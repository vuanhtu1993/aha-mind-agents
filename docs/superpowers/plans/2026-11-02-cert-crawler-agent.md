# Universal Cert Question Crawler Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust, rate-limited, event-driven Crawler Agent using BullMQ and MongoDB to crawl all questions, choices, correct answers, and AI-expert pedagogical explanations for any certification (starting with CCAF and CCAO-F) from `hoccungsushi.com`.

**Architecture:** A Producer Service fetches exam metadata and partitions question IDs into batches of at most 20 to push atomic jobs into a BullMQ queue. A Rate-limited Consumer Processor throttles requests (max 5 req/s), fetches deep answer reveals (`/reveal?q={id}&detail=1`), normalizes data, and upserts into MongoDB. A REST Controller provides trigger and status monitoring endpoints.

**Tech Stack:** NestJS 11, TypeScript, BullMQ, Redis (ioredis), Mongoose, Axios.

**Spec:** `docs/superpowers/specs/2026-11-02-cert-crawler-agent-design.md`

## Global Constraints

- All source files must be TypeScript, formatted with Prettier and compliant with ESLint.
- Sensitive session cookies must only be accessed via `ConfigService.get('HOCCUNGSUSHI_COOKIE')`, never hardcoded.
- Data must be upserted to MongoDB with compound unique index `{ certId: 1, externalId: 1 }` to prevent duplicates.
- The endpoint `/api/cert/:certId?ids=...` must receive at most 20 IDs per batch.
- Every file must include the author footer comment `Made by Anh Tu - Share to be share`.

## Review Focus

1. **Non-sequential IDs:** Question IDs must come directly from `attempt.question_ids` or `refs` from the attempts API, never from an arithmetic loop like `1142..1310`.
2. **Missing Attempt Auto-Creation:** If `/api/cert/attempts?cert_id={certId}` returns null/undefined attempt, the producer must auto-create one via `POST /api/cert/attempts` with `{ cert_id: certId, mode: "practice" }`.
3. **Rate Limiting & Anti-Ban:** BullMQ limiter must enforce `limiter: { max: 5, duration: 1000 }` to avoid HTTP 429 Too Many Requests.
4. **Missing or Expired Cookie (401):** When cookie is missing or invalid, the producer/processor must log an explicit, actionable error rather than crashing silently.
5. **Idempotent Upsert:** Re-triggering sync for the same `certId` must update existing records in-place without generating duplicates.

---

### Task 1: Database Schema & Entity Definition (`CertQuestion`)

**Files:**
- Create: `src/infra/database/schemas/cert-question.schema.ts`
- Test: `src/infra/database/schemas/cert-question.schema.spec.ts`
- Modify: `src/infra/database/database.module.ts:50-70`

**Interfaces:**
- Consumes: `@nestjs/mongoose`, `mongoose`
- Produces: `CertQuestion`, `CertQuestionSchema`, `CertQuestionDocument`

- [ ] **Step 1: Write the failing test for `CertQuestionSchema`**

Create `src/infra/database/schemas/cert-question.schema.spec.ts`:
```typescript
import { CertQuestion, CertQuestionSchema } from './cert-question.schema';

describe('CertQuestionSchema', () => {
  it('should have compound unique index on certId and externalId', () => {
    const indexes = CertQuestionSchema.indexes();
    const hasCompoundIndex = indexes.some(
      ([fields, options]) =>
        fields.certId === 1 && fields.externalId === 1 && options?.unique === true,
    );
    expect(hasCompoundIndex).toBe(true);
  });

  it('should be named CertQuestion', () => {
    expect(CertQuestion.name).toBe('CertQuestion');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/infra/database/schemas/cert-question.schema.spec.ts`
Expected: FAIL with "Cannot find module './cert-question.schema'"

- [ ] **Step 3: Implement `CertQuestion` Schema**

