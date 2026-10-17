# Multi-Source Ingestion (Threads & Reddit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mở rộng nguồn dữ liệu cho module Fun Feed bằng cách bổ sung hai `SourceAdapter` mới: Reddit (meme hình ảnh, r/EnglishLearning, r/grammar, r/engrish) và Threads by Meta (ảnh/chữ châm biếm ngôn ngữ), khắc phục triệt để tình trạng thiếu hụt nội dung do hạn ngạch YouTube và giới hạn ảnh câm của GIPHY. TikTok Adapter được tách riêng cho Phase kế tiếp.

**Architecture:** Áp dụng nguyên lý Single Responsibility & Open/Closed Principle (SOLID). Xây dựng `RedditAdapter` và `ThreadsAdapter` tuân thủ interface `SourceAdapter`. Dữ liệu thô từ Reddit JSON và Threads API được chuẩn hóa thành `NormalizedMedia` (`type: 'image' | 'short_video' | 'gif'`), sau đó đi qua quy trình Dedup -> LLM Safety & Educational Enrichment (Gemini/Hive) -> Lưu vào MongoDB Atlas phục vụ Cursor Pagination.

**Tech Stack:** NestJS 11, TypeScript, Axios, Mongoose, Zod, Jest.

---

## File Structure Map

```
src/plugins/fun-feed/
├── adapters/
│   ├── source-adapter.interface.ts         # Modify: Mở rộng type source và kiểu chẩn đoán diagnostics
│   ├── giphy.adapter.ts                    # Giữ nguyên
│   ├── youtube.adapter.ts                  # Giữ nguyên
│   ├── reddit.adapter.ts                   # Create: Adapter cào bài viết kèm ảnh từ Subreddits
│   ├── reddit.adapter.spec.ts              # Create: Unit test cho RedditAdapter
│   ├── threads.adapter.ts                  # Create: Adapter lấy nội dung meme từ Threads
│   └── threads.adapter.spec.ts             # Create: Unit test cho ThreadsAdapter
├── config/
│   ├── keywords.config.ts                  # Modify: Thêm Subreddits và Threads hashtags vào pool
│   └── keywords.config.spec.ts             # Create: Test kiểm tra pool từ khóa đa nguồn
├── schemas/
│   ├── media-content.schema.ts             # Modify: Enum source chấp nhận 'threads' | 'reddit'
│   └── schemas.spec.ts                     # Modify: Test chấp nhận các source mới
├── services/
│   ├── fun-feed-ingestion.service.ts       # Modify: Inject RedditAdapter & ThreadsAdapter
│   └── fun-feed-ingestion.service.spec.ts  # Modify: Test ingestion đa nguồn và báo cáo diagnostics
├── controllers/
│   ├── fun-feed-cron.controller.ts         # Modify: Hỗ trợ query source filter trong cron trigger
│   └── fun-feed-cron.controller.spec.ts    # Modify: Test cron trigger với source filter
└── fun-feed.module.ts                      # Modify: Đăng ký RedditAdapter và ThreadsAdapter vào DI
```

---

### Task 1: Mở Rộng Schema & Domain Interface

**Files:**
- Modify: `src/plugins/fun-feed/schemas/schemas.spec.ts`
- Modify: `src/plugins/fun-feed/adapters/source-adapter.interface.ts:1-25`
- Modify: `src/plugins/fun-feed/schemas/media-content.schema.ts:7-19`

- [ ] **Step 1: Write the failing test for new sources in schema**

Chỉnh sửa file `src/plugins/fun-feed/schemas/schemas.spec.ts` để kiểm tra `source: 'reddit'` và `source: 'threads'` hợp lệ:

```typescript
import { AhaMediaContentSchema } from './media-content.schema';

describe('AhaMediaContentSchema', () => {
  it('should accept reddit and threads as valid sources', () => {
    const sourcePath: any = AhaMediaContentSchema.path('source');
    expect(sourcePath.enumValues).toContain('reddit');
    expect(sourcePath.enumValues).toContain('threads');
  });

  it('should accept image and short_video as valid media types', () => {
    const typePath: any = AhaMediaContentSchema.path('type');
    expect(typePath.enumValues).toContain('image');
    expect(typePath.enumValues).toContain('short_video');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/plugins/fun-feed/schemas/schemas.spec.ts`
