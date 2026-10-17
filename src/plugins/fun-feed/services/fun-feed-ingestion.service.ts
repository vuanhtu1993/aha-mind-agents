import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { z } from 'zod';
import { AhaMediaContentDocument } from '../schemas/media-content.schema';
import { NormalizedMedia } from '../adapters/source-adapter.interface';
import { GiphyAdapter } from '../adapters/giphy.adapter';
import { YoutubeAdapter } from '../adapters/youtube.adapter';
import { RedditAdapter } from '../adapters/reddit.adapter';
import { ThreadsAdapter } from '../adapters/threads.adapter';
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
    private readonly redditAdapter?: RedditAdapter,
    private readonly threadsAdapter?: ThreadsAdapter,
  ) {}

  async ingestSingleKeyword(
    keywordItem: KeywordItem,
    limit = 5,
  ): Promise<{
    fetched: number;
    deduped: number;
    saved: number;
    diagnostics?: Record<string, { status: string; count: number; message?: string }>;
  }> {
    const fetchedItems: NormalizedMedia[] = [];
    const diagnostics: Record<string, { status: string; count: number; message?: string }> = {};

    // 1. Fetch từ GIPHY
    if (this.giphyAdapter && (keywordItem.source === 'giphy' || keywordItem.source === 'all')) {
      if (typeof (this.giphyAdapter as any).fetchWithReport === 'function') {
        const { items, report } = await (this.giphyAdapter as any).fetchWithReport(keywordItem.keyword, limit);
        fetchedItems.push(...items);
        diagnostics.giphy = { status: report.status, count: report.count, message: report.message };
      } else {
        const gifs = await this.giphyAdapter.fetch(keywordItem.keyword, limit);
        fetchedItems.push(...gifs);
      }
    }

    // 2. Fetch từ YouTube Shorts
    if (this.youtubeAdapter && (keywordItem.source === 'youtube' || keywordItem.source === 'all')) {
      if (typeof (this.youtubeAdapter as any).fetchWithReport === 'function') {
        const { items, report } = await (this.youtubeAdapter as any).fetchWithReport(keywordItem.keyword, limit);
        fetchedItems.push(...items);
        diagnostics.youtube = { status: report.status, count: report.count, message: report.message };
      } else {
        const vids = await this.youtubeAdapter.fetch(keywordItem.keyword, limit);
        fetchedItems.push(...vids);
      }
    }

    // 3. Fetch từ Reddit
    if (this.redditAdapter && (keywordItem.source === 'reddit' || keywordItem.source === 'all')) {
      if (typeof (this.redditAdapter as any).fetchWithReport === 'function') {
        const { items, report } = await (this.redditAdapter as any).fetchWithReport(keywordItem.keyword, limit);
        fetchedItems.push(...items);
        diagnostics.reddit = { status: report.status, count: report.count, message: report.message };
      } else {
        const redditItems = await this.redditAdapter.fetch(keywordItem.keyword, limit);
        fetchedItems.push(...redditItems);
      }
    }

    // 4. Fetch từ Threads (Chỉ tự động gọi khi source là 'threads' hoặc khi đã cấu hình API Key)
    const shouldFetchThreads =
      this.threadsAdapter &&
      (keywordItem.source === 'threads' ||
        (keywordItem.source === 'all' &&
          (typeof (this.threadsAdapter as any).isConfigured !== 'function' ||
            (this.threadsAdapter as any).isConfigured())));

    if (shouldFetchThreads && this.threadsAdapter) {
      if (typeof (this.threadsAdapter as any).fetchWithReport === 'function') {
        const { items, report } = await (this.threadsAdapter as any).fetchWithReport(keywordItem.keyword, limit);
        fetchedItems.push(...items);
        diagnostics.threads = { status: report.status, count: report.count, message: report.message };
      } else {
        const threadsItems = await this.threadsAdapter.fetch(keywordItem.keyword, limit);
        fetchedItems.push(...threadsItems);
      }
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
            `Bỏ qua item [${item.source}:${item.sourceId}] do không an toàn hoặc điểm thấp: ${enriched.learningScore}`,
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
        this.logger.error(`Lỗi enrich item [${item.source}:${item.sourceId}]: ${err.message}`);
      }
    }

    return { fetched: fetchedItems.length, deduped, saved, diagnostics };
  }

  private async enrichItemWithLlm(item: NormalizedMedia, fallbackTopic: KeywordItem['topic']) {
    const prompt = `Phân tích meme/video tiếng Anh sau:
Tiêu đề: "${item.title}"
Nguồn: ${item.source} (${item.sourceUrl})
Định dạng: ${item.type}
Chủ đề gợi ý: ${fallbackTopic}

Hãy đánh giá xem nội dung có lành mạnh không (isSafe: true/false), giải thích ngắn gọn tại sao hài hước (whyFunny) và người học rút ra được bài học gì (youLearned).
LƯU Ý: Phân tích trực diện, súc tích (1-2 câu), không suy diễn lan man. Trả về đúng định dạng JSON yêu cầu.`;

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
      { maxTokens: 16384 },
    );

    return res.parsed;
  }
}
