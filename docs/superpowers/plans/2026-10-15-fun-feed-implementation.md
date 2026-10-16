# Fun Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng tính năng Fun Feed giải trí và học tiếng Anh qua meme/video (GIPHY & YouTube) theo phong cách TikTok/Reels trên nền tảng Vercel Serverless.

**Architecture:** Kiến trúc phân rã (Decoupled) giữa luồng thu thập làm giàu nội dung (Ingestion qua Vercel Cron trigger dạng Light-Batch) và luồng hiển thị (Serving API đọc trực tiếp từ MongoDB Atlas bằng Cursor Pagination, media streaming trực tiếp từ CDN của GIPHY/YouTube). Tự động kiểm duyệt bằng Rating G và LLM Safety filter kết hợp cơ chế Auto-hide khi cộng đồng report $\ge 3$ lần.

**Tech Stack:** NestJS 11, MongoDB/Mongoose, Vercel Serverless, GIPHY Search API, YouTube Data API v3, Gemini/Hive AI, Zod, Jest.

---

## File Structure

```
src/plugins/fun-feed/
├── config/
│   └── keywords.config.ts                      # Danh mục từ khóa tĩnh theo chủ đề
├── schemas/
│   ├── media-content.schema.ts                 # Schema lưu trữ media memes/video
│   └── user-interaction.schema.ts              # Schema lưu vết like/save/report
├── dto/
│   ├── feed-query.dto.ts                       # DTO query feed phân trang cursor
│   └── interact.dto.ts                         # DTO tương tác người dùng
├── adapters/
│   ├── source-adapter.interface.ts             # Interface chuẩn cho các nguồn media
│   ├── giphy.adapter.ts                        # Adapter tích hợp GIPHY API
│   ├── giphy.adapter.spec.ts                   # Unit test cho GiphyAdapter
│   ├── youtube.adapter.ts                      # Adapter tích hợp YouTube Data API v3
│   └── youtube.adapter.spec.ts                 # Unit test cho YoutubeAdapter
├── services/
│   ├── fun-feed-ingestion.service.ts           # Service cào, lọc an toàn, LLM enrich và lưu DB
│   ├── fun-feed-ingestion.service.spec.ts      # Unit test cho FunFeedIngestionService
│   ├── fun-feed.service.ts                     # Service phục vụ feed, cursor query và tương tác
│   └── fun-feed.service.spec.ts                # Unit test cho FunFeedService
├── controllers/
│   ├── fun-feed.controller.ts                  # Controller public: xem feed, tương tác
│   ├── fun-feed.controller.spec.ts             # Unit test cho FunFeedController
│   ├── fun-feed-cron.controller.ts             # Controller nhận trigger từ Vercel Cron
│   └── fun-feed-cron.controller.spec.ts        # Unit test cho FunFeedCronController
├── tools/
│   ├── get-funny-english.tool.ts               # Tool cho Aha Mind Agent
│   └── get-funny-english.tool.spec.ts          # Unit test cho Tool
├── fun-feed.module.ts                          # Module đăng ký DI container
└── fun-feed.module.spec.ts                     # Integration test cho module
```

---

### Task 1: Static Keyword Config & Mongoose Schemas

**Files:**
- Create: `src/plugins/fun-feed/config/keywords.config.ts`
- Create: `src/plugins/fun-feed/schemas/media-content.schema.ts`
- Create: `src/plugins/fun-feed/schemas/user-interaction.schema.ts`
- Test: `src/plugins/fun-feed/schemas/schemas.spec.ts`

- [ ] **Step 1: Write the failing test for schemas**

```typescript
// src/plugins/fun-feed/schemas/schemas.spec.ts
import mongoose from 'mongoose';
import { AhaMediaContentSchema, AhaMediaContent } from './media-content.schema';
import { UserInteractionSchema, UserInteraction } from './user-interaction.schema';
import { FUNNY_KEYWORDS_POOL } from '../config/keywords.config';

describe('Fun Feed Schemas & Config', () => {
  it('should have predefined keywords in FUNNY_KEYWORDS_POOL', () => {
    expect(FUNNY_KEYWORDS_POOL.length).toBeGreaterThan(0);
    expect(FUNNY_KEYWORDS_POOL[0]).toHaveProperty('keyword');
    expect(FUNNY_KEYWORDS_POOL[0]).toHaveProperty('topic');
    expect(FUNNY_KEYWORDS_POOL[0]).toHaveProperty('source');
  });

  it('should validate AhaMediaContent schema correctly', () => {
    const MediaModel = mongoose.model<AhaMediaContent>('TestMedia', AhaMediaContentSchema);
    const validDoc = new MediaModel({
      source: 'giphy',
      sourceId: 'xyz123',
      sourceUrl: 'https://giphy.com/gifs/xyz123',
      type: 'gif',
      title: 'Grammar meme',
      mediaUrl: 'https://media.giphy.com/media/xyz123/giphy.gif',
      topic: 'grammar',
      level: 'beginner',
      whyFunny: 'Confusing past tense',
      youLearned: 'Irregular verbs',
      status: 'published',
    });

    const err = validDoc.validateSync();
    expect(err).toBeUndefined();
    expect(validDoc.status).toBe('published');
    expect(validDoc.stats.likes).toBe(0);
  });

  it('should validate UserInteraction schema correctly', () => {
    const InteractionModel = mongoose.model<UserInteraction>('TestInteraction', UserInteractionSchema);
    const validDoc = new InteractionModel({
      userId: 'user_001',
      contentId: new mongoose.Types.ObjectId().toString(),
      action: 'like',
    });

    const err = validDoc.validateSync();
    expect(err).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/plugins/fun-feed/schemas/schemas.spec.ts`
