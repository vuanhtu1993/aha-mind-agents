import axios from 'axios';
import { Logger } from '@nestjs/common';
import { NormalizedMedia, SourceAdapter, SourceReport } from './source-adapter.interface';

export class YoutubeAdapter implements SourceAdapter {
  readonly source = 'youtube';
  private readonly logger = new Logger(YoutubeAdapter.name);

  constructor(private readonly apiKey: string) {}

  async fetchWithReport(keyword: string, limit = 5): Promise<{ items: NormalizedMedia[]; report: SourceReport }> {
    if (!this.apiKey) {
      this.logger.warn('YOUTUBE_DATA_API_KEY chưa được cấu hình. Bỏ qua fetch YouTube.');
      return {
        items: [],
        report: {
          source: 'youtube',
          status: 'missing_key',
          count: 0,
          message: 'YOUTUBE_DATA_API_KEY chưa được thiết lập trong biến môi trường.',
        },
      };
    }

    try {
      // Hỗ trợ hashtag và tự động đính kèm ngữ cảnh tiếng Anh nếu từ khóa quá tổng quát (ví dụ: #meme, funny)
      const hasEnglishContext = /(english|grammar|vocab|idiom|pronunc|slang|spell|esl|learn)/i.test(keyword);
      const query = hasEnglishContext ? `${keyword} shorts` : `${keyword} english shorts`;

      const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          key: this.apiKey,
          q: query,
          part: 'snippet',
          type: 'video',
          maxResults: limit,
          videoDuration: 'short',
        },
        timeout: 8000,
      });

      const items = response.data?.items || [];
      const normalized = items
        .filter((item: any) => item.id?.videoId)
        .map((item: any): NormalizedMedia => {
          const videoId = item.id.videoId;
          return {
            source: 'youtube',
            sourceId: videoId,
            sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
            type: 'short_video',
            title: item.snippet?.title || keyword,
            mediaUrl: `https://www.youtube.com/embed/${videoId}`,
            thumbnailUrl:
              item.snippet?.thumbnails?.high?.url ||
              item.snippet?.thumbnails?.default?.url,
            attribution: item.snippet?.channelTitle || 'YouTube Creator',
            rating: 'g',
          };
        });

      return {
        items: normalized,
        report: {
          source: 'youtube',
          status: 'ok',
          count: normalized.length,
        },
      };
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.error?.message || error.message;
      this.logger.error(`Lỗi khi gọi YouTube API [${keyword}]: ${errorMsg}`);
      return {
        items: [],
        report: {
          source: 'youtube',
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

