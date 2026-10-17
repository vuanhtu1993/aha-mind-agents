import axios from 'axios';
import { Logger } from '@nestjs/common';
import { NormalizedMedia, SourceAdapter, SourceReport } from './source-adapter.interface';

/**
 * RedditAdapter: Thu thập các bài đăng meme hài hước về tiếng Anh từ Reddit.
 * 
 * Tại sao cần RedditAdapter?
 * - Reddit sở hữu các cộng đồng học tiếng Anh và meme ngôn ngữ lớn nhất thế giới (r/EnglishLearning, r/grammar, r/engrish).
 * - Cung cấp kho meme phong phú kèm ngữ cảnh chữ dồi dào, là đầu vào tuyệt vời cho LLM phân tích ngữ pháp.
 * - Hỗ trợ cả Official OAuth2 (Client Credentials) cho môi trường Cloud/Datacenter (Vercel/AWS)
 *   và Public JSON Endpoint cho môi trường residential/local.
 *
 * Made by Anh Tu - Share to be share
 */
export class RedditAdapter implements SourceAdapter {
  readonly source = 'reddit';
  private readonly logger = new Logger(RedditAdapter.name);
  private static hasWarned403 = false;

  private readonly userAgent: string;
  private cachedAccessToken?: string;
  private tokenExpiresAt = 0;

  constructor(
    private readonly clientId?: string,
    private readonly clientSecret?: string,
    private readonly proxyUrl?: string,
    private readonly username?: string,
  ) {
    const user = this.username || 'aha_mind';
    this.userAgent = `web:aha-mind-agents:v1.0.0 (by /u/${user})`;
  }

  /**
   * Kiểm tra xem adapter đã được cấu hình OAuth credentials hoặc Proxy hay chưa.
   * Nếu chưa cấu hình trên môi trường Cloud (Vercel/AWS), hệ thống sẽ bỏ qua để tránh lỗi 403 Forbidden.
   */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret) || !!this.proxyUrl;
  }

  /**
   * Lấy OAuth Access Token từ Reddit (Application-only OAuth / Client Credentials Flow).
   * Giúp request vượt qua màng lọc WAF chặn Datacenter IP của Reddit trên Vercel.
   */
  private async getAccessToken(): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) {
      return null;
    }

    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedAccessToken;
    }

    try {
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const response = await axios.post(
        'https://www.reddit.com/api/v1/access_token',
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': this.userAgent,
          },
          timeout: 6000,
        },
      );

      if (response.data?.access_token) {
        this.cachedAccessToken = response.data.access_token;
        this.tokenExpiresAt = Date.now() + (response.data.expires_in || 3600) * 1000;
        return this.cachedAccessToken ?? null;
      }
      return null;
    } catch (err: any) {
      this.logger.warn(`Lỗi khi xin Reddit OAuth access token: ${err.message}`);
      return null;
    }
  }

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

      const token = await this.getAccessToken();
      const headers: Record<string, string> = {
        'User-Agent': this.userAgent,
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
        if (cleanKeyword.startsWith('r/')) {
          url = `https://oauth.reddit.com/r/${subredditName}/hot`;
        } else {
          url = 'https://oauth.reddit.com/search';
          params.q = `${cleanKeyword} (subreddit:EnglishLearning OR subreddit:grammar OR subreddit:engrish OR subreddit:memes)`;
          params.sort = 'top';
          params.t = 'month';
        }
      } else {
        if (cleanKeyword.startsWith('r/')) {
          url = `https://www.reddit.com/r/${subredditName}/hot.json`;
        } else {
          url = 'https://www.reddit.com/search.json';
          params.q = `${cleanKeyword} (subreddit:EnglishLearning OR subreddit:grammar OR subreddit:engrish OR subreddit:memes)`;
          params.sort = 'top';
          params.t = 'month';
        }
      }

      const response = await axios.get(url, {
        params,
        headers,
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
      const is403 = error.response?.status === 403;
      const errorMsg = error.response?.data?.message || error.message;

      if (is403) {
        if (!RedditAdapter.hasWarned403) {
          this.logger.warn(
            `Bỏ qua Reddit [${keyword}]: Reddit WAF chặn IP máy chủ Cloud/Datacenter (403 Forbidden). Cần cấu hình REDDIT_CLIENT_ID & REDDIT_CLIENT_SECRET hoặc Proxy dân cư để cào từ Vercel/Cloud.`,
          );
          RedditAdapter.hasWarned403 = true;
        }
      } else if (isConnectionRefused) {
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