Expected: FAIL with "Cannot find module '../config/keywords.config'"

- [ ] **Step 3: Write minimal implementation**

Create `src/plugins/fun-feed/config/keywords.config.ts`:
```typescript
/**
 * Danh mục từ khóa tìm kiếm nội dung hài hước tiếng Anh theo chủ đề.
 * Quản lý tĩnh qua code thay vì database để tối ưu hóa hiệu năng và tuân thủ YAGNI.
 */
export interface KeywordItem {
  keyword: string;
  topic: 'grammar' | 'vocabulary' | 'pronunciation' | 'idiom' | 'conversation';
  source: 'giphy' | 'youtube' | 'all';
}

export const FUNNY_KEYWORDS_POOL: KeywordItem[] = [
  // Grammar
  { keyword: 'english grammar meme', topic: 'grammar', source: 'all' },
  { keyword: 'past tense funny english', topic: 'grammar', source: 'giphy' },
  { keyword: 'grammar police english', topic: 'grammar', source: 'all' },
  // Idioms
  { keyword: 'english idioms funny', topic: 'idiom', source: 'all' },
  { keyword: 'break a leg meme funny', topic: 'idiom', source: 'giphy' },
  { keyword: 'literal idioms english funny', topic: 'idiom', source: 'youtube' },
  // Pronunciation
  { keyword: 'english pronunciation funny meme', topic: 'pronunciation', source: 'all' },
  { keyword: 'silent letters english meme', topic: 'pronunciation', source: 'all' },
  // Vocabulary
  { keyword: 'confusing english words meme', topic: 'vocabulary', source: 'all' },
  { keyword: 'english false friends vocabulary funny', topic: 'vocabulary', source: 'all' },
  // Conversation
  { keyword: 'awkward english conversation meme', topic: 'conversation', source: 'all' },
];
```

Create `src/plugins/fun-feed/schemas/media-content.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AhaMediaContentDocument = AhaMediaContent & Document;

@Schema({ timestamps: true, collection: 'aha_media_contents' })
export class AhaMediaContent {
  @Prop({ required: true, enum: ['giphy', 'youtube', 'generated'] })
  source: string;

  @Prop({ required: true })
  sourceId: string;

  @Prop({ required: true })
  sourceUrl: string;

  @Prop({ required: true, enum: ['gif', 'image', 'video', 'short_video'] })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  mediaUrl: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop()
  attribution?: string;

  @Prop({ enum: ['grammar', 'vocabulary', 'pronunciation', 'idiom', 'conversation'] })
  topic?: string;

  @Prop({ enum: ['beginner', 'intermediate', 'advanced'] })
  level?: string;

  @Prop()
  whyFunny?: string;

  @Prop()
  youLearned?: string;

  @Prop()
  explanation?: string;

  @Prop({ type: Number, default: 0 })
  learningScore?: number;

  @Prop({
    type: Object,
    default: () => ({ views: 0, likes: 0, saves: 0, reports: 0 }),
  })
  stats: { views: number; likes: number; saves: number; reports: number };

  @Prop({
    required: true,
    enum: ['pending', 'published', 'rejected', 'hidden'],
    default: 'published',
  })
  status: string;

  @Prop({ default: () => new Date() })
  publishedAt: Date;
}

export const AhaMediaContentSchema = SchemaFactory.createForClass(AhaMediaContent);

// Index phục vụ tối ưu hóa Cursor Pagination cho TikTok Feed
AhaMediaContentSchema.index({ status: 1, topic: 1, publishedAt: -1 });
AhaMediaContentSchema.index({ source: 1, sourceId: 1 }, { unique: true });
```

Create `src/plugins/fun-feed/schemas/user-interaction.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';

export type UserInteractionDocument = UserInteraction & Document;

@Schema({ timestamps: true, collection: 'user_interactions' })
export class UserInteraction {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, type: SchemaTypes.ObjectId, ref: 'AhaMediaContent' })
  contentId: string;

  @Prop({ required: true, enum: ['view', 'like', 'skip', 'save', 'report'] })
  action: string;

  @Prop()
  reportReason?: string;
}

export const UserInteractionSchema = SchemaFactory.createForClass(UserInteraction);
UserInteractionSchema.index({ userId: 1, contentId: 1, action: 1 });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/plugins/fun-feed/schemas/schemas.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/fun-feed/config/ src/plugins/fun-feed/schemas/
git commit -m "feat(fun-feed): add keywords config and mongoose schemas"
```

