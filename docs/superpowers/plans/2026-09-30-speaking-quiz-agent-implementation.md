# Speaking Quiz Generation Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng module tác nhân `SpeakingQuizModule` (`MOD-AGENT-SPEAKING-QUIZ`) trong `aha-mind-agents`, tự động phân tích ngữ cảnh Storybook hoặc Custom Topic để tạo đề bài nói theo cấu trúc PREP (Point, Reason, Example, Conclusion), thực thi bất đồng bộ qua BullMQ Worker và phát tiến độ thời gian thực qua Server-Sent Events (SSE).

**Architecture:** Kiến trúc đa tầng Decoupled Agent Pipeline sử dụng NestJS 11 + LangGraph v0.2 StateGraph + BullMQ v5 Job Queue + Redis Pub/Sub + MongoDB Mongoose v11. Request kích hoạt job trả về `HTTP 202 Accepted` ngay lập tức; Background Worker điều phối StateGraph qua 4 nodes (`ContextResolver` -> `QuestionFormulator` -> `PrepSynthesizer` -> `Persister`), cập nhật tiến độ (25% -> 50% -> 80% -> 100%) vào SSE stream và lưu trữ trực tiếp vào collection `speaking_questions` trên `AHA_TOOLS_CONNECTION`.

**Tech Stack:** NestJS 11, TypeScript 5.9, LangChain / LangGraph v0.2, Google GenAI (Gemini 2.5 Flash via `GeminiService`), BullMQ v5 / `@nestjs/bullmq`, Redis (ioredis), MongoDB (Mongoose v11), Zod v3.24, RxJS v7.

---

## Bản Đồ Files Thay Đổi & Tạo Mới (File Allocation Map)

```text
aha-mind-agents/
├── src/
│   ├── app.module.ts                                         # Cập nhật: Nạp QueueModule & SpeakingQuizModule
│   ├── infra/
│   │   ├── database/
│   │   │   ├── database.module.ts                            # Cập nhật: Đăng ký SpeakingQuestionSchema
│   │   │   └── schemas/
│   │   │       ├── speaking-question.schema.ts               # Tạo mới: Mongoose schema cho speaking_questions
│   │   │       └── speaking-question.schema.spec.ts          # Tạo mới: Test kiểm tra schema definition
│   │   └── queue/
│   │       ├── queue.module.ts                               # Tạo mới: BullModule.forRootAsync với Redis
│   │       └── queue.module.spec.ts                          # Tạo mới: Test cấu hình QueueModule
│   └── plugins/
│       └── speaking-quiz/
│           ├── dto/
│           │   └── create-speaking-quiz-job.dto.ts           # Tạo mới: DTO kích hoạt job sinh câu hỏi
│           ├── nodes/
│           │   ├── context-resolver.node.ts                  # Tạo mới: Node 1 phân giải ngữ cảnh
│           │   ├── context-resolver.node.spec.ts             # Tạo mới: Unit test Node 1
│           │   ├── question-formulator.node.ts               # Tạo mới: Node 2 sinh câu hỏi tranh luận
│           │   ├── question-formulator.node.spec.ts          # Tạo mới: Unit test Node 2
│           │   ├── prep-synthesizer.node.ts                  # Tạo mới: Node 3 tổng hợp giàn giáo PREP
│           │   ├── prep-synthesizer.node.spec.ts             # Tạo mới: Unit test Node 3
│           │   ├── persister.node.ts                         # Tạo mới: Node 4 kiểm duyệt và ghi MongoDB
│           │   └── persister.node.spec.ts                    # Tạo mới: Unit test Node 4
│           ├── pipelines/
│           │   ├── speaking-quiz.pipeline.ts                 # Tạo mới: StateGraph pipeline service
│           │   └── speaking-quiz.pipeline.spec.ts            # Tạo mới: Unit test pipeline execution
│           ├── speaking-quiz.controller.ts                   # Tạo mới: Controller REST & SSE endpoints
│           ├── speaking-quiz.controller.spec.ts              # Tạo mới: Unit test controller
│           ├── speaking-quiz.module.ts                       # Tạo mới: Plugin module định tuyến
│           ├── speaking-quiz.plugin.ts                       # Tạo mới: Implement AgentPlugin interface
│           ├── speaking-quiz.plugin.spec.ts                  # Tạo mới: Test AgentPlugin contract
│           ├── speaking-quiz.schema.ts                       # Tạo mới: Zod schemas cho input/output
│           ├── speaking-quiz.schema.spec.ts                  # Tạo mới: Unit test Zod schemas
│           ├── speaking-quiz.service.ts                      # Tạo mới: Service điều phối job & queue
│           ├── speaking-quiz.service.spec.ts                 # Tạo mới: Unit test service
│           ├── speaking-quiz.state.ts                        # Tạo mới: LangGraph Annotation.Root
│           ├── speaking-quiz.worker.ts                       # Tạo mới: BullMQ Worker processor
│           └── speaking-quiz.worker.spec.ts                  # Tạo mới: Unit test worker processor
└── test/
    └── speaking-quiz.e2e-spec.ts                             # Tạo mới: E2E test cho speaking-quiz flow
```

---

## Chi Tiết Các Tác Vụ Thực Thi (Task Breakdown)

### Task 1: Hạ Tầng Dữ Liệu - Mongoose Schema `SpeakingQuestion`

**Mục tiêu:** Định nghĩa Mongoose schema cho collection `speaking_questions` theo đúng thiết kế trong Mục 3 của Spec và đăng ký vào connection `AHA_TOOLS_CONNECTION` trong `DatabaseModule`.

**Files:**
- Create: `src/infra/database/schemas/speaking-question.schema.ts`
- Create: `src/infra/database/schemas/speaking-question.schema.spec.ts`
- Modify: `src/infra/database/database.module.ts:50-55`

- [ ] **Step 1: Viết test cho `SpeakingQuestionSchema`**

Tạo file `src/infra/database/schemas/speaking-question.schema.spec.ts`:
```typescript
import { SpeakingQuestionSchema, SpeakingQuestion } from './speaking-question.schema';

describe('SpeakingQuestionSchema', () => {
  it('should define required fields correctly', () => {
    const paths = SpeakingQuestionSchema.paths;
    expect(paths['topic']).toBeDefined();
    expect(paths['topic'].isRequired).toBeTruthy();
    expect(paths['question']).toBeDefined();
    expect(paths['question'].isRequired).toBeTruthy();
    expect(paths['level']).toBeDefined();
    expect(paths['status']).toBeDefined();
    expect(paths['prepScaffold.point']).toBeDefined();
    expect(paths['prepScaffold.reason']).toBeDefined();
    expect(paths['prepScaffold.example']).toBeDefined();
    expect(paths['prepScaffold.conclusion']).toBeDefined();
  });

  it('should have compound indexes defined', () => {
    const indexes = SpeakingQuestionSchema.indexes();
    const hasStorybookIndex = indexes.some(
      ([idx]) => idx.storybookId === 1 && idx.status === 1,
    );
    const hasLevelIndex = indexes.some(
      ([idx]) => idx.level === 1 && idx.status === 1,
    );
    expect(hasStorybookIndex).toBeTruthy();
    expect(hasLevelIndex).toBeTruthy();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `npx jest src/infra/database/schemas/speaking-question.schema.spec.ts`
Expected: FAIL với lỗi "Cannot find module './speaking-question.schema'".

- [ ] **Step 3: Triển khai schema `SpeakingQuestion`**

Tạo file `src/infra/database/schemas/speaking-question.schema.ts`:
```typescript
/**
 * @file speaking-question.schema.ts
 * @description Mongoose Schema cho collection `speaking_questions` trong aha-mind-agents
 *
 * Made by Anh Tu - Share to be share
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class TargetKeywordItem {
  @Prop({ required: true })
  word: string;

  @Prop()
  ipa?: string;

  @Prop({ required: true })
  meaning: string;
}

export const TargetKeywordItemSchema = SchemaFactory.createForClass(TargetKeywordItem);

@Schema({ _id: false })
export class SpeakingScaffoldStageItem {
  @Prop({ required: true, enum: ['point', 'reason', 'example', 'conclusion'] })
  stage: string;

  @Prop({ required: true })
  title: string;

  @Prop({ type: [String], required: true })
  signposts: string[];

  @Prop({ required: true })
  hint: string;

  @Prop({ required: true })
  modelAnswer: string;
}

export const SpeakingScaffoldStageItemSchema = SchemaFactory.createForClass(SpeakingScaffoldStageItem);

@Schema({ _id: false })
export class SpeakingPrepScaffold {
  @Prop({ type: SpeakingScaffoldStageItemSchema, required: true })
  point: SpeakingScaffoldStageItem;

  @Prop({ type: SpeakingScaffoldStageItemSchema, required: true })
  reason: SpeakingScaffoldStageItem;

  @Prop({ type: SpeakingScaffoldStageItemSchema, required: true })
  example: SpeakingScaffoldStageItem;

  @Prop({ type: SpeakingScaffoldStageItemSchema, required: true })
  conclusion: SpeakingScaffoldStageItem;
}

export const SpeakingPrepScaffoldSchema = SchemaFactory.createForClass(SpeakingPrepScaffold);

@Schema({ timestamps: true, collection: 'speaking_questions' })
export class SpeakingQuestion extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Storybook', required: false, index: true })
  storybookId?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, index: true })
  topic: string;

  @Prop({ required: true })
  question: string;

  @Prop({ required: true, enum: ['B1', 'B2', 'C1'], default: 'B2', index: true })
  level: string;

  @Prop({ type: [TargetKeywordItemSchema], default: [] })
  targetKeywords: TargetKeywordItem[];

  @Prop({ type: SpeakingPrepScaffoldSchema, required: true })
  prepScaffold: SpeakingPrepScaffold;

  @Prop({ required: true, enum: ['active', 'archived'], default: 'active', index: true })
  status: string;

  @Prop({ required: false })
  generatedByModel?: string;
}

export const SpeakingQuestionSchema = SchemaFactory.createForClass(SpeakingQuestion);

SpeakingQuestionSchema.index({ storybookId: 1, status: 1 });
SpeakingQuestionSchema.index({ level: 1, status: 1 });
```

- [ ] **Step 4: Đăng ký `SpeakingQuestion` vào `DatabaseModule`**

Chỉnh sửa file `src/infra/database/database.module.ts`:
Thêm import:
```typescript
import { SpeakingQuestion, SpeakingQuestionSchema } from './schemas/speaking-question.schema';
```
Thêm vào mảng `MongooseModule.forFeature` của `AHA_TOOLS_CONNECTION`:
```typescript
    // 3. Đăng ký các Models vào đúng Connection
    MongooseModule.forFeature(
      [
        { name: Storybook.name, schema: StorybookSchema },
        { name: SpeakingQuestion.name, schema: SpeakingQuestionSchema },
      ],
      AHA_TOOLS_CONNECTION,
    ),
```

- [ ] **Step 5: Chạy lại test để xác nhận test vượt qua**

Run: `npx jest src/infra/database/schemas/speaking-question.schema.spec.ts`
Expected: PASS (2 tests passed).

- [ ] **Step 6: Commit thay đổi**

```bash
git add src/infra/database/schemas/speaking-question.schema.ts src/infra/database/schemas/speaking-question.schema.spec.ts src/infra/database/database.module.ts
git commit -m "feat(database): define and register SpeakingQuestion schema"
```

---

### Task 2: Định Nghĩa Zod Schemas & LangGraph State Definition

**Mục tiêu:** Định nghĩa toàn bộ Zod validation schemas (Input validation, LLM Structured Output validation, Document output validation) và LangGraph State (`SpeakingQuizState`) với các reducer phù hợp.

**Files:**
- Create: `src/plugins/speaking-quiz/speaking-quiz.schema.ts`
- Create: `src/plugins/speaking-quiz/speaking-quiz.schema.spec.ts`
- Create: `src/plugins/speaking-quiz/speaking-quiz.state.ts`

- [ ] **Step 1: Viết test cho Zod Schemas**

Tạo file `src/plugins/speaking-quiz/speaking-quiz.schema.spec.ts`:
```typescript
import {
  StorybookSpeakingInputSchema,
  CustomTopicSpeakingInputSchema,
  QuestionFormulatorOutputSchema,
  PrepSynthesizerOutputSchema,
} from './speaking-quiz.schema';

describe('SpeakingQuizSchemas', () => {
  it('should validate storybook input successfully', () => {
    const input = { storybookId: '679c1a2b3c4d5e6f7a8b9c0d', level: 'B2' };
    const parsed = StorybookSpeakingInputSchema.parse(input);
    expect(parsed.storybookId).toBe('679c1a2b3c4d5e6f7a8b9c0d');
    expect(parsed.level).toBe('B2');
  });

  it('should validate custom topic input successfully', () => {
    const input = { customTopic: 'AI and Future Jobs', level: 'C1' };
    const parsed = CustomTopicSpeakingInputSchema.parse(input);
    expect(parsed.customTopic).toBe('AI and Future Jobs');
    expect(parsed.level).toBe('C1');
  });

  it('should validate question formulator output schema', () => {
    const mockOutput = {
      topic: 'Technology in Education',
      question: 'Should traditional textbooks be completely replaced by AI?',
    };
    const parsed = QuestionFormulatorOutputSchema.parse(mockOutput);
    expect(parsed.topic).toBe('Technology in Education');
    expect(parsed.question).toContain('traditional textbooks');
  });

  it('should validate PREP synthesizer output schema with all 4 stages', () => {
    const mockPrep = {
      point: {
        title: 'Point',
        signposts: ['In my view', 'I strongly believe'],
        hint: 'State your core viewpoint clearly',
        modelAnswer: 'In my view, AI should assist teachers rather than replace them.',
      },
      reason: {
        title: 'Reason',
        signposts: ['The main reason is', 'Because'],
        hint: 'Explain why you hold this perspective',
        modelAnswer: 'The main reason is that human empathy cannot be replicated.',
      },
      example: {
        title: 'Example',
        signposts: ['For instance', 'Take an example of'],
        hint: 'Provide a concrete demonstration',
        modelAnswer: 'For instance, when a student experiences emotional distress, a mentor helps.',
      },
      conclusion: {
        title: 'Conclusion',
        signposts: ['In conclusion', 'To sum up'],
        hint: 'Restate and reinforce your point',
        modelAnswer: 'To sum up, harmonious collaboration between humans and AI is essential.',
      },
    };
    const parsed = PrepSynthesizerOutputSchema.parse(mockPrep);
    expect(parsed.point.signposts.length).toBeGreaterThanOrEqual(2);
    expect(parsed.conclusion.title).toBe('Conclusion');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `npx jest src/plugins/speaking-quiz/speaking-quiz.schema.spec.ts`
Expected: FAIL với lỗi "Cannot find module './speaking-quiz.schema'".

- [ ] **Step 3: Triển khai Zod Schemas**

Tạo file `src/plugins/speaking-quiz/speaking-quiz.schema.ts`:
```typescript
/**
 * @file speaking-quiz.schema.ts
 * @description Zod Schemas cho module Speaking Quiz (Validation & Structured Outputs)
 *
 * Made by Anh Tu - Share to be share
 */