Create `src/infra/database/schemas/cert-question.schema.ts`:
```typescript
/**
 * @file cert-question.schema.ts
 * @description Mongoose Schema lưu trữ câu hỏi chứng chỉ (CCAF, CCAO-F, ...)
 *
 * Made by Anh Tu - Share to be share
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CertQuestionDocument = CertQuestion & Document;

@Schema({ timestamps: true, collection: 'cert_questions' })
export class CertQuestion {
  @Prop({ required: true, index: true })
  certId: string;

  @Prop({ required: true, index: true })
  externalId: number;

  @Prop()
  questionNo: number;

  @Prop({ required: true })
  topic: string;

  @Prop()
  guideRef?: string;

  @Prop({ required: true })
  questionEn: string;

  @Prop()
  questionVi?: string;

  @Prop()
  questionJa?: string;

  @Prop({ type: Object, required: true })
  optionsEn: Record<string, string>;

  @Prop({ type: Object })
  optionsVi?: Record<string, string>;

  @Prop({ type: Object })
  optionsJa?: Record<string, string>;

  @Prop({ default: false })
  isMulti: boolean;

  @Prop({ required: true })
  correctAnswer: string;

  @Prop()
  explanationEn?: string;

  @Prop()
  aiExpertVi?: string;

  @Prop()
  aiExpertJa?: string;

  @Prop()
  sourceUrl?: string;

  @Prop()
  reviewConfidence?: string;
}

export const CertQuestionSchema = SchemaFactory.createForClass(CertQuestion);
CertQuestionSchema.index({ certId: 1, externalId: 1 }, { unique: true });
```

- [ ] **Step 4: Register `CertQuestion` in `src/infra/database/database.module.ts`**

Register `{ name: CertQuestion.name, schema: CertQuestionSchema }` under `AHA_TOOLS_CONNECTION` in `DatabaseModule`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test src/infra/database/schemas/cert-question.schema.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/infra/database/schemas/cert-question.schema.ts src/infra/database/schemas/cert-question.schema.spec.ts src/infra/database/database.module.ts
git commit -m "feat(database): add CertQuestion schema with compound unique index"
```

---

### Task 2: Constants, DTOs & Job Interfaces

**Files:**
- Create: `src/plugins/cert-crawler/cert-crawler.constants.ts`
- Create: `src/plugins/cert-crawler/dto/sync-cert.dto.ts`
- Create: `src/plugins/cert-crawler/interfaces/cert-crawler.interface.ts`
- Test: `src/plugins/cert-crawler/dto/sync-cert.dto.spec.ts`

**Interfaces:**
- Consumes: `class-validator`
- Produces: `CERT_CRAWLER_QUEUE`, `CRAWL_QUESTION_JOB`, `SyncCertDto`, `CrawlQuestionJobData`

- [ ] **Step 1: Write the failing test for `SyncCertDto`**

Create `src/plugins/cert-crawler/dto/sync-cert.dto.spec.ts`:
```typescript
import { validate } from 'class-validator';
import { SyncCertDto } from './sync-cert.dto';