---

### Task 2: Source Adapters (GIPHY & YouTube)

**Files:**
- Create: `src/plugins/fun-feed/adapters/source-adapter.interface.ts`
- Create: `src/plugins/fun-feed/adapters/giphy.adapter.ts`
- Create: `src/plugins/fun-feed/adapters/giphy.adapter.spec.ts`
- Create: `src/plugins/fun-feed/adapters/youtube.adapter.ts`
- Create: `src/plugins/fun-feed/adapters/youtube.adapter.spec.ts`

- [ ] **Step 1: Write the failing tests for GIPHY & YouTube Adapters**

Create `src/plugins/fun-feed/adapters/giphy.adapter.spec.ts`:
```typescript
import axios from 'axios';
import { GiphyAdapter } from './giphy.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GiphyAdapter', () => {
  let adapter: GiphyAdapter;

  beforeEach(() => {
    adapter = new GiphyAdapter('dummy-api-key');
    jest.clearAllMocks();
  });

  it('should fetch and normalize GIPHY items with rating g', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'g1',
            url: 'https://giphy.com/gifs/g1',
            title: 'Funny Grammar GIF',
            rating: 'g',
            username: 'grammarhero',
            images: {
              original: { url: 'https://media.giphy.com/media/g1/giphy.gif' },
              fixed_height_small: { url: 'https://media.giphy.com/media/g1/100.gif' },
            },
          },
        ],
      },
    });

    const results = await adapter.fetch('english grammar meme', 5);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      source: 'giphy',
      sourceId: 'g1',
      sourceUrl: 'https://giphy.com/gifs/g1',
      type: 'gif',
      title: 'Funny Grammar GIF',
      mediaUrl: 'https://media.giphy.com/media/g1/giphy.gif',
      thumbnailUrl: 'https://media.giphy.com/media/g1/100.gif',
      attribution: 'grammarhero',
      rating: 'g',
    });
  });

  it('should return empty list when api key is missing or call fails', async () => {
    const emptyAdapter = new GiphyAdapter('');
    const res = await emptyAdapter.fetch('test', 5);
    expect(res).toEqual([]);
  });
});
```

Create `src/plugins/fun-feed/adapters/youtube.adapter.spec.ts`:
```typescript
import axios from 'axios';
import { YoutubeAdapter } from './youtube.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('YoutubeAdapter', () => {
  let adapter: YoutubeAdapter;

  beforeEach(() => {
    adapter = new YoutubeAdapter('dummy-yt-key');
    jest.clearAllMocks();
  });

  it('should fetch and normalize YouTube video items', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: { videoId: 'yt123' },
            snippet: {
              title: 'Learn English Idioms with Memes',
              channelTitle: 'Aha English',
              thumbnails: {
                high: { url: 'https://i.ytimg.com/vi/yt123/hqdefault.jpg' },
              },
            },
          },
        ],
      },
    });

    const results = await adapter.fetch('english idiom meme', 5);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      source: 'youtube',
      sourceId: 'yt123',
      sourceUrl: 'https://www.youtube.com/watch?v=yt123',
      type: 'short_video',
      title: 'Learn English Idioms with Memes',
      mediaUrl: 'https://www.youtube.com/embed/yt123',
      thumbnailUrl: 'https://i.ytimg.com/vi/yt123/hqdefault.jpg',
      attribution: 'Aha English',
      rating: 'g',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/plugins/fun-feed/adapters/`
Expected: FAIL with "Cannot find module './giphy.adapter'"

- [ ] **Step 3: Write minimal implementation for adapters**

Create `src/plugins/fun-feed/adapters/source-adapter.interface.ts`:
```typescript
export interface NormalizedMedia {
  source: 'giphy' | 'youtube' | 'generated';
  sourceId: string;
  sourceUrl: string;
  type: 'gif' | 'image' | 'video' | 'short_video';
  title: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  attribution?: string;
  rating?: string;
}

export interface SourceAdapter {
  readonly source: string;
  fetch(keyword: string, limit?: number): Promise<NormalizedMedia[]>;
}
```

Create `src/plugins/fun-feed/adapters/giphy.adapter.ts`:
```typescript
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
      return items.map((item: any): NormalizedMedia => ({
        source: 'giphy',
        sourceId: item.id,
        sourceUrl: item.url || `https://giphy.com/gifs/${item.id}`,
        type: 'gif',
        title: item.title || keyword,
        mediaUrl: item.images?.original?.url || '',
        thumbnailUrl: item.images?.fixed_height_small?.url,
        attribution: item.username || 'GIPHY Creator',
        rating: item.rating || 'g',
      })).filter((m: NormalizedMedia) => !!m.mediaUrl);
    } catch (error: any) {
      this.logger.error(`Lỗi khi gọi GIPHY API [${keyword}]: ${error.message}`);
      return [];
    }
  }
}
```

Create `src/plugins/fun-feed/adapters/youtube.adapter.ts`:
```typescript
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
            thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url,
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/plugins/fun-feed/adapters/`
Expected: PASS with 4 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/plugins/fun-feed/adapters/
git commit -m "feat(fun-feed): implement GIPHY and YouTube source adapters"
```