Expected: FAIL vì `enumValues` hiện tại của schema chưa có `'reddit'` và `'threads'`.

- [ ] **Step 3: Update `source-adapter.interface.ts` and `media-content.schema.ts`**

Trong `src/plugins/fun-feed/adapters/source-adapter.interface.ts`:
```typescript
export interface NormalizedMedia {
  source: 'giphy' | 'youtube' | 'threads' | 'reddit' | 'tiktok' | 'generated';
  sourceId: string;
  sourceUrl: string;
  type: 'gif' | 'image' | 'video' | 'short_video';
  title: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  attribution?: string;
  rating?: string;
}

export interface SourceReport {
  source: string;
  status: 'ok' | 'missing_key' | 'error';
  count: number;
  message?: string;
}

export interface SourceAdapter {
  readonly source: string;
  fetch(keyword: string, limit?: number): Promise<NormalizedMedia[]>;
  fetchWithReport?(keyword: string, limit?: number): Promise<{ items: NormalizedMedia[]; report: SourceReport }>;
}
```

Trong `src/plugins/fun-feed/schemas/media-content.schema.ts`:
```typescript
@Schema({ timestamps: true, collection: 'aha_media_contents' })
export class AhaMediaContent {
  @Prop({ required: true, enum: ['giphy', 'youtube', 'threads', 'reddit', 'tiktok', 'generated'] })
  source: string;

  @Prop({ required: true })
  sourceId: string;

  @Prop({ required: true })
  sourceUrl: string;

  @Prop({ required: true, enum: ['gif', 'image', 'video', 'short_video'] })
  type: string;
  // ... các trường còn lại giữ nguyên
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/plugins/fun-feed/schemas/schemas.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/plugins/fun-feed/adapters/source-adapter.interface.ts src/plugins/fun-feed/schemas/media-content.schema.ts src/plugins/fun-feed/schemas/schemas.spec.ts
git commit -m "feat(fun-feed): expand source enum to support reddit and threads"
```

---

### Task 2: Triển Khai RedditAdapter (TDD)

**Files:**
- Create: `src/plugins/fun-feed/adapters/reddit.adapter.spec.ts`
- Create: `src/plugins/fun-feed/adapters/reddit.adapter.ts`

- [ ] **Step 1: Write the failing test for RedditAdapter**

Tạo file `src/plugins/fun-feed/adapters/reddit.adapter.spec.ts`:

```typescript
import axios from 'axios';
import { RedditAdapter } from './reddit.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('RedditAdapter', () => {
  let adapter: RedditAdapter;

  beforeEach(() => {
    adapter = new RedditAdapter();
    jest.clearAllMocks();
  });

  it('should fetch and normalize image posts from a subreddit', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: {
          children: [
            {
              data: {
                id: 'post_1',
                title: 'Funny Oxford Comma meme',
                permalink: '/r/EnglishLearning/comments/post_1/meme',
                url: 'https://i.redd.it/post_1.jpg',
                thumbnail: 'https://b.thumbs.redditmedia.com/thumb_1.jpg',
                author: 'GrammarCat',
                post_hint: 'image',
                over_18: false,
                stickied: false,
              },
            },
            {
              data: {
                id: 'post_nsfw',
                title: 'NSFW meme',
                permalink: '/r/EnglishLearning/comments/post_nsfw/bad',
                url: 'https://i.redd.it/bad.jpg',
                author: 'BadUser',
                post_hint: 'image',
                over_18: true, // Should be filtered out
                stickied: false,
              },
            },
            {
              data: {
                id: 'post_text_only',
                title: 'Question about grammar (no image)',
                permalink: '/r/EnglishLearning/comments/text/question',
                url: 'https://www.reddit.com/r/EnglishLearning/comments/text/question',
                author: 'Learner',
                post_hint: 'self', // Should be filtered out
                over_18: false,
                stickied: false,
              },
            },
          ],
        },
      },
    });

    const result = await adapter.fetchWithReport('r/EnglishLearning', 5);
    expect(result.report.status).toBe('ok');
    expect(result.report.count).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      source: 'reddit',
      sourceId: 'post_1',
      sourceUrl: 'https://reddit.com/r/EnglishLearning/comments/post_1/meme',
      type: 'image',
      title: 'Funny Oxford Comma meme',
      mediaUrl: 'https://i.redd.it/post_1.jpg',
      thumbnailUrl: 'https://b.thumbs.redditmedia.com/thumb_1.jpg',
      attribution: 'u/GrammarCat',
      rating: 'g',
    });
  });

  it('should handle search queries when keyword is not a subreddit', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: {
          children: [
            {
              data: {
                id: 'post_search',
                title: 'English homophones meme',
                permalink: '/r/memes/comments/post_search/homophones',
                url: 'https://i.redd.it/homophones.png',
                author: 'WordSmith',
                post_hint: 'image',
                over_18: false,
                stickied: false,
              },
            },
          ],
        },
      },
    });

    const items = await adapter.fetch('english homophones meme', 3);
    expect(items).toHaveLength(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('https://www.reddit.com/search.json'),
      expect.any(Object),
    );
  });

  it('should handle network errors gracefully and return error report', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Rate limited 429'));
    const result = await adapter.fetchWithReport('r/EnglishLearning', 5);
    expect(result.report.status).toBe('error');
    expect(result.report.count).toBe(0);
    expect(result.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/plugins/fun-feed/adapters/reddit.adapter.spec.ts`
