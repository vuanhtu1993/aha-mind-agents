/**
 * @file persister.node.ts
 * @description Node 4 trong StateGraph: Kiểm tra tính hợp lệ và ghi vào collection speaking_questions
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AHA_TOOLS_CONNECTION } from '../../../infra/database/database.constants';
import { SpeakingQuestion } from '../../../infra/database/schemas/speaking-question.schema';
import { SpeakingQuizStateType } from '../speaking-quiz.state';

@Injectable()
export class PersisterNode {
  private readonly logger = new Logger(PersisterNode.name);

  constructor(
    @InjectModel(SpeakingQuestion.name, AHA_TOOLS_CONNECTION)
    private readonly speakingQuestionModel: Model<SpeakingQuestion>,
  ) {}

  public async invoke(state: SpeakingQuizStateType): Promise<Partial<SpeakingQuizStateType>> {
    if (state.error) return {};

    if (!state.resolvedTopic || !state.generatedQuestion || !state.prepScaffold) {
      return { error: 'Dữ liệu không đầy đủ để lưu trữ (thiếu topic, question hoặc prepScaffold)' };
    }

    this.logger.log(`Đang lưu đề bài Speaking Quiz vào CSDL: "${state.resolvedTopic}"`);

    try {
      const docData: Record<string, any> = {
        topic: state.resolvedTopic,
        question: state.generatedQuestion,
        level: state.level || 'B2',
        targetKeywords: (state.targetKeywords || []).map(k => ({
          word: k.word,
          ipa: k.ipa,
          meaning: k.meaning,
        })),
        prepScaffold: {
          point: { stage: 'point', ...state.prepScaffold.point },
          reason: { stage: 'reason', ...state.prepScaffold.reason },
          example: { stage: 'example', ...state.prepScaffold.example },
          conclusion: { stage: 'conclusion', ...state.prepScaffold.conclusion },
        },
        status: 'active',
        generatedByModel: 'gemini-2.5-flash',
      };

      if (state.storybookId && Types.ObjectId.isValid(state.storybookId)) {
        docData.storybookId = new Types.ObjectId(state.storybookId);
      }

      const doc = new this.speakingQuestionModel(docData);
      const saved = await doc.save();

      this.logger.log(`✅ Đã lưu Speaking Question thành công với ID: ${saved._id}`);

      return {
        persistedId: saved._id.toString(),
      };
    } catch (err: any) {
      this.logger.error(`❌ Lỗi ghi cơ sở dữ liệu: ${err.message}`);
      return { error: `Không thể lưu Speaking Question vào CSDL: ${err.message}` };
    }
  }
}
