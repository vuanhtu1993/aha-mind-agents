import axios from 'axios';
import { Logger } from '@nestjs/common';
import { NormalizedMedia, SourceAdapter, SourceReport } from './source-adapter.interface';

export class GiphyAdapter implements SourceAdapter {
  readonly source = 'giphy';
  private readonly logger = new Logger(GiphyAdapter.name);

  constructor(private readonly apiKey: string) {}

  async fetchWithReport(keyword: string, limit = 5): Promise<{ items: NormalizedMedia[]; report: SourceReport }> {
    if (!this.apiKey) {
      this.logger.warn('GIPHY_API_KEY chưa được cấu hình. Bỏ qua fetch GIPHY.');
      return {
        items: [],
        report: {
          source: 'giphy',
          status: 'missing_key',
          count: 0,
          message: 'GIPHY_API_KEY chưa được thiết lập trong biến môi trường.',
        },
      };
    }

    try {
      // 1. Tìm kiếm ưu tiên rating 'g' (an toàn tuyệt đối)
      const response = await axios.get('https://api.giphy.com/v1/gifs/search', {
        params: {
          api_key: this.apiKey,
          q: keyword,
          limit,
          rating: 'g',
          lang: 'en',
        },
        timeout: 8000,
      });

      let rawData = response.data?.data || [];

      // 2. Fallback sang rating 'pg' nếu rating 'g' không có kết quả (vẫn đảm bảo qua LLM Safety filter)
      if (rawData.length === 0) {
        const fallbackResponse = await axios.get('https://api.giphy.com/v1/gifs/search', {
          params: {
            api_key: this.apiKey,
            q: keyword,
            limit,
            rating: 'pg',
            lang: 'en',
          },
          timeout: 8000,
        });
        rawData = fallbackResponse.data?.data || [];
      }

      const items = rawData
        .map((item: any): NormalizedMedia => ({
          source: 'giphy',
          sourceId: item.id,
          sourceUrl: item.url || `https://giphy.com/gifs/${item.id}`,
          type: 'gif',
          title: item.title || keyword,
          mediaUrl: item.images?.original?.url || '',
          thumbnailUrl: item.images?.fixed_height_small?.url,
          attribution: item.username || 'GIPHY Creator',
          rating: item.rating || 'g',
        }))
        .filter((m: NormalizedMedia) => !!m.mediaUrl);

      return {
        items,
        report: {
          source: 'giphy',
          status: 'ok',
          count: items.length,
        },
      };
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message;
      this.logger.error(`Lỗi khi gọi GIPHY API [${keyword}]: ${errorMsg}`);
      return {
        items: [],
        report: {
          source: 'giphy',
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