Expected: FAIL with "Cannot find module './reddit.adapter'".

- [ ] **Step 3: Implement `RedditAdapter`**

Tạo file `src/plugins/fun-feed/adapters/reddit.adapter.ts`:

```typescript
import axios from 'axios';
import { Logger } from '@nestjs/common';
import { NormalizedMedia, SourceAdapter, SourceReport } from './source-adapter.interface';

export class RedditAdapter implements SourceAdapter {
  readonly source = 'reddit';
  private readonly logger = new Logger(RedditAdapter.name);
  private readonly userAgent = 'AhaMindAgents/1.0 (Educational English Learning Bot; contact@ahamind.app)';

  async fetchWithReport(keyword: string, limit = 5): Promise<{ items: NormalizedMedia[]; report: SourceReport }> {
    try {
      const cleanKeyword = keyword.trim();
      const isSubreddit = cleanKeyword.startsWith('r/') || /^[a-zA-Z0-9_]+$/.test(cleanKeyword);
      const subredditName = cleanKeyword.replace(/^r\//, '');

      let url: string;
      const params: Record<string, any> = {
        limit: Math.min(limit * 3, 25), // Lấy dư để lọc bài không có ảnh
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

        // 1. Loại bỏ bài NSFW, bài pinned và bài không có ảnh
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
      const errorMsg = error.response?.data?.message || error.message;
      this.logger.error(`Lỗi khi cào Reddit [${keyword}]: ${errorMsg}`);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/plugins/fun-feed/adapters/reddit.adapter.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/plugins/fun-feed/adapters/reddit.adapter.ts src/plugins/fun-feed/adapters/reddit.adapter.spec.ts
git commit -m "feat(fun-feed): implement RedditAdapter with image filtering and safety checks"
```

---

### Task 3: Triển Khai ThreadsAdapter (TDD)

**Files:**
- Create: `src/plugins/fun-feed/adapters/threads.adapter.spec.ts`
- Create: `src/plugins/fun-feed/adapters/threads.adapter.ts`

- [ ] **Step 1: Write the failing test for ThreadsAdapter**

Tạo file `src/plugins/fun-feed/adapters/threads.adapter.spec.ts`:

