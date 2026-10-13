/**
 * @file vocab-review.service.ts
 * @description Nghiệp vụ tạo phiên ôn tập trắc nghiệm, ghi nhận kết quả và thống kê FSRS
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AHA_TOOLS_CONNECTION } from '../../../infra/database/database.constants';
import { VocabCard } from '../../../infra/database/schemas/vocab-card.schema';
import { VocabReviewLog } from '../../../infra/database/schemas/vocab-review-log.schema';
import { Storybook } from '../../../infra/database/schemas/storybook.schema';
import { FSRSService } from './fsrs.service';
import { DistractorService } from './distractor.service';
import { SubmitReviewDto } from '../dto/submit-review.dto';
import { CandidateVocabItem } from '../dto/candidate-vocab.dto';

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  cardId: string;
  word: string;
  ipa?: string;
  audioUrl?: string;
  level: string;
  wordFamily?: any[];
  collocations?: any[];
  sourceStorybookTitle?: string;
  explanation: string;
  options: QuizOption[];
  exampleSentences?: Array<{ sentence: string; answer: string }>;
  quizMode: 'mcq' | 'cloze';
  fsrsState: {
    due: string;
    reps: number;
    stability: number;
  };
}

export interface ReviewSessionResponse {
  questions: QuizQuestion[];
  totalDue: number;
  sessionLimit: number;
  totalSaved: number;
}

@Injectable()
export class VocabReviewService {
  private readonly logger = new Logger(VocabReviewService.name);

  constructor(
    @InjectModel(VocabCard.name, AHA_TOOLS_CONNECTION)
    private readonly vocabCardModel: Model<VocabCard>,
    @InjectModel(VocabReviewLog.name, AHA_TOOLS_CONNECTION)
    private readonly reviewLogModel: Model<VocabReviewLog>,
    @InjectModel(Storybook.name, AHA_TOOLS_CONNECTION)
    private readonly storybookModel: Model<Storybook>,
    private readonly fsrsService: FSRSService,
    private readonly distractorService: DistractorService,
  ) {}

  /**
   * Sinh phiên câu hỏi ôn tập (MCQ / Cloze) kèm options gây nhiễu
   */
  public async getReviewSession(options: {
    limit?: number;
    practiceAll?: boolean;
  } = {}): Promise<ReviewSessionResponse> {
    const limit = Math.min(Math.max(1, options.limit || 15), 30);
    const practiceAll = options.practiceAll === true;
    const now = new Date();

    const query: Record<string, any> = practiceAll ? {} : { 'fsrs.due': { $lte: now } };

    const [targetCards, totalCount, allPersonalCards, allStorybooks] = await Promise.all([
      this.vocabCardModel
        .find(query)
        .sort({ 'fsrs.due': 1 })
        .limit(limit)
        .lean(),
      this.vocabCardModel.countDocuments({}),
      this.vocabCardModel.find({}, { explanation: 1, word: 1 }).lean(),
      this.storybookModel.find({}, { 'keywords.explanation': 1, 'keywords.word': 1 }).lean(),
    ]);

    if (targetCards.length === 0 && !practiceAll) {
      return {
        questions: [],
        totalDue: 0,
        sessionLimit: limit,
        totalSaved: totalCount,
      };
    }

    // 1. Trích xuất giải nghĩa từ cards cá nhân
    const personalExplanations = allPersonalCards
      .map((c: any) => c.explanation?.trim())
      .filter((exp: string | undefined): exp is string => Boolean(exp));

    // 2. Trích xuất giải nghĩa từ keywords của Storybooks
    const storybookExplanations = allStorybooks
      .flatMap((sb: any) => sb.keywords?.map((k: any) => k.explanation?.trim()) || [])
      .filter((exp: string | undefined): exp is string => Boolean(exp));

    // 3. Hợp nhất thành Global Distractor Pool duy nhất
    const uniquePoolMap = new Map<string, string>();
    for (const exp of [...personalExplanations, ...storybookExplanations]) {
      const key = exp.toLowerCase();
      if (!uniquePoolMap.has(key)) {
        uniquePoolMap.set(key, exp);
      }
    }
    const globalExplanations = Array.from(uniquePoolMap.values());

    const optionLetters = ['A', 'B', 'C', 'D'];

    const questions: QuizQuestion[] = targetCards.map((card: any) => {
      const targetExplanation = (card.explanation || '').trim();
      const distractors = this.distractorService.generateDistractors(
        targetExplanation,
        3,
        globalExplanations,
      );

      const rawOptions = [
        { text: targetExplanation, isCorrect: true },
        ...distractors.map(text => ({ text, isCorrect: false })),
      ];

      const shuffledOptions: QuizOption[] = [...rawOptions]
        .sort(() => Math.random() - 0.5)
        .map((opt, idx) => ({
          id: optionLetters[idx] || `${idx + 1}`,
          text: opt.text,
          isCorrect: opt.isCorrect,
        }));

      const stability = card.fsrs?.stability ?? 0;
      const reps = card.fsrs?.reps ?? 0;
      const exampleSentences = card.exampleSentences || [];

      // Kích hoạt Cloze mode nếu thẻ đã ôn ít nhất 2 lần hoặc stability >= 1.0 và có ví dụ
      const quizMode: 'mcq' | 'cloze' =
        (reps >= 2 || stability >= 1.0) && exampleSentences.length > 0 ? 'cloze' : 'mcq';

      return {
        cardId: card._id.toString(),
        word: card.word,
        ipa: card.ipa || '',
        audioUrl: card.audioUrl || '',
        level: card.level || 'A1',
        wordFamily: card.wordFamily || [],
        collocations: card.collocations || [],
        sourceStorybookTitle: card.sourceStorybookTitle || '',
        explanation: card.explanation || '',
        options: shuffledOptions,
        exampleSentences,
        quizMode,
        fsrsState: {
          due: card.fsrs?.due ? new Date(card.fsrs.due).toISOString() : new Date().toISOString(),
          reps,
          stability,
        },
      };
    });

    return {
      questions,
      totalDue: targetCards.length,
      sessionLimit: limit,
      totalSaved: totalCount,
    };
  }

  /**
   * Nộp kết quả câu hỏi trắc nghiệm, cập nhật FSRS và ghi log
   */
  public async submitReview(dto: SubmitReviewDto) {
    const card = await this.vocabCardModel.findById(dto.cardId);
    if (!card) {
      throw new NotFoundException(`Không tìm thấy thẻ từ vựng với ID: ${dto.cardId}`);
    }

    const rating = this.fsrsService.calculateFSRSRating(dto.isCorrect, dto.responseTimeMs);
    const now = new Date();

    const prevFsrs = card.fsrs;
    const prevState = {
      due: prevFsrs?.due ? new Date(prevFsrs.due) : new Date(),
      stability: prevFsrs?.stability ?? 0,
      difficulty: prevFsrs?.difficulty ?? 0,
      elapsed_days: prevFsrs?.elapsed_days ?? 0,
      scheduled_days: prevFsrs?.scheduled_days ?? 0,
      reps: prevFsrs?.reps ?? 0,
      lapses: prevFsrs?.lapses ?? 0,
      state: prevFsrs?.state ?? 0,
      last_review: prevFsrs?.last_review,
    };

    const { updatedState } = this.fsrsService.scheduleNextReview(prevState, rating, now);

    // Cập nhật card trong DB
    card.fsrs = updatedState;
    await card.save();

    // Ghi nhận review log
    await this.reviewLogModel.create({
      vocabCardId: card._id,
      word: card.word,
      rating,
      state: prevState.state,
      due: prevState.due,
      stability: prevState.stability,
      difficulty: prevState.difficulty,
      elapsed_days: prevState.elapsed_days,
      scheduled_days: prevState.scheduled_days,
      responseTimeMs: dto.responseTimeMs,
      isCorrect: dto.isCorrect,
      reviewedAt: now,
    });

    return {
      success: true,
      cardId: card._id.toString(),
      word: card.word,
      isCorrect: dto.isCorrect,
      rating,
      nextDue: updatedState.due,
      stability: updatedState.stability,
      difficulty: updatedState.difficulty,
      reps: updatedState.reps,
      lapses: updatedState.lapses,
    };
  }

  /**
   * Đếm số lượng từ vựng đến hạn và phân loại trạng thái học tập
   */
  public async getDueCount() {
    const now = new Date();

    const [dueCount, totalCount, newCount, masteredCount] = await Promise.all([
      this.vocabCardModel.countDocuments({ 'fsrs.due': { $lte: now } }),
      this.vocabCardModel.countDocuments({}),
      this.vocabCardModel.countDocuments({ 'fsrs.state': 0 }),
      this.vocabCardModel.countDocuments({ 'fsrs.stability': { $gte: 30 } }),
    ]);

    const learningCount = Math.max(0, totalCount - newCount - masteredCount);

    return {
      dueCount,
      totalCount,
      newCount,
      learningCount,
      masteredCount,
      nextDueTimestamp: now.toISOString(),
    };
  }

  /**
   * Trích xuất danh sách từ vựng ứng viên cần ôn để đưa vào Speaking Quiz
   */
  public async getCandidateDueVocab(options: { limit?: number } = {}): Promise<CandidateVocabItem[]> {
    const limit = Math.min(Math.max(1, options.limit || 4), 10);
    const now = new Date();

    // Ưu tiên 1: Thẻ đến hạn (due <= now)
    let cards = await this.vocabCardModel
      .find({ 'fsrs.due': { $lte: now } })
      .sort({ 'fsrs.due': 1 })
      .limit(limit)
      .lean();

    // Fallback: Nếu không đủ từ đến hạn, lấy thêm từ đang học hoặc mới lưu có stability thấp
    if (cards.length < limit) {
      const remaining = limit - cards.length;
      const existingIds = cards.map(c => c._id);
      const fallbackCards = await this.vocabCardModel
        .find({ _id: { $nin: existingIds } })
        .sort({ 'fsrs.stability': 1, 'fsrs.reps': 1 })
        .limit(remaining)
        .lean();
      cards = [...cards, ...fallbackCards];
    }

    return cards.map((c: any) => {
      let srsStatus: 'due' | 'learning' | 'mastered' | 'new' = 'learning';
      const dueTime = c.fsrs?.due ? new Date(c.fsrs.due).getTime() : 0;
      const stability = c.fsrs?.stability ?? 0;
      const reps = c.fsrs?.reps ?? 0;

      if (dueTime <= now.getTime()) {
        srsStatus = 'due';
      } else if (stability >= 30) {
        srsStatus = 'mastered';
      } else if (reps === 0) {
        srsStatus = 'new';
      }

      return {
        word: c.word,
        explanation: c.explanation,
        level: c.level || 'B2',
        srsStatus,
      };
    });
  }
}
