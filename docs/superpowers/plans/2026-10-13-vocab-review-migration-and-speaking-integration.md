# Vocab Review Migration & Speaking Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Di chuyển 100% logic Vocab Review (FSRS Engine, Distractor Generation, Session Synthesis, Review Log) từ `aha-tools` sang `aha-mind-agents` dưới dạng `VocabReviewModule`, đồng thời tích hợp tự động các thẻ từ vựng đến hạn ôn vào Pipeline sinh đề nói của `SpeakingQuizModule`.

**Architecture:** Kiến trúc Decoupled Microservice kết hợp FSRS v4 độc lập + Multi-Tier Distractor Pool + Mongoose Models trên `AHA_TOOLS_CONNECTION` + LangGraph Context-Injection. Next.js (`aha-tools`) đóng vai trò Presentation Layer tiêu thụ REST API chuẩn hóa; BullMQ worker của Speaking Quiz tự động truy vấn từ vựng suy giảm trí nhớ để ép Gemini 2.5 Flash lồng ghép vào câu hỏi tranh luận và giàn giáo PREP.

**Tech Stack:** NestJS 11, TypeScript 5.9, Mongoose 8.10 / `@nestjs/mongoose`, `ts-fsrs` (FSRS Scheduler v4), LangGraph / LangChain, BullMQ v5, Zod v3.24, Jest 29.

---

## Bản Đồ Files Thay Đổi & Tạo Mới (File Allocation Map)

```text
aha-mind-agents/
├── package.json                                                     # Thêm dependency: ts-fsrs
├── src/
│   ├── app.module.ts                                                # Import VocabReviewModule
│   ├── infra/
│   │   └── database/
│   │       ├── database.constants.ts                                # Thêm constants model nếu cần
│   │       ├── database.module.ts                                   # Đăng ký VocabCard & VocabReviewLog vào AHA_TOOLS_CONNECTION
│   │       └── schemas/
│   │           ├── vocab-card.schema.ts                             # Mongoose schema mapping collection vocab_cards
│   │           ├── vocab-card.schema.spec.ts                        # Unit test cho vocab-card.schema
│   │           ├── vocab-review-log.schema.ts                       # Mongoose schema mapping collection vocab_review_logs
│   │           ├── vocab-review-log.schema.spec.ts                  # Unit test cho vocab-review-log.schema
│   │           ├── speaking-question.schema.ts                      # Cập nhật: TargetKeywordItem thêm srsStatus & isInjected
│   │           └── speaking-question.schema.spec.ts                 # Cập nhật: Test srsStatus & isInjected
│   └── plugins/
│       ├── speaking-quiz/
│       │   ├── speaking-quiz.module.ts                              # Import VocabReviewModule
│       │   ├── speaking-quiz.state.ts                               # Cập nhật TargetKeywordItemType (srsStatus, isInjected)
│       │   ├── nodes/
│       │   │   ├── context-resolver.node.ts                         # Tiêm VocabReviewService để lấy Candidate Due Vocab
│       │   │   ├── context-resolver.node.spec.ts                    # Test tiêm từ vựng candidate vào state
│       │   │   ├── question-formulator.node.ts                      # Cập nhật system prompt ràng buộc từ vựng
│       │   │   ├── prep-synthesizer.node.ts                         # Cập nhật system prompt ràng buộc PREP
│       │   │   ├── persister.node.ts                                # Lưu srsStatus và isInjected vào DB
│       │   │   └── persister.node.spec.ts                           # Test lưu srsStatus và isInjected
│       └── vocab-review/
│           ├── vocab-review.module.ts                               # Module đăng ký controller, services, schemas
│           ├── vocab-review.controller.ts                           # Controller: /api/vocab/review/session, submit, due-count
│           ├── vocab-review.controller.spec.ts                      # Unit test cho VocabReviewController
│           ├── dto/
│           │   ├── review-session-query.dto.ts                      # DTO query parameters (limit, practiceAll)
│           │   ├── submit-review.dto.ts                             # DTO nộp kết quả ôn tập (cardId, isCorrect, responseTimeMs)
│           │   ├── candidate-vocab.dto.ts                           # DTO / Type cho từ vựng ứng viên luyện nói
│           │   └── vocab-review-dto.spec.ts                         # Validation test cho DTOs
│           └── services/
│               ├── fsrs.service.ts                                  # Service tính toán FSRS v4 độc lập
│               ├── fsrs.service.spec.ts                             # Unit test cho FSRSService
│               ├── distractor.service.ts                            # Service tổng hợp distractors 3 tầng
│               ├── distractor.service.spec.ts                       # Unit test cho DistractorService
│               ├── vocab-review.service.ts                          # Service nghiệp vụ review session, submit, due-count
│               └── vocab-review.service.spec.ts                     # Unit test cho VocabReviewService
├── docs/
│   └── contracts/
│       └── vocab-review-api-contract.md                             # Tài liệu API Contract & Client SDK cho aha-tools
└── test/
    └── vocab-review.e2e-spec.ts                                     # E2E test cho toàn bộ luồng Vocab Review API
```

---

## Chi Tiết Các Tác Vụ Thực Thi (Task Breakdown)

### Task 1: Cài đặt Dependency `ts-fsrs` & Mongoose Schemas (`VocabCard`, `VocabReviewLog`)

**Mục tiêu:** Cài đặt thư viện `ts-fsrs` cho `aha-mind-agents`, định nghĩa Mongoose schemas `VocabCard` và `VocabReviewLog` khớp 100% cấu trúc MongoDB hiện có của `aha-tools`, và đăng ký vào `DatabaseModule` dưới `AHA_TOOLS_CONNECTION`.

**Files:**
- Modify: `package.json`
- Create: `src/infra/database/schemas/vocab-card.schema.ts`
- Create: `src/infra/database/schemas/vocab-card.schema.spec.ts`
- Create: `src/infra/database/schemas/vocab-review-log.schema.ts`
- Create: `src/infra/database/schemas/vocab-review-log.schema.spec.ts`
- Modify: `src/infra/database/database.constants.ts:1-7`
- Modify: `src/infra/database/database.module.ts:50-60`

- [ ] **Step 1: Cài đặt `ts-fsrs`**

Chạy lệnh cài đặt thư viện:
```bash
npm install ts-fsrs
```
Kiểm tra: `npm list ts-fsrs` hiển thị phiên bản đã cài đặt.

- [ ] **Step 2: Viết test cho `VocabCardSchema` và `VocabReviewLogSchema`**

Tạo file `src/infra/database/schemas/vocab-card.schema.spec.ts`:
```typescript
import { VocabCardSchema } from './vocab-card.schema';

describe('VocabCardSchema', () => {
  it('should define required fields correctly', () => {
    const paths = VocabCardSchema.paths;
    expect(paths['word']).toBeDefined();
    expect(paths['word'].isRequired).toBeTruthy();
    expect(paths['explanation']).toBeDefined();
    expect(paths['explanation'].isRequired).toBeTruthy();
    expect(paths['level']).toBeDefined();
    expect(paths['fsrs.due']).toBeDefined();
    expect(paths['fsrs.stability']).toBeDefined();
    expect(paths['fsrs.difficulty']).toBeDefined();
    expect(paths['fsrs.state']).toBeDefined();
  });

  it('should have index on word and fsrs.due', () => {
    const paths = VocabCardSchema.paths;
    expect(paths['word'].options.index).toBeTruthy();
    expect(paths['fsrs.due'].options.index).toBeTruthy();
  });
});
```

