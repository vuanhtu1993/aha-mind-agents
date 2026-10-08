/**
 * @file context-resolver.node.ts
 * @description Node 1 trong StateGraph: Phân giải ngữ cảnh từ Storybook hoặc Custom Topic
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AHA_TOOLS_CONNECTION } from '../../../infra/database/database.constants';
import { Storybook } from '../../../infra/database/schemas/storybook.schema';
import { SpeakingQuizStateType, TargetKeywordItemType } from '../speaking-quiz.state';

@Injectable()
export class ContextResolverNode {
  private readonly logger = new Logger(ContextResolverNode.name);

  constructor(
    @InjectModel(Storybook.name, AHA_TOOLS_CONNECTION)
    private readonly storybookModel: Model<Storybook>,
  ) { }

  public async invoke(state: SpeakingQuizStateType): Promise<Partial<SpeakingQuizStateType>> {
    if (state.error) return {};

    const level = state.requestedLevel || 'B2';

    // 1. Phân giải ngữ cảnh từ Storybook
    if (state.storybookId) {
      this.logger.log(`Đang truy vấn bài học Storybook: ${state.storybookId}`);
      try {
        const storybook = await this.storybookModel.findById(state.storybookId).lean();
        if (!storybook) {
          return { error: `Storybook không tồn tại với ID: ${state.storybookId}` };
        }

        const resolvedTopic = storybook.title || 'Chủ đề bài học';
        const sentenceTexts = (storybook.sentences || []).map((s: any) => s.text).filter(Boolean);
        const sourceContentSummary = sentenceTexts.length > 0
          ? sentenceTexts.slice(0, 10).join(' ')
          : storybook.originalText || resolvedTopic;

        // Trích xuất 2-3 target keywords từ danh sách keywords của Storybook
        let targetKeywords: TargetKeywordItemType[] = [];
        if (storybook.keywords && storybook.keywords.length > 0) {
          targetKeywords = storybook.keywords.slice(0, 3).map((k: any) => ({
            word: k.word,
            ipa: k.ipa || undefined,
            meaning: k.explanation || k.word,
          }));
        }

        // Fallback Heuristic: Nếu không có đủ keywords, trích các từ có độ dài >= 7 ký tự từ sentences
        if (targetKeywords.length < 2 && sentenceTexts.length > 0) {
          const words = sourceContentSummary
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length >= 7);
          const uniqueWords = Array.from(new Set(words.map(w => w.toLowerCase()))).slice(0, 3);
          for (const w of uniqueWords) {
            if (!targetKeywords.some(tk => tk.word.toLowerCase() === w)) {
              targetKeywords.push({
                word: w,
                meaning: `Key terminology in context: ${w}`,
              });
            }
          }
        }

        this.logger.log(`✅ Phân giải Storybook thành công: "${resolvedTopic}" với ${targetKeywords.length} từ vựng mục tiêu.`);

        return {
          resolvedTopic,
          sourceContentSummary,
          targetKeywords,
          level,
        };
      } catch (err: any) {
        this.logger.error(`Lỗi truy vấn Storybook: ${err.message}`);
        return { error: `Không thể đọc dữ liệu Storybook: ${err.message}` };
      }
    }

    // 2. Phân giải ngữ cảnh từ Custom Topic
    if (state.customTopic) {
      const resolvedTopic = state.customTopic.trim();
      const sourceContentSummary = `Debate topic on: ${resolvedTopic}`;
      const targetKeywords: TargetKeywordItemType[] = (state.customKeywords || []).map(w => ({
        word: w.trim(),
        meaning: `Core concept: ${w.trim()}`,
      }));

      this.logger.log(`✅ Phân giải Custom Topic thành công: "${resolvedTopic}"`);

      return {
        resolvedTopic,
        sourceContentSummary,
        targetKeywords,
        level,
      };
    }

    return { error: 'Thiếu thông tin đầu vào (cần storybookId hoặc customTopic)' };
  }
}