import { z } from 'zod';

export const CefrLevelSchema = z.enum(['B1', 'B2', 'C1']);

export const StorybookSpeakingInputSchema = z.object({
  storybookId: z.string().min(1, 'storybookId không được để trống'),
  level: CefrLevelSchema.default('B2'),
  forceRegenerate: z.boolean().optional().default(false),
});

export const CustomTopicSpeakingInputSchema = z.object({
  customTopic: z.string().min(3, 'customTopic phải có ít nhất 3 ký tự'),
  level: CefrLevelSchema.default('B2'),
  targetKeywords: z.array(z.string()).optional(),
  forceRegenerate: z.boolean().optional().default(false),
});

export const SpeakingQuizJobPayloadSchema = z.object({
  storybookId: z.string().optional(),
  customTopic: z.string().optional(),
  level: CefrLevelSchema.default('B2'),
  targetKeywords: z.array(z.string()).optional(),
  forceRegenerate: z.boolean().optional().default(false),
}).refine(data => data.storybookId || data.customTopic, {
  message: 'Bắt buộc phải cung cấp storybookId hoặc customTopic',
});

export const QuestionFormulatorOutputSchema = z.object({
  topic: z.string().min(2, 'Topic không được để trống'),
  question: z.string().min(10, 'Câu hỏi tranh luận phải rõ ràng và chi tiết'),
});

const StageScaffoldSchema = z.object({
  title: z.string().min(1),
  signposts: z.array(z.string().min(1)).min(2, 'Cần tối thiểu 2 cụm từ nối (signposts)'),
  hint: z.string().min(5, 'Gợi ý giàn giáo phải cụ thể'),
  modelAnswer: z.string().min(10, 'Câu mẫu phải có nội dung hoàn chỉnh'),
});

export const PrepSynthesizerOutputSchema = z.object({
  point: StageScaffoldSchema,
  reason: StageScaffoldSchema,
  example: StageScaffoldSchema,
  conclusion: StageScaffoldSchema,
});

export type StorybookSpeakingInput = z.infer<typeof StorybookSpeakingInputSchema>;
export type CustomTopicSpeakingInput = z.infer<typeof CustomTopicSpeakingInputSchema>;
export type SpeakingQuizJobPayload = z.infer<typeof SpeakingQuizJobPayloadSchema>;
export type QuestionFormulatorOutput = z.infer<typeof QuestionFormulatorOutputSchema>;
export type PrepSynthesizerOutput = z.infer<typeof PrepSynthesizerOutputSchema>;
```

- [ ] **Step 4: Triển khai LangGraph State Annotation**

Tạo file `src/plugins/speaking-quiz/speaking-quiz.state.ts`:
```typescript
/**
 * @file speaking-quiz.state.ts
 * @description LangGraph State Annotation cho Speaking Quiz Agent Pipeline
 *
 * Made by Anh Tu - Share to be share
 */

import { Annotation } from '@langchain/langgraph';
import { PrepSynthesizerOutput } from './speaking-quiz.schema';

export interface TargetKeywordItemType {
  word: string;
  ipa?: string;
  meaning: string;
}

export const SpeakingQuizState = Annotation.Root({
  // Input parameters
  storybookId: Annotation<string | undefined>(),
  customTopic: Annotation<string | undefined>(),
  requestedLevel: Annotation<'B1' | 'B2' | 'C1'>(),
  customKeywords: Annotation<string[] | undefined>({
    reducer: (_, y) => y,
  }),

  // Agent Runtime Config
  config: Annotation<any>(),

  // Resolved context (Node 1)
  resolvedTopic: Annotation<string>(),
  sourceContentSummary: Annotation<string>(),
  targetKeywords: Annotation<TargetKeywordItemType[]>({
    reducer: (_, y) => y,
    default: () => [],
  }),
  level: Annotation<'B1' | 'B2' | 'C1'>({
    default: () => 'B2',
  }),

  // LLM Outputs (Node 2 & Node 3)
  generatedQuestion: Annotation<string | undefined>(),
  prepScaffold: Annotation<PrepSynthesizerOutput | undefined>({
    reducer: (_, y) => y,
  }),

  // Execution result & tokens (Node 4)
  persistedId: Annotation<string | undefined>(),
  error: Annotation<string | null>({
    default: () => null,
  }),
  tokenUsage: Annotation<{ promptTokens: number; completionTokens: number; totalTokens: number }>({
    reducer: (prev, curr) => ({
      promptTokens: (prev?.promptTokens || 0) + (curr?.promptTokens || 0),
      completionTokens: (prev?.completionTokens || 0) + (curr?.completionTokens || 0),
      totalTokens: (prev?.totalTokens || 0) + (curr?.totalTokens || 0),
    }),
    default: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
  }),
});

export type SpeakingQuizStateType = typeof SpeakingQuizState.State;
```

- [ ] **Step 5: Chạy lại test để xác nhận test vượt qua**

Run: `npx jest src/plugins/speaking-quiz/speaking-quiz.schema.spec.ts`
Expected: PASS (4 tests passed).

- [ ] **Step 6: Commit thay đổi**

```bash
git add src/plugins/speaking-quiz/speaking-quiz.schema.ts src/plugins/speaking-quiz/speaking-quiz.schema.spec.ts src/plugins/speaking-quiz/speaking-quiz.state.ts
git commit -m "feat(speaking-quiz): define Zod schemas and LangGraph state"
```

---

### Task 3: LangGraph Node 1 - `ContextResolverNode`

**Mục tiêu:** Xây dựng Node 1 thực hiện truy vấn nội dung bài học `Storybook` từ MongoDB (hoặc chuẩn hóa Custom Topic), trích xuất tóm tắt và lọc 2–3 từ vựng mục tiêu (kèm fallback heuristic nếu Storybook thiếu từ vựng).

**Files:**
- Create: `src/plugins/speaking-quiz/nodes/context-resolver.node.ts`
- Create: `src/plugins/speaking-quiz/nodes/context-resolver.node.spec.ts`

- [ ] **Step 1: Viết test cho `ContextResolverNode`**

Tạo file `src/plugins/speaking-quiz/nodes/context-resolver.node.spec.ts`:
```typescript
import { ContextResolverNode } from './context-resolver.node';
import { Model } from 'mongoose';
import { Storybook } from '../../../infra/database/schemas/storybook.schema';

