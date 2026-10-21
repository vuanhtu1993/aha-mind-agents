import axios from 'axios';
import { Logger } from '@nestjs/common';
import { NormalizedMedia, SourceAdapter, SourceReport } from './source-adapter.interface';
import {
  YoutubeChannelConfig,
  getUploadsPlaylistId,
  normalizeHandle,
} from '../config/channels.config';

export interface ResolvedChannel {
  channelId: string;
  name: string;
  uploadsPlaylistId: string;
}

/**
 * YoutubeAdapter: Thu thập video ngắn (Shorts) từ YouTube Data API v3 và YouTube RSS Feed.
 *
 * Chiến lược kỹ thuật (Why?):
 * 1. Hỗ trợ cấu hình thân thiện người dùng: Cho phép truyền @handle (ví dụ: @bbclearningenglish)
 *    và tự động phân giải (Resolve) sang Channel ID & Uploads Playlist ID.
 * 2. Uploads Playlist (playlistItems.list) chỉ tốn 1 unit/request (tiết kiệm 100 lần Quota so với Search).
 * 3. YouTube RSS Feed tốn 0 unit/request, là lớp phòng thủ (Fault-Tolerant Fallback) khi hết quota hoặc chưa cấu hình API Key.
 *
 * Made by Anh Tu - Share to be share
 */
export class YoutubeAdapter implements SourceAdapter {
  readonly source = 'youtube';
  private readonly logger = new Logger(YoutubeAdapter.name);

  /** In-memory cache lưu kết quả phân giải handle -> channelId để tránh gọi lặp lại */
  private readonly channelCache = new Map<string, ResolvedChannel>();

  constructor(private readonly apiKey: string) {}

  /**
   * Phân giải một YoutubeChannelConfig từ @handle thân thiện sang Channel ID và Uploads Playlist ID.
   * Ưu tiên:
   * 1. Nếu config đã có sẵn channelId -> Sử dụng trực tiếp.
   * 2. Nếu đã có trong in-memory cache -> Sử dụng từ cache.
   * 3. Gọi YouTube API (channels.list?forHandle) nếu có API Key (tốn 1 unit).
   * 4. Fallback cào trực tiếp thẻ meta từ https://www.youtube.com/@handle (0 unit, không cần API Key).
   */
  async resolveChannel(channel: YoutubeChannelConfig): Promise<ResolvedChannel | null> {
    const handle = normalizeHandle(channel.handle);
    const cleanHandle = handle.replace(/^@/, '').trim();

    // 1. Trường hợp đã cấu hình sẵn channelId
    if (channel.channelId) {
      const resolved: ResolvedChannel = {
        channelId: channel.channelId,
        name: channel.name || cleanHandle,
        uploadsPlaylistId:
          channel.uploadsPlaylistId || getUploadsPlaylistId(channel.channelId),
      };
      this.channelCache.set(handle, resolved);
      return resolved;
    }

    // 2. Trường hợp đã lưu trong Cache
    if (this.channelCache.has(handle)) {
      return this.channelCache.get(handle)!;
    }

    // 3. Phân giải qua YouTube Data API v3 (forHandle)
    if (this.apiKey) {
      try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
          params: {
            key: this.apiKey,
            part: 'snippet,contentDetails',
            forHandle: cleanHandle,
          },
          timeout: 6000,
        });