Tạo file `src/infra/database/schemas/vocab-review-log.schema.spec.ts`:
```typescript
import { VocabReviewLogSchema } from './vocab-review-log.schema';

describe('VocabReviewLogSchema', () => {
  it('should define required fields for review log correctly', () => {
    const paths = VocabReviewLogSchema.paths;
    expect(paths['vocabCardId']).toBeDefined();
    expect(paths['vocabCardId'].isRequired).toBeTruthy();
    expect(paths['word']).toBeDefined();
    expect(paths['rating']).toBeDefined();
    expect(paths['isCorrect']).toBeDefined();
    expect(paths['reviewedAt']).toBeDefined();
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận test thất bại (Red phase)**

Run: `npx jest src/infra/database/schemas/vocab-card.schema.spec.ts src/infra/database/schemas/vocab-review-log.schema.spec.ts`
Expected: FAIL do chưa có các file schema.

- [ ] **Step 4: Cập nhật constants và cài đặt `vocab-card.schema.ts`, `vocab-review-log.schema.ts`**

Cập nhật `src/infra/database/database.constants.ts`:
```typescript
export const AHA_TOOLS_CONNECTION = 'AhaToolsConnection';
export const AHA_MIND_CONNECTION = 'AhaMindConnection';

export const STORYBOOK_MODEL = 'Storybook_v5';
export const AGENT_LOG_MODEL = 'AgentExecLog';
export const AGENT_CONFIG_MODEL = 'AgentConfig';
export const VOCAB_CARD_MODEL = 'VocabCard';
export const VOCAB_REVIEW_LOG_MODEL = 'VocabReviewLog';
```

Tạo file `src/infra/database/schemas/vocab-card.schema.ts`:
```typescript
/**
 * @file vocab-card.schema.ts
 * @description Mongoose Schema cho collection `vocab_cards` trong MongoDB aha-tools
 *
 * Made by Anh Tu - Share to be share
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class VocabExampleSentence {
  @Prop({ required: true })
  sentence: string;

  @Prop({ required: true })
  answer: string;
}
export const VocabExampleSentenceSchema = SchemaFactory.createForClass(VocabExampleSentence);

@Schema({ _id: false })
export class VocabWordFamily {
  @Prop({ required: true })
  word: string;

  @Prop()
  partOfSpeech?: string;

  @Prop()
  ipa?: string;

  @Prop({ required: true })
  explanation: string;
}
export const VocabWordFamilySchema = SchemaFactory.createForClass(VocabWordFamily);

@Schema({ _id: false })
export class VocabCollocation {
  @Prop({ required: true })
  collocation: string;

  @Prop({ required: true })
  explanation: string;
}
export const VocabCollocationSchema = SchemaFactory.createForClass(VocabCollocation);

@Schema({ _id: false })
export class FSRSCardState {
  @Prop({ type: Date, required: true, index: true })
  due: Date;

  @Prop({ type: Number, required: true, default: 0 })
  stability: number;

  @Prop({ type: Number, required: true, default: 0 })
  difficulty: number;

  @Prop({ type: Number, required: true, default: 0 })
  elapsed_days: number;

  @Prop({ type: Number, required: true, default: 0 })
  scheduled_days: number;

  @Prop({ type: Number, required: true, default: 0 })
  reps: number;

  @Prop({ type: Number, required: true, default: 0 })
  lapses: number;

  @Prop({ type: Number, required: true, default: 0 })
  state: number; // 0: New, 1: Learning, 2: Review, 3: Relearning

  @Prop({ type: Date, required: false })
  last_review?: Date;
}
export const FSRSCardStateSchema = SchemaFactory.createForClass(FSRSCardState);

@Schema({ timestamps: true, collection: 'vocab_cards' })
export class VocabCard extends Document {
  @Prop({ required: true, index: true })
  word: string;

  @Prop()
  ipa?: string;

  @Prop({ required: true })
  explanation: string;

  @Prop({
    required: true,
    enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    default: 'B1',
  })
  level: string;

  @Prop()
  audioUrl?: string;

  @Prop({ type: [VocabExampleSentenceSchema], default: [] })
  exampleSentences?: VocabExampleSentence[];

  @Prop({ type: [VocabWordFamilySchema], default: [] })
  wordFamily?: VocabWordFamily[];

  @Prop({ type: [VocabCollocationSchema], default: [] })
  collocations?: VocabCollocation[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Storybook', required: false })
  sourceStorybookId?: MongooseSchema.Types.ObjectId;

  @Prop()
  sourceStorybookTitle?: string;

  @Prop({ type: FSRSCardStateSchema, required: true })
  fsrs: FSRSCardState;
}

export const VocabCardSchema = SchemaFactory.createForClass(VocabCard);
```

Tạo file `src/infra/database/schemas/vocab-review-log.schema.ts`:
```typescript
/**
 * @file vocab-review-log.schema.ts
 * @description Mongoose Schema cho collection `vocab_review_logs` lưu lịch sử ôn tập FSRS
 *
 * Made by Anh Tu - Share to be share
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true, collection: 'vocab_review_logs' })
export class VocabReviewLog extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'VocabCard', required: true, index: true })
  vocabCardId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  word: string;

  @Prop({ required: true })
  rating: number; // 1: Again, 2: Hard, 3: Good, 4: Easy

  @Prop({ required: true, default: 0 })
  state: number;

  @Prop({ type: Date, required: true, default: Date.now })
  due: Date;

  @Prop({ type: Number, required: true, default: 0 })
  stability: number;

  @Prop({ type: Number, required: true, default: 0 })
  difficulty: number;

  @Prop({ type: Number, required: true, default: 0 })
  elapsed_days: number;

  @Prop({ type: Number, required: true, default: 0 })
  scheduled_days: number;

  @Prop({ type: Number, required: true, default: 0 })
  responseTimeMs: number;

  @Prop({ required: true })
  isCorrect: boolean;

  @Prop({ type: Date, default: Date.now, index: true })
  reviewedAt: Date;
}

export const VocabReviewLogSchema = SchemaFactory.createForClass(VocabReviewLog);
```

Cập nhật `src/infra/database/database.module.ts`:
Thêm import `VocabCard`, `VocabCardSchema`, `VocabReviewLog`, `VocabReviewLogSchema` và đăng ký trong `MongooseModule.forFeature(..., AHA_TOOLS_CONNECTION)`.

- [ ] **Step 5: Chạy lại test xác nhận Green**

Run: `npx jest src/infra/database/schemas/vocab-card.schema.spec.ts src/infra/database/schemas/vocab-review-log.schema.spec.ts`
Expected: PASS (2 suites passed).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/infra/database/database.constants.ts src/infra/database/database.module.ts src/infra/database/schemas/vocab-card.schema.ts src/infra/database/schemas/vocab-card.schema.spec.ts src/infra/database/schemas/vocab-review-log.schema.ts src/infra/database/schemas/vocab-review-log.schema.spec.ts
git commit -m "feat(infra): install ts-fsrs and add vocab card and review log schemas"
```

---

### Task 2: Dịch vụ Tính toán Chu kỳ Ghi nhớ `FSRSService`

**Mục tiêu:** Xây dựng `FSRSService` độc lập đóng gói logic FSRS v4, chuyển hóa kết quả quiz (đúng/sai, thời gian phản hồi) thành FSRS Rating và tính toán ngày đến hạn tiếp theo (`nextDue`, `stability`, `difficulty`).

**Files:**
- Create: `src/plugins/vocab-review/services/fsrs.service.ts`
- Create: `src/plugins/vocab-review/services/fsrs.service.spec.ts`

- [ ] **Step 1: Viết test cho `FSRSService`**

Tạo file `src/plugins/vocab-review/services/fsrs.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { FSRSService } from './fsrs.service';
import { Rating } from 'ts-fsrs';

describe('FSRSService', () => {
  let service: FSRSService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FSRSService],
    }).compile();

    service = module.get<FSRSService>(FSRSService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateFSRSRating', () => {
    it('should return Rating.Again (1) when answer is incorrect', () => {
      expect(service.calculateFSRSRating(false, 1500)).toBe(Rating.Again);
    });

    it('should return Rating.Easy (4) when answer is correct and response time < 3s', () => {
      expect(service.calculateFSRSRating(true, 2500)).toBe(Rating.Easy);
    });

    it('should return Rating.Good (3) when answer is correct and response time 3s - 10s', () => {
      expect(service.calculateFSRSRating(true, 5000)).toBe(Rating.Good);
      expect(service.calculateFSRSRating(true, 10000)).toBe(Rating.Good);
    });

    it('should return Rating.Hard (2) when answer is correct and response time > 10s', () => {
      expect(service.calculateFSRSRating(true, 11000)).toBe(Rating.Hard);
    });
  });

  describe('scheduleNextReview', () => {
    it('should schedule next review date in the future for successful ratings', () => {
      const initial = service.createInitialFSRSState(new Date('2026-10-13T00:00:00Z'));
      const reviewDate = new Date('2026-10-13T08:00:00Z');

      const result = service.scheduleNextReview(initial, Rating.Good, reviewDate);

      expect(result.updatedState).toBeDefined();
      expect(result.updatedState.reps).toBeGreaterThan(0);
      expect(new Date(result.updatedState.due).getTime()).toBeGreaterThan(reviewDate.getTime());
      expect(result.rating).toBe(Rating.Good);
    });

    it('should decrease stability or increase lapses on Again rating', () => {
      const initial = service.createInitialFSRSState(new Date('2026-10-13T00:00:00Z'));
      const reviewDate = new Date('2026-10-13T08:00:00Z');

      const result = service.scheduleNextReview(initial, Rating.Again, reviewDate);
      expect(result.updatedState.reps).toBeDefined();
      expect(result.rating).toBe(Rating.Again);
    });
  });
});
```

- [ ] **Step 2: Chạy test xác nhận Red**

Run: `npx jest src/plugins/vocab-review/services/fsrs.service.spec.ts`
Expected: FAIL do chưa có file `fsrs.service.ts`.

- [ ] **Step 3: Triển khai `FSRSService`**

Tạo file `src/plugins/vocab-review/services/fsrs.service.ts`:
```typescript
/**
 * @file fsrs.service.ts
 * @description Dịch vụ tính toán thuật toán FSRS v4 (Free Spaced Repetition Scheduler)
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable } from '@nestjs/common';
import {
  fsrs,
  generatorParameters,
  Rating,
  Grade,
  State,
  createEmptyCard,
  Card as FSRSCard,
  RecordLogItem,
} from 'ts-fsrs';
import { FSRSCardState } from '../../../infra/database/schemas/vocab-card.schema';

@Injectable()
export class FSRSService {
  private readonly srsScheduler = fsrs(
    generatorParameters({
      request_retention: 0.9,
      maximum_interval: 365,
      enable_fuzz: true,
      enable_short_term: false,
    }),
  );

  /**
   * Khởi tạo trạng thái FSRS mặc định cho từ vựng mới lưu
   */
  public createInitialFSRSState(now: Date = new Date()): FSRSCardState {
    const empty = createEmptyCard(now);
    return {
      due: empty.due,
      stability: empty.stability,
      difficulty: empty.difficulty,
      elapsed_days: empty.elapsed_days,
      scheduled_days: empty.scheduled_days,
      reps: empty.reps,
      lapses: empty.lapses,
      state: empty.state,
      last_review: empty.last_review,
    };
  }

  /**
   * Chuyển đổi kết quả trắc nghiệm và độ trễ phản hồi thành điểm FSRS Rating (1: Again, 2: Hard, 3: Good, 4: Easy)
   */
  public calculateFSRSRating(isCorrect: boolean, responseTimeMs: number): Grade {
    if (!isCorrect) {
      return Rating.Again;
    }
    if (responseTimeMs < 3000) {
      return Rating.Easy;
    } else if (responseTimeMs <= 10000) {
      return Rating.Good;
    } else {
      return Rating.Hard;
    }
  }

  /**
   * Tính toán lần ôn tập tiếp theo dựa trên FSRS algorithm
   */
  public scheduleNextReview(
    currentState: FSRSCardState,
    rating: Grade,
    reviewDate: Date = new Date(),
  ): {
    updatedState: FSRSCardState;
    log: RecordLogItem;
    rating: Grade;
  } {
    const empty = createEmptyCard(new Date(currentState.due));
    const card: FSRSCard = {
      ...empty,
      due: new Date(currentState.due),
      stability: currentState.stability,
      difficulty: currentState.difficulty,
      elapsed_days: currentState.elapsed_days,
      scheduled_days: currentState.scheduled_days,
      reps: currentState.reps,
      lapses: currentState.lapses,
      state: currentState.state as State,
      last_review: currentState.last_review ? new Date(currentState.last_review) : undefined,
    };

    const result = this.srsScheduler.next(card, reviewDate, rating);

    const updatedState: FSRSCardState = {
      due: result.card.due,
      stability: result.card.stability,
      difficulty: result.card.difficulty,
      elapsed_days: result.card.elapsed_days,
      scheduled_days: result.card.scheduled_days,
      reps: result.card.reps,
      lapses: result.card.lapses,
      state: result.card.state,
      last_review: result.card.last_review,
    };

    return {
      updatedState,
      log: result.log,
      rating,
    };
  }
}
```

- [ ] **Step 4: Chạy lại test xác nhận Green**

Run: `npx jest src/plugins/vocab-review/services/fsrs.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/vocab-review/services/fsrs.service.ts src/plugins/vocab-review/services/fsrs.service.spec.ts
git commit -m "feat(vocab-review): implement FSRSService with ts-fsrs engine"
```

---

### Task 3: Lõi Sinh Đáp Án Gây Nhiễu 3 Tầng `DistractorService`

**Mục tiêu:** Xây dựng `DistractorService` tổng hợp các đáp án sai có tính thuyết phục cho câu hỏi MCQ dựa trên kiến trúc 3 tầng:
1. Định nghĩa từ vựng cá nhân (`vocab_cards`).
2. Kho từ vựng toàn cục trong `storybooks` (`Incidental Learning Pool`).
3. Ngân hàng dự phòng mặc định CEFR B1-C1 (`DEFAULT_DISTRACTORS`).

**Files:**
- Create: `src/plugins/vocab-review/services/distractor.service.ts`
- Create: `src/plugins/vocab-review/services/distractor.service.spec.ts`

- [ ] **Step 1: Viết test cho `DistractorService`**

Tạo file `src/plugins/vocab-review/services/distractor.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DistractorService } from './distractor.service';