---

### Task 3: Ingestion Service (Light-batch & LLM Enrichment)

**Files:**
- Create: `src/plugins/fun-feed/services/fun-feed-ingestion.service.ts`
- Test: `src/plugins/fun-feed/services/fun-feed-ingestion.service.spec.ts`

- [ ] **Step 1: Write the failing test for Ingestion Service**

```typescript
// src/plugins/fun-feed/services/fun-feed-ingestion.service.spec.ts
import { FunFeedIngestionService } from './fun-feed-ingestion.service';
import { NormalizedMedia } from '../adapters/source-adapter.interface';

describe('FunFeedIngestionService', () => {
  let service: FunFeedIngestionService;
  let mediaModelMock: any;
  let hiveServiceMock: any;
  let giphyAdapterMock: any;
  let youtubeAdapterMock: any;

  beforeEach(() => {
    mediaModelMock = {
      findOne: jest.fn(),
      create: jest.fn(),
    };

    hiveServiceMock = {
      invokeStructured: jest.fn(),
    };

    giphyAdapterMock = {
      fetch: jest.fn(),
    };

    youtubeAdapterMock = {
      fetch: jest.fn(),
    };

    service = new FunFeedIngestionService(
      mediaModelMock,
      hiveServiceMock,
      giphyAdapterMock,
      youtubeAdapterMock,
    );
  });

  it('should dedup existing items and enrich only new items', async () => {
    const rawItems: NormalizedMedia[] = [
      {
        source: 'giphy',
        sourceId: 'existing_id',
        sourceUrl: 'https://giphy.com/1',
        type: 'gif',
        title: 'Old meme',
        mediaUrl: 'https://media.giphy.com/1.gif',
      },
      {
        source: 'giphy',
        sourceId: 'new_id',
        sourceUrl: 'https://giphy.com/2',
        type: 'gif',
        title: 'New funny meme',
        mediaUrl: 'https://media.giphy.com/2.gif',
      },
    ];

    giphyAdapterMock.fetch.mockResolvedValueOnce(rawItems);
    youtubeAdapterMock.fetch.mockResolvedValueOnce([]);

    // existing_id exists, new_id does not
    mediaModelMock.findOne
      .mockResolvedValueOnce({ _id: 'db_1' })
      .mockResolvedValueOnce(null);

    hiveServiceMock.invokeStructured.mockResolvedValueOnce({
      parsed: {
        isSafe: true,
        topic: 'grammar',
        level: 'beginner',
        whyFunny: 'Because of incorrect irregular verbs',
        youLearned: 'Always check past participle',
        learningScore: 0.8,
      },
    });

    const result = await service.ingestSingleKeyword(
      { keyword: 'english grammar meme', topic: 'grammar', source: 'giphy' },
      5,
    );

    expect(result.fetched).toBe(2);
    expect(result.deduped).toBe(1);
    expect(result.saved).toBe(1);
    expect(mediaModelMock.create).toHaveBeenCalledTimes(1);
    expect(mediaModelMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'new_id',
        status: 'published',
        learningScore: 0.8,
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/plugins/fun-feed/services/fun-feed-ingestion.service.spec.ts`
Expected: FAIL with "Cannot find module './fun-feed-ingestion.service'"

- [ ] **Step 3: Write minimal implementation**

Create `src/plugins/fun-feed/services/fun-feed-ingestion.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { z } from 'zod';
import { AhaMediaContent, AhaMediaContentDocument } from '../schemas/media-content.schema';
import { NormalizedMedia } from '../adapters/source-adapter.interface';
import { GiphyAdapter } from '../adapters/giphy.adapter';
import { YoutubeAdapter } from '../adapters/youtube.adapter';
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
  ) {}

  async ingestSingleKeyword(keywordItem: KeywordItem, limit = 5): Promise<{ fetched: number; deduped: number; saved: number }> {
    const fetchedItems: NormalizedMedia[] = [];

    if (keywordItem.source === 'giphy' || keywordItem.source === 'all') {
      const gifs = await this.giphyAdapter.fetch(keywordItem.keyword, limit);
      fetchedItems.push(...gifs);
    }

    if (keywordItem.source === 'youtube' || keywordItem.source === 'all') {
      const vids = await this.youtubeAdapter.fetch(keywordItem.keyword, limit);
      fetchedItems.push(...vids);
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
          this.logger.warn(`Bỏ qua item [${item.sourceId}] do không an toàn hoặc điểm thấp: ${enriched.learningScore}`);
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
        this.logger.error(`Lỗi enrich item [${item.sourceId}]: ${err.message}`);
      }
    }

    return { fetched: fetchedItems.length, deduped, saved };
  }

  private async enrichItemWithLlm(item: NormalizedMedia, fallbackTopic: KeywordItem['topic']) {
    const prompt = `Phân tích meme/video tiếng Anh sau:
Tiêu đề: "${item.title}"
Nguồn: ${item.source} (${item.sourceUrl})
Chủ đề gợi ý: ${fallbackTopic}

Hãy đánh giá xem nội dung có lành mạnh không (isSafe: true/false), giải thích ngắn gọn tại sao hài hước (whyFunny) và người học rút ra được bài học gì (youLearned).`;

    const res = await this.aiService.invokeStructured({
      prompt,
      schema: LlmEnrichmentSchema,
      systemPrompt: 'Bạn là chuyên gia ngôn ngữ học và meme văn hóa Anh-Mỹ giúp người học tiếng Anh giải trí và tiến bộ.',
    });

    return res.parsed;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/plugins/fun-feed/services/fun-feed-ingestion.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/fun-feed/services/fun-feed-ingestion.service.*
git commit -m "feat(fun-feed): implement ingestion service with dedup and LLM enrichment"
```

---

### Task 4: Cron Controller & Vercel Configuration

**Files:**
- Create: `src/plugins/fun-feed/controllers/fun-feed-cron.controller.ts`
- Create: `src/plugins/fun-feed/controllers/fun-feed-cron.controller.spec.ts`
- Modify: `vercel.json:1-38`

- [ ] **Step 1: Write the failing test for Cron Controller**

```typescript
// src/plugins/fun-feed/controllers/fun-feed-cron.controller.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import { FunFeedCronController } from './fun-feed-cron.controller';

describe('FunFeedCronController', () => {
  let controller: FunFeedCronController;
  let ingestionServiceMock: any;
  let configServiceMock: any;

  beforeEach(() => {
    ingestionServiceMock = {
      ingestSingleKeyword: jest.fn().mockResolvedValue({ fetched: 5, deduped: 3, saved: 2 }),
    };

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'CRON_SECRET') return 'super-secret-cron-key';
        return null;
      }),
    };

    controller = new FunFeedCronController(ingestionServiceMock, configServiceMock);
  });

  it('should reject requests without valid Bearer token when CRON_SECRET is set', async () => {
    await expect(controller.handleVercelCron('Bearer invalid-token')).rejects.toThrow(UnauthorizedException);
  });

  it('should execute batch ingest when Bearer token matches CRON_SECRET', async () => {
    const res = await controller.handleVercelCron('Bearer super-secret-cron-key');
    expect(res.success).toBe(true);
    expect(res.processedKeywords).toBeGreaterThan(0);
    expect(ingestionServiceMock.ingestSingleKeyword).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/plugins/fun-feed/controllers/fun-feed-cron.controller.spec.ts`
Expected: FAIL with "Cannot find module './fun-feed-cron.controller'"

- [ ] **Step 3: Write minimal implementation**

Create `src/plugins/fun-feed/controllers/fun-feed-cron.controller.ts`:
```typescript
import { Controller, Get, Headers, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FunFeedIngestionService } from '../services/fun-feed-ingestion.service';
import { FUNNY_KEYWORDS_POOL } from '../config/keywords.config';

@ApiTags('Fun Feed Cron')
@Controller('funny-feed')
export class FunFeedCronController {
  private readonly logger = new Logger(FunFeedCronController.name);

  constructor(
    private readonly ingestionService: FunFeedIngestionService,
    private readonly configService: ConfigService,
  ) {}

  @Get('cron-ingest')
  @ApiOperation({ summary: 'Kích hoạt Ingest định kỳ từ Vercel Cron' })
  async handleVercelCron(@Headers('authorization') authHeader?: string) {
    const cronSecret = this.configService.get<string>('CRON_SECRET');
    if (cronSecret) {
      const token = authHeader?.replace('Bearer ', '');
      if (token !== cronSecret) {
        this.logger.warn('Truy cập cron bị từ chối: Sai CRON_SECRET');
        throw new UnauthorizedException('Invalid cron authorization token');
      }
    }

    // Chọn ngẫu nhiên 1-2 từ khóa để cào nhanh trong 5-10s (tránh Vercel Timeout)
    const randomKeyword = FUNNY_KEYWORDS_POOL[Math.floor(Math.random() * FUNNY_KEYWORDS_POOL.length)];
    this.logger.log(`Bắt đầu Ingest cho từ khóa [${randomKeyword.keyword}]...`);

    const result = await this.ingestionService.ingestSingleKeyword(randomKeyword, 4);

    return {
      success: true,
      processedKeywords: 1,
      keyword: randomKeyword.keyword,
      topic: randomKeyword.topic,
      stats: result,
    };
  }
}
```

