import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { z } from 'zod';
import { AhaMediaContentDocument } from '../schemas/media-content.schema';
import { NormalizedMedia } from '../adapters/source-adapter.interface';
import { GiphyAdapter } from '../adapters/giphy.adapter';
import { YoutubeAdapter } from '../adapters/youtube.adapter';
import { KeywordItem } from '../config/keywords.config';

export const LlmEnrichmentSchema = z.object({
  isSafe: z.boolean().describe('True nếu nội dung lành mạnh, không có yếu tố bạo lực, 18+, hoặc xúc phạm'),
  topic: z.enum(['grammar', 'vocabulary', 'pronunciation', 'idiom', 'conversation']),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  whyFunny: z.string().describe('Giải thích ngắn gọn 1-2 câu vì sao nội dung này hài hước bằng tiếng Việt'),
  youLearned: z.string().describe('Điểm kiến thức tiếng Anh đúc kết được (từ vựng, cấu trúc)'),
  learningScore: z.number().min(0).max(1).describe('Thang điểm 0.0 - 1.0 đánh giá độ hữu ích cho việc học tiếng Anh'),
});

@Injectable()
export class FunFeedIngestionService {
  private readonly logger = new Logger(FunFeedIngestionService.name);

  constructor(
    private readonly mediaModel: Model<AhaMediaContentDocument>,
    private readonly aiService: any, // HiveService hoặc GeminiService
    private readonly giphyAdapter: GiphyAdapter,
    private readonly youtubeAdapter: YoutubeAdapter,
  ) {}

  async ingestSingleKeyword(
    keywordItem: KeywordItem,
    limit = 5,
  ): Promise<{ fetched: number; deduped: number; saved: number }> {
    const fetchedItems: NormalizedMedia[] = [];

    if (keywordItem.source === 'giphy' || keywordItem.source === 'all') {
      const gifs = await this.giphyAdapter.fetch(keywordItem.keyword, limit);
      fetchedItems.push(...gifs);
    }

    if (keywordItem.source === 'youtube' || keywordItem.source === 'all') {
      const vids = await this.youtubeAdapter.fetch(keywordItem.keyword, limit);
      fetchedItems.push(...vids);
    }

    let saved = 0;
    let deduped = 0;

    for (const item of fetchedItems) {
      // 1. Dedup kiểm tra source + sourceId
      const exists = await this.mediaModel.findOne({ source: item.source, sourceId: item.sourceId }).lean();
      if (exists) {
        continue;
      }
      deduped++;

      // 2. LLM Safety check & Enrich
      try {
        const enriched = await this.enrichItemWithLlm(item, keywordItem.topic);
        if (!enriched.isSafe || enriched.learningScore < 0.4) {
          this.logger.warn(
            `Bỏ qua item [${item.sourceId}] do không an toàn hoặc điểm thấp: ${enriched.learningScore}`,
          );
          continue;
        }

        // 3. Auto-publish lưu vào DB
        await this.mediaModel.create({
          ...item,
          topic: enriched.topic,
          level: enriched.level,
          whyFunny: enriched.whyFunny,
          youLearned: enriched.youLearned,
          learningScore: enriched.learningScore,
          status: 'published',
          publishedAt: new Date(),
        });
        saved++;
      } catch (err: any) {
        this.logger.error(`Lỗi enrich item [${item.sourceId}]: ${err.message}`);
      }
    }

    return { fetched: fetchedItems.length, deduped, saved };
  }

  private async enrichItemWithLlm(item: NormalizedMedia, fallbackTopic: KeywordItem['topic']) {
    const prompt = `Phân tích meme/video tiếng Anh sau:
Tiêu đề: "${item.title}"
Nguồn: ${item.source} (${item.sourceUrl})
Chủ đề gợi ý: ${fallbackTopic}

Hãy đánh giá xem nội dung có lành mạnh không (isSafe: true/false), giải thích ngắn gọn tại sao hài hước (whyFunny) và người học rút ra được bài học gì (youLearned).`;

    const res = await this.aiService.invokeStructured(
      LlmEnrichmentSchema,
      [
        {
          role: 'system',
          content:
            'Bạn là chuyên gia ngôn ngữ học và meme văn hóa Anh-Mỹ giúp người học tiếng Anh giải trí và tiến bộ.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    );

    return res.parsed;
  }
}