```typescript
import axios from 'axios';
import { ThreadsAdapter } from './threads.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ThreadsAdapter', () => {
  it('should return missing_key report when THREADS_ACCESS_TOKEN is not set', async () => {
    const adapter = new ThreadsAdapter('');
    const result = await adapter.fetchWithReport('#learnenglish', 5);
    expect(result.report.status).toBe('missing_key');
    expect(result.items).toEqual([]);
  });

  it('should fetch and normalize posts from Threads API when token is provided', async () => {
    const adapter = new ThreadsAdapter('valid-threads-token');
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'th_1',
            text: 'Why do we drive on a parkway and park on a driveway? English is hard.',
            media_type: 'IMAGE',
            media_url: 'https://scontent.cdninstagram.com/th_1.jpg',
            permalink: 'https://www.threads.net/@englishnerd/post/th_1',
            username: 'englishnerd',
          },
          {
            id: 'th_2',
            text: 'Short video explaining irregular verbs in 15 seconds',
            media_type: 'VIDEO',
            media_url: 'https://scontent.cdninstagram.com/th_2.mp4',
            permalink: 'https://www.threads.net/@teachertom/post/th_2',
            username: 'teachertom',
          },
        ],
      },
    });

    const result = await adapter.fetchWithReport('#englishhumor', 5);
    expect(result.report.status).toBe('ok');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      source: 'threads',
      sourceId: 'th_1',
      sourceUrl: 'https://www.threads.net/@englishnerd/post/th_1',
      type: 'image',
      title: 'Why do we drive on a parkway and park on a driveway? English is hard.',
      mediaUrl: 'https://scontent.cdninstagram.com/th_1.jpg',
      thumbnailUrl: 'https://scontent.cdninstagram.com/th_1.jpg',
      attribution: 'englishnerd',
      rating: 'g',
    });
    expect(result.items[1].type).toBe('short_video');
  });

  it('should handle API errors and return error report', async () => {
    const adapter = new ThreadsAdapter('valid-threads-token');
    mockedAxios.get.mockRejectedValueOnce(new Error('Graph API Error'));
    const result = await adapter.fetchWithReport('#englishjokes', 5);
    expect(result.report.status).toBe('error');
    expect(result.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/plugins/fun-feed/adapters/threads.adapter.spec.ts`
Expected: FAIL with "Cannot find module './threads.adapter'".

- [ ] **Step 3: Implement `ThreadsAdapter`**

Tạo file `src/plugins/fun-feed/adapters/threads.adapter.ts`:

```typescript
import axios from 'axios';
import { Logger } from '@nestjs/common';
import { NormalizedMedia, SourceAdapter, SourceReport } from './source-adapter.interface';

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

      // 1. Nếu có Official Access Token (Meta Graph Threads API)
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

      // 2. Fallback nếu sử dụng RapidAPI Threads Scraper (khi chưa có Meta App Review)
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/plugins/fun-feed/adapters/threads.adapter.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/plugins/fun-feed/adapters/threads.adapter.ts src/plugins/fun-feed/adapters/threads.adapter.spec.ts
git commit -m "feat(fun-feed): implement ThreadsAdapter with Meta Graph and RapidAPI fallback"
```

---

### Task 4: Cập Nhật Danh Mục Từ Khóa Đa Nguồn (`keywords.config.ts`)

**Files:**
- Create: `src/plugins/fun-feed/config/keywords.config.spec.ts`
- Modify: `src/plugins/fun-feed/config/keywords.config.ts`

- [ ] **Step 1: Write the failing test for multi-source keywords pool**

Tạo file `src/plugins/fun-feed/config/keywords.config.spec.ts`:

```typescript
import { FUNNY_KEYWORDS_POOL, KeywordItem } from './keywords.config';

describe('FUNNY_KEYWORDS_POOL', () => {
  it('should include keywords for reddit and threads', () => {
    const redditKeywords = FUNNY_KEYWORDS_POOL.filter((k) => k.source === 'reddit');
    const threadsKeywords = FUNNY_KEYWORDS_POOL.filter((k) => k.source === 'threads');

    expect(redditKeywords.length).toBeGreaterThanOrEqual(3);
    expect(threadsKeywords.length).toBeGreaterThanOrEqual(3);
  });

  it('should ensure every keyword item has valid properties', () => {
    FUNNY_KEYWORDS_POOL.forEach((item: KeywordItem) => {
      expect(item.keyword).toBeDefined();
      expect(item.keyword.length).toBeGreaterThan(0);
      expect(['grammar', 'vocabulary', 'pronunciation', 'idiom', 'conversation']).toContain(item.topic);
      expect(['giphy', 'youtube', 'threads', 'reddit', 'all']).toContain(item.source);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/plugins/fun-feed/config/keywords.config.spec.ts`
Expected: FAIL vì `keywords.config.ts` chưa có keyword nào có `source === 'reddit'` hoặc `source === 'threads'`.

- [ ] **Step 3: Update `keywords.config.ts`**

Chỉnh sửa file `src/plugins/fun-feed/config/keywords.config.ts` để cập nhật type `KeywordItem['source']` và bổ sung danh mục Subreddits + Threads:

