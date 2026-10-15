/**
 * @file youtube-sentence-consolidator.node.ts
 * @description Node gộp phụ đề YouTube tất định và phiên âm IPA
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { HiveService } from 'src/core/hive/hive.service';
import { PhoneticService } from 'src/core/phonetics/phonetic.service';
import { StoryShadowingStateType } from '../story-shadowing.state';
import { SubtitleAlignerUtil } from '../utils/subtitle-aligner.util';
import { z } from 'zod';

const DifficultyClassificationSchema = z.object({
  level: z.enum(['easy', 'medium', 'hard']),
});

const CLASSIFICATION_PROMPT = `You are an expert English language assessor.
Evaluate the overall language difficulty level of the provided English transcript text.
Criteria:
- easy: A1-A2, short simple sentences, high-frequency everyday vocabulary.
- medium: B1-B2, conversational, common phrasal verbs, standard structures.
- hard: C1-C2, specialized terms, idiomatic nuances, complex sentence structures.

Output JSON: { "level": "easy" | "medium" | "hard" }`;

@Injectable()
export class YoutubeSentenceConsolidatorNode {
  private readonly logger = new Logger(YoutubeSentenceConsolidatorNode.name);

  constructor(
    private readonly hive: HiveService,
    private readonly phonetics: PhoneticService,
  ) { }

  public async invoke(state: StoryShadowingStateType): Promise<Partial<StoryShadowingStateType>> {
    if (state.error || !state.youtubeTranscript) return {};

    this.logger.log('Đang gộp phụ đề và căn chỉnh thời gian bằng thuật toán tất định (Deterministic)...');

    try {
      await this.phonetics.ensureInitialized();
      const MAX_BLOCKS = 400;
      const transcriptToProcess = state.youtubeTranscript.slice(0, MAX_BLOCKS);

      // 1. Gộp câu và căn chỉnh thời gian chuẩn xác bằng thuật toán (0ms, 0 Token)
      const alignedSentences = SubtitleAlignerUtil.align(transcriptToProcess);

      if (alignedSentences.length === 0) {
        return { error: 'Không thể tách câu từ phụ đề YouTube này.' };
      }

      // 2. Phiên âm IPA cho từng từ
      const allSentences = alignedSentences.map(s => ({
        ...s,
        words: this.phonetics.transcribeSentence(s.text),
      }));

      // 3. Phân loại độ khó (Gọi nhẹ nhàng LLM 1 lần duy nhất với mẫu text ngắn)
      let overallLevel: 'easy' | 'medium' | 'hard' = 'medium';
      let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      try {
        const nodeConfig = state.config?.nodeOverrides?.['youtubeConsolidator'] || {};
        const prompt = nodeConfig.systemPrompt || CLASSIFICATION_PROMPT;
        const model = nodeConfig.model || state.config?.defaultModel;
        const temp = nodeConfig.temperature ?? state.config?.temperature ?? 0.1;
        const maxTokens = nodeConfig.maxTokens ?? 500;

        // Lấy mẫu khoảng 10-15 câu đầu để đánh giá trình độ
        const sampleText = allSentences.slice(0, 15).map(s => s.text).join(' ');

        const levelRes = await this.hive.invokeStructured(
          DifficultyClassificationSchema,
          [
            { role: 'system', content: prompt },
            { role: 'user', content: `Analyze the English proficiency level of this sample text:\n\n${sampleText}` }
          ],
          {
            temperature: temp,
            model: model,
            maxTokens: maxTokens,
            name: 'youtube_level_classifier'
          }
        );

        if (levelRes?.parsed?.level) {
          overallLevel = levelRes.parsed.level;
        }
        if (levelRes?.usage) {
          totalUsage = levelRes.usage;
        }
      } catch (aiErr: any) {
        this.logger.warn(`⚠️ Không thể phân loại độ khó bằng AI (${aiErr.message}), mặc định: 'medium'`);
      }

      this.logger.log(`✅ Đã gộp thành công ${allSentences.length} câu hoàn chỉnh với độ chính xác thời gian tuyệt đối.`);

      return {
        rawSentences: allSentences,
        level: overallLevel,
        sentences: allSentences.map(s => ({ ...s, audioBase64: '' })),
        tokenUsage: totalUsage,
      };
    } catch (err: any) {
      this.logger.error(`❌ Lỗi Youtube Consolidator: ${err.message}`);
      return { error: 'Không thể xử lý ngôn ngữ phụ đề. Vui lòng thử video khác.' };
    }
  }
}