describe('ContextResolverNode', () => {
  let node: ContextResolverNode;
  let mockStorybookModel: Partial<Model<Storybook>>;

  beforeEach(() => {
    mockStorybookModel = {
      findById: jest.fn(),
    };
    node = new ContextResolverNode(mockStorybookModel as Model<Storybook>);
  });

  it('should resolve storybook context with sentences and keywords', async () => {
    const mockDoc = {
      _id: '679c1a2b3c4d5e6f7a8b9c0d',
      title: 'The Future of Renewable Energy',
      sentences: [
        { id: 1, text: 'Renewable energy is becoming increasingly vital.' },
        { id: 2, text: 'Solar panels harness sunlight efficiently.' },
      ],
      keywords: [
        { word: 'renewable', ipa: '/rɪˈnjuː.ə.bəl/', explanation: 'able to be renewed' },
        { word: 'harness', ipa: '/ˈhɑː.nəs/', explanation: 'control and make use of' },
      ],
      level: 'medium',
    };
    (mockStorybookModel.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockDoc),
    });

    const result = await node.invoke({
      storybookId: '679c1a2b3c4d5e6f7a8b9c0d',
      requestedLevel: 'B2',
    } as any);

    expect(result.resolvedTopic).toBe('The Future of Renewable Energy');
    expect(result.sourceContentSummary).toContain('Renewable energy');
    expect(result.targetKeywords?.length).toBe(2);
    expect(result.level).toBe('B2');
    expect(result.error).toBeUndefined();
  });

  it('should return error when storybook is not found', async () => {
    (mockStorybookModel.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const result = await node.invoke({
      storybookId: 'non-existing-id',
      requestedLevel: 'B2',
    } as any);

    expect(result.error).toContain('Storybook không tồn tại');
  });

  it('should resolve custom topic directly when no storybookId provided', async () => {
    const result = await node.invoke({
      customTopic: 'Work from Home Pros and Cons',
      requestedLevel: 'C1',
      customKeywords: ['productivity', 'isolation'],
    } as any);

    expect(result.resolvedTopic).toBe('Work from Home Pros and Cons');
    expect(result.level).toBe('C1');
    expect(result.targetKeywords?.length).toBe(2);
    expect(result.targetKeywords?.[0].word).toBe('productivity');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `npx jest src/plugins/speaking-quiz/nodes/context-resolver.node.spec.ts`
Expected: FAIL với lỗi "Cannot find module './context-resolver.node'".

- [ ] **Step 3: Triển khai `ContextResolverNode`**

Tạo file `src/plugins/speaking-quiz/nodes/context-resolver.node.ts`:
```typescript
/**
 * @file context-resolver.node.ts
 * @description Node 1 trong StateGraph: Phân giải ngữ cảnh từ Storybook hoặc Custom Topic
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AHA_TOOLS_CONNECTION } from '../../../infra/database/database.constants';
import { Storybook } from '../../../infra/database/schemas/storybook.schema';
import { SpeakingQuizStateType, TargetKeywordItemType } from '../speaking-quiz.state';

@Injectable()
export class ContextResolverNode {
  private readonly logger = new Logger(ContextResolverNode.name);

  constructor(
    @InjectModel(Storybook.name, AHA_TOOLS_CONNECTION)
    private readonly storybookModel: Model<Storybook>,
  ) {}

  public async invoke(state: SpeakingQuizStateType): Promise<Partial<SpeakingQuizStateType>> {
    if (state.error) return {};

    const level = state.requestedLevel || 'B2';

    // 1. Phân giải ngữ cảnh từ Storybook
    if (state.storybookId) {
      this.logger.log(`Đang truy vấn bài học Storybook: ${state.storybookId}`);
      try {
        const storybook = await this.storybookModel.findById(state.storybookId).lean();
        if (!storybook) {
          return { error: `Storybook không tồn tại với ID: ${state.storybookId}` };
        }

        const resolvedTopic = storybook.title || 'Chủ đề bài học';
        const sentenceTexts = (storybook.sentences || []).map((s: any) => s.text).filter(Boolean);
        const sourceContentSummary = sentenceTexts.length > 0
          ? sentenceTexts.slice(0, 10).join(' ')
          : storybook.originalText || resolvedTopic;

        // Trích xuất 2-3 target keywords từ danh sách keywords của Storybook
        let targetKeywords: TargetKeywordItemType[] = [];
        if (storybook.keywords && storybook.keywords.length > 0) {
          targetKeywords = storybook.keywords.slice(0, 3).map((k: any) => ({
            word: k.word,
            ipa: k.ipa || undefined,
            meaning: k.explanation || k.word,
          }));
        }

        // Fallback Heuristic: Nếu không có đủ keywords, trích các từ có độ dài >= 7 ký tự từ sentences
        if (targetKeywords.length < 2 && sentenceTexts.length > 0) {
          const words = sourceContentSummary
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length >= 7);
          const uniqueWords = Array.from(new Set(words.map(w => w.toLowerCase()))).slice(0, 3);
          for (const w of uniqueWords) {
            if (!targetKeywords.some(tk => tk.word.toLowerCase() === w)) {
              targetKeywords.push({
                word: w,
                meaning: `Key terminology in context: ${w}`,
              });
            }
          }
        }

        this.logger.log(`✅ Phân giải Storybook thành công: "${resolvedTopic}" với ${targetKeywords.length} từ vựng mục tiêu.`);

        return {
          resolvedTopic,
          sourceContentSummary,
          targetKeywords,
          level,
        };
      } catch (err: any) {
        this.logger.error(`Lỗi truy vấn Storybook: ${err.message}`);
        return { error: `Không thể đọc dữ liệu Storybook: ${err.message}` };
      }
    }

    // 2. Phân giải ngữ cảnh từ Custom Topic
    if (state.customTopic) {
      const resolvedTopic = state.customTopic.trim();
      const sourceContentSummary = `Debate topic on: ${resolvedTopic}`;
      const targetKeywords: TargetKeywordItemType[] = (state.customKeywords || []).map(w => ({
        word: w.trim(),
        meaning: `Core concept: ${w.trim()}`,
      }));

      this.logger.log(`✅ Phân giải Custom Topic thành công: "${resolvedTopic}"`);

      return {
        resolvedTopic,
        sourceContentSummary,
        targetKeywords,
        level,
      };
    }

    return { error: 'Thiếu thông tin đầu vào (cần storybookId hoặc customTopic)' };
  }
}
```

- [ ] **Step 4: Chạy lại test để xác nhận test vượt qua**

Run: `npx jest src/plugins/speaking-quiz/nodes/context-resolver.node.spec.ts`
Expected: PASS (3 tests passed).

- [ ] **Step 5: Commit thay đổi**

```bash
git add src/plugins/speaking-quiz/nodes/context-resolver.node.ts src/plugins/speaking-quiz/nodes/context-resolver.node.spec.ts
git commit -m "feat(speaking-quiz): implement ContextResolverNode"
```

---

### Task 4: LangGraph Node 2 - `QuestionFormulatorNode`

**Mục tiêu:** Xây dựng Node 2 gọi LLM Gemini tạo câu hỏi tranh luận có chiều sâu sư phạm (Thought-provoking opinion/debate prompt) thay vì câu hỏi đọc hiểu dữ kiện máy móc, tuân thủ cấp độ CEFR.

**Files:**
- Create: `src/plugins/speaking-quiz/nodes/question-formulator.node.ts`
- Create: `src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts`

- [ ] **Step 1: Viết test cho `QuestionFormulatorNode`**

Tạo file `src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts`:
```typescript
import { QuestionFormulatorNode } from './question-formulator.node';
import { GeminiService } from '../../../core/gemini/gemini.service';

describe('QuestionFormulatorNode', () => {
  let node: QuestionFormulatorNode;
  let mockGeminiService: Partial<GeminiService>;

  beforeEach(() => {
    mockGeminiService = {
      invokeStructured: jest.fn(),
    };
    node = new QuestionFormulatorNode(mockGeminiService as GeminiService);
  });

  it('should formulate debate question matching topic and level', async () => {
    const mockStructuredResult = {
      parsed: {
        topic: 'AI in Education',
        question: 'Should artificial intelligence replace traditional teachers in evaluating student essays?',
      },
      usage: { promptTokens: 120, completionTokens: 45, totalTokens: 165 },
    };
    (mockGeminiService.invokeStructured as jest.Mock).mockResolvedValue(mockStructuredResult);

    const result = await node.invoke({
      resolvedTopic: 'AI in Education',
      sourceContentSummary: 'Discussion regarding automated grading software in schools.',
      level: 'B2',
      targetKeywords: [{ word: 'evaluate', meaning: 'assess' }],
    } as any);

    expect(result.generatedQuestion).toBe(
      'Should artificial intelligence replace traditional teachers in evaluating student essays?',
    );
    expect(result.tokenUsage?.totalTokens).toBe(165);
    expect(result.error).toBeUndefined();
  });

  it('should return error when LLM invocation fails', async () => {
    (mockGeminiService.invokeStructured as jest.Mock).mockRejectedValue(
      new Error('Gemini API Rate Limit Exceeded'),
    );

    const result = await node.invoke({
      resolvedTopic: 'AI in Education',
      sourceContentSummary: 'Content summary',
      level: 'B2',
    } as any);

    expect(result.error).toContain('Không thể tạo câu hỏi tranh luận');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `npx jest src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts`
Expected: FAIL với lỗi "Cannot find module './question-formulator.node'".

- [ ] **Step 3: Triển khai `QuestionFormulatorNode`**

Tạo file `src/plugins/speaking-quiz/nodes/question-formulator.node.ts`:
```typescript
/**
 * @file question-formulator.node.ts
 * @description Node 2 trong StateGraph: Tạo câu hỏi tranh luận (Thought-provoking prompt)
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../../core/gemini/gemini.service';
import { QuestionFormulatorOutputSchema } from '../speaking-quiz.schema';
import { SpeakingQuizStateType } from '../speaking-quiz.state';

const SYSTEM_PROMPT = `You are an expert English language educator and debate coach.
Your task is to craft a thought-provoking, open-ended debate question based on the provided topic, context, and target vocabulary.

Pedagogical Rules:
1. STRICTLY FORBIDDEN: Do NOT create fact-retrieval questions (e.g., "What happened in the story?" or "Who did X?").
2. The question MUST stimulate personal opinion, ethical dilemmas, or societal perspectives with at least two viable opposing sides.
3. Tailor vocabulary and grammatical structure strictly to CEFR level {LEVEL}:
   - B1: Clear, straightforward moral or daily life choices.
   - B2: Contemporary societal issues, balancing advantages vs disadvantages.
   - C1: Complex ethical, philosophical, or systemic trade-offs.
4. Output must strictly conform to the required JSON schema.`;

@Injectable()
export class QuestionFormulatorNode {
  private readonly logger = new Logger(QuestionFormulatorNode.name);

  constructor(private readonly gemini: GeminiService) {}

  public async invoke(state: SpeakingQuizStateType): Promise<Partial<SpeakingQuizStateType>> {
    if (state.error || !state.resolvedTopic) return {};

    this.logger.log(`Đang sinh câu hỏi tranh luận cho chủ đề: "${state.resolvedTopic}" [Level: ${state.level}]`);

    const promptTemplate = SYSTEM_PROMPT.replace('{LEVEL}', state.level || 'B2');
    const keywordList = (state.targetKeywords || []).map(k => k.word).join(', ');

    const userPrompt = `Topic: ${state.resolvedTopic}
Context Summary: ${state.sourceContentSummary || 'No extra summary.'}
Target Keywords to stimulate: ${keywordList || 'None specified'}
Target CEFR Level: ${state.level}

Generate a compelling debate question that invites the learner to take a stand.`;

    try {
      const response = await this.gemini.invokeStructured(
        QuestionFormulatorOutputSchema,
        [
          { role: 'system', content: promptTemplate },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.3, name: 'question_formulator' },
      );

      this.logger.log(`✅ Câu hỏi đã sinh: "${response.parsed.question}"`);

      return {
        generatedQuestion: response.parsed.question,
        tokenUsage: response.usage,
      };
    } catch (err: any) {
      this.logger.error(`❌ Lỗi sinh câu hỏi: ${err.message}`);
      return { error: `Không thể tạo câu hỏi tranh luận: ${err.message}` };
    }
  }
}
```

- [ ] **Step 4: Chạy lại test để xác nhận test vượt qua**

Run: `npx jest src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts`
Expected: PASS (2 tests passed).

- [ ] **Step 5: Commit thay đổi**

```bash
git add src/plugins/speaking-quiz/nodes/question-formulator.node.ts src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts
git commit -m "feat(speaking-quiz): implement QuestionFormulatorNode"
```

---

### Task 5: LangGraph Node 3 - `PrepSynthesizerNode`

**Mục tiêu:** Xây dựng Node 3 tổng hợp 4 chặng giàn giáo PREP (Point, Reason, Example, Conclusion) kèm từ nối (signposts), gợi ý (hint), và câu mẫu (model answer) bắt buộc lồng ghép các từ vựng mục tiêu, có cơ chế tự sửa lỗi (Self-Correction Retry Loop).

**Files:**
- Create: `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.ts`
- Create: `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts`

- [ ] **Step 1: Viết test cho `PrepSynthesizerNode`**

Tạo file `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts`:
```typescript
import { PrepSynthesizerNode } from './prep-synthesizer.node';
import { GeminiService } from '../../../core/gemini/gemini.service';

describe('PrepSynthesizerNode', () => {
  let node: PrepSynthesizerNode;
  let mockGeminiService: Partial<GeminiService>;

  beforeEach(() => {
    mockGeminiService = {
      invokeStructured: jest.fn(),
    };
    node = new PrepSynthesizerNode(mockGeminiService as GeminiService);
  });

  it('should synthesize PREP scaffold containing all 4 stages', async () => {
    const mockPrepOutput = {
      parsed: {
        point: {
          title: 'Point',
          signposts: ['From my perspective', 'I strongly believe that'],
          hint: 'Express your stance directly and concisely.',
          modelAnswer: 'From my perspective, remote work increases productivity when managed well.',
        },
        reason: {
          title: 'Reason',
          signposts: ['This is primarily because', 'The core justification is'],
          hint: 'Explain the underlying reason using the keyword.',
          modelAnswer: 'This is primarily because employees avoid commute fatigue.',
        },
        example: {
          title: 'Example',
          signposts: ['For instance', 'A notable example is'],
          hint: 'Give an illustrative real-world scenario.',
          modelAnswer: 'For instance, many tech companies saw output jump during hybrid setups.',
        },
        conclusion: {
          title: 'Conclusion',
          signposts: ['In summary', 'Ultimately'],
          hint: 'Reiterate your opening point with conviction.',
          modelAnswer: 'In summary, flexibility is indispensable for modern organizations.',
        },
      },
      usage: { promptTokens: 300, completionTokens: 180, totalTokens: 480 },
    };
    (mockGeminiService.invokeStructured as jest.Mock).mockResolvedValue(mockPrepOutput);

    const result = await node.invoke({
      resolvedTopic: 'Remote Work',
      generatedQuestion: 'Does remote work boost productivity?',
      level: 'B2',
      targetKeywords: [{ word: 'productivity', meaning: 'efficiency' }],
    } as any);

    expect(result.prepScaffold).toBeDefined();
    expect(result.prepScaffold?.point.signposts).toHaveLength(2);
    expect(result.prepScaffold?.conclusion.title).toBe('Conclusion');
    expect(result.tokenUsage?.totalTokens).toBe(480);
    expect(result.error).toBeUndefined();
  });

  it('should retry when initial synthesis returns invalid schema', async () => {
    (mockGeminiService.invokeStructured as jest.Mock)
      .mockRejectedValueOnce(new Error('Validation error: missing conclusion'))
      .mockResolvedValueOnce({
        parsed: {
          point: { title: 'Point', signposts: ['P1', 'P2'], hint: 'H1', modelAnswer: 'M1' },
          reason: { title: 'Reason', signposts: ['R1', 'R2'], hint: 'H2', modelAnswer: 'M2' },
          example: { title: 'Example', signposts: ['E1', 'E2'], hint: 'H3', modelAnswer: 'M3' },
          conclusion: { title: 'Conclusion', signposts: ['C1', 'C2'], hint: 'H4', modelAnswer: 'M4' },
        },
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      });

    const result = await node.invoke({
      resolvedTopic: 'Remote Work',
      generatedQuestion: 'Does remote work boost productivity?',
      level: 'B2',
      targetKeywords: [],
    } as any);

    expect(result.prepScaffold?.conclusion.title).toBe('Conclusion');
    expect(mockGeminiService.invokeStructured).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `npx jest src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts`
Expected: FAIL với lỗi "Cannot find module './prep-synthesizer.node'".

- [ ] **Step 3: Triển khai `PrepSynthesizerNode`**

Tạo file `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.ts`:
```typescript
/**
 * @file prep-synthesizer.node.ts
 * @description Node 3 trong StateGraph: Tổng hợp giàn giáo PREP (Point, Reason, Example, Conclusion)
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../../core/gemini/gemini.service';
import { PrepSynthesizerOutputSchema } from '../speaking-quiz.schema';
import { SpeakingQuizStateType } from '../speaking-quiz.state';

const SYSTEM_PROMPT = `You are a master speech coach and English pedagogue.
Your objective is to build a complete 4-stage PREP scaffolding structure (Point, Reason, Example, Conclusion) for the learner to construct their spoken speech.

Each of the 4 stages must strictly contain:
1. "title": "Point", "Reason", "Example", or "Conclusion".
2. "signposts": A list of at least 2 natural discourse markers / transition phrases suitable for CEFR level {LEVEL}.
3. "hint": A practical instruction guiding what the student should say in Vietnamese or accessible English.
4. "modelAnswer": A natural, high-scoring sample sentence conforming to CEFR level {LEVEL}.

CRITICAL INTEGRATION RULE:
Incorporate at least 2 of the target vocabulary items naturally into the model answers across the 4 stages.`;

@Injectable()
export class PrepSynthesizerNode {
  private readonly logger = new Logger(PrepSynthesizerNode.name);

  constructor(private readonly gemini: GeminiService) {}

  public async invoke(state: SpeakingQuizStateType): Promise<Partial<SpeakingQuizStateType>> {
    if (state.error || !state.generatedQuestion) return {};

    this.logger.log(`Đang tổng hợp giàn giáo PREP cho câu hỏi: "${state.generatedQuestion}"`);

    const promptTemplate = SYSTEM_PROMPT.replace(/{LEVEL}/g, state.level || 'B2');
    const keywordStr = (state.targetKeywords || [])
      .map(k => `"${k.word}" (${k.meaning})`)
      .join(', ');

    const userPrompt = `Topic: ${state.resolvedTopic}
Debate Question: ${state.generatedQuestion}
Target Keywords to Integrate: ${keywordStr || 'General high-frequency debate terms'}
CEFR Level: ${state.level}

Construct the full PREP scaffolding with all 4 stages: point, reason, example, conclusion.`;

    const maxRetries = 2;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      try {
        const response = await this.gemini.invokeStructured(
          PrepSynthesizerOutputSchema,
          [
            { role: 'system', content: promptTemplate },
            { role: 'user', content: attempt === 0 ? userPrompt : `${userPrompt}\n\nNote: Ensure all 4 stages are complete and valid.` },
          ],
          { temperature: 0.2, name: 'prep_synthesizer' },
        );

        this.logger.log(`✅ Giàn giáo PREP hoàn thành sau ${attempt + 1} lần thực thi.`);
        return {
          prepScaffold: response.parsed,
          tokenUsage: response.usage,
        };
      } catch (err: any) {
        attempt++;
        lastError = err;
        this.logger.warn(`⚠️ Lỗi sinh PREP (lần ${attempt}/${maxRetries + 1}): ${err.message}`);
      }
    }

    return { error: `Không thể tổng hợp giàn giáo PREP sau ${maxRetries + 1} lần thử: ${lastError?.message}` };
  }
}
```

- [ ] **Step 4: Chạy lại test để xác nhận test vượt qua**

Run: `npx jest src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts`
Expected: PASS (2 tests passed).

- [ ] **Step 5: Commit thay đổi**

```bash
git add src/plugins/speaking-quiz/nodes/prep-synthesizer.node.ts src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts
git commit -m "feat(speaking-quiz): implement PrepSynthesizerNode"
```

---

### Task 6: LangGraph Node 4 - `PersisterNode`

**Mục tiêu:** Xây dựng Node 4 thẩm định dữ liệu hoàn chỉnh và lưu vào collection `speaking_questions` trong MongoDB thông qua connection `AHA_TOOLS_CONNECTION`.

**Files:**
- Create: `src/plugins/speaking-quiz/nodes/persister.node.ts`
- Create: `src/plugins/speaking-quiz/nodes/persister.node.spec.ts`

- [ ] **Step 1: Viết test cho `PersisterNode`**

Tạo file `src/plugins/speaking-quiz/nodes/persister.node.spec.ts`:
```typescript
import { PersisterNode } from './persister.node';
import { Model } from 'mongoose';
import { SpeakingQuestion } from '../../../infra/database/schemas/speaking-question.schema';

describe('PersisterNode', () => {
  let node: PersisterNode;
  let mockSpeakingQuestionModel: any;

  beforeEach(() => {
    mockSpeakingQuestionModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ _id: '67a8b9c0f123456789abcdef', ...dto }),
    }));
    node = new PersisterNode(mockSpeakingQuestionModel as unknown as Model<SpeakingQuestion>);
  });

  it('should persist valid speaking question into database', async () => {
    const state = {
      storybookId: '679c1a2b3c4d5e6f7a8b9c0d',
      resolvedTopic: 'AI in Education',
      generatedQuestion: 'Should AI grade student essays?',
      level: 'B2',
      targetKeywords: [{ word: 'evaluate', meaning: 'assess' }],
      prepScaffold: {
        point: { title: 'Point', signposts: ['In my view'], hint: 'State point', modelAnswer: 'Ans 1' },
        reason: { title: 'Reason', signposts: ['Because'], hint: 'State reason', modelAnswer: 'Ans 2' },
        example: { title: 'Example', signposts: ['For instance'], hint: 'State example', modelAnswer: 'Ans 3' },
        conclusion: { title: 'Conclusion', signposts: ['In sum'], hint: 'Conclude', modelAnswer: 'Ans 4' },
      },
    };

    const result = await node.invoke(state as any);

    expect(result.persistedId).toBe('67a8b9c0f123456789abcdef');
    expect(result.error).toBeUndefined();
  });

  it('should return error when mandatory state data is missing', async () => {
    const invalidState = {
      resolvedTopic: 'AI in Education',
      // Missing generatedQuestion and prepScaffold
    };

    const result = await node.invoke(invalidState as any);

    expect(result.error).toContain('Dữ liệu không đầy đủ');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `npx jest src/plugins/speaking-quiz/nodes/persister.node.spec.ts`
Expected: FAIL với lỗi "Cannot find module './persister.node'".

- [ ] **Step 3: Triển khai `PersisterNode`**

Tạo file `src/plugins/speaking-quiz/nodes/persister.node.ts`:
```typescript
/**
 * @file persister.node.ts
 * @description Node 4 trong StateGraph: Kiểm tra tính hợp lệ và ghi vào collection speaking_questions
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AHA_TOOLS_CONNECTION } from '../../../infra/database/database.constants';
import { SpeakingQuestion } from '../../../infra/database/schemas/speaking-question.schema';
import { SpeakingQuizStateType } from '../speaking-quiz.state';

@Injectable()
export class PersisterNode {
  private readonly logger = new Logger(PersisterNode.name);

  constructor(
    @InjectModel(SpeakingQuestion.name, AHA_TOOLS_CONNECTION)
    private readonly speakingQuestionModel: Model<SpeakingQuestion>,
  ) {}

  public async invoke(state: SpeakingQuizStateType): Promise<Partial<SpeakingQuizStateType>> {
    if (state.error) return {};

    if (!state.resolvedTopic || !state.generatedQuestion || !state.prepScaffold) {
      return { error: 'Dữ liệu không đầy đủ để lưu trữ (thiếu topic, question hoặc prepScaffold)' };
    }

    this.logger.log(`Đang lưu đề bài Speaking Quiz vào CSDL: "${state.resolvedTopic}"`);

    try {
      const docData: Record<string, any> = {
        topic: state.resolvedTopic,
        question: state.generatedQuestion,
        level: state.level || 'B2',
        targetKeywords: (state.targetKeywords || []).map(k => ({
          word: k.word,
          ipa: k.ipa,
          meaning: k.meaning,
        })),
        prepScaffold: {
          point: { stage: 'point', ...state.prepScaffold.point },
          reason: { stage: 'reason', ...state.prepScaffold.reason },
          example: { stage: 'example', ...state.prepScaffold.example },
          conclusion: { stage: 'conclusion', ...state.prepScaffold.conclusion },
        },
        status: 'active',
        generatedByModel: 'gemini-2.5-flash',
      };

      if (state.storybookId && Types.ObjectId.isValid(state.storybookId)) {
        docData.storybookId = new Types.ObjectId(state.storybookId);
      }

      const doc = new this.speakingQuestionModel(docData);
      const saved = await doc.save();

      this.logger.log(`✅ Đã lưu Speaking Question thành công với ID: ${saved._id}`);

      return {
        persistedId: saved._id.toString(),
      };
    } catch (err: any) {
      this.logger.error(`❌ Lỗi ghi cơ sở dữ liệu: ${err.message}`);
      return { error: `Không thể lưu Speaking Question vào CSDL: ${err.message}` };
    }
  }
}
```

- [ ] **Step 4: Chạy lại test để xác nhận test vượt qua**

Run: `npx jest src/plugins/speaking-quiz/nodes/persister.node.spec.ts`
Expected: PASS (2 tests passed).

- [ ] **Step 5: Commit thay đổi**

```bash
git add src/plugins/speaking-quiz/nodes/persister.node.ts src/plugins/speaking-quiz/nodes/persister.node.spec.ts
git commit -m "feat(speaking-quiz): implement PersisterNode"
```

---

### Task 7: LangGraph Pipeline & `SpeakingQuizPlugin` Implementation

**Mục tiêu:** Biên dịch LangGraph StateGraph từ 4 nodes, triển khai `SpeakingQuizPipelineService` với luồng RxJS Observable stream, và implement `SpeakingQuizPlugin` tuân thủ interface `AgentPlugin` để hiển thị trên Dashboard và Gateway.

**Files:**
- Create: `src/plugins/speaking-quiz/pipelines/speaking-quiz.pipeline.ts`
- Create: `src/plugins/speaking-quiz/pipelines/speaking-quiz.pipeline.spec.ts`
- Create: `src/plugins/speaking-quiz/speaking-quiz.plugin.ts`
- Create: `src/plugins/speaking-quiz/speaking-quiz.plugin.spec.ts`

- [ ] **Step 1: Viết test cho `SpeakingQuizPipelineService`**

Tạo file `src/plugins/speaking-quiz/pipelines/speaking-quiz.pipeline.spec.ts`:
```typescript
import { SpeakingQuizPipelineService } from './speaking-quiz.pipeline';
import { ContextResolverNode } from '../nodes/context-resolver.node';
import { QuestionFormulatorNode } from '../nodes/question-formulator.node';
import { PrepSynthesizerNode } from '../nodes/prep-synthesizer.node';
import { PersisterNode } from '../nodes/persister.node';
import { firstValueFrom, toArray } from 'rxjs';

describe('SpeakingQuizPipelineService', () => {
  let pipelineService: SpeakingQuizPipelineService;
  let mockContextResolver: Partial<ContextResolverNode>;
  let mockQuestionFormulator: Partial<QuestionFormulatorNode>;
  let mockPrepSynthesizer: Partial<PrepSynthesizerNode>;
  let mockPersister: Partial<PersisterNode>;

  beforeEach(() => {
    mockContextResolver = {
      invoke: jest.fn().mockResolvedValue({
        resolvedTopic: 'Topic A',
        sourceContentSummary: 'Summary A',
        targetKeywords: [],
        level: 'B2',
      }),
    };
    mockQuestionFormulator = {
      invoke: jest.fn().mockResolvedValue({
        generatedQuestion: 'Debate Question A?',
      }),
    };
    mockPrepSynthesizer = {
      invoke: jest.fn().mockResolvedValue({
        prepScaffold: {
          point: { title: 'Point', signposts: ['P'], hint: 'H', modelAnswer: 'A' },
          reason: { title: 'Reason', signposts: ['R'], hint: 'H', modelAnswer: 'A' },
          example: { title: 'Example', signposts: ['E'], hint: 'H', modelAnswer: 'A' },
          conclusion: { title: 'Conclusion', signposts: ['C'], hint: 'H', modelAnswer: 'A' },
        },
      }),
    };
    mockPersister = {
      invoke: jest.fn().mockResolvedValue({
        persistedId: '67a8b9c0f123456789abcdef',
      }),
    };

    pipelineService = new SpeakingQuizPipelineService(
      mockContextResolver as ContextResolverNode,
      mockQuestionFormulator as QuestionFormulatorNode,
      mockPrepSynthesizer as PrepSynthesizerNode,
      mockPersister as PersisterNode,
    );
  });

  it('should execute pipeline emitting progress events (25 -> 50 -> 80 -> 100)', async () => {
    const events$ = pipelineService.execute(
      { storybookId: '679c1a2b3c4d5e6f7a8b9c0d', level: 'B2' },
      { jobId: 'job-123', log: jest.fn() },
    );

    const events = await firstValueFrom(events$.pipe(toArray()));
    const progressList = events.map(e => e.progress).filter(Boolean);

    expect(progressList).toContain(25);
    expect(progressList).toContain(50);
    expect(progressList).toContain(80);
    expect(progressList).toContain(100);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `npx jest src/plugins/speaking-quiz/pipelines/speaking-quiz.pipeline.spec.ts`
Expected: FAIL với lỗi "Cannot find module './speaking-quiz.pipeline'".

- [ ] **Step 3: Triển khai `SpeakingQuizPipelineService`**

Tạo file `src/plugins/speaking-quiz/pipelines/speaking-quiz.pipeline.ts`:
```typescript
/**
 * @file speaking-quiz.pipeline.ts
 * @description Pipeline điều phối LangGraph StateGraph cho Speaking Quiz Agent
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { StateGraph, END } from '@langchain/langgraph';
import { Observable } from 'rxjs';
import { ProgressEvent, ExecutionContext } from '../../../core/plugin.interface';
import { SpeakingQuizState, SpeakingQuizStateType } from '../speaking-quiz.state';
import { ContextResolverNode } from '../nodes/context-resolver.node';
import { QuestionFormulatorNode } from '../nodes/question-formulator.node';
import { PrepSynthesizerNode } from '../nodes/prep-synthesizer.node';
import { PersisterNode } from '../nodes/persister.node';

@Injectable()
export class SpeakingQuizPipelineService {
  private readonly logger = new Logger(SpeakingQuizPipelineService.name);

  constructor(
    private readonly contextResolver: ContextResolverNode,
    private readonly questionFormulator: QuestionFormulatorNode,
    private readonly prepSynthesizer: PrepSynthesizerNode,
    private readonly persister: PersisterNode,
  ) {}

  public execute(
    input: { storybookId?: string; customTopic?: string; level?: 'B1' | 'B2' | 'C1'; targetKeywords?: string[] },
    context: ExecutionContext,
  ): Observable<ProgressEvent> {
    return new Observable<ProgressEvent>((subscriber) => {
      subscriber.next({ status: 'init', message: 'Khởi tạo Speaking Quiz Pipeline...' });

      const workflow = new StateGraph(SpeakingQuizState)
        .addNode('contextResolver', (state) => this.contextResolver.invoke(state as SpeakingQuizStateType))
        .addNode('questionFormulator', (state) => this.questionFormulator.invoke(state as SpeakingQuizStateType))
        .addNode('prepSynthesizer', (state) => this.prepSynthesizer.invoke(state as SpeakingQuizStateType))
        .addNode('persister', (state) => this.persister.invoke(state as SpeakingQuizStateType))
        .addEdge('__start__', 'contextResolver')
        .addEdge('contextResolver', 'questionFormulator')
        .addEdge('questionFormulator', 'prepSynthesizer')
        .addEdge('prepSynthesizer', 'persister')
        .addEdge('persister', END);

      const app = workflow.compile();

      const runPipeline = async () => {
        try {
          const finalState: Partial<SpeakingQuizStateType> = {
            storybookId: input.storybookId,
            customTopic: input.customTopic,
            requestedLevel: input.level || 'B2',
            customKeywords: input.targetKeywords,
            config: context.config,
          };

          const stepDetails: Record<string, { progress: number; stage: string; message: string }> = {
            contextResolver: { progress: 25, stage: 'context_resolved', message: 'Context resolved successfully' },
            questionFormulator: { progress: 50, stage: 'question_formulated', message: 'Debate question formulated' },
            prepSynthesizer: { progress: 80, stage: 'prep_synthesized', message: 'PREP scaffold synthesized' },
            persister: { progress: 100, stage: 'completed', message: 'Speaking quiz successfully created and saved' },
          };

          for await (const chunk of await app.stream(finalState)) {
            const nodeKey = Object.keys(chunk)[0];
            if (nodeKey && chunk[nodeKey]) {
              Object.assign(finalState, chunk[nodeKey]);
              if (finalState.error) break;

              const stepInfo = stepDetails[nodeKey] || { progress: 50, stage: nodeKey, message: `Completed ${nodeKey}` };
              subscriber.next({
                jobId: context.jobId,
                stepId: nodeKey,
                stepName: stepInfo.stage,
                status: 'completed',
                progress: stepInfo.progress,
                message: stepInfo.message,
                payload: nodeKey === 'persister' ? { questionId: finalState.persistedId } : undefined,
              });
            }
          }

          if (finalState.error) {
            throw new Error(finalState.error);
          }

          subscriber.next({
            jobId: context.jobId,
            status: 'done',
            progress: 100,
            message: 'Speaking quiz generation completed',
            payload: {
              questionId: finalState.persistedId,
              topic: finalState.resolvedTopic,
              question: finalState.generatedQuestion,
              level: finalState.level,
              tokenUsage: finalState.tokenUsage,
            },
          });
          subscriber.complete();
        } catch (error: any) {
          subscriber.next({
            jobId: context.jobId,
            status: 'failed',
            message: `Pipeline failure: ${error.message}`,
          });
          subscriber.error(error);
        }
      };

      runPipeline();
    });
  }
}
```

- [ ] **Step 4: Viết test cho `SpeakingQuizPlugin`**

Tạo file `src/plugins/speaking-quiz/speaking-quiz.plugin.spec.ts`:
```typescript
import { SpeakingQuizPlugin } from './speaking-quiz.plugin';
import { SpeakingQuizPipelineService } from './pipelines/speaking-quiz.pipeline';

describe('SpeakingQuizPlugin', () => {
  let plugin: SpeakingQuizPlugin;
  let mockPipeline: Partial<SpeakingQuizPipelineService>;

  beforeEach(() => {
    mockPipeline = {
      execute: jest.fn(),
    };
    plugin = new SpeakingQuizPlugin(mockPipeline as SpeakingQuizPipelineService);
  });

  it('should have valid metadata', () => {
    expect(plugin.metadata.id).toBe('speaking-quiz');
    expect(plugin.metadata.displayName).toBe('Speaking Quiz Agent');
    expect(plugin.metadata.pipelines.length).toBeGreaterThan(0);
  });

  it('should validate inputs properly', async () => {
    await expect(plugin.validateInput('generate', { storybookId: 'id123' })).resolves.toBeDefined();
    await expect(plugin.validateInput('generate', {})).rejects.toThrow();
  });

  it('should return pipeline steps', () => {
    const steps = plugin.getSteps('generate');
    expect(steps.length).toBe(4);
    expect(steps[0].id).toBe('contextResolver');
  });
});
```

- [ ] **Step 5: Triển khai `SpeakingQuizPlugin`**

Tạo file `src/plugins/speaking-quiz/speaking-quiz.plugin.ts`:
```typescript
/**
 * @file speaking-quiz.plugin.ts
 * @description AgentPlugin implementation cho Speaking Quiz Agent
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  AgentPlugin,
  AgentPluginMetadata,
  ExecutionContext,
  PipelineStep,
  ProgressEvent,
} from '../../core/plugin.interface';
import { SpeakingQuizPipelineService } from './pipelines/speaking-quiz.pipeline';
import { SpeakingQuizJobPayloadSchema } from './speaking-quiz.schema';

@Injectable()
export class SpeakingQuizPlugin implements AgentPlugin {
  public metadata: AgentPluginMetadata = {
    id: 'speaking-quiz',
    displayName: 'Speaking Quiz Agent',
    description: 'Tự động tạo câu hỏi phản biện và giàn giáo luyện nói PREP (Point, Reason, Example, Conclusion) từ bài học Storybook hoặc chủ đề tự do.',
    pipelines: [
      {
        id: 'generate',
        displayName: 'Sinh đề bài nói PREP',
        nodes: [
          {
            id: 'contextResolver',
            type: 'tool',
            displayName: 'Phân giải ngữ cảnh Storybook / Custom Topic',
            configurableOptions: [],
          },
          {
            id: 'questionFormulator',
            type: 'llm',
            displayName: 'Tạo câu hỏi tranh luận phản biện',
            configurableOptions: ['systemPrompt', 'model', 'temperature'],
            defaultConfig: {
              temperature: 0.3,
            },
          },
          {
            id: 'prepSynthesizer',
            type: 'llm',
            displayName: 'Tổng hợp giàn giáo PREP & Model Answer',
            configurableOptions: ['systemPrompt', 'model', 'temperature'],
            defaultConfig: {
              temperature: 0.2,
            },
          },
          {
            id: 'persister',
            type: 'tool',
            displayName: 'Kiểm duyệt Zod & Ghi MongoDB',
            configurableOptions: [],
          },
        ],
        edges: [
          { source: 'contextResolver', target: 'questionFormulator' },
          { source: 'questionFormulator', target: 'prepSynthesizer' },
          { source: 'prepSynthesizer', target: 'persister' },
        ],
      },
    ],
  };

  constructor(private readonly pipelineService: SpeakingQuizPipelineService) {}

  public async validateInput(pipeline: string, input: any): Promise<any> {
    if (pipeline === 'generate') {
      return SpeakingQuizJobPayloadSchema.parse(input);
    }
    throw new Error(`Pipeline '${pipeline}' không được hỗ trợ trong plugin ${this.metadata.id}`);
  }

  public getSteps(pipeline: string): PipelineStep[] {
    if (pipeline === 'generate') {
      return [
        { id: 'contextResolver', name: 'Phân giải ngữ cảnh' },
        { id: 'questionFormulator', name: 'Sinh câu hỏi tranh luận' },
        { id: 'prepSynthesizer', name: 'Tổng hợp giàn giáo PREP' },
        { id: 'persister', name: 'Lưu trữ CSDL' },
      ];
    }
    return [];
  }

  public execute(
    pipeline: string,
    input: any,
    context: ExecutionContext,
  ): Observable<ProgressEvent> {
    if (pipeline === 'generate') {
      return this.pipelineService.execute(input, context);
    }
    throw new Error(`Pipeline '${pipeline}' không tồn tại trong plugin ${this.metadata.id}`);
  }
}
```

- [ ] **Step 6: Chạy lại test xác nhận test vượt qua**

Run: `npx jest src/plugins/speaking-quiz/pipelines/speaking-quiz.pipeline.spec.ts src/plugins/speaking-quiz/speaking-quiz.plugin.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit thay đổi**

```bash
git add src/plugins/speaking-quiz/pipelines/speaking-quiz.pipeline.ts src/plugins/speaking-quiz/pipelines/speaking-quiz.pipeline.spec.ts src/plugins/speaking-quiz/speaking-quiz.plugin.ts src/plugins/speaking-quiz/speaking-quiz.plugin.spec.ts
git commit -m "feat(speaking-quiz): implement pipeline service and AgentPlugin"
```

---

### Task 8: Hạ Tầng Hàng Đợi BullMQ & `SpeakingQuizWorker`

**Mục tiêu:** Cấu hình `QueueModule` khởi tạo `BullModule.forRootAsync` với kết nối Redis an toàn, và xây dựng `SpeakingQuizWorker` (`@Processor('speaking-quiz-queue')`) lắng nghe job `generate-speaking-quiz`, cập nhật tiến độ và phát sự kiện Pub/Sub.

**Files:**
- Create: `src/infra/queue/queue.module.ts`
- Create: `src/infra/queue/queue.module.spec.ts`
- Create: `src/plugins/speaking-quiz/speaking-quiz.worker.ts`
- Create: `src/plugins/speaking-quiz/speaking-quiz.worker.spec.ts`

- [ ] **Step 1: Viết test cho `QueueModule`**

Tạo file `src/infra/queue/queue.module.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { QueueModule } from './queue.module';
import { ConfigModule } from '@nestjs/config';

describe('QueueModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        QueueModule,
      ],
    }).compile();
  });

  it('should compile QueueModule successfully', () => {
    expect(module).toBeDefined();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại**

Run: `npx jest src/infra/queue/queue.module.spec.ts`
Expected: FAIL với lỗi "Cannot find module './queue.module'".

- [ ] **Step 3: Triển khai `QueueModule`**

Tạo file `src/infra/queue/queue.module.ts`:
```typescript
/**
 * @file queue.module.ts
 * @description Cấu hình BullMQ Queue Module kết nối Redis
 *
 * Made by Anh Tu - Share to be share
 */

import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUri =
          configService.get<string>('REDIS_URI') ||
          configService.get<string>('REDIS_URL') ||
          'redis://localhost:6379';

        try {
          const parsed = new URL(redisUri);
          return {
            connection: {
              host: parsed.hostname || 'localhost',
              port: parseInt(parsed.port, 10) || 6379,
              username: parsed.username || undefined,
              password: parsed.password || undefined,
              maxRetriesPerRequest: null,
            },
          };
        } catch {
          return {
            connection: {
              host: 'localhost',
              port: 6379,
              maxRetriesPerRequest: null,
            },
          };
        }
      },
      inject: [ConfigService],
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
```

- [ ] **Step 4: Viết test cho `SpeakingQuizWorker`**

Tạo file `src/plugins/speaking-quiz/speaking-quiz.worker.spec.ts`:
```typescript
import { SpeakingQuizWorker } from './speaking-quiz.worker';
import { SpeakingQuizPipelineService } from './pipelines/speaking-quiz.pipeline';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';
import { of } from 'rxjs';

describe('SpeakingQuizWorker', () => {
  let worker: SpeakingQuizWorker;
  let mockPipeline: Partial<SpeakingQuizPipelineService>;
  let mockRedisPubSub: Partial<RedisPubSubService>;

  beforeEach(() => {
    mockPipeline = {
      execute: jest.fn().mockReturnValue(of({
        status: 'done',
        progress: 100,
        message: 'Completed',
        payload: { questionId: 'q123' },
      })),
    };
    mockRedisPubSub = {
      publishEvent: jest.fn().mockResolvedValue(undefined),
    };

    worker = new SpeakingQuizWorker(
      mockPipeline as SpeakingQuizPipelineService,
      mockRedisPubSub as RedisPubSubService,
    );
  });

  it('should process speaking quiz job successfully', async () => {
    const mockJob: any = {
      id: 'job-sq-123',
      data: {
        storybookId: 'sb123',
        level: 'B2',
      },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    const result = await worker.process(mockJob);
    expect(result.questionId).toBe('q123');
    expect(mockRedisPubSub.publishEvent).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Triển khai `SpeakingQuizWorker`**

Tạo file `src/plugins/speaking-quiz/speaking-quiz.worker.ts`:
```typescript
/**
 * @file speaking-quiz.worker.ts
 * @description BullMQ Background Processor thực thi LangGraph StateGraph cho Speaking Quiz
 *
 * Made by Anh Tu - Share to be share
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SpeakingQuizPipelineService } from './pipelines/speaking-quiz.pipeline';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';
import { firstValueFrom, toArray } from 'rxjs';

@Processor('speaking-quiz-queue')
export class SpeakingQuizWorker extends WorkerHost {
  private readonly logger = new Logger(SpeakingQuizWorker.name);

  constructor(
    private readonly pipelineService: SpeakingQuizPipelineService,
    private readonly redisPubSub: RedisPubSubService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const jobId = job.id || `job-sq-${Date.now()}`;
    this.logger.log(`Bắt đầu xử lý Job [${jobId}] trong hàng đợi speaking-quiz-queue...`);

    const context = {
      jobId,
      log: (msg: string, meta?: any) => {
        this.logger.log(`[Job ${jobId}] ${msg} ${meta ? JSON.stringify(meta) : ''}`);
      },
    };

    // Bắn sự kiện khởi chạy
    await this.redisPubSub.publishEvent({
      type: 'JOB_STARTED',
      jobId,
      pluginId: 'speaking-quiz',
      pipeline: 'generate',
      timestamp: Date.now(),
    });

    try {
      const stream$ = this.pipelineService.execute(job.data, context);

      let finalResult: any = null;

      await new Promise<void>((resolve, reject) => {
        stream$.subscribe({
          next: async (event) => {
            if (event.progress !== undefined) {
              await job.updateProgress(event.progress);
            }

            // Broadcast tiến trình qua Redis Pub/Sub cho SSE subscribers
            await this.redisPubSub.publishEvent({
              type: 'JOB_STEP',
              jobId,
              pluginId: 'speaking-quiz',
              timestamp: Date.now(),
              data: event,
            });

            if (event.status === 'done') {
              finalResult = event.payload;
            }
          },
          error: (err) => reject(err),
          complete: () => resolve(),
        });
      });

      await this.redisPubSub.publishEvent({
        type: 'JOB_COMPLETED',
        jobId,
        pluginId: 'speaking-quiz',
        pipeline: 'generate',
        timestamp: Date.now(),
        data: finalResult,
      });

      this.logger.log(`✅ Hoàn thành Job [${jobId}] thành công.`);
      return finalResult;
    } catch (err: any) {
      this.logger.error(`❌ Job [${jobId}] thất bại: ${err.message}`);

      await this.redisPubSub.publishEvent({
        type: 'JOB_FAILED',
        jobId,
        pluginId: 'speaking-quiz',
        pipeline: 'generate',
        timestamp: Date.now(),
        data: { error: err.message },
      });

      throw err;
    }
  }
}
```

- [ ] **Step 6: Chạy lại test xác nhận test vượt qua**

Run: `npx jest src/infra/queue/queue.module.spec.ts src/plugins/speaking-quiz/speaking-quiz.worker.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit thay đổi**

```bash
git add src/infra/queue/queue.module.ts src/infra/queue/queue.module.spec.ts src/plugins/speaking-quiz/speaking-quiz.worker.ts src/plugins/speaking-quiz/speaking-quiz.worker.spec.ts
git commit -m "feat(speaking-quiz): implement QueueModule and SpeakingQuizWorker"
```

---

### Task 9: REST API & Server-Sent Events (SSE) Streaming Endpoints

**Mục tiêu:** Xây dựng `SpeakingQuizService` và `SpeakingQuizController` với các endpoints: `POST /api/agents/speaking-quiz/jobs` (HTTP 202 Accepted), `GET /api/agents/speaking-quiz/jobs/:jobId/progress` (SSE Stream), `GET /api/agents/speaking-quiz/questions/:id` và `GET /api/agents/speaking-quiz/questions?storybookId=...`.

**Files:**
- Create: `src/plugins/speaking-quiz/dto/create-speaking-quiz-job.dto.ts`
- Create: `src/plugins/speaking-quiz/speaking-quiz.service.ts`
- Create: `src/plugins/speaking-quiz/speaking-quiz.service.spec.ts`
- Create: `src/plugins/speaking-quiz/speaking-quiz.controller.ts`
- Create: `src/plugins/speaking-quiz/speaking-quiz.controller.spec.ts`

- [ ] **Step 1: Định nghĩa DTO cho Job Request**

Tạo file `src/plugins/speaking-quiz/dto/create-speaking-quiz-job.dto.ts`:
```typescript
/**
 * @file create-speaking-quiz-job.dto.ts
 * @description DTO kích hoạt Job sinh câu hỏi Speaking Quiz
 *
 * Made by Anh Tu - Share to be share
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsArray, IsBoolean } from 'class-validator';

export class CreateSpeakingQuizJobDto {
  @ApiPropertyOptional({
    description: 'MongoDB ObjectId của Storybook bài học',
    example: '679c1a2b3c4d5e6f7a8b9c0d',
  })
  @IsOptional()
  @IsString()
  storybookId?: string;

  @ApiPropertyOptional({
    description: 'Chủ đề tự do nếu không dùng Storybook',
    example: 'Remote Work vs Office Work',
  })
  @IsOptional()
  @IsString()
  customTopic?: string;

  @ApiPropertyOptional({
    description: 'Cấp độ ngôn ngữ theo chuẩn CEFR',
    enum: ['B1', 'B2', 'C1'],
    default: 'B2',
  })
  @IsOptional()
  @IsEnum(['B1', 'B2', 'C1'])
  level?: 'B1' | 'B2' | 'C1';

  @ApiPropertyOptional({
    description: 'Danh sách từ vựng mục tiêu bổ sung',
    type: [String],
    example: ['productivity', 'isolation'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetKeywords?: string[];

  @ApiPropertyOptional({
    description: 'Gắn cờ bắt buộc sinh mới bỏ qua câu hỏi đã tồn tại trong DB',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceRegenerate?: boolean;
}
```

- [ ] **Step 2: Viết test cho `SpeakingQuizService`**

Tạo file `src/plugins/speaking-quiz/speaking-quiz.service.spec.ts`:
```typescript
import { SpeakingQuizService } from './speaking-quiz.service';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { SpeakingQuestion } from '../../infra/database/schemas/speaking-question.schema';

describe('SpeakingQuizService', () => {
  let service: SpeakingQuizService;
  let mockQueue: Partial<Queue>;
  let mockModel: any;

  beforeEach(() => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-sq-12345' }),
      getJob: jest.fn(),
    };
    mockModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
    };
    service = new SpeakingQuizService(
      mockQueue as Queue,
      mockModel as Model<SpeakingQuestion>,
    );
  });

  it('should enqueue job and return accepted response', async () => {
    (mockModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const result = await service.createJob({
      storybookId: 'sb123',
      level: 'B2',
    });

    expect(result.jobId).toBe('job-sq-12345');
    expect(result.status).toBe('queued');
    expect(result.sseUrl).toContain('job-sq-12345');
  });

  it('should find questions by storybookId', async () => {
    const mockQuestions = [{ _id: 'q1', topic: 'Topic 1' }];
    (mockModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQuestions),
      }),
    });

    const result = await service.getQuestionsByStorybook('sb123');
    expect(result.total).toBe(1);
    expect(result.questions).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Triển khai `SpeakingQuizService`**

Tạo file `src/plugins/speaking-quiz/speaking-quiz.service.ts`:
```typescript
/**
 * @file speaking-quiz.service.ts
 * @description Service xử lý Business Logic và Queue Interaction cho Speaking Quiz
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';
import { SpeakingQuestion } from '../../infra/database/schemas/speaking-question.schema';
import { CreateSpeakingQuizJobDto } from './dto/create-speaking-quiz-job.dto';

@Injectable()
export class SpeakingQuizService {
  private readonly logger = new Logger(SpeakingQuizService.name);

  constructor(
    @InjectQueue('speaking-quiz-queue')
    private readonly queue: Queue,
    @InjectModel(SpeakingQuestion.name, AHA_TOOLS_CONNECTION)
    private readonly questionModel: Model<SpeakingQuestion>,
  ) {}

  public async createJob(dto: CreateSpeakingQuizJobDto) {
    // 1. Kiểm tra Idempotency nếu đã có câu hỏi cho storybookId
    if (dto.storybookId && !dto.forceRegenerate && Types.ObjectId.isValid(dto.storybookId)) {
      const existing = await this.questionModel
        .findOne({ storybookId: new Types.ObjectId(dto.storybookId), status: 'active' })
        .lean();

      if (existing) {
        this.logger.log(`Tái sử dụng câu hỏi có sẵn cho Storybook [${dto.storybookId}]`);
        return {
          jobId: `existing-${existing._id}`,
          status: 'completed',
          existingQuestionId: existing._id,
          createdAt: (existing as any).createdAt || new Date().toISOString(),
        };
      }
    }

    // 2. Đẩy job vào BullMQ Queue
    const job = await this.queue.add(
      'generate-speaking-quiz',
      {
        storybookId: dto.storybookId,
        customTopic: dto.customTopic,
        level: dto.level || 'B2',
        targetKeywords: dto.targetKeywords,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    const jobId = job.id || `job-sq-${Date.now()}`;

    return {
      jobId,
      status: 'queued',
      sseUrl: `/api/agents/speaking-quiz/jobs/${jobId}/progress`,
      createdAt: new Date().toISOString(),
    };
  }

  public async getQuestionById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`ID câu hỏi không hợp lệ: ${id}`);
    }
    const question = await this.questionModel.findById(id).lean();
    if (!question) {
      throw new NotFoundException(`Không tìm thấy câu hỏi với ID: ${id}`);
    }
    return {
      id: (question._id as any).toString(),
      storybookId: question.storybookId ? (question.storybookId as any).toString() : undefined,
      topic: question.topic,
      question: question.question,
      level: question.level,
      targetKeywords: question.targetKeywords,
      prepScaffold: question.prepScaffold,
    };
  }

  public async getQuestionsByStorybook(storybookId: string) {
    if (!Types.ObjectId.isValid(storybookId)) {
      return { total: 0, questions: [] };
    }

    const docs = await this.questionModel
      .find({ storybookId: new Types.ObjectId(storybookId), status: 'active' })
      .sort({ createdAt: -1 })
      .lean();

    return {
      total: docs.length,
      questions: docs.map((doc: any) => ({
        id: doc._id.toString(),
        storybookId: doc.storybookId ? doc.storybookId.toString() : undefined,
        topic: doc.topic,
        question: doc.question,
        level: doc.level,
        targetKeywords: doc.targetKeywords,
        prepScaffold: doc.prepScaffold,
      })),
    };
  }

  public async getJob(jobId: string) {
    return this.queue.getJob(jobId);
  }
}
```

- [ ] **Step 4: Viết test cho `SpeakingQuizController`**

Tạo file `src/plugins/speaking-quiz/speaking-quiz.controller.spec.ts`:
```typescript
import { SpeakingQuizController } from './speaking-quiz.controller';
import { SpeakingQuizService } from './speaking-quiz.service';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';

describe('SpeakingQuizController', () => {
  let controller: SpeakingQuizController;
  let mockService: Partial<SpeakingQuizService>;
  let mockPubSub: Partial<RedisPubSubService>;

  beforeEach(() => {
    mockService = {
      createJob: jest.fn().mockResolvedValue({
        jobId: 'job-sq-123',
        status: 'queued',
        sseUrl: '/api/agents/speaking-quiz/jobs/job-sq-123/progress',
        createdAt: '2026-09-30T16:40:00.000Z',
      }),
      getQuestionById: jest.fn().mockResolvedValue({ id: 'q123', topic: 'T1' }),
      getQuestionsByStorybook: jest.fn().mockResolvedValue({ total: 1, questions: [] }),
    };
    mockPubSub = {
      events$: jest.fn() as any,
    };

    controller = new SpeakingQuizController(
      mockService as SpeakingQuizService,
      mockPubSub as RedisPubSubService,
    );
  });

  it('should return 202 accepted response on job creation', async () => {
    const result = await controller.createJob({
      storybookId: 'sb123',
      level: 'B2',
    });
    expect(result.jobId).toBe('job-sq-123');
    expect(result.status).toBe('queued');
  });

  it('should get question by id', async () => {
    const result = await controller.getQuestionById('q123');
    expect(result.id).toBe('q123');
  });
});
```

- [ ] **Step 5: Triển khai `SpeakingQuizController`**

Tạo file `src/plugins/speaking-quiz/speaking-quiz.controller.ts`:
```typescript
/**
 * @file speaking-quiz.controller.ts
 * @description API Controller cho module Speaking Quiz (Jobs, SSE Streams, Questions)
 *
 * Made by Anh Tu - Share to be share
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { SpeakingQuizService } from './speaking-quiz.service';
import { CreateSpeakingQuizJobDto } from './dto/create-speaking-quiz-job.dto';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';

@ApiTags('Speaking Quiz Agent')
@Controller('agents/speaking-quiz')
export class SpeakingQuizController {
  private readonly logger = new Logger(SpeakingQuizController.name);

  constructor(
    private readonly speakingQuizService: SpeakingQuizService,
    private readonly redisPubSub: RedisPubSubService,
  ) {}

  @Post('jobs')
  @ApiOperation({ summary: 'Kích hoạt Job sinh câu hỏi luyện nói PREP (Bất đồng bộ)' })
  @ApiResponse({ status: 202, description: 'Job đã được tiếp nhận và xếp vào hàng đợi BullMQ' })
  @HttpCode(HttpStatus.ACCEPTED)
  async createJob(@Body() dto: CreateSpeakingQuizJobDto) {
    return this.speakingQuizService.createJob(dto);
  }

  @Get('jobs/:jobId/progress')
  @ApiOperation({ summary: 'Lắng nghe tiến trình thời gian thực của Job qua Server-Sent Events' })
  @ApiParam({ name: 'jobId', description: 'Mã định danh của Job' })
  async streamProgress(
    @Param('jobId') jobId: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Kiểm tra nếu job đã hoàn thành từ trước
    const existingJob = await this.speakingQuizService.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'completed') {
        res.write(`data: ${JSON.stringify({
          jobId,
          progress: 100,
          stage: 'completed',
          message: 'Speaking quiz successfully created and saved',
          result: existingJob.returnvalue,
          timestamp: new Date().toISOString(),
        })}\n\n`);
        res.end();
        return;
      }
    }

    // Subscribe vào luồng sự kiện Redis Pub/Sub
    const subscription = this.redisPubSub.events$.subscribe((event) => {
      if (event.jobId === jobId) {
        res.write(`data: ${JSON.stringify(event.data || event)}\n\n`);

        if (event.type === 'JOB_COMPLETED' || event.type === 'JOB_FAILED') {
          subscription.unsubscribe();
          res.end();
        }
      }
    });

    res.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @Get('questions/:id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết câu hỏi theo ID' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của câu hỏi' })
  async getQuestionById(@Param('id') id: string) {
    return this.speakingQuizService.getQuestionById(id);
  }

  @Get('questions')
  @ApiOperation({ summary: 'Liệt kê danh sách câu hỏi theo Storybook' })
  @ApiQuery({ name: 'storybookId', description: 'ID của bài học Storybook', required: true })
  async getQuestionsByStorybook(@Query('storybookId') storybookId: string) {
    return this.speakingQuizService.getQuestionsByStorybook(storybookId);
  }
}
```

- [ ] **Step 6: Chạy lại test xác nhận test vượt qua**

Run: `npx jest src/plugins/speaking-quiz/speaking-quiz.service.spec.ts src/plugins/speaking-quiz/speaking-quiz.controller.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit thay đổi**

```bash
git add src/plugins/speaking-quiz/dto/create-speaking-quiz-job.dto.ts src/plugins/speaking-quiz/speaking-quiz.service.ts src/plugins/speaking-quiz/speaking-quiz.service.spec.ts src/plugins/speaking-quiz/speaking-quiz.controller.ts src/plugins/speaking-quiz/speaking-quiz.controller.spec.ts
git commit -m "feat(speaking-quiz): implement REST and SSE controller endpoints"
```

---

### Task 10: Tích Hợp Module & Kiểm Thử E2E Toàn Diện

**Mục tiêu:** Đóng gói toàn bộ các thành phần vào `SpeakingQuizModule`, tự động đăng ký Plugin vào `PluginRegistryService` lúc ứng dụng khởi động, nạp vào `AppModule`, và xây dựng bài test E2E kiểm tra toàn bộ luồng.

**Files:**
- Create: `src/plugins/speaking-quiz/speaking-quiz.module.ts`
- Modify: `src/app.module.ts:34-38`
- Create: `test/speaking-quiz.e2e-spec.ts`

- [ ] **Step 1: Triển khai `SpeakingQuizModule`**

Tạo file `src/plugins/speaking-quiz/speaking-quiz.module.ts`:
```typescript
/**
 * @file speaking-quiz.module.ts
 * @description NestJS Module đăng ký Speaking Quiz Agent Plugin, Worker và BullMQ Queue
 *
 * Made by Anh Tu - Share to be share
 */

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';
import { Storybook, StorybookSchema } from '../../infra/database/schemas/storybook.schema';
import { SpeakingQuestion, SpeakingQuestionSchema } from '../../infra/database/schemas/speaking-question.schema';
import { PluginRegistryService } from '../../core/services/plugin-registry.service';
import { ContextResolverNode } from './nodes/context-resolver.node';
import { QuestionFormulatorNode } from './nodes/question-formulator.node';
import { PrepSynthesizerNode } from './nodes/prep-synthesizer.node';
import { PersisterNode } from './nodes/persister.node';
import { SpeakingQuizPipelineService } from './pipelines/speaking-quiz.pipeline';
import { SpeakingQuizPlugin } from './speaking-quiz.plugin';
import { SpeakingQuizWorker } from './speaking-quiz.worker';
import { SpeakingQuizService } from './speaking-quiz.service';
import { SpeakingQuizController } from './speaking-quiz.controller';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: Storybook.name, schema: StorybookSchema },
        { name: SpeakingQuestion.name, schema: SpeakingQuestionSchema },
      ],
      AHA_TOOLS_CONNECTION,
    ),
    BullModule.registerQueue({
      name: 'speaking-quiz-queue',
    }),
  ],
  controllers: [SpeakingQuizController],
  providers: [
    ContextResolverNode,
    QuestionFormulatorNode,
    PrepSynthesizerNode,
    PersisterNode,
    SpeakingQuizPipelineService,
    SpeakingQuizPlugin,
    SpeakingQuizWorker,
    SpeakingQuizService,
  ],
  exports: [SpeakingQuizPlugin, SpeakingQuizService],
})
export class SpeakingQuizModule implements OnModuleInit {
  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly speakingQuizPlugin: SpeakingQuizPlugin,
  ) {}

  onModuleInit() {
    this.pluginRegistry.register(this.speakingQuizPlugin);
  }
}
```

- [ ] **Step 2: Nạp `QueueModule` và `SpeakingQuizModule` vào `AppModule`**

Chỉnh sửa file `src/app.module.ts`:
Thêm imports:
```typescript
import { QueueModule } from './infra/queue/queue.module';
import { SpeakingQuizModule } from './plugins/speaking-quiz/speaking-quiz.module';
```
Thêm `QueueModule` và `SpeakingQuizModule` vào mảng `imports` của `@Module`:
```typescript
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ...(process.env.VERCEL !== '1'
      ? [ServeStaticModule.forRoot({ rootPath: getPublicPath() })]
      : []),
    DatabaseModule,
    QueueModule,
    CoreModule,
    HealthModule,
    StoryShadowingModule,
    SpeakingQuizModule,
    AgentsModule,
    DashboardModule,
  ],
})
export class AppModule { }
```

- [ ] **Step 3: Viết E2E Integration Test**

Tạo file `test/speaking-quiz.e2e-spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('SpeakingQuizModule (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/agents - should list speaking-quiz in registered agents', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/agents')
      .expect(200);

    const pluginIds = response.body.map((p: any) => p.id);
    expect(pluginIds).toContain('speaking-quiz');
  });

  it('POST /api/agents/speaking-quiz/jobs - should accept job and return 202', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/agents/speaking-quiz/jobs')
      .send({
        customTopic: 'Artificial Intelligence and Human Creativity',
        level: 'B2',
      })
      .expect(202);

    expect(response.body.status).toBe('queued');
    expect(response.body.jobId).toBeDefined();
    expect(response.body.sseUrl).toContain('/api/agents/speaking-quiz/jobs/');
  });

  it('GET /api/agents/speaking-quiz/questions - should return array for storybook queries', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/agents/speaking-quiz/questions?storybookId=679c1a2b3c4d5e6f7a8b9c0d')
      .expect(200);

    expect(response.body.total).toBeDefined();
    expect(Array.isArray(response.body.questions)).toBeTruthy();
  });
});
```

- [ ] **Step 4: Chạy toàn bộ test suite (Unit + E2E)**

Run: `pnpm test`
Expected: Tất cả các test suites pass hoàn toàn.

- [ ] **Step 5: Chạy TypeScript typecheck**

Run: `pnpm typecheck`
Expected: Output clean, không có lỗi kiểu dữ liệu.

- [ ] **Step 6: Commit thay đổi cuối cùng**

```bash
git add src/plugins/speaking-quiz/speaking-quiz.module.ts src/app.module.ts test/speaking-quiz.e2e-spec.ts
git commit -m "feat(speaking-quiz): register module into app and add E2E verification"
```

---

## 7. Tiêu Chí Nghiệm Thu Hoàn Tất (Acceptance Checklist)

- [ ] **AC-1:** Schema `SpeakingQuestion` được lưu chính xác vào collection `speaking_questions` trong `AHA_TOOLS_CONNECTION`.
- [ ] **AC-2:** StateGraph 4 nodes (`ContextResolver` -> `QuestionFormulator` -> `PrepSynthesizer` -> `Persister`) chạy tuần tự với dữ liệu chuẩn Zod.
- [ ] **AC-3:** BullMQ Queue `speaking-quiz-queue` và Worker xử lý job bất đồng bộ với exponential backoff.
- [ ] **AC-4:** Endpoint `POST /api/agents/speaking-quiz/jobs` trả về `HTTP 202 Accepted` kèm `jobId` và `sseUrl`.
- [ ] **AC-5:** Endpoint `GET /api/agents/speaking-quiz/jobs/:jobId/progress` phát đúng chuỗi mốc tiến trình SSE `25% -> 50% -> 80% -> 100%`.
- [ ] **AC-6:** Module `speaking-quiz` tự động đăng ký vào `PluginRegistryService` và hiển thị trên Dashboard & Swagger `/api/docs`.

---

*Made by Anh Tu - Share to be share*