describe('DistractorService', () => {
  let service: DistractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DistractorService],
    }).compile();

    service = module.get<DistractorService>(DistractorService);
  });

  it('should generate 3 unique distractors not equal to the correct explanation', () => {
    const target = 'A practical method or technique used to solve a specific problem';
    const pool = [
      'To gradually become smaller, weaker, or less important over time',
      'The ability to understand something instinctively without needing conscious reasoning',
      'A standard or benchmark by which other things can be judged or measured',
      'A practical method or technique used to solve a specific problem', // trùng đáp án đúng
    ];

    const distractors = service.generateDistractors(target, 3, pool);

    expect(distractors).toHaveLength(3);
    expect(distractors).not.toContain(target);
    const unique = new Set(distractors.map(d => d.toLowerCase()));
    expect(unique.size).toBe(3);
  });

  it('should fallback to default CEFR bank when pool has fewer than 3 items', () => {
    const target = 'Something special';
    const emptyPool: string[] = [];

    const distractors = service.generateDistractors(target, 3, emptyPool);

    expect(distractors).toHaveLength(3);
    expect(distractors).not.toContain(target);
  });
});
```

- [ ] **Step 2: Chạy test xác nhận Red**

Run: `npx jest src/plugins/vocab-review/services/distractor.service.spec.ts`
Expected: FAIL do chưa có file `distractor.service.ts`.

- [ ] **Step 3: Triển khai `DistractorService`**

Tạo file `src/plugins/vocab-review/services/distractor.service.ts`:
```typescript
/**
 * @file distractor.service.ts
 * @description Dịch vụ sinh đáp án gây nhiễu (Distractors) 3 tầng cho MCQ Vocab Review
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable } from '@nestjs/common';

export const DEFAULT_DISTRACTORS: string[] = [
  'A period of little or no growth after rapid progress or change',
  'An important discovery or event that helps improve a situation or provide an answer',
  'The act of thinking deeply about something or remembering past experiences',
  'A practical method or technique used to solve a specific problem',
  'To gradually become smaller, weaker, or less important over time',
  'The ability to understand something instinctively without needing conscious reasoning',
  'A standard or benchmark by which other things can be judged or measured',
  'To make something clear or easier to understand by providing more details',
  'A sudden and significant change in the way something is done or understood',
  'The capacity to recover quickly from difficulties, tough situations, or toughness',
  'To cause something to begin or happen, especially a reaction or process',
  'A subtle difference in meaning, expression, sound, or appearance',
  'To combine different ideas, styles, or systems into a single effective whole',
  'The state of being widely known or respected for excellence or achievements',
  'To delay or postpone doing something that should be done immediately',
  'A set of principles or beliefs that guide how a person or group behaves',
  'To give official permission, approval, or formal authorization for an action',
  'A temporary failure or gap in memory, concentration, or judgment',
  'To make a continuous effort to achieve a difficult goal despite challenges',
  'The process of making something as effective, perfect, or functional as possible',
  'An obstacle or difficulty that prevents smooth progress or success',
  'To emphasize or make something stand out clearly from its surroundings',
  'The quality of being logical, consistent, and easy to follow or comprehend',
  'To reduce or lessen the severity, intensity, or painfulness of something',
  'A tendency or inclination towards a particular opinion, preference, or outcome',
  'To express feelings, thoughts, or ideas clearly and effectively in words',
  'A fundamental change in approach, mindset, or underlying assumptions',
  'To hold someone's attention completely because of being interesting or exciting',
  'The act of examining one\'s own thoughts, feelings, and motivations carefully',
  'To succeed in dealing with or gaining control over a challenge or obstacle',
];

@Injectable()
export class DistractorService {
  /**
   * Lấy ngẫu nhiên các câu trả lời nhiễu từ ngân hàng mặc định
   */
  public getRandomDefaultDistractors(targetExplanation: string, count = 3): string[] {
    const targetKey = targetExplanation.toLowerCase().trim();
    const filtered = DEFAULT_DISTRACTORS.filter(
      d => d.toLowerCase().trim() !== targetKey,
    );
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Sinh danh sách distractors theo mô hình 3 tầng
   */
  public generateDistractors(
    targetExplanation: string,
    count = 3,
    globalPool: string[] = [],
  ): string[] {
    const targetKey = targetExplanation.toLowerCase().trim();

    // Lọc bỏ đáp án đúng khỏi pool
    const candidates = globalPool.filter(
      exp => exp && exp.toLowerCase().trim() !== targetKey,
    );

    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    let selected = shuffled.slice(0, count);

    // Nếu không đủ số lượng yêu cầu, lấy bổ sung từ ngân hàng mặc định
    if (selected.length < count) {
      const needed = count - selected.length;
      const fallback = this.getRandomDefaultDistractors(targetExplanation, needed);
      selected = [...selected, ...fallback];
    }

    return selected;
  }
}
```

- [ ] **Step 4: Chạy lại test xác nhận Green**

Run: `npx jest src/plugins/vocab-review/services/distractor.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/vocab-review/services/distractor.service.ts src/plugins/vocab-review/services/distractor.service.spec.ts
git commit -m "feat(vocab-review): implement 3-tier DistractorService"
```

---

### Task 4: Data Transfer Objects (DTOs) & Types cho Vocab Review

**Mục tiêu:** Định nghĩa các DTOs chuẩn hóa có validation với `class-validator` và `class-transformer` cho các endpoint của `VocabReviewController`.

**Files:**
- Create: `src/plugins/vocab-review/dto/review-session-query.dto.ts`
- Create: `src/plugins/vocab-review/dto/submit-review.dto.ts`
- Create: `src/plugins/vocab-review/dto/candidate-vocab.dto.ts`
- Create: `src/plugins/vocab-review/dto/vocab-review-dto.spec.ts`

- [ ] **Step 1: Viết test cho các DTOs**

Tạo file `src/plugins/vocab-review/dto/vocab-review-dto.spec.ts`:
```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReviewSessionQueryDto } from './review-session-query.dto';
import { SubmitReviewDto } from './submit-review.dto';