describe('SyncCertDto', () => {
  it('should validate valid certId', async () => {
    const dto = new SyncCertDto();
    dto.certId = 'cca-f';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject empty certId', async () => {
    const dto = new SyncCertDto();
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/plugins/cert-crawler/dto/sync-cert.dto.spec.ts`
Expected: FAIL with "Cannot find module './sync-cert.dto'"

- [ ] **Step 3: Implement Constants, DTO and Job Interfaces**

Create `src/plugins/cert-crawler/cert-crawler.constants.ts`:
```typescript
/**
 * @file cert-crawler.constants.ts
 *
 * Made by Anh Tu - Share to be share
 */

export const CERT_CRAWLER_QUEUE = 'cert-crawler';
export const CRAWL_QUESTION_JOB = 'crawl-question';
export const HOCCUNGSUSHI_BASE_URL = 'https://hoccungsushi.com';
```

Create `src/plugins/cert-crawler/dto/sync-cert.dto.ts`:
```typescript
/**
 * @file sync-cert.dto.ts
 *
 * Made by Anh Tu - Share to be share
 */

import { IsNotEmpty, IsString } from 'class-validator';

export class SyncCertDto {
  @IsString()
  @IsNotEmpty()
  certId: string;
}
```

Create `src/plugins/cert-crawler/interfaces/cert-crawler.interface.ts`:
```typescript
/**
 * @file cert-crawler.interface.ts
 *
 * Made by Anh Tu - Share to be share
 */

export interface RawQuestionItem {
  id: number;
  question_no: number;
  question_en: string;
  question_vi?: string;
  question_ja?: string;
  options: Record<string, string>;
  options_vi?: Record<string, string>;
  options_ja?: Record<string, string>;
  is_multi: boolean;
  topic: string;
  guide_ref?: string;
  review_confidence?: string;
}

export interface CrawlQuestionJobData {
  certId: string;
  attemptId: number;
  question: RawQuestionItem;
}

export interface RevealResponse {
  answer_key?: string;
  correct?: string;
  correct_verified?: string;
  explanation?: string;
  ai_expert?: string;
  ai_expert_ja?: string;
  source_url?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/plugins/cert-crawler/dto/sync-cert.dto.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/cert-crawler/
git commit -m "feat(cert-crawler): add constants, dto, and job interfaces"
```

---

### Task 3: Cert Crawler Producer Service (`CertCrawlerProducerService`)

**Files:**
- Create: `src/plugins/cert-crawler/cert-crawler.producer.ts`
- Test: `src/plugins/cert-crawler/cert-crawler.producer.spec.ts`

**Interfaces:**
- Consumes: `ConfigService`, `@InjectQueue(CERT_CRAWLER_QUEUE) Queue`, `Axios`
- Produces: `triggerSync(certId: string): Promise<{ attemptId: number; totalQuestions: number; queuedJobs: number }>`

- [ ] **Step 1: Write the failing test for `CertCrawlerProducerService`**

Create `src/plugins/cert-crawler/cert-crawler.producer.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { CERT_CRAWLER_QUEUE } from './cert-crawler.constants';

describe('CertCrawlerProducerService', () => {
  let service: CertCrawlerProducerService;
  const mockQueue = {
    addBulk: jest.fn().mockResolvedValue([]),
  };
  const mockConfig = {
    get: jest.fn().mockReturnValue('dummy_cookie'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertCrawlerProducerService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: getQueueToken(CERT_CRAWLER_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<CertCrawlerProducerService>(CertCrawlerProducerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/plugins/cert-crawler/cert-crawler.producer.spec.ts`
Expected: FAIL with "Cannot find module './cert-crawler.producer'"

- [ ] **Step 3: Implement `CertCrawlerProducerService`**

Create `src/plugins/cert-crawler/cert-crawler.producer.ts`:
```typescript
/**
 * @file cert-crawler.producer.ts
 * @description Producer Service lấy danh sách câu hỏi theo batch và đẩy vào BullMQ
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import axios from 'axios';
import {
  CERT_CRAWLER_QUEUE,
  CRAWL_QUESTION_JOB,
  HOCCUNGSUSHI_BASE_URL,
} from './cert-crawler.constants';
import { RawQuestionItem, CrawlQuestionJobData } from './interfaces/cert-crawler.interface';

@Injectable()
export class CertCrawlerProducerService {
  private readonly logger = new Logger(CertCrawlerProducerService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(CERT_CRAWLER_QUEUE) private readonly crawlerQueue: Queue,
  ) {}

  private getAuthHeaders() {
    const cookie = this.configService.get<string>('HOCCUNGSUSHI_COOKIE');
    if (!cookie) {
      throw new BadRequestException('HOCCUNGSUSHI_COOKIE chưa được cấu hình trong .env');
    }
    return {
      Cookie: cookie,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
  }

  /**
   * Lấy hoặc tạo mới attempt cho certId
   */
  async getOrCreateAttempt(certId: string): Promise<{ attemptId: number; questionIds: number[] }> {
    const headers = this.getAuthHeaders();
    const attemptsUrl = `${HOCCUNGSUSHI_BASE_URL}/api/cert/attempts?cert_id=${encodeURIComponent(certId)}`;

    const res = await axios.get(attemptsUrl, { headers });
    let attempt = res.data?.attempt;

    // Nếu chưa có attempt, tự động tạo mới
    if (!attempt?.id) {
      this.logger.log(`Tạo attempt mới cho chứng chỉ: ${certId}`);
      const createRes = await axios.post(
        `${HOCCUNGSUSHI_BASE_URL}/api/cert/attempts`,
        { cert_id: certId, mode: 'practice' },
        { headers },
      );
      attempt = createRes.data?.attempt;
    }

    // Lấy chi tiết attempt để lấy mảng question_ids chính xác
    const detailRes = await axios.get(
      `${HOCCUNGSUSHI_BASE_URL}/api/cert/attempts/${attempt.id}`,
      { headers },
    );

    const questionIds =
      detailRes.data?.attempt?.question_ids ||
      detailRes.data?.refs?.map((r: { id: number }) => r.id) ||
      [];

    if (!questionIds.length) {
      throw new BadRequestException(`Không tìm thấy câu hỏi nào cho chứng chỉ: ${certId}`);
    }

    return { attemptId: attempt.id, questionIds };
  }

  /**
   * Kích hoạt cào toàn bộ câu hỏi của certId
   */
  async triggerSync(certId: string) {
    this.logger.log(`Bắt đầu đồng bộ chứng chỉ: ${certId}`);
    const { attemptId, questionIds } = await this.getOrCreateAttempt(certId);
    this.logger.log(`Tìm thấy ${questionIds.length} câu hỏi. Attempt ID: ${attemptId}`);

    const headers = this.getAuthHeaders();
    const batchSize = 20;
    const allQuestions: RawQuestionItem[] = [];

    // Chia thành các batch tối đa 20 câu
    for (let i = 0; i < questionIds.length; i += batchSize) {
      const batchIds = questionIds.slice(i, i + batchSize).join(',');
      const batchUrl = `${HOCCUNGSUSHI_BASE_URL}/api/cert/${certId}?ids=${batchIds}`;
      const batchRes = await axios.get(batchUrl, { headers });
      const questions: RawQuestionItem[] = batchRes.data?.questions || [];
      allQuestions.push(...questions);
    }

    // Tạo các atomic jobs cho BullMQ
    const jobs = allQuestions.map((q) => ({
      name: CRAWL_QUESTION_JOB,
      data: {
        certId,
        attemptId,
        question: q,
      } as CrawlQuestionJobData,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
      },
    }));

    await this.crawlerQueue.addBulk(jobs);
    this.logger.log(`Đã đẩy ${jobs.length} jobs vào hàng đợi ${CERT_CRAWLER_QUEUE}`);

    return {
      certId,
      attemptId,
      totalQuestions: questionIds.length,
      queuedJobs: jobs.length,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/plugins/cert-crawler/cert-crawler.producer.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/cert-crawler/cert-crawler.producer.ts src/plugins/cert-crawler/cert-crawler.producer.spec.ts
git commit -m "feat(cert-crawler): implement CertCrawlerProducerService"
```

---

### Task 4: Cert Crawler Consumer Processor (`CertCrawlerProcessor`)

**Files:**
- Create: `src/plugins/cert-crawler/cert-crawler.processor.ts`
- Test: `src/plugins/cert-crawler/cert-crawler.processor.spec.ts`

**Interfaces:**
- Consumes: `@Processor(CERT_CRAWLER_QUEUE)`, `@InjectModel(CertQuestion.name, AHA_TOOLS_CONNECTION)`, `Axios`
- Produces: `process(job: Job<CrawlQuestionJobData>): Promise<void>`

- [ ] **Step 1: Write the failing test for `CertCrawlerProcessor`**

Create `src/plugins/cert-crawler/cert-crawler.processor.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { CertCrawlerProcessor } from './cert-crawler.processor';
import { CertQuestion } from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

describe('CertCrawlerProcessor', () => {
  let processor: CertCrawlerProcessor;
  const mockModel = {
    findOneAndUpdate: jest.fn().mockResolvedValue({}),
  };
  const mockConfig = {
    get: jest.fn().mockReturnValue('dummy_cookie'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertCrawlerProcessor,
        { provide: ConfigService, useValue: mockConfig },
        { provide: getModelToken(CertQuestion.name, AHA_TOOLS_CONNECTION), useValue: mockModel },
      ],
    }).compile();

    processor = module.get<CertCrawlerProcessor>(CertCrawlerProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/plugins/cert-crawler/cert-crawler.processor.spec.ts`
Expected: FAIL with "Cannot find module './cert-crawler.processor'"

- [ ] **Step 3: Implement `CertCrawlerProcessor`**

Create `src/plugins/cert-crawler/cert-crawler.processor.ts`:
```typescript
/**
 * @file cert-crawler.processor.ts
 * @description Consumer Processor lấy đáp án chi tiết và upsert vào MongoDB
 *
 * Made by Anh Tu - Share to be share
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import axios from 'axios';
import {
  CERT_CRAWLER_QUEUE,
  HOCCUNGSUSHI_BASE_URL,
} from './cert-crawler.constants';
import { CrawlQuestionJobData, RevealResponse } from './interfaces/cert-crawler.interface';
import { CertQuestion, CertQuestionDocument } from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

@Processor(CERT_CRAWLER_QUEUE, {
  limiter: {
    max: 5,
    duration: 1000,
  },
})
export class CertCrawlerProcessor extends WorkerHost {
  private readonly logger = new Logger(CertCrawlerProcessor.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(CertQuestion.name, AHA_TOOLS_CONNECTION)
    private readonly certQuestionModel: Model<CertQuestionDocument>,
  ) {
    super();
  }

  async process(job: Job<CrawlQuestionJobData>): Promise<void> {
    const { certId, attemptId, question } = job.data;
    const cookie = this.configService.get<string>('HOCCUNGSUSHI_COOKIE');

    const revealUrl = `${HOCCUNGSUSHI_BASE_URL}/api/cert/attempts/${attemptId}/reveal?q=${question.id}&detail=1`;

    let revealData: RevealResponse = {};
    try {
      const res = await axios.get(revealUrl, {
        headers: {
          Cookie: cookie,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      });
      revealData = res.data || {};
    } catch (error: any) {
      this.logger.warn(
        `Không thể lấy reveal cho câu hỏi ${question.id} (Cert: ${certId}): ${error.message}`,
      );
    }

    const correctAnswer =
      revealData.correct ||
      revealData.answer_key ||
      revealData.correct_verified ||
      '';

    const questionDoc = {
      certId,
      externalId: question.id,
      questionNo: question.question_no,
      topic: question.topic,
      guideRef: question.guide_ref,
      questionEn: question.question_en,
      questionVi: question.question_vi,
      questionJa: question.question_ja,
      optionsEn: question.options,
      optionsVi: question.options_vi,
      optionsJa: question.options_ja,
      isMulti: question.is_multi ?? false,
      correctAnswer,
      explanationEn: revealData.explanation,
      aiExpertVi: revealData.ai_expert,
      aiExpertJa: revealData.ai_expert_ja,
      sourceUrl: revealData.source_url,
      reviewConfidence: question.review_confidence,
    };

    await this.certQuestionModel.findOneAndUpdate(
      { certId, externalId: question.id },
      { $set: questionDoc },
      { upsert: true, new: true },
    );

    this.logger.log(`✅ [${certId}] Đã lưu câu hỏi #${question.question_no} (ID: ${question.id})`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/plugins/cert-crawler/cert-crawler.processor.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/cert-crawler/cert-crawler.processor.ts src/plugins/cert-crawler/cert-crawler.processor.spec.ts
git commit -m "feat(cert-crawler): implement CertCrawlerProcessor"
```

---

### Task 5: Controller, Module Wiring & Verification

**Files:**
- Create: `src/plugins/cert-crawler/cert-crawler.controller.ts`
- Create: `src/plugins/cert-crawler/cert-crawler.module.ts`
- Modify: `src/app.module.ts:15-46`
- Test: `src/plugins/cert-crawler/cert-crawler.controller.spec.ts`

**Interfaces:**
- Consumes: `CertCrawlerProducerService`, `Model<CertQuestionDocument>`
- Produces: `POST /api/crawler/cert/sync`, `GET /api/crawler/cert/status`

- [ ] **Step 1: Write the failing test for `CertCrawlerController`**

Create `src/plugins/cert-crawler/cert-crawler.controller.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CertCrawlerController } from './cert-crawler.controller';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { CertQuestion } from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

describe('CertCrawlerController', () => {
  let controller: CertCrawlerController;
  const mockProducer = {
    triggerSync: jest.fn().mockResolvedValue({ totalQuestions: 169, queuedJobs: 169 }),
  };
  const mockModel = {
    countDocuments: jest.fn().mockResolvedValue(100),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CertCrawlerController],
      providers: [
        { provide: CertCrawlerProducerService, useValue: mockProducer },
        { provide: getModelToken(CertQuestion.name, AHA_TOOLS_CONNECTION), useValue: mockModel },
      ],
    }).compile();

    controller = module.get<CertCrawlerController>(CertCrawlerController);
  });

  it('should trigger sync', async () => {
    const result = await controller.sync({ certId: 'cca-f' });
    expect(result.totalQuestions).toBe(169);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/plugins/cert-crawler/cert-crawler.controller.spec.ts`
Expected: FAIL with "Cannot find module './cert-crawler.controller'"

- [ ] **Step 3: Implement Controller and Module**

Create `src/plugins/cert-crawler/cert-crawler.controller.ts`:
```typescript
/**
 * @file cert-crawler.controller.ts
 * @description API Controller điều khiển tác vụ cào câu hỏi chứng chỉ
 *
 * Made by Anh Tu - Share to be share
 */

import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { SyncCertDto } from './dto/sync-cert.dto';
import { CertQuestion, CertQuestionDocument } from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

@Controller('api/crawler/cert')
export class CertCrawlerController {
  constructor(
    private readonly producerService: CertCrawlerProducerService,
    @InjectModel(CertQuestion.name, AHA_TOOLS_CONNECTION)
    private readonly certQuestionModel: Model<CertQuestionDocument>,
  ) {}

  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async sync(@Body() dto: SyncCertDto) {
    return this.producerService.triggerSync(dto.certId);
  }

  @Get('status')
  async status(@Query('certId') certId: string) {
    const count = await this.certQuestionModel.countDocuments({ certId });
    return {
      certId,
      totalSaved: count,
    };
  }
}
```

Create `src/plugins/cert-crawler/cert-crawler.module.ts`:
```typescript
/**
 * @file cert-crawler.module.ts
 * @description NestJS Module đăng ký Controller, Producer, Processor và Queue
 *
 * Made by Anh Tu - Share to be share
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { CERT_CRAWLER_QUEUE } from './cert-crawler.constants';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { CertCrawlerProcessor } from './cert-crawler.processor';
import { CertCrawlerController } from './cert-crawler.controller';
import { CertQuestion, CertQuestionSchema } from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: CERT_CRAWLER_QUEUE,
    }),
    MongooseModule.forFeature(
      [{ name: CertQuestion.name, schema: CertQuestionSchema }],
      AHA_TOOLS_CONNECTION,
    ),
  ],
  controllers: [CertCrawlerController],
  providers: [CertCrawlerProducerService, CertCrawlerProcessor],
  exports: [CertCrawlerProducerService],
})
export class CertCrawlerModule {}
```

- [ ] **Step 4: Register `CertCrawlerModule` in `src/app.module.ts`**

Import and add `CertCrawlerModule` into `imports` array in `src/app.module.ts`.

- [ ] **Step 5: Run all unit tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Live Verification Test**

Run node script or trigger endpoint to verify crawling of sample questions into MongoDB:
Verify with:
```bash
node -e "
require('dotenv').config();
const { MongoClient } = require('mongodb');
async function check() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const count = await db.collection('cert_questions').countDocuments({ certId: 'cca-f' });
  console.log('Total cca-f questions in MongoDB:', count);
  const sample = await db.collection('cert_questions').findOne({ certId: 'cca-f' });
  console.log('Sample question:', sample?.externalId, sample?.correctAnswer, sample?.aiExpertVi ? 'Has aiExpertVi' : 'No aiExpert');
  await client.close();
}
check();
"
```

- [ ] **Step 7: Commit**

```bash
git add src/plugins/cert-crawler/ src/app.module.ts
git commit -m "feat(cert-crawler): complete CertCrawlerModule with controller and app wiring"
```
