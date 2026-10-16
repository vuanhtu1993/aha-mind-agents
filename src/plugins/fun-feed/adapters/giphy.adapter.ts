import axios from 'axios';
import { Logger } from '@nestjs/common';
import { NormalizedMedia, SourceAdapter } from './source-adapter.interface';

export class GiphyAdapter implements SourceAdapter {
  readonly source = 'giphy';
  private readonly logger = new Logger(GiphyAdapter.name);

  constructor(private readonly apiKey: string) {}

  async fetch(keyword: string, limit = 5): Promise<NormalizedMedia[]> {
    if (!this.apiKey) {
      this.logger.warn('GIPHY_API_KEY chưa được cấu hình. Bỏ qua fetch GIPHY.');
      return [];
    }

    try {
      const response = await axios.get('https://api.giphy.com/v1/gifs/search', {
        params: {
          api_key: this.apiKey,
          q: keyword,
          limit,
          rating: 'g',
          lang: 'en',
        },
        timeout: 5000,
      });

      const items = response.data?.data || [];
      return items
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
    } catch (error: any) {
      this.logger.error(`Lỗi khi gọi GIPHY API [${keyword}]: ${error.message}`);
      return [];
    }
  }
}