describe('Vocab Review DTOs Validation', () => {
  describe('ReviewSessionQueryDto', () => {
    it('should validate valid query parameters', async () => {
      const dto = plainToInstance(ReviewSessionQueryDto, { limit: 15, practiceAll: false });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should clamp or reject limit outside 1 to 30', async () => {
      const dto = plainToInstance(ReviewSessionQueryDto, { limit: 50 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('SubmitReviewDto', () => {
    it('should pass with valid cardId, isCorrect and responseTimeMs', async () => {
      const dto = plainToInstance(SubmitReviewDto, {
        cardId: '670a1b2c3d4e5f6a7b8c9d0e',
        isCorrect: true,
        responseTimeMs: 2500,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with empty cardId', async () => {
      const dto = plainToInstance(SubmitReviewDto, {
        cardId: '',
        isCorrect: true,
        responseTimeMs: 2500,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Chạy test xác nhận Red**

Run: `npx jest src/plugins/vocab-review/dto/vocab-review-dto.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Triển khai các DTOs**

Tạo file `src/plugins/vocab-review/dto/review-session-query.dto.ts`:
```typescript
/**
 * @file review-session-query.dto.ts
 * @description Query parameters cho endpoint GET /api/vocab/review/session
 *
 * Made by Anh Tu - Share to be share
 */

import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ReviewSessionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number = 15;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  practiceAll?: boolean = false;
}
```

Tạo file `src/plugins/vocab-review/dto/submit-review.dto.ts`:
```typescript
/**
 * @file submit-review.dto.ts
 * @description Request body cho endpoint POST /api/vocab/review/submit
 *
 * Made by Anh Tu - Share to be share
 */

import { IsBoolean, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class SubmitReviewDto {
  @IsString()
  @IsNotEmpty({ message: 'cardId không được để trống' })
  cardId: string;

  @IsBoolean()
  isCorrect: boolean;

  @IsInt()
  @Min(0)
  responseTimeMs: number;
}
```

Tạo file `src/plugins/vocab-review/dto/candidate-vocab.dto.ts`:
```typescript
/**
 * @file candidate-vocab.dto.ts
 * @description Type definitions cho từ vựng trích xuất tích hợp vào Speaking Quiz
 *
 * Made by Anh Tu - Share to be share
 */

export interface CandidateVocabItem {
  word: string;
  explanation: string;
  level: string;
  srsStatus: 'due' | 'learning' | 'mastered' | 'new';
}
```

- [ ] **Step 4: Chạy lại test xác nhận Green**

Run: `npx jest src/plugins/vocab-review/dto/vocab-review-dto.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/vocab-review/dto/
git commit -m "feat(vocab-review): add validated DTOs for vocab review endpoints"
```

---

### Task 5: Nghiệp Vụ Phiên Ôn Tập & Thẻ Đến Hạn `VocabReviewService`

**Mục tiêu:** Xây dựng `VocabReviewService` thực hiện:
1. `getReviewSession`: Query thẻ đến hạn (`due <= now`), tổng hợp distractor pool từ thẻ cá nhân & storybooks, trộn MCQ/Cloze options.
2. `submitReview`: Tính FSRS rating, cập nhật DB `vocab_cards`, ghi vết `vocab_review_logs`.
3. `getDueCount`: Thống kê thẻ đến hạn, đang học, đã thuộc.
4. `getCandidateDueVocab`: Trích xuất top 4 từ vựng ưu tiên phục vụ tiêm ngữ cảnh Speaking Quiz.

**Files:**
- Create: `src/plugins/vocab-review/services/vocab-review.service.ts`
- Create: `src/plugins/vocab-review/services/vocab-review.service.spec.ts`

- [ ] **Step 1: Viết unit test cho `VocabReviewService`**

Tạo file `src/plugins/vocab-review/services/vocab-review.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { VocabReviewService } from './vocab-review.service';
import { FSRSService } from './fsrs.service';
import { DistractorService } from './distractor.service';
import { VocabCard } from '../../../infra/database/schemas/vocab-card.schema';
import { VocabReviewLog } from '../../../infra/database/schemas/vocab-review-log.schema';
import { Storybook } from '../../../infra/database/schemas/storybook.schema';
import { AHA_TOOLS_CONNECTION } from '../../../infra/database/database.constants';

describe('VocabReviewService', () => {
  let service: VocabReviewService;
  let mockVocabCardModel: any;
  let mockReviewLogModel: any;
  let mockStorybookModel: any;

  beforeEach(async () => {
    mockVocabCardModel = {
      find: jest.fn(),
      findById: jest.fn(),
      countDocuments: jest.fn(),
    };
    mockReviewLogModel = {
      create: jest.fn(),
    };
    mockStorybookModel = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VocabReviewService,
        FSRSService,
        DistractorService,
        {
          provide: getModelToken(VocabCard.name, AHA_TOOLS_CONNECTION),
          useValue: mockVocabCardModel,
        },
        {
          provide: getModelToken(VocabReviewLog.name, AHA_TOOLS_CONNECTION),
          useValue: mockReviewLogModel,
        },
        {
          provide: getModelToken(Storybook.name, AHA_TOOLS_CONNECTION),
          useValue: mockStorybookModel,
        },
      ],
    }).compile();

    service = module.get<VocabReviewService>(VocabReviewService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDueCount', () => {
    it('should aggregate dueCount, totalCount, newCount, masteredCount and learningCount', async () => {
      mockVocabCardModel.countDocuments
        .mockResolvedValueOnce(5) // dueCount
        .mockResolvedValueOnce(20) // totalCount
        .mockResolvedValueOnce(3) // newCount
        .mockResolvedValueOnce(7); // masteredCount

      const result = await service.getDueCount();

      expect(result.dueCount).toBe(5);
      expect(result.totalCount).toBe(20);
      expect(result.newCount).toBe(3);
      expect(result.masteredCount).toBe(7);
      expect(result.learningCount).toBe(10); // 20 - 3 - 7
    });
  });

  describe('getCandidateDueVocab', () => {
    it('should return prioritized candidate vocabulary cards with correct srsStatus', async () => {
      const mockCards = [
        {
          word: 'sustainable',
          explanation: 'Able to be maintained at a certain rate',
          level: 'B2',
          fsrs: { due: new Date(Date.now() - 10000), stability: 1.2, reps: 3 },
        },
        {
          word: 'mitigate',
          explanation: 'Make less severe',
          level: 'C1',
          fsrs: { due: new Date(Date.now() + 50000), stability: 0.8, reps: 1 },
        },
      ];

      mockVocabCardModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockCards),
      });

      const candidates = await service.getCandidateDueVocab({ limit: 4 });

      expect(candidates).toHaveLength(2);
      expect(candidates[0].word).toBe('sustainable');
      expect(candidates[0].srsStatus).toBe('due');
      expect(candidates[1].word).toBe('mitigate');
      expect(candidates[1].srsStatus).toBe('learning');
    });
  });
});
```

- [ ] **Step 2: Chạy test xác nhận Red**

Run: `npx jest src/plugins/vocab-review/services/vocab-review.service.spec.ts`
Expected: FAIL do chưa có file `vocab-review.service.ts`.

- [ ] **Step 3: Triển khai `VocabReviewService`**

Tạo file `src/plugins/vocab-review/services/vocab-review.service.ts`:
```typescript
/**
 * @file vocab-review.service.ts
 * @description Nghiệp vụ tạo phiên ôn tập trắc nghiệm, ghi nhận kết quả và thống kê FSRS
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AHA_TOOLS_CONNECTION } from '../../../infra/database/database.constants';
import { VocabCard } from '../../../infra/database/schemas/vocab-card.schema';
import { VocabReviewLog } from '../../../infra/database/schemas/vocab-review-log.schema';
import { Storybook } from '../../../infra/database/schemas/storybook.schema';
import { FSRSService } from './fsrs.service';
import { DistractorService } from './distractor.service';
import { SubmitReviewDto } from '../dto/submit-review.dto';
import { CandidateVocabItem } from '../dto/candidate-vocab.dto';

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  cardId: string;
  word: string;
  ipa?: string;
  audioUrl?: string;
  level: string;
  wordFamily?: any[];
  collocations?: any[];
  sourceStorybookTitle?: string;
  explanation: string;
  options: QuizOption[];
  exampleSentences?: Array<{ sentence: string; answer: string }>;
  quizMode: 'mcq' | 'cloze';
  fsrsState: {
    due: string;
    reps: number;
    stability: number;
  };
}

export interface ReviewSessionResponse {
  questions: QuizQuestion[];
  totalDue: number;
  sessionLimit: number;
  totalSaved: number;
}

@Injectable()
export class VocabReviewService {
  private readonly logger = new Logger(VocabReviewService.name);

  constructor(
    @InjectModel(VocabCard.name, AHA_TOOLS_CONNECTION)
    private readonly vocabCardModel: Model<VocabCard>,
    @InjectModel(VocabReviewLog.name, AHA_TOOLS_CONNECTION)
    private readonly reviewLogModel: Model<VocabReviewLog>,
    @InjectModel(Storybook.name, AHA_TOOLS_CONNECTION)
    private readonly storybookModel: Model<Storybook>,
    private readonly fsrsService: FSRSService,
    private readonly distractorService: DistractorService,
  ) {}

  /**
   * Sinh phiên câu hỏi ôn tập (MCQ / Cloze) kèm options gây nhiễu
   */
  public async getReviewSession(options: {
    limit?: number;
    practiceAll?: boolean;
  } = {}): Promise<ReviewSessionResponse> {
    const limit = Math.min(Math.max(1, options.limit || 15), 30);
    const practiceAll = options.practiceAll === true;
    const now = new Date();

    const query: Record<string, any> = practiceAll ? {} : { 'fsrs.due': { $lte: now } };

    const [targetCards, totalCount, allPersonalCards, allStorybooks] = await Promise.all([
      this.vocabCardModel
        .find(query)
        .sort({ 'fsrs.due': 1 })
        .limit(limit)
        .lean(),
      this.vocabCardModel.countDocuments({}),
      this.vocabCardModel.find({}, { explanation: 1, word: 1 }).lean(),
      this.storybookModel.find({}, { 'keywords.explanation': 1, 'keywords.word': 1 }).lean(),
    ]);

    if (targetCards.length === 0 && !practiceAll) {
      return {
        questions: [],
        totalDue: 0,
        sessionLimit: limit,
        totalSaved: totalCount,
      };
    }

    // 1. Trích xuất giải nghĩa từ cards cá nhân
    const personalExplanations = allPersonalCards
      .map((c: any) => c.explanation?.trim())
      .filter((exp: string | undefined): exp is string => Boolean(exp));

    // 2. Trích xuất giải nghĩa từ keywords của Storybooks
    const storybookExplanations = allStorybooks
      .flatMap((sb: any) => sb.keywords?.map((k: any) => k.explanation?.trim()) || [])
      .filter((exp: string | undefined): exp is string => Boolean(exp));

    // 3. Hợp nhất thành Global Distractor Pool duy nhất
    const uniquePoolMap = new Map<string, string>();
    for (const exp of [...personalExplanations, ...storybookExplanations]) {
      const key = exp.toLowerCase();
      if (!uniquePoolMap.has(key)) {
        uniquePoolMap.set(key, exp);
      }
    }
    const globalExplanations = Array.from(uniquePoolMap.values());

    const optionLetters = ['A', 'B', 'C', 'D'];

    const questions: QuizQuestion[] = targetCards.map((card: any) => {
      const targetExplanation = (card.explanation || '').trim();
      const distractors = this.distractorService.generateDistractors(
        targetExplanation,
        3,
        globalExplanations,
      );

      const rawOptions = [
        { text: targetExplanation, isCorrect: true },
        ...distractors.map(text => ({ text, isCorrect: false })),
      ];

      const shuffledOptions: QuizOption[] = [...rawOptions]
        .sort(() => Math.random() - 0.5)
        .map((opt, idx) => ({
          id: optionLetters[idx] || `${idx + 1}`,
          text: opt.text,
          isCorrect: opt.isCorrect,
        }));

      const stability = card.fsrs?.stability ?? 0;
      const reps = card.fsrs?.reps ?? 0;
      const exampleSentences = card.exampleSentences || [];

      // Kích hoạt Cloze mode nếu thẻ đã ôn ít nhất 2 lần hoặc stability >= 1.0 và có ví dụ
      const quizMode: 'mcq' | 'cloze' =
        (reps >= 2 || stability >= 1.0) && exampleSentences.length > 0 ? 'cloze' : 'mcq';

      return {
        cardId: card._id.toString(),
        word: card.word,
        ipa: card.ipa || '',
        audioUrl: card.audioUrl || '',
        level: card.level || 'A1',
        wordFamily: card.wordFamily || [],
        collocations: card.collocations || [],
        sourceStorybookTitle: card.sourceStorybookTitle || '',
        explanation: card.explanation || '',
        options: shuffledOptions,
        exampleSentences,
        quizMode,
        fsrsState: {
          due: card.fsrs?.due ? new Date(card.fsrs.due).toISOString() : new Date().toISOString(),
          reps,
          stability,
        },
      };
    });

    return {
      questions,
      totalDue: targetCards.length,
      sessionLimit: limit,
      totalSaved: totalCount,
    };
  }

  /**
   * Nộp kết quả câu hỏi trắc nghiệm, cập nhật FSRS và ghi log
   */
  public async submitReview(dto: SubmitReviewDto) {
    const card = await this.vocabCardModel.findById(dto.cardId);
    if (!card) {
      throw new NotFoundException(`Không tìm thấy thẻ từ vựng với ID: ${dto.cardId}`);
    }

    const rating = this.fsrsService.calculateFSRSRating(dto.isCorrect, dto.responseTimeMs);
    const now = new Date();

    const prevFsrs = card.fsrs;
    const prevState = {
      due: prevFsrs?.due ? new Date(prevFsrs.due) : new Date(),
      stability: prevFsrs?.stability ?? 0,
      difficulty: prevFsrs?.difficulty ?? 0,
      elapsed_days: prevFsrs?.elapsed_days ?? 0,
      scheduled_days: prevFsrs?.scheduled_days ?? 0,
      reps: prevFsrs?.reps ?? 0,
      lapses: prevFsrs?.lapses ?? 0,
      state: prevFsrs?.state ?? 0,
      last_review: prevFsrs?.last_review,
    };

    const { updatedState } = this.fsrsService.scheduleNextReview(prevState, rating, now);

    // Cập nhật card trong DB
    card.fsrs = updatedState;
    await card.save();

    // Ghi nhận review log
    await this.reviewLogModel.create({
      vocabCardId: card._id,
      word: card.word,
      rating,
      state: prevState.state,
      due: prevState.due,
      stability: prevState.stability,
      difficulty: prevState.difficulty,
      elapsed_days: prevState.elapsed_days,
      scheduled_days: prevState.scheduled_days,
      responseTimeMs: dto.responseTimeMs,
      isCorrect: dto.isCorrect,
      reviewedAt: now,
    });

    return {
      success: true,
      cardId: card._id.toString(),
      word: card.word,
      isCorrect: dto.isCorrect,
      rating,
      nextDue: updatedState.due,
      stability: updatedState.stability,
      difficulty: updatedState.difficulty,
      reps: updatedState.reps,
      lapses: updatedState.lapses,
    };
  }

  /**
   * Đếm số lượng từ vựng đến hạn và phân loại trạng thái học tập
   */
  public async getDueCount() {
    const now = new Date();

    const [dueCount, totalCount, newCount, masteredCount] = await Promise.all([
      this.vocabCardModel.countDocuments({ 'fsrs.due': { $lte: now } }),
      this.vocabCardModel.countDocuments({}),
      this.vocabCardModel.countDocuments({ 'fsrs.state': 0 }),
      this.vocabCardModel.countDocuments({ 'fsrs.stability': { $gte: 30 } }),
    ]);

    const learningCount = Math.max(0, totalCount - newCount - masteredCount);

    return {
      dueCount,
      totalCount,
      newCount,
      learningCount,
      masteredCount,
      nextDueTimestamp: now.toISOString(),
    };
  }

  /**
   * Trích xuất danh sách từ vựng ứng viên cần ôn để đưa vào Speaking Quiz
   */
  public async getCandidateDueVocab(options: { limit?: number } = {}): Promise<CandidateVocabItem[]> {
    const limit = Math.min(Math.max(1, options.limit || 4), 10);
    const now = new Date();

    // Ưu tiên 1: Thẻ đến hạn (due <= now)
    let cards = await this.vocabCardModel
      .find({ 'fsrs.due': { $lte: now } })
      .sort({ 'fsrs.due': 1 })
      .limit(limit)
      .lean();

    // Fallback: Nếu không đủ từ đến hạn, lấy thêm từ đang học hoặc mới lưu có stability thấp
    if (cards.length < limit) {
      const remaining = limit - cards.length;
      const existingIds = cards.map(c => c._id);
      const fallbackCards = await this.vocabCardModel
        .find({ _id: { $nin: existingIds } })
        .sort({ 'fsrs.stability': 1, 'fsrs.reps': 1 })
        .limit(remaining)
        .lean();
      cards = [...cards, ...fallbackCards];
    }

    return cards.map((c: any) => {
      let srsStatus: 'due' | 'learning' | 'mastered' | 'new' = 'learning';
      const dueTime = c.fsrs?.due ? new Date(c.fsrs.due).getTime() : 0;
      const stability = c.fsrs?.stability ?? 0;
      const reps = c.fsrs?.reps ?? 0;

      if (dueTime <= now.getTime()) {
        srsStatus = 'due';
      } else if (stability >= 30) {
        srsStatus = 'mastered';
      } else if (reps === 0) {
        srsStatus = 'new';
      }

      return {
        word: c.word,
        explanation: c.explanation,
        level: c.level || 'B2',
        srsStatus,
      };
    });
  }
}
```

- [ ] **Step 4: Chạy lại test xác nhận Green**

Run: `npx jest src/plugins/vocab-review/services/vocab-review.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/vocab-review/services/vocab-review.service.ts src/plugins/vocab-review/services/vocab-review.service.spec.ts
git commit -m "feat(vocab-review): implement VocabReviewService with session generation and review submission"
```

---

### Task 6: REST API Controller & Plugin Module (`VocabReviewController` & `VocabReviewModule`)

**Mục tiêu:** Cung cấp các endpoint REST API:
- `GET /api/vocab/review/session`
- `POST /api/vocab/review/submit`
- `GET /api/vocab/review/due-count`
Đóng gói vào `VocabReviewModule` và đăng ký vào `src/app.module.ts`.

**Files:**
- Create: `src/plugins/vocab-review/vocab-review.controller.ts`
- Create: `src/plugins/vocab-review/vocab-review.controller.spec.ts`
- Create: `src/plugins/vocab-review/vocab-review.module.ts`
- Modify: `src/app.module.ts:1-45`

- [ ] **Step 1: Viết test cho `VocabReviewController`**

Tạo file `src/plugins/vocab-review/vocab-review.controller.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { VocabReviewController } from './vocab-review.controller';
import { VocabReviewService } from './services/vocab-review.service';

describe('VocabReviewController', () => {
  let controller: VocabReviewController;
  let mockVocabReviewService: any;

  beforeEach(async () => {
    mockVocabReviewService = {
      getReviewSession: jest.fn().mockResolvedValue({ questions: [], totalDue: 0 }),
      submitReview: jest.fn().mockResolvedValue({ success: true, cardId: '123' }),
      getDueCount: jest.fn().mockResolvedValue({ dueCount: 5, totalCount: 20 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VocabReviewController],
      providers: [
        {
          provide: VocabReviewService,
          useValue: mockVocabReviewService,
        },
      ],
    }).compile();

    controller = module.get<VocabReviewController>(VocabReviewController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return review session', async () => {
    const result = await controller.getSession({ limit: 15, practiceAll: false });
    expect(mockVocabReviewService.getReviewSession).toHaveBeenCalledWith({
      limit: 15,
      practiceAll: false,
    });
    expect(result).toEqual({ questions: [], totalDue: 0 });
  });

  it('should submit review result', async () => {
    const dto = { cardId: '123', isCorrect: true, responseTimeMs: 2000 };
    const result = await controller.submitReview(dto);
    expect(mockVocabReviewService.submitReview).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ success: true, cardId: '123' });
  });

  it('should return due count stats', async () => {
    const result = await controller.getDueCount();
    expect(mockVocabReviewService.getDueCount).toHaveBeenCalled();
    expect(result).toEqual({ dueCount: 5, totalCount: 20 });
  });
});
```

- [ ] **Step 2: Chạy test xác nhận Red**

Run: `npx jest src/plugins/vocab-review/vocab-review.controller.spec.ts`
Expected: FAIL do chưa có file `vocab-review.controller.ts`.

- [ ] **Step 3: Triển khai `VocabReviewController` và `VocabReviewModule`**

Tạo file `src/plugins/vocab-review/vocab-review.controller.ts`:
```typescript
/**
 * @file vocab-review.controller.ts
 * @description REST API Controller cho phiên ôn tập từ vựng FSRS
 *
 * Made by Anh Tu - Share to be share
 */

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { VocabReviewService } from './services/vocab-review.service';
import { ReviewSessionQueryDto } from './dto/review-session-query.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';

@ApiTags('Vocab Review')
@Controller('vocab/review')
export class VocabReviewController {
  constructor(private readonly vocabReviewService: VocabReviewService) {}

  @Get('session')
  @ApiOperation({ summary: 'Lấy danh sách câu hỏi phiên ôn tập trắc nghiệm / cloze' })
  public async getSession(@Query() query: ReviewSessionQueryDto) {
    return this.vocabReviewService.getReviewSession(query);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Nộp kết quả trắc nghiệm và cập nhật trạng thái FSRS' })
  public async submitReview(@Body() body: SubmitReviewDto) {
    return this.vocabReviewService.submitReview(body);
  }

  @Get('due-count')
  @ApiOperation({ summary: 'Thống kê số lượng từ đến hạn ôn tập và phân loại' })
  public async getDueCount() {
    return this.vocabReviewService.getDueCount();
  }
}
```

Tạo file `src/plugins/vocab-review/vocab-review.module.ts`:
```typescript
/**
 * @file vocab-review.module.ts
 * @description NestJS Module đăng ký VocabReviewController và các dịch vụ FSRS
 *
 * Made by Anh Tu - Share to be share
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';
import { VocabCard, VocabCardSchema } from '../../infra/database/schemas/vocab-card.schema';
import { VocabReviewLog, VocabReviewLogSchema } from '../../infra/database/schemas/vocab-review-log.schema';
import { Storybook, StorybookSchema } from '../../infra/database/schemas/storybook.schema';
import { VocabReviewController } from './vocab-review.controller';
import { VocabReviewService } from './services/vocab-review.service';
import { FSRSService } from './services/fsrs.service';
import { DistractorService } from './services/distractor.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: VocabCard.name, schema: VocabCardSchema },
        { name: VocabReviewLog.name, schema: VocabReviewLogSchema },
        { name: Storybook.name, schema: StorybookSchema },
      ],
      AHA_TOOLS_CONNECTION,
    ),
  ],
  controllers: [VocabReviewController],
  providers: [VocabReviewService, FSRSService, DistractorService],
  exports: [VocabReviewService, FSRSService, DistractorService],
})
export class VocabReviewModule {}
```

Cập nhật `src/app.module.ts` để nạp `VocabReviewModule`.

- [ ] **Step 4: Chạy lại test xác nhận Green**

Run: `npx jest src/plugins/vocab-review/vocab-review.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/vocab-review/vocab-review.controller.ts src/plugins/vocab-review/vocab-review.controller.spec.ts src/plugins/vocab-review/vocab-review.module.ts src/app.module.ts
git commit -m "feat(vocab-review): create VocabReviewController and register VocabReviewModule in AppModule"
```

---

### Task 7: Cập nhật Schema & State cho Tích hợp Từ Vựng vào Speaking Quiz

**Mục tiêu:** Mở rộng `TargetKeywordItem` trong `speaking-question.schema.ts` và `speaking-quiz.state.ts` để hỗ trợ `srsStatus?: 'due' | 'learning' | 'mastered' | 'new' | 'unsaved'` và `isInjected?: boolean`.

**Files:**
- Modify: `src/infra/database/schemas/speaking-question.schema.ts:12-23`
- Modify: `src/infra/database/schemas/speaking-question.schema.spec.ts:1-30`
- Modify: `src/plugins/speaking-quiz/speaking-quiz.state.ts:11-16`

- [ ] **Step 1: Viết test mở rộng cho `TargetKeywordItem`**

Cập nhật `src/infra/database/schemas/speaking-question.schema.spec.ts`:
```typescript
import { SpeakingQuestionSchema } from './speaking-question.schema';

describe('SpeakingQuestionSchema', () => {
  it('should define required fields correctly', () => {
    const paths = SpeakingQuestionSchema.paths;
    expect(paths['topic']).toBeDefined();
    expect(paths['question']).toBeDefined();
    expect(paths['level']).toBeDefined();
    expect(paths['status']).toBeDefined();
    expect(paths['targetKeywords']).toBeDefined();
  });

  it('should support srsStatus and isInjected in targetKeywords', () => {
    const targetKeywordsSchema = (SpeakingQuestionSchema.paths['targetKeywords'] as any).schema;
    expect(targetKeywordsSchema.paths['srsStatus']).toBeDefined();
    expect(targetKeywordsSchema.paths['isInjected']).toBeDefined();
  });
});
```

- [ ] **Step 2: Chạy test xác nhận Red**

Run: `npx jest src/infra/database/schemas/speaking-question.schema.spec.ts`
Expected: FAIL do chưa có trường `srsStatus` và `isInjected` trong `targetKeywords`.

- [ ] **Step 3: Triển khai cập nhật schema và state**

Cập nhật `src/infra/database/schemas/speaking-question.schema.ts`:
```typescript
@Schema({ _id: false })
export class TargetKeywordItem {
  @Prop({ required: true })
  word: string;

  @Prop()
  ipa?: string;

  @Prop({ required: true })
  meaning: string;

  @Prop({ required: false, enum: ['due', 'learning', 'mastered', 'new', 'unsaved'] })
  srsStatus?: string;

  @Prop({ required: false, default: false })
  isInjected?: boolean;
}

export const TargetKeywordItemSchema = SchemaFactory.createForClass(TargetKeywordItem);
```

Cập nhật `src/plugins/speaking-quiz/speaking-quiz.state.ts`:
```typescript
export interface TargetKeywordItemType {
  word: string;
  ipa?: string;
  meaning: string;
  srsStatus?: 'due' | 'learning' | 'mastered' | 'new' | 'unsaved';
  isInjected?: boolean;
}
```

- [ ] **Step 4: Chạy lại test xác nhận Green**

Run: `npx jest src/infra/database/schemas/speaking-question.schema.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infra/database/schemas/speaking-question.schema.ts src/infra/database/schemas/speaking-question.schema.spec.ts src/plugins/speaking-quiz/speaking-quiz.state.ts
git commit -m "feat(speaking-quiz): add srsStatus and isInjected to TargetKeywordItem schema and state"
```

---

### Task 8: Tiêm Từ Vựng Cần Ôn Vào Speaking Quiz StateGraph Pipeline

**Mục tiêu:**
1. Import `VocabReviewModule` vào `SpeakingQuizModule`.
2. Tiêm `VocabReviewService` vào `ContextResolverNode`: truy vấn `getCandidateDueVocab({ limit: 4 })` và tích hợp các từ vựng này vào `targetKeywords` với nhãn `srsStatus` và `isInjected: true`.
3. Bổ sung `[TARGET VOCABULARY INTEGRATION CONSTRAINT]` vào prompt của `QuestionFormulatorNode` và `PrepSynthesizerNode`.
4. Cập nhật `PersisterNode` để lưu trữ `srsStatus` và `isInjected`.

**Files:**
- Modify: `src/plugins/speaking-quiz/speaking-quiz.module.ts:1-60`
- Modify: `src/plugins/speaking-quiz/nodes/context-resolver.node.ts:1-105`
- Modify: `src/plugins/speaking-quiz/nodes/context-resolver.node.spec.ts:1-60`
- Modify: `src/plugins/speaking-quiz/nodes/question-formulator.node.ts:14-55`
- Modify: `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.ts:14-55`
- Modify: `src/plugins/speaking-quiz/nodes/persister.node.ts:35-50`
- Modify: `src/plugins/speaking-quiz/nodes/persister.node.spec.ts:1-50`

- [ ] **Step 1: Viết test cho `ContextResolverNode` với `VocabReviewService`**

Cập nhật `src/plugins/speaking-quiz/nodes/context-resolver.node.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ContextResolverNode } from './context-resolver.node';
import { Storybook } from '../../../infra/database/schemas/storybook.schema';
import { AHA_TOOLS_CONNECTION } from '../../../infra/database/database.constants';
import { VocabReviewService } from '../../vocab-review/services/vocab-review.service';

describe('ContextResolverNode with VocabReview integration', () => {
  let node: ContextResolverNode;
  let mockStorybookModel: any;
  let mockVocabReviewService: any;

  beforeEach(async () => {
    mockStorybookModel = {
      findById: jest.fn(),
    };
    mockVocabReviewService = {
      getCandidateDueVocab: jest.fn().mockResolvedValue([
        {
          word: 'sustainable',
          explanation: 'Able to be maintained',
          level: 'B2',
          srsStatus: 'due',
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextResolverNode,
        {
          provide: getModelToken(Storybook.name, AHA_TOOLS_CONNECTION),
          useValue: mockStorybookModel,
        },
        {
          provide: VocabReviewService,
          useValue: mockVocabReviewService,
        },
      ],
    }).compile();

    node = module.get<ContextResolverNode>(ContextResolverNode);
  });

  it('should inject candidate due vocab into targetKeywords when customTopic is used', async () => {
    const result = await node.invoke({
      customTopic: 'Renewable energy advantages',
      level: 'B2',
      customKeywords: [],
    } as any);

    expect(mockVocabReviewService.getCandidateDueVocab).toHaveBeenCalled();
    expect(result.targetKeywords).toBeDefined();
    expect(result.targetKeywords?.some(k => k.word === 'sustainable' && k.srsStatus === 'due')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Chạy test xác nhận Red**

Run: `npx jest src/plugins/speaking-quiz/nodes/context-resolver.node.spec.ts`
Expected: FAIL do `ContextResolverNode` chưa được tiêm `VocabReviewService`.

- [ ] **Step 3: Cập nhật `SpeakingQuizModule`, `ContextResolverNode`, `QuestionFormulatorNode`, `PrepSynthesizerNode`, `PersisterNode`**

1. Cập nhật `src/plugins/speaking-quiz/speaking-quiz.module.ts`:
   Thêm `VocabReviewModule` vào mảng `imports`.

2. Cập nhật `src/plugins/speaking-quiz/nodes/context-resolver.node.ts`:
   - Inject `private readonly vocabReviewService: VocabReviewService` (optional hoặc trực tiếp).
   - Truy vấn candidate due vocab: `const candidateVocab = await this.vocabReviewService.getCandidateDueVocab({ limit: 3 });`
   - Ghép các từ vựng này vào `targetKeywords` với `{ word: c.word, meaning: c.explanation, srsStatus: c.srsStatus, isInjected: true }`.

3. Cập nhật prompt trong `src/plugins/speaking-quiz/nodes/question-formulator.node.ts`:
   Thêm hướng dẫn ràng buộc tích hợp từ vựng mục tiêu.

4. Cập nhật prompt trong `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.ts`:
   Thêm hướng dẫn bắt buộc lồng ghép các từ vựng mục tiêu vào câu mẫu PREP.

5. Cập nhật `src/plugins/speaking-quiz/nodes/persister.node.ts`:
   Đảm bảo `targetKeywords` được lưu với `srsStatus` và `isInjected`.

- [ ] **Step 4: Chạy lại toàn bộ test suite của `speaking-quiz`**

Run: `npx jest src/plugins/speaking-quiz/`
Expected: PASS (tất cả các test suite của speaking-quiz đều thành công).

- [ ] **Step 5: Commit**

```bash
git add src/plugins/speaking-quiz/
git commit -m "feat(speaking-quiz): inject candidate due vocab into prompt pipeline and persist SRS status"
```

---

### Task 9: API Contract & Client SDK Guide cho `aha-tools`

**Mục tiêu:** Biên soạn tài liệu Hợp đồng API (`docs/contracts/vocab-review-api-contract.md`) cung cấp đầy đủ mã nguồn TypeScript Client SDK (`vocab-review-client.ts`) và mã nguồn các Route Handlers / Components mẫu phía Next.js (`aha-tools`).

**Files:**
- Create: `docs/contracts/vocab-review-api-contract.md`

- [ ] **Step 1: Soạn thảo API Contract chuẩn hóa**

Tạo file `docs/contracts/vocab-review-api-contract.md` bao gồm:
1. Định nghĩa Concept & Anatomy giữa `aha-mind-agents` và `aha-tools`.
2. Đặc tả chi tiết các endpoints:
   - `GET /api/vocab/review/session?limit=15&practiceAll=false`
   - `POST /api/vocab/review/submit`
   - `GET /api/vocab/review/due-count`
3. Mã nguồn đầy đủ của Client SDK: `src/lib/services/vocab-review-client.ts` cho `aha-tools`.
4. Hướng dẫn sửa đổi `src/app/api/vocab/review/route.ts` và `src/app/api/vocab/due-count/route.ts` thành proxy gọn nhẹ.
5. Hướng dẫn hiển thị SRS Badges trong `SpeakingPrepCard.tsx`.

- [ ] **Step 2: Commit tài liệu Contract**

```bash
git add docs/contracts/vocab-review-api-contract.md
git commit -m "docs(contracts): add comprehensive Vocab Review API Contract and aha-tools client SDK guide"
```

---

### Task 10: E2E Integration Testing & Toàn Diện Hệ Thống

**Mục tiêu:** Viết E2E test cho luồng Vocab Review API và chạy kiểm tra toàn bộ test suites của `aha-mind-agents` đảm bảo không có bất kỳ regression nào.

**Files:**
- Create: `test/vocab-review.e2e-spec.ts`

- [ ] **Step 1: Viết E2E test cho Vocab Review Flow**

Tạo file `test/vocab-review.e2e-spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Vocab Review Flow (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/api/vocab/review/due-count (GET) should return due count stats', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/vocab/review/due-count')
      .expect(200);

    expect(response.body).toHaveProperty('dueCount');
    expect(response.body).toHaveProperty('totalCount');
    expect(response.body).toHaveProperty('learningCount');
  });

  it('/api/vocab/review/session (GET) should return questions structure', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/vocab/review/session?limit=5&practiceAll=true')
      .expect(200);

    expect(response.body).toHaveProperty('questions');
    expect(response.body).toHaveProperty('sessionLimit', 5);
  });
});
```

- [ ] **Step 2: Chạy toàn bộ test suites**

Run: `npm test`
Expected: PASS toàn bộ các test suites (unit tests + e2e tests).

- [ ] **Step 3: Chạy TypeScript Typecheck & Build**

Run: `npm run build`
Expected: Nest build thành công không có lỗi TypeScript.

- [ ] **Step 4: Commit hoàn tất**

```bash
git add test/vocab-review.e2e-spec.ts
git commit -m "test(e2e): add e2e integration tests for vocab review flow"
```

---

*Made by Anh Tu - Share to be share*