        const item = response.data?.items?.[0];
        if (item?.id) {
          const resolved: ResolvedChannel = {
            channelId: item.id,
            name: channel.name || item.snippet?.title || cleanHandle,
            uploadsPlaylistId:
              item.contentDetails?.relatedPlaylists?.uploads || getUploadsPlaylistId(item.id),
          };
          this.channelCache.set(handle, resolved);
          return resolved;
        }
      } catch (apiErr: any) {
        this.logger.debug(
          `Không thể resolve handle [${handle}] qua YouTube API: ${apiErr.message}. Chuyển sang fallback HTML.`,
        );
      }
    }

    // 4. Phân giải qua HTML Scraping trang kênh YouTube (0 Quota, không cần API Key)
    try {
      const response = await axios.get(`https://www.youtube.com/@${cleanHandle}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 6000,
      });

      const html = typeof response.data === 'string' ? response.data : '';
      const metaMatch = /<meta itemprop="channelId" content="([^"]+)"/.exec(html);
      const canonMatch = /href="https:\/\/www\.youtube\.com\/channel\/([^"]+)"/.exec(html);
      const jsonMatch = /"channelId":"(UC[a-zA-Z0-9_-]+)"/.exec(html);
      const channelId = metaMatch?.[1] || canonMatch?.[1] || jsonMatch?.[1];

      if (channelId) {
        const titleMatch =
          /<meta property="og:title" content="([^"]+)"/.exec(html) ||
          /<title>([^<]+)<\/title>/.exec(html);
        const name =
          channel.name ||
          titleMatch?.[1]?.replace(/ - YouTube$/, '').trim() ||
          cleanHandle;

        const resolved: ResolvedChannel = {
          channelId,
          name,
          uploadsPlaylistId: getUploadsPlaylistId(channelId),
        };
        this.channelCache.set(handle, resolved);
        return resolved;
      }
    } catch (htmlErr: any) {
      this.logger.warn(`Không thể resolve handle [${handle}] qua HTML: ${htmlErr.message}`);
    }

    return null;
  }

  /**
   * Cào video ngẫu nhiên theo từ khóa (Legacy keyword search).
   * Vẫn duy trì để phục vụ mô hình tìm kiếm ngẫu nhiên dự phòng.
   */
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
      const errorMsg = error.response?.data?.error?.message || error.message;
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

  /**
   * Thu thập các video mới nhất từ một kênh YouTube cụ thể theo khung thời gian (Channel Curation).
   * Tự động resolve handle -> channelId -> Uploads Playlist (1 unit quota) và fallback sang RSS (0 unit).
   */
  async fetchLatestFromChannelWithReport(
    channel: YoutubeChannelConfig,
    options?: { maxAgeHours?: number; limit?: number },
  ): Promise<{ items: NormalizedMedia[]; report: SourceReport }> {
    const limit = options?.limit || 5;
    const maxAgeHours = options?.maxAgeHours ?? 48;
    const cutoffTime = maxAgeHours > 0 ? Date.now() - maxAgeHours * 3600 * 1000 : 0;

    // 1. Tự động phân giải @handle sang Channel ID
    const resolved = await this.resolveChannel(channel);
    if (!resolved?.channelId) {
      const msg = `Không thể phân giải thông tin kênh từ handle [${channel.handle}].`;
      this.logger.error(msg);
      return {
        items: [],
        report: {
          source: 'youtube',
          status: 'error',
          count: 0,
          message: msg,
        },
      };
    }

    const { channelId, name, uploadsPlaylistId } = resolved;

    // 2. Nếu không có API Key, tự động chuyển sang cơ chế RSS Feed (0 Quota)
    if (!this.apiKey) {
      this.logger.debug(`YOUTUBE_DATA_API_KEY chưa cấu hình, fallback sang RSS cho kênh [${name}] (${channelId})`);
      const rssItems = await this.fetchFromRss(channelId, name, channel.defaultTopic, limit * 2);
      const filtered =
        cutoffTime > 0
          ? rssItems.filter((item) => {
              const pub = item.metadata?.publishedAt ? new Date(item.metadata.publishedAt).getTime() : 0;
              return pub >= cutoffTime;
            })
          : rssItems;

      const finalItems = (filtered.length > 0 ? filtered : rssItems).slice(0, limit);
      return {
        items: finalItems,
        report: {
          source: 'youtube',
          status: 'ok',
          count: finalItems.length,
          message: 'Lấy thành công qua YouTube RSS Feed (0 Quota).',
        },
      };
    }

    // 3. Sử dụng Uploads Playlist API (chỉ tiêu tốn 1 unit quota)
    try {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
        params: {
          key: this.apiKey,
          playlistId: uploadsPlaylistId,
          part: 'snippet,contentDetails',
          maxResults: Math.min(limit * 2, 20),
        },
        timeout: 8000,
      });

      const rawItems = response.data?.items || [];
      const normalized: NormalizedMedia[] = [];

      for (const item of rawItems) {
        const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
        if (!videoId) continue;

        const publishedAtStr = item.snippet?.publishedAt || item.contentDetails?.videoPublishedAt;
        const publishedTime = publishedAtStr ? new Date(publishedAtStr).getTime() : 0;

        // Bỏ qua nếu video xuất bản trước khung thời gian yêu cầu
        if (cutoffTime > 0 && publishedTime > 0 && publishedTime < cutoffTime) {
          continue;
        }

        normalized.push({
          source: 'youtube',
          sourceId: videoId,
          sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          type: 'short_video',
          title: item.snippet?.title || `Short by ${name}`,
          mediaUrl: `https://www.youtube.com/embed/${videoId}`,
          thumbnailUrl:
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.default?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          attribution: item.snippet?.channelTitle || name,
          rating: 'g',
          metadata: {
            channelId,
            handle: channel.handle,
            publishedAt: publishedAtStr,
            topic: channel.defaultTopic,
          },
        });

        if (normalized.length >= limit) break;
      }

      return {
        items: normalized,
        report: {
          source: 'youtube',
          status: 'ok',
          count: normalized.length,
          message: 'Lấy thành công qua YouTube Playlist API (1 unit quota).',
        },
      };
    } catch (apiError: any) {
      const errorMsg = apiError.response?.data?.error?.message || apiError.message;
      this.logger.warn(
        `Lỗi gọi YouTube Playlist API cho kênh [${name}]: ${errorMsg}. Tự động fallback sang RSS Feed...`,
      );

      // Dự phòng an toàn: Fallback sang YouTube RSS Feed
      const rssItems = await this.fetchFromRss(channelId, name, channel.defaultTopic, limit);
      return {
        items: rssItems,
        report: {
          source: 'youtube',
          status: rssItems.length > 0 ? 'ok' : 'error',
          count: rssItems.length,
          message: `Fallback RSS: ${errorMsg}`,
        },
      };
    }
  }

  /**
   * Thu thập video kênh YouTube thuận tiện không kèm report.
   */
  async fetchLatestFromChannel(
    channel: YoutubeChannelConfig,
    options?: { maxAgeHours?: number; limit?: number },
  ): Promise<NormalizedMedia[]> {
    const res = await this.fetchLatestFromChannelWithReport(channel, options);
    return res.items;
  }

  /**
   * Trích xuất video từ YouTube Atom/RSS Feed công khai (0 Quota).
   * https://www.youtube.com/feeds/videos.xml?channel_id=...
   */
  private async fetchFromRss(
    channelId: string,
    channelName: string,
    defaultTopic: string,
    limit = 5,
  ): Promise<NormalizedMedia[]> {
    try {
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      const response = await axios.get(rssUrl, { timeout: 8000 });
      const allEntries = this.parseRssFeed(response.data, channelName, channelId, defaultTopic);
      return allEntries.slice(0, limit);
    } catch (rssError: any) {
      this.logger.warn(`Không thể lấy RSS Feed từ kênh ${channelName} (${channelId}): ${rssError.message}`);
      return [];
    }
  }

  /**
   * Trích xuất các entry từ XML Atom Feed của YouTube bằng Regex chuẩn,
   * không cần cài đặt thêm thư viện XML parser cồng kềnh.
   */
  private parseRssFeed(
    xml: string,
    channelName: string,
    channelId: string,
    defaultTopic: string,
  ): NormalizedMedia[] {
    const items: NormalizedMedia[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match: RegExpExecArray | null;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entryContent = match[1];
      const videoIdMatch = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entryContent);
      const titleMatch = /<title>([^<]+)<\/title>/.exec(entryContent);
      const publishedMatch = /<published>([^<]+)<\/published>/.exec(entryContent);
      const thumbMatch = /<media:thumbnail[^>]+url="([^"]+)"/.exec(entryContent);

      if (videoIdMatch && titleMatch) {
        const videoId = videoIdMatch[1].trim();
        const title = titleMatch[1].trim();
        const publishedAt = publishedMatch ? publishedMatch[1].trim() : new Date().toISOString();
        const thumbnailUrl = thumbMatch
          ? thumbMatch[1].trim()
          : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        items.push({
          source: 'youtube',
          sourceId: videoId,
          sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          type: 'short_video',
          title,
          mediaUrl: `https://www.youtube.com/embed/${videoId}`,
          thumbnailUrl,
          attribution: channelName,
          rating: 'g',
          metadata: {
            channelId,
            publishedAt,
            topic: defaultTopic || 'conversation',
            isRssFallback: true,
          },
        });
      }
    }

    return items;
  }
}
