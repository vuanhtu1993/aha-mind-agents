import axios from 'axios';
import { Logger } from '@nestjs/common';
import { NormalizedMedia, SourceAdapter, SourceReport } from './source-adapter.interface';

/**
 * ThreadsAdapter: Thu thập bài viết meme, hình ảnh và video ngắn về tiếng Anh từ Meta Threads.
 *
 * Tại sao cần ThreadsAdapter?
 * - Threads là mạng xã hội tiểu blog phát triển nhanh của Meta, tập trung vào văn hóa chữ và ảnh chế (memes, puns, wordplay).
 * - Cung cấp ngữ cảnh phong phú (caption + hình ảnh) giúp LLM phân tích sâu điểm hài hước và đúc kết ngữ pháp.
 * - Hỗ trợ cả Official Meta Graph API và RapidAPI Scraper fallback để linh hoạt khi triển khai thực tế.
 *
 * Made by Anh Tu - Share to be share
 */
export class ThreadsAdapter implements SourceAdapter {
  readonly source = 'threads';
  private readonly logger = new Logger(ThreadsAdapter.name);

  constructor(
    private readonly accessToken: string,
    private readonly rapidApiKey?: string,
  ) {}

  async fetchWithReport(keyword: string, limit = 5): Promise<{ items: NormalizedMedia[]; report: SourceReport }> {
    if (!this.accessToken && !this.rapidApiKey) {
      this.logger.warn('THREADS_ACCESS_TOKEN hoặc THREADS_RAPIDAPI_KEY chưa được thiết lập. Bỏ qua fetch Threads.');
      return {
        items: [],
        report: {
          source: 'threads',
          status: 'missing_key',
          count: 0,
          message: 'Chưa cấu hình API Key cho Threads.',
        },
      };
    }

    try {
      const cleanKeyword = keyword.replace(/^#/, '').trim();

      // 1. Trường hợp sử dụng Official Access Token (Meta Graph Threads API)
      if (this.accessToken) {
        const response = await axios.get('https://graph.threads.net/v1.0/threads/search', {
          params: {
            q: cleanKeyword,
            search_type: 'TOP',
            fields: 'id,text,media_type,media_url,permalink,username,timestamp',
            access_token: this.accessToken,
            limit,
          },
          timeout: 8000,
        });

        const rawData = response.data?.data || [];
        const items: NormalizedMedia[] = rawData
          .filter((item: any) => item.media_url)
          .map((item: any): NormalizedMedia => ({
            source: 'threads',
            sourceId: item.id,
            sourceUrl: item.permalink || `https://www.threads.net/post/${item.id}`,
            type: item.media_type === 'VIDEO' ? 'short_video' : 'image',
            title: item.text?.slice(0, 150) || cleanKeyword,
            mediaUrl: item.media_url,
            thumbnailUrl: item.thumbnail_url || item.media_url,
            attribution: item.username || 'Threads Creator',
            rating: 'g',
          }));

        return {
          items,
          report: {
            source: 'threads',
            status: 'ok',
            count: items.length,
          },
        };
      }

      // 2. Fallback sang RapidAPI Threads Scraper nếu chưa vượt qua Meta App Review
      const rapidResponse = await axios.get('https://threads-scraper-api.p.rapidapi.com/search', {
        params: { query: cleanKeyword, limit },
        headers: {
          'X-RapidAPI-Key': this.rapidApiKey,
          'X-RapidAPI-Host': 'threads-scraper-api.p.rapidapi.com',
        },
        timeout: 8000,
      });

      const parsedItems = (rapidResponse.data?.results || []).map((item: any): NormalizedMedia => ({
        source: 'threads',
        sourceId: item.id,
        sourceUrl: item.url || `https://www.threads.net/post/${item.id}`,
        type: item.is_video ? 'short_video' : 'image',
        title: item.caption?.slice(0, 150) || cleanKeyword,
        mediaUrl: item.image_url || item.video_url,
        thumbnailUrl: item.image_url,
        attribution: item.author || 'Threads Creator',
        rating: 'g',
      }));

      return {
        items: parsedItems,
        report: {
          source: 'threads',
          status: 'ok',
          count: parsedItems.length,
        },
      };
    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      this.logger.error(`Lỗi khi gọi Threads API [${keyword}]: ${errorMsg}`);
      return {
        items: [],
        report: {
          source: 'threads',
          status: 'error',
          count: 0,
          message: errorMsg,
        },
      };
    }
  }

  async fetch(keyword: string, limit = 5): Promise<NormalizedMedia[]> {
    const res = await this.fetchWithReport(keyword, limit);
    return res.items;
  }
}
