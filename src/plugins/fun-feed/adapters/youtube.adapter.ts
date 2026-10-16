import axios from 'axios';
import { Logger } from '@nestjs/common';
import { NormalizedMedia, SourceAdapter } from './source-adapter.interface';

export class YoutubeAdapter implements SourceAdapter {
  readonly source = 'youtube';
  private readonly logger = new Logger(YoutubeAdapter.name);

  constructor(private readonly apiKey: string) {}

  async fetch(keyword: string, limit = 5): Promise<NormalizedMedia[]> {
    if (!this.apiKey) {
      this.logger.warn('YOUTUBE_DATA_API_KEY chưa được cấu hình. Bỏ qua fetch YouTube.');
      return [];
    }

    try {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          key: this.apiKey,
          q: `${keyword} shorts`,
          part: 'snippet',
          type: 'video',
          maxResults: limit,
          videoDuration: 'short',
        },
        timeout: 5000,
      });

      const items = response.data?.items || [];
      return items
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
    } catch (error: any) {
      this.logger.error(`Lỗi khi gọi YouTube API [${keyword}]: ${error.message}`);
      return [];
    }
  }
}