```typescript
export interface KeywordItem {
  keyword: string;
  topic: 'grammar' | 'vocabulary' | 'pronunciation' | 'idiom' | 'conversation';
  source: 'giphy' | 'youtube' | 'threads' | 'reddit' | 'all';
}
```
Và thêm vào mảng `FUNNY_KEYWORDS_POOL`:
```typescript
  // 7. Curated Subreddits (Reddit Community Memes)
  { keyword: 'r/EnglishLearning', topic: 'grammar', source: 'reddit' },
  { keyword: 'r/grammar', topic: 'grammar', source: 'reddit' },
  { keyword: 'r/engrish', topic: 'vocabulary', source: 'reddit' },
  { keyword: 'oxford comma fail', topic: 'grammar', source: 'reddit' },
  { keyword: 'english idiom meme', topic: 'idiom', source: 'reddit' },

  // 8. Threads Community Hashtags & Topics
  { keyword: '#learnenglish', topic: 'conversation', source: 'threads' },
  { keyword: '#englishhumor', topic: 'conversation', source: 'threads' },
  { keyword: '#englishjokes', topic: 'idiom', source: 'threads' },
  { keyword: '#confusingenglish', topic: 'vocabulary', source: 'threads' },
  { keyword: '#grammarpolice', topic: 'grammar', source: 'threads' },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/plugins/fun-feed/config/keywords.config.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/plugins/fun-feed/config/keywords.config.ts src/plugins/fun-feed/config/keywords.config.spec.ts
git commit -m "feat(fun-feed): expand static keywords pool with reddit subreddits and threads tags"
```

---

### Task 5: Tích Hợp Đa Nguồn Vào Ingestion Service (TDD)

**Files:**
- Modify: `src/plugins/fun-feed/services/fun-feed-ingestion.service.spec.ts`
- Modify: `src/plugins/fun-feed/services/fun-feed-ingestion.service.ts`

- [ ] **Step 1: Write failing tests in `fun-feed-ingestion.service.spec.ts`**

Cập nhật file `src/plugins/fun-feed/services/fun-feed-ingestion.service.spec.ts` để kiểm tra việc gọi `redditAdapter` và `threadsAdapter`:

```typescript
import { FunFeedIngestionService } from './fun-feed-ingestion.service';
import { NormalizedMedia } from '../adapters/source-adapter.interface';

describe('FunFeedIngestionService', () => {
  let service: FunFeedIngestionService;
  let mediaModelMock: any;
  let hiveServiceMock: any;
  let giphyAdapterMock: any;
  let youtubeAdapterMock: any;
  let redditAdapterMock: any;
  let threadsAdapterMock: any;

  beforeEach(() => {
    mediaModelMock = {
      findOne: jest.fn().mockReturnValue({ lean: jest.fn() }),
      create: jest.fn(),
    };

    hiveServiceMock = {
      invokeStructured: jest.fn(),
    };

    giphyAdapterMock = { fetchWithReport: jest.fn() };
    youtubeAdapterMock = { fetchWithReport: jest.fn() };
    redditAdapterMock = { fetchWithReport: jest.fn() };
    threadsAdapterMock = { fetchWithReport: jest.fn() };

    service = new FunFeedIngestionService(
      mediaModelMock,
      hiveServiceMock,
      giphyAdapterMock,
      youtubeAdapterMock,
      redditAdapterMock,
      threadsAdapterMock,
    );
  });

  it('should fetch from Reddit when keyword source is reddit or all', async () => {
    redditAdapterMock.fetchWithReport.mockResolvedValueOnce({
      items: [
        {
          source: 'reddit',
          sourceId: 'red_1',
          sourceUrl: 'https://reddit.com/r/1',
          type: 'image',
          title: 'Reddit meme',
          mediaUrl: 'https://i.redd.it/1.jpg',
        },
      ],
      report: { source: 'reddit', status: 'ok', count: 1 },
    });

    mediaModelMock.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(null) });

    hiveServiceMock.invokeStructured.mockResolvedValueOnce({
      parsed: {
        isSafe: true,
        topic: 'grammar',
        level: 'intermediate',
        whyFunny: 'Oxford comma omitted',
        youLearned: 'Use comma before and',
        learningScore: 0.9,
      },
    });

    const result = await service.ingestSingleKeyword(
      { keyword: 'r/EnglishLearning', topic: 'grammar', source: 'reddit' },
      5,
    );

    expect(redditAdapterMock.fetchWithReport).toHaveBeenCalledWith('r/EnglishLearning', 5);
    expect(result.saved).toBe(1);
    expect(result.diagnostics?.reddit?.status).toBe('ok');
  });

  it('should fetch from Threads when keyword source is threads or all', async () => {
    threadsAdapterMock.fetchWithReport.mockResolvedValueOnce({
      items: [
        {
          source: 'threads',
          sourceId: 'th_1',
          sourceUrl: 'https://threads.net/1',
          type: 'image',
          title: 'Threads joke',
          mediaUrl: 'https://cdn.threads.net/1.jpg',
        },
      ],
      report: { source: 'threads', status: 'ok', count: 1 },
    });

    mediaModelMock.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(null) });

    hiveServiceMock.invokeStructured.mockResolvedValueOnce({
      parsed: {
        isSafe: true,
        topic: 'conversation',
        level: 'beginner',
        whyFunny: 'Puns on daily words',
        youLearned: 'Driveway vs parkway',
        learningScore: 0.85,
      },
    });

    const result = await service.ingestSingleKeyword(
      { keyword: '#englishjokes', topic: 'conversation', source: 'threads' },
      5,
    );

    expect(threadsAdapterMock.fetchWithReport).toHaveBeenCalledWith('#englishjokes', 5);
    expect(result.saved).toBe(1);
    expect(result.diagnostics?.threads?.status).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/plugins/fun-feed/services/fun-feed-ingestion.service.spec.ts`
