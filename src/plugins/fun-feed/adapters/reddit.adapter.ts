import axios from 'axios';
import { Logger } from '@nestjs/common';
import { NormalizedMedia, SourceAdapter, SourceReport } from './source-adapter.interface';

/**
 * RedditAdapter: Thu thập các bài đăng meme hài hước về tiếng Anh từ Reddit.
 * 
 * Tại sao cần RedditAdapter?
 * - Reddit sở hữu các cộng đồng học tiếng Anh và meme ngôn ngữ lớn nhất thế giới (r/EnglishLearning, r/grammar, r/engrish).
 * - Cung cấp public JSON endpoint không tốn phí, không bị giới hạn quota 100 units như YouTube API.
 * - Ảnh meme có ngữ cảnh chữ phong phú, là đầu vào tuyệt vời cho LLM phân tích ngữ pháp.
 *
 * Made by Anh Tu - Share to be share
 */
export class RedditAdapter implements SourceAdapter {
  readonly source = 'reddit';
  private readonly logger = new Logger(RedditAdapter.name);

  // Reddit bắt buộc gửi User-Agent tùy chỉnh để định danh bot, tránh bị chặn mã lỗi 429 Too Many Requests
  private readonly userAgent = 'AhaMindAgents/1.0 (Educational English Learning Bot; contact@ahamind.app)';

  async fetchWithReport(keyword: string, limit = 5): Promise<{ items: NormalizedMedia[]; report: SourceReport }> {
    try {
      const cleanKeyword = keyword.trim();
      const isSubreddit = cleanKeyword.startsWith('r/') || /^[a-zA-Z0-9_]+$/.test(cleanKeyword);
      const subredditName = cleanKeyword.replace(/^r\//, '');

      let url: string;
      const params: Record<string, any> = {
        // Lấy dư gấp 3 lần số lượng yêu cầu để bù trừ cho các bài text không có ảnh
        limit: Math.min(limit * 3, 25),
      };

      if (cleanKeyword.startsWith('r/')) {
        url = `https://www.reddit.com/r/${subredditName}/hot.json`;
      } else {
        url = 'https://www.reddit.com/search.json';
        params.q = `${cleanKeyword} (subreddit:EnglishLearning OR subreddit:grammar OR subreddit:engrish OR subreddit:memes)`;
        params.sort = 'top';
        params.t = 'month';
      }

      const response = await axios.get(url, {
        params,
        headers: {
          'User-Agent': this.userAgent,
        },
        timeout: 8000,
      });

      const children = response.data?.data?.children || [];
      const items: NormalizedMedia[] = [];

      for (const entry of children) {
        const post = entry.data;
        if (!post) continue;

        // 1. Lọc an toàn: Loại bỏ bài NSFW (over_18), bài ghim (stickied) và bài không có ảnh
        if (post.over_18 || post.stickied) continue;

        const postUrl: string = post.url || '';
        const isImage =
          post.post_hint === 'image' ||
          /\.(jpg|jpeg|png|webp|gif)$/i.test(postUrl) ||
          postUrl.includes('i.redd.it');

        if (!isImage) continue;

        const isGif = /\.gif$/i.test(postUrl);

        items.push({
          source: 'reddit',
          sourceId: post.id,
          sourceUrl: `https://reddit.com${post.permalink}`,
          type: isGif ? 'gif' : 'image',
          title: post.title || cleanKeyword,
          mediaUrl: postUrl,
          thumbnailUrl: post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : undefined,
          attribution: post.author ? `u/${post.author}` : 'Reddit Community',
          rating: 'g',
        });

        if (items.length >= limit) break;
      }

      return {
        items,
        report: {
          source: 'reddit',
          status: 'ok',
          count: items.length,
        },
      };
    } catch (error: any) {
      const isConnectionRefused = error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED') || error.message?.includes('127.0.0.1');
      const errorMsg = error.response?.data?.message || error.message;

      if (isConnectionRefused) {
        this.logger.warn(
          `Bỏ qua Reddit [${keyword}]: Không thể kết nối tới reddit.com (Do nhà mạng ISP chặn DNS Sinkhole 127.0.0.1 trên môi trường local).`,
        );
      } else {
        this.logger.warn(`Không thể lấy dữ liệu Reddit [${keyword}]: ${errorMsg}`);
      }

      return {
        items: [],
        report: {
          source: 'reddit',
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