Update `vercel.json` to register the cron:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/index.ts",
      "use": "@vercel/node"
    },
    {
      "src": "index.html",
      "use": "@vercel/static"
    },
    {
      "src": "assets/**",
      "use": "@vercel/static"
    },
    {
      "src": "favicon.svg",
      "use": "@vercel/static"
    },
    {
      "src": "icons.svg",
      "use": "@vercel/static"
    }
  ],
  "crons": [
    {
      "path": "/api/funny-feed/cron-ingest",
      "schedule": "0 */6 * * *"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/index.ts"
    },
    {
      "handle": "filesystem"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/plugins/fun-feed/controllers/fun-feed-cron.controller.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/fun-feed/controllers/fun-feed-cron.controller.* vercel.json
git commit -m "feat(fun-feed): add cron endpoint and register vercel cron schedule"
```

---

### Task 5: Feed Service & Controller (Serving Feed & User Interactions)

**Files:**
- Create: `src/plugins/fun-feed/dto/feed-query.dto.ts`
- Create: `src/plugins/fun-feed/dto/interact.dto.ts`
- Create: `src/plugins/fun-feed/services/fun-feed.service.ts`
- Create: `src/plugins/fun-feed/services/fun-feed.service.spec.ts`
- Create: `src/plugins/fun-feed/controllers/fun-feed.controller.ts`
- Create: `src/plugins/fun-feed/controllers/fun-feed.controller.spec.ts`

- [ ] **Step 1: Write the failing tests for Feed Service & Controller**

Create `src/plugins/fun-feed/services/fun-feed.service.spec.ts`:
```typescript
import { FunFeedService } from './fun-feed.service';

describe('FunFeedService', () => {
  let service: FunFeedService;
  let mediaModelMock: any;
  let interactionModelMock: any;

  beforeEach(() => {
    mediaModelMock = {
      find: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    interactionModelMock = {
      create: jest.fn().mockResolvedValue({}),
      countDocuments: jest.fn(),
    };

    service = new FunFeedService(mediaModelMock, interactionModelMock);
  });

  it('should query feed with published status and cursor pagination', async () => {
    const cursor = '2026-10-15T12:00:00.000Z';
    await service.getFeed({ cursor, limit: 10, topic: 'grammar' });

    expect(mediaModelMock.find).toHaveBeenCalledWith({
      status: 'published',
      topic: 'grammar',
      publishedAt: { $lt: new Date(cursor) },
    });
    expect(mediaModelMock.limit).toHaveBeenCalledWith(10);
  });

  it('should auto-hide content when report count reaches 3', async () => {
    interactionModelMock.countDocuments.mockResolvedValueOnce(3);

    await service.interact('media_1', 'user_1', { action: 'report', reportReason: 'Inappropriate' });

    expect(interactionModelMock.create).toHaveBeenCalled();
    expect(mediaModelMock.updateOne).toHaveBeenCalledWith(
      { _id: 'media_1' },
      { $set: { status: 'hidden' } },
    );
  });
});
```

Create `src/plugins/fun-feed/controllers/fun-feed.controller.spec.ts`:
```typescript
import { FunFeedController } from './fun-feed.controller';

describe('FunFeedController', () => {
  let controller: FunFeedController;
  let funFeedServiceMock: any;

  beforeEach(() => {
    funFeedServiceMock = {
      getFeed: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      interact: jest.fn().mockResolvedValue({ success: true }),
    };

    controller = new FunFeedController(funFeedServiceMock);
  });

  it('should return feed items from service', async () => {
    const res = await controller.getFeed({ limit: 5 });
    expect(res).toHaveProperty('items');
    expect(funFeedServiceMock.getFeed).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/plugins/fun-feed/services/fun-feed.service.spec.ts src/plugins/fun-feed/controllers/fun-feed.controller.spec.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

Create `src/plugins/fun-feed/dto/feed-query.dto.ts`:
```typescript
import { IsOptional, IsEnum, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FeedQueryDto {
  @ApiPropertyOptional({ enum: ['grammar', 'vocabulary', 'pronunciation', 'idiom', 'conversation'] })
  @IsOptional()
  @IsEnum(['grammar', 'vocabulary', 'pronunciation', 'idiom', 'conversation'])
  topic?: string;

  @ApiPropertyOptional({ enum: ['beginner', 'intermediate', 'advanced'] })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  level?: string;

  @ApiPropertyOptional({ description: 'Cursor timestamp (ISO Date) của item cuối trang trước' })
  @IsOptional()
  @IsDateString()
  cursor?: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 10;
}
```

Create `src/plugins/fun-feed/dto/interact.dto.ts`:
```typescript
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InteractDto {
  @ApiProperty({ enum: ['view', 'like', 'skip', 'save', 'report'] })
  @IsEnum(['view', 'like', 'skip', 'save', 'report'])
  action: 'view' | 'like' | 'skip' | 'save' | 'report';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportReason?: string;
}
```

Create `src/plugins/fun-feed/services/fun-feed.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { AhaMediaContentDocument } from '../schemas/media-content.schema';
import { UserInteractionDocument } from '../schemas/user-interaction.schema';
import { FeedQueryDto } from '../dto/feed-query.dto';
import { InteractDto } from '../dto/interact.dto';

@Injectable()
export class FunFeedService {
  private readonly logger = new Logger(FunFeedService.name);

  constructor(
    private readonly mediaModel: Model<AhaMediaContentDocument>,
    private readonly interactionModel: Model<UserInteractionDocument>,
  ) {}

  async getFeed(query: FeedQueryDto) {
    const filter: any = { status: 'published' };

    if (query.topic) filter.topic = query.topic;
    if (query.level) filter.level = query.level;
    if (query.cursor) {
      filter.publishedAt = { $lt: new Date(query.cursor) };
    }

    const items = await this.mediaModel
      .find(filter)
      .sort({ publishedAt: -1 })
      .limit(query.limit)
      .lean();

    const nextCursor = items.length > 0 ? items[items.length - 1].publishedAt?.toISOString() : null;

    return {
      items,
      nextCursor,
      hasMore: items.length === query.limit,
    };
  }

  async interact(contentId: string, userId: string, dto: InteractDto) {
    await this.interactionModel.create({
      userId: userId || 'anonymous',
      contentId,
      action: dto.action,
      reportReason: dto.reportReason,
    });

    if (dto.action === 'like') {
      await this.mediaModel.updateOne({ _id: contentId }, { $inc: { 'stats.likes': 1 } });
    } else if (dto.action === 'report') {
      await this.mediaModel.updateOne({ _id: contentId }, { $inc: { 'stats.reports': 1 } });
      const reportCount = await this.interactionModel.countDocuments({ contentId, action: 'report' });
      if (reportCount >= 3) {
        this.logger.warn(`Content [${contentId}] bị ẩn tự động do nhận $\ge 3$ reports.`);
        await this.mediaModel.updateOne({ _id: contentId }, { $set: { status: 'hidden' } });
      }
    }

    return { success: true };
  }
}
```

Create `src/plugins/fun-feed/controllers/fun-feed.controller.ts`:
```typescript
import { Controller, Get, Post, Param, Query, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FunFeedService } from '../services/fun-feed.service';
import { FeedQueryDto } from '../dto/feed-query.dto';
import { InteractDto } from '../dto/interact.dto';

@ApiTags('Funny English Feed')
@Controller('funny-feed')
export class FunFeedController {
  constructor(private readonly funFeedService: FunFeedService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách Funny English Feed (Cursor Pagination cho TikTok UI)' })
  async getFeed(@Query() query: FeedQueryDto) {
    return this.funFeedService.getFeed(query);
  }

  @Post(':id/interact')
  @ApiOperation({ summary: 'Ghi nhận tương tác like, save, skip, report' })
  async interact(
    @Param('id') id: string,
    @Body() dto: InteractDto,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.funFeedService.interact(id, userId || 'guest', dto);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/plugins/fun-feed/services/fun-feed.service.spec.ts src/plugins/fun-feed/controllers/fun-feed.controller.spec.ts`
Expected: PASS with all tests passing

- [ ] **Step 5: Commit**

```bash
git add src/plugins/fun-feed/dto/ src/plugins/fun-feed/services/fun-feed.service.* src/plugins/fun-feed/controllers/fun-feed.controller.*
git commit -m "feat(fun-feed): implement feed serving service and controller with cursor pagination"
```

---

### Task 6: Aha Mind Agent Tool & Module Integration

**Files:**
- Create: `src/plugins/fun-feed/tools/get-funny-english.tool.ts`
- Create: `src/plugins/fun-feed/tools/get-funny-english.tool.spec.ts`
- Create: `src/plugins/fun-feed/fun-feed.module.ts`
- Modify: `src/app.module.ts:1-47`

- [ ] **Step 1: Write failing tests for Tool & Module**

Create `src/plugins/fun-feed/tools/get-funny-english.tool.spec.ts`:
```typescript
import { createGetFunnyEnglishTool } from './get-funny-english.tool';

describe('getFunnyEnglish Tool', () => {
  it('should query published memes matching criteria', async () => {
    const mediaModelMock: any = {
      find: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          title: 'Grammar meme',
          whyFunny: 'Irregular verbs mixup',
          youLearned: 'past participle',
          mediaUrl: 'https://media.giphy.com/test.gif',
        },
      ]),
    };

    const tool = createGetFunnyEnglishTool(mediaModelMock);
    const result = await (tool as any).func({ topic: 'grammar', limit: 2 });
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('Grammar meme');
    expect(mediaModelMock.find).toHaveBeenCalledWith({
      status: 'published',
      topic: 'grammar',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/plugins/fun-feed/tools/get-funny-english.tool.spec.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

Create `src/plugins/fun-feed/tools/get-funny-english.tool.ts`:
```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { Model } from 'mongoose';
import { AhaMediaContentDocument } from '../schemas/media-content.schema';

export const createGetFunnyEnglishTool = (mediaModel: Model<AhaMediaContentDocument>) => {
  return tool(
    async ({ topic, level, limit }) => {
      const filter: any = { status: 'published' };
      if (topic) filter.topic = topic;
      if (level) filter.level = level;

      const items = await mediaModel
        .find(filter)
        .limit(limit || 3)
        .lean();

      return JSON.stringify(
        items.map((i) => ({
          title: i.title,
          type: i.type,
          mediaUrl: i.mediaUrl,
          whyFunny: i.whyFunny,
          youLearned: i.youLearned,
          sourceUrl: i.sourceUrl,
        })),
      );
    },
    {
      name: 'get_funny_english',
      description: 'Tìm kiếm meme, video hoặc ảnh hài hước về tiếng Anh để giải trí và học tập nhẹ nhàng cho người học.',
      schema: z.object({
        topic: z.enum(['grammar', 'vocabulary', 'pronunciation', 'idiom', 'conversation']).optional(),
        level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
        limit: z.number().max(5).default(3),
      }),
    },
  );
};
```

Create `src/plugins/fun-feed/fun-feed.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';
import { HiveService } from '../../core/hive/hive.service';
import { AhaMediaContent, AhaMediaContentSchema } from './schemas/media-content.schema';
import { UserInteraction, UserInteractionSchema } from './schemas/user-interaction.schema';
import { GiphyAdapter } from './adapters/giphy.adapter';
import { YoutubeAdapter } from './adapters/youtube.adapter';
import { FunFeedIngestionService } from './services/fun-feed-ingestion.service';
import { FunFeedService } from './services/fun-feed.service';
import { FunFeedController } from './controllers/fun-feed.controller';
import { FunFeedCronController } from './controllers/fun-feed-cron.controller';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: AhaMediaContent.name, schema: AhaMediaContentSchema },
        { name: UserInteraction.name, schema: UserInteractionSchema },
      ],
      AHA_TOOLS_CONNECTION,
    ),
  ],
  controllers: [FunFeedController, FunFeedCronController],
  providers: [
    {
      provide: GiphyAdapter,
      useFactory: (config: ConfigService) => new GiphyAdapter(config.get<string>('GIPHY_API_KEY', '')),
      inject: [ConfigService],
    },
    {
      provide: YoutubeAdapter,
      useFactory: (config: ConfigService) => new YoutubeAdapter(config.get<string>('YOUTUBE_DATA_API_KEY', '')),
      inject: [ConfigService],
    },
    {
      provide: FunFeedIngestionService,
      useFactory: (mediaModel, hiveService, giphy, youtube) =>
        new FunFeedIngestionService(mediaModel, hiveService, giphy, youtube),
      inject: [
        getModelToken(AhaMediaContent.name, AHA_TOOLS_CONNECTION),
        HiveService,
        GiphyAdapter,
        YoutubeAdapter,
      ],
    },
    {
      provide: FunFeedService,
      useFactory: (mediaModel, interactionModel) => new FunFeedService(mediaModel, interactionModel),
      inject: [
        getModelToken(AhaMediaContent.name, AHA_TOOLS_CONNECTION),
        getModelToken(UserInteraction.name, AHA_TOOLS_CONNECTION),
      ],
    },
  ],
  exports: [FunFeedService, FunFeedIngestionService],
})
export class FunFeedModule {}
```

Modify `src/app.module.ts`:
Add `FunFeedModule` import:
```typescript
import { FunFeedModule } from './plugins/fun-feed/fun-feed.module';
// ...
@Module({
  imports: [
    // ...
    SpeakingQuizModule,
    VocabReviewModule,
    FunFeedModule,
    AgentsModule,
    DashboardModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Run all unit tests for the plugin**

Run: `npx jest src/plugins/fun-feed/`
Expected: PASS (all suites passing)

- [ ] **Step 5: Run full project typecheck**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/plugins/fun-feed/tools/ src/plugins/fun-feed/fun-feed.module.ts src/app.module.ts
git commit -m "feat(fun-feed): add agent tool and register FunFeedModule in AppModule"
```

---

## Plan Self-Review Checklist

- [x] **Spec coverage:** Phủ toàn bộ mục tiêu Feed (GIF, Short Video YouTube), UX tương thích TikTok (Cursor Pagination), Ingestion tự động qua Vercel Cron, LLM safety & enrichment, Auto-hide khi report $\ge 3$, Tool cho Aha Mind Agent.
- [x] **No Placeholders:** Toàn bộ code tests và code implementation đều có nội dung hoàn chỉnh, không có TODO hay TBD.
- [x] **Serverless Alignment:** Đã giải quyết triệt để rào cản Vercel Serverless (không dùng background worker chạy ngầm, chia batch nhỏ an toàn dưới 10s timeout).
- [x] **Type consistency:** Các tên biến, DTO, Mongoose model token và Zod schema khớp hoàn toàn giữa các file.

---

*Made by Anh Tu - Share to be share*