Expected: FAIL vì `FunFeedIngestionService` constructor chỉ nhận 4 tham số, chưa có `redditAdapter` và `threadsAdapter`.

- [ ] **Step 3: Update `FunFeedIngestionService` implementation**

Cập nhật `src/plugins/fun-feed/services/fun-feed-ingestion.service.ts`:

```typescript
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
    private readonly aiService: any,
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

    // 4. Fetch từ Threads
    if (this.threadsAdapter && (keywordItem.source === 'threads' || keywordItem.source === 'all')) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/plugins/fun-feed/services/fun-feed-ingestion.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/plugins/fun-feed/services/fun-feed-ingestion.service.ts src/plugins/fun-feed/services/fun-feed-ingestion.service.spec.ts
git commit -m "feat(fun-feed): integrate Reddit and Threads adapters into FunFeedIngestionService"
```

---

### Task 6: Cập Nhật Module DI Container & Cron Controller (TDD)

**Files:**
- Modify: `src/plugins/fun-feed/controllers/fun-feed-cron.controller.spec.ts`
- Modify: `src/plugins/fun-feed/controllers/fun-feed-cron.controller.ts`
- Modify: `src/plugins/fun-feed/fun-feed.module.ts`

- [ ] **Step 1: Write failing test in `fun-feed-cron.controller.spec.ts` for source filter**

Cập nhật `src/plugins/fun-feed/controllers/fun-feed-cron.controller.spec.ts` kiểm tra tham số `source`:

```typescript
it('should accept custom source query param and pass to ingestionService', async () => {
  await controller.handleVercelCron(
    { headers: { authorization: 'Bearer secret_123' } },
    'r/grammar',
    '3',
    'reddit',
  );

  expect(ingestionServiceMock.ingestSingleKeyword).toHaveBeenCalledWith(
    expect.objectContaining({
      keyword: 'r/grammar',
      source: 'reddit',
    }),
    3,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/plugins/fun-feed/controllers/fun-feed-cron.controller.spec.ts`
Expected: FAIL vì `handleVercelCron` chưa nhận tham số thứ tư `source`.

- [ ] **Step 3: Update `FunFeedCronController` and `FunFeedModule`**

Trong `src/plugins/fun-feed/controllers/fun-feed-cron.controller.ts`:
```typescript
  @Get('cron-ingest')
  @ApiOperation({ summary: 'Kích hoạt Ingest định kỳ từ Vercel Cron (Cần Authorization nếu có CRON_SECRET)' })
  @ApiQuery({ name: 'keyword', required: false, description: 'Từ khóa tùy chọn để cào (Mặc định chọn ngẫu nhiên trong pool)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Số lượng items cần cào (mặc định 4)' })
  @ApiQuery({ name: 'source', required: false, description: 'Nguồn cần cào: giphy, youtube, reddit, threads, all' })
  async handleVercelCron(
    @Req() req?: Request | any,
    @Query('keyword') customKeyword?: string,
    @Query('limit') customLimit?: string,
    @Query('source') customSource?: string,
  ) {
    const rawHeader = req?.headers?.['authorization'] || (typeof req === 'string' ? req : undefined);
    const cronSecret = this.configService.get<string>('CRON_SECRET');
    if (cronSecret) {
      const token = rawHeader?.replace(/^Bearer\s+/i, '');
      if (token !== cronSecret) {
        this.logger.warn('Truy cập cron bị từ chối: Sai CRON_SECRET');
        throw new UnauthorizedException('Invalid cron authorization token');
      }
    }

    const validSources = ['giphy', 'youtube', 'threads', 'reddit', 'all'] as const;
    const resolvedSource = validSources.includes(customSource as any)
      ? (customSource as any)
      : undefined;

    const baseItem = customKeyword
      ? { keyword: customKeyword, topic: 'grammar' as const, source: resolvedSource || ('all' as const) }
      : FUNNY_KEYWORDS_POOL[Math.floor(Math.random() * FUNNY_KEYWORDS_POOL.length)];

    const keywordItem = resolvedSource ? { ...baseItem, source: resolvedSource } : baseItem;

    const limit = customLimit ? parseInt(customLimit, 10) : 4;
    this.logger.log(`Bắt đầu Ingest cho từ khóa [${keywordItem.keyword}] (source: ${keywordItem.source}, limit: ${limit})...`);

    const result = await this.ingestionService.ingestSingleKeyword(keywordItem, limit);

    return {
      success: true,
      processedKeywords: 1,
      keyword: keywordItem.keyword,
      topic: keywordItem.topic,
      source: keywordItem.source,
      stats: result,
    };
  }
```

Trong `src/plugins/fun-feed/fun-feed.module.ts`:
```typescript
import { RedditAdapter } from './adapters/reddit.adapter';
import { ThreadsAdapter } from './adapters/threads.adapter';

// trong providers:
    {
      provide: RedditAdapter,
      useFactory: () => new RedditAdapter(),
    },
    {
      provide: ThreadsAdapter,
      useFactory: (config: ConfigService) =>
        new ThreadsAdapter(
          config.get<string>('THREADS_ACCESS_TOKEN', process.env.THREADS_ACCESS_TOKEN || ''),
          config.get<string>('THREADS_RAPIDAPI_KEY', process.env.THREADS_RAPIDAPI_KEY || ''),
        ),
      inject: [ConfigService],
    },
    {
      provide: FunFeedIngestionService,
      useFactory: (mediaModel, hiveService, giphy, youtube, reddit, threads) =>
        new FunFeedIngestionService(mediaModel, hiveService, giphy, youtube, reddit, threads),
      inject: [
        getModelToken(AhaMediaContent.name, AHA_TOOLS_CONNECTION),
        HiveService,
        GiphyAdapter,
        YoutubeAdapter,
        RedditAdapter,
        ThreadsAdapter,
      ],
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/plugins/fun-feed/controllers/fun-feed-cron.controller.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/plugins/fun-feed/controllers/fun-feed-cron.controller.ts src/plugins/fun-feed/controllers/fun-feed-cron.controller.spec.ts src/plugins/fun-feed/fun-feed.module.ts
git commit -m "feat(fun-feed): wire Reddit and Threads adapters into DI module and support source query in cron"
```

---

### Task 7: Kiểm Thử Toàn Diện & Đảm Bảo Chất Lượng (Full Verification)

- [ ] **Step 1: Run all Fun Feed test suites**

Run: `npm test -- src/plugins/fun-feed`
Expected: All test suites PASS (10 suites, 20+ tests).

- [ ] **Step 2: Run TypeScript typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: NestJS build succeeds with exit code 0.

- [ ] **Step 4: Final commit and cleanup**

```bash
git status
git commit -m "chore(fun-feed): complete multi-source ingestion plan for Threads and Reddit"
```

---

*Made by Anh Tu - Share to be share*
