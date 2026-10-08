# Hive LLM Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng `HiveService` độc lập sử dụng Hive API (`zai-org/glm-5.3-flash`) với đầy đủ 3 cơ chế `invoke`, `invokeStructured` và `invokeStream`, giữ nguyên chuẩn giao tiếp của `GeminiService` để giải quyết lỗi 503 mà không phải sửa logic nghiệp vụ của các Agent Node.

**Architecture:** Tạo module dịch vụ `HiveService` trong `src/core/hive` sử dụng `axios` và `zod` có sẵn. Service giao tiếp với endpoint `https://api.thehive.ai/api/v3/chat/completions`, hỗ trợ parse JSON có cấu trúc qua Zod schema và stream SSE thời gian thực. Đăng ký vào `CoreModule` để bất kỳ Node nào trong các Plugin đều có thể cắm rút linh hoạt.

**Tech Stack:** NestJS, TypeScript, Axios, Zod, RxJS/AsyncGenerator, Jest.

---

### Task 1: Bổ sung cấu hình Biến môi trường cho Hive

**Files:**
- Modify: `src/common/config/env.validation.ts`
- Modify: `src/common/config/env.validation.spec.ts`

- [ ] **Step 1: Viết test kiểm tra schema cấu hình Hive trong `env.validation.spec.ts`**

Mở file `src/common/config/env.validation.spec.ts` và bổ sung test case kiểm tra các trường cấu hình Hive:

```typescript
it('should support Hive AI configuration with defaults', () => {
  const env = {
    MONGODB_URI: 'mongodb://localhost:27017/test',
    HIVE_API_KEY: 'test-hive-key',
  };
  const validated = validateEnv(env);
  expect(validated.HIVE_API_KEY).toBe('test-hive-key');
  expect(validated.HIVE_MODEL).toBe('zai-org/glm-5.3-flash');
  expect(validated.HIVE_BASE_URL).toBe('https://api.thehive.ai/api/v3');
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại (Red)**

Run: `npm test -- src/common/config/env.validation.spec.ts`  
Expected: FAIL vì `HIVE_API_KEY`, `HIVE_MODEL`, `HIVE_BASE_URL` chưa được định nghĩa trong `EnvSchema`.

- [ ] **Step 3: Bổ sung trường cấu hình vào `src/common/config/env.validation.ts`**

Thêm các trường sau vào `EnvSchema` trong `src/common/config/env.validation.ts`:

```typescript
  // Hive AI Configuration (Dự phòng cho Gemini 503)
  HIVE_API_KEY: z.string().optional(),
  HIVE_MODEL: z.string().default('zai-org/glm-5.3-flash'),
  HIVE_BASE_URL: z.string().default('https://api.thehive.ai/api/v3'),
```

- [ ] **Step 4: Chạy lại test để xác nhận test vượt qua (Green)**

Run: `npm test -- src/common/config/env.validation.spec.ts`  
Expected: PASS toàn bộ các test case.

- [ ] **Step 5: Commit thay đổi cấu hình**

```bash
git add src/common/config/env.validation.ts src/common/config/env.validation.spec.ts
git commit -m "feat(config): add hive ai configuration schema"
```

---

### Task 2: Định nghĩa Interfaces & Types cho Hive Service

**Files:**
- Create: `src/core/hive/hive.interface.ts`

- [ ] **Step 1: Tạo file định nghĩa types `src/core/hive/hive.interface.ts`**

Tạo mới file `src/core/hive/hive.interface.ts` chứa các interface chuẩn hóa:

```typescript
import { z } from 'zod';

export type HiveRole = 'system' | 'user' | 'assistant';

export interface HiveMessage {
  role: HiveRole;
  content: string;
}

export interface HiveCallOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  name?: string;
}

export interface HiveTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
}

export interface HiveInvokeResult {
  text: string;
  usage: HiveTokenUsage;
  reasoning?: string;
}

export interface HiveStructuredResult<T> {
  parsed: T;
  usage: HiveTokenUsage;
}

export interface HiveStreamChunk {
  content?: string;
  reasoning?: string;
  isDone: boolean;
  usage?: HiveTokenUsage;
}
```

- [ ] **Step 2: Chạy typecheck để xác nhận tính hợp lệ**

Run: `npm run typecheck`  
Expected: PASS không có lỗi TypeScript.

- [ ] **Step 3: Commit interface**

```bash
git add src/core/hive/hive.interface.ts
git commit -m "feat(hive): add hive service interfaces and type definitions"
```

---

### Task 3: Viết Unit Test cho HiveService (TDD Red)

**Files:**
- Create: `src/core/hive/hive.service.spec.ts`

- [ ] **Step 1: Viết bộ Unit Test đầy đủ cho `HiveService`**

Tạo file `src/core/hive/hive.service.spec.ts` mock `axios` và `ConfigService`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { z } from 'zod';
import { HiveService } from './hive.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HiveService', () => {
  let service: HiveService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HiveService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'HIVE_API_KEY') return 'test-key';
              if (key === 'HIVE_MODEL') return 'zai-org/glm-5.3-flash';
              if (key === 'HIVE_BASE_URL') return 'https://api.thehive.ai/api/v3';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<HiveService>(HiveService);
    configService = module.get<ConfigService>(ConfigService);
    jest.clearAllMocks();
  });

  describe('invoke', () => {
    it('should send request and return text with usage', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: 'Hello world',
                reasoning: 'Need to say hello',
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
            completion_tokens_details: { reasoning_tokens: 15 },
          },
        },
      });

      const result = await service.invoke([
        { role: 'user', content: 'Say hello' },
      ]);

      expect(result.text).toBe('Hello world');
      expect(result.usage.totalTokens).toBe(30);
      expect(result.reasoning).toBe('Need to say hello');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('invokeStructured', () => {
    const TestSchema = z.object({
      greeting: z.string(),
      count: z.number(),
    });

    it('should validate structured json response using zod', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({ greeting: 'Xin chào', count: 5 }),
              },
            },
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 25,
            total_tokens: 40,
          },
        },
      });

      const result = await service.invokeStructured(
        TestSchema,
        'Generate greeting'
      );

      expect(result.parsed).toEqual({ greeting: 'Xin chào', count: 5 });
      expect(result.usage.promptTokens).toBe(15);
    });

    it('should throw Error if model returns invalid JSON', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: 'Not a JSON text',
              },
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        },
      });

      await expect(
        service.invokeStructured(TestSchema, 'Generate invalid')
      ).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại vì chưa tạo `HiveService` (Red)**

Run: `npm test -- src/core/hive/hive.service.spec.ts`  
Expected: FAIL vì `Cannot find module './hive.service'`.

---

### Task 4: Hiện thực HiveService (TDD Green)

**Files:**
- Create: `src/core/hive/hive.service.ts`

- [ ] **Step 1: Viết mã nguồn cho `src/core/hive/hive.service.ts`**

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';
import {
  HiveCallOptions,
  HiveInvokeResult,
  HiveMessage,
  HiveStructuredResult,
  HiveStreamChunk,
} from './hive.interface';

@Injectable()
export class HiveService implements OnModuleInit {
  private readonly logger = new Logger(HiveService.name);
  private client: AxiosInstance;
  private apiKey: string;
  private defaultModel: string;
  private baseUrl: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.apiKey = this.configService.get<string>('HIVE_API_KEY', process.env.HIVE_API_KEY || '');
    this.defaultModel = this.configService.get<string>('HIVE_MODEL', 'zai-org/glm-5.3-flash');
    this.baseUrl = this.configService.get<string>('HIVE_BASE_URL', 'https://api.thehive.ai/api/v3');

    if (!this.apiKey) {
      this.logger.warn('⚠️ HIVE_API_KEY chưa được cấu hình. Các lời gọi HiveService sẽ bị từ chối.');
    } else {
      this.logger.log(`✅ HiveService đã sẵn sàng (Model mặc định: ${this.defaultModel}).`);
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 90000, // 90s do reasoning model có thể cần thời gian suy luận ban đầu
    });
  }

  /**
   * Gọi LLM thông thường trả về văn bản và token usage.
   */
  public async invoke(
    messages: HiveMessage[] | any[],
    options?: HiveCallOptions
  ): Promise<HiveInvokeResult> {
    this.ensureApiKey();

    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.1;
    const maxTokens = options?.maxTokens ?? 4096;

    const payload = {
      model,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      messages: this.normalizeMessages(messages),
    };

    try {
      const response = await this.client.post('/chat/completions', payload, {
        headers: {
          authorization: `Bearer ${this.apiKey}`,
        },
      });

      const choice = response.data?.choices?.[0];
      const message = choice?.message;
      const usage = response.data?.usage || {};

      return {
        text: message?.content || '',
        reasoning: message?.reasoning || undefined,
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          reasoningTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
        },
      };
    } catch (error: any) {
      const errMsg = error?.response?.data ? JSON.stringify(error.response.data) : error.message;
      this.logger.error(`❌ Lỗi Hive API Completion: ${errMsg}`);
      throw error;
    }
  }

  /**
   * Gọi LLM trả về Structured Output theo Zod Schema.
   * Tương thích 100% với signature của GeminiService.invokeStructured
   */
  public async invokeStructured<T = any>(
    schema: z.ZodSchema<T> | any,
    prompt: string | HiveMessage[] | any[],
    options?: HiveCallOptions
  ): Promise<HiveStructuredResult<T>> {
    this.ensureApiKey();

    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.1;
    const maxTokens = options?.maxTokens ?? 4096;

    const rawMessages = typeof prompt === 'string'
      ? [{ role: 'user', content: prompt }]
      : this.normalizeMessages(prompt);

    // Bổ sung chỉ thị xuất JSON chuẩn xác vào system prompt
    const enhancedMessages = [
      {
        role: 'system',
        content:
          'You are an AI assistant that MUST respond ONLY with a valid JSON object matching the requested schema. Do not include markdown code block backticks (```json) or introductory explanations.',
      },
      ...rawMessages,
    ];

    const payload = {
      model,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      response_format: { type: 'json_object' },
      messages: enhancedMessages,
    };

    try {
      const response = await this.client.post('/chat/completions', payload, {
        headers: {
          authorization: `Bearer ${this.apiKey}`,
        },
      });

      const content = response.data?.choices?.[0]?.message?.content || '{}';
      const usage = response.data?.usage || {};

      let parsedJson: any;
      try {
        // Tẩy các ký tự markdown thừa nếu có
        const sanitizedContent = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        parsedJson = JSON.parse(sanitizedContent);
      } catch (jsonErr: any) {
        this.logger.error(`❌ Hive trả về JSON không hợp lệ: ${content}`);
        throw new Error(`Hive API returned invalid JSON: ${jsonErr.message}`);
      }

      // Kiểm chứng qua Zod Schema nếu là Zod Schema
      let validatedData = parsedJson;
      if (schema && typeof schema.parse === 'function') {
        validatedData = schema.parse(parsedJson);
      }

      return {
        parsed: validatedData,
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          reasoningTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
        },
      };
    } catch (error: any) {
      const errMsg = error?.response?.data ? JSON.stringify(error.response.data) : error.message;
      this.logger.error(`❌ Lỗi Hive API Structured: ${errMsg}`);
      throw error;
    }
  }

  /**
   * Gọi LLM ở chế độ Streaming SSE.
   */
  public async *invokeStream(
    messages: HiveMessage[] | any[],
    options?: HiveCallOptions
  ): AsyncGenerator<HiveStreamChunk> {
    this.ensureApiKey();

    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.1;
    const maxTokens = options?.maxTokens ?? 4096;

    const payload = {
      model,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      messages: this.normalizeMessages(messages),
    };

    const response = await this.client.post('/chat/completions', payload, {
      headers: {
        authorization: `Bearer ${this.apiKey}`,
      },
      responseType: 'stream',
    });

    const stream = response.data;
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.replace(/^data:\s*/, '');
        if (dataStr === '[DONE]') {
          yield { isDone: true };
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta;
          yield {
            content: delta?.content || undefined,
            reasoning: delta?.reasoning || undefined,
            isDone: false,
          };
        } catch {
          // Bỏ qua dòng bị cắt ngang nếu có
        }
      }
    }

    yield { isDone: true };
  }

  private ensureApiKey() {
    if (!this.apiKey) {
      throw new Error('HIVE_API_KEY is missing in configuration/environment');
    }
  }

  private normalizeMessages(messages: any[]): HiveMessage[] {
    return messages.map((m) => ({
      role: m.role || 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));
  }
}
```

- [ ] **Step 2: Chạy unit test để xác nhận test vượt qua (Green)**

Run: `npm test -- src/core/hive/hive.service.spec.ts`  
Expected: PASS toàn bộ các test case của `HiveService`.

- [ ] **Step 3: Commit code HiveService**

```bash
git add src/core/hive/hive.service.ts src/core/hive/hive.service.spec.ts
git commit -m "feat(hive): implement HiveService with invoke, invokeStructured and invokeStream"
```

---

### Task 5: Đăng ký HiveService vào CoreModule

**Files:**
- Modify: `src/core/core.module.ts`

- [ ] **Step 1: Cập nhật `src/core/core.module.ts` khai báo và export `HiveService`**

```typescript
import { Module, Global } from '@nestjs/common';
import { GeminiService } from './gemini/gemini.service';
import { GeminiRateLimiterService } from './gemini/gemini-rate-limiter.service';
import { HiveService } from './hive/hive.service';
import { PluginRegistryService } from './services/plugin-registry.service';
import { RedisPubSubService } from './services/redis-pubsub.service';
import { ActiveJobTrackerService } from './services/active-job-tracker.service';

@Global()
@Module({
  providers: [
    GeminiService,
    GeminiRateLimiterService,
    HiveService,
    PluginRegistryService,
    RedisPubSubService,
    ActiveJobTrackerService,
  ],
  exports: [
    GeminiService,
    GeminiRateLimiterService,
    HiveService,
    PluginRegistryService,
    RedisPubSubService,
    ActiveJobTrackerService,
  ],
})
export class CoreModule {}
```

- [ ] **Step 2: Chạy kiểm tra toàn bộ test suite để đảm bảo không gãy module**

Run: `npm test`  
Expected: Tất cả các test hiện có của project đều PASS.

- [ ] **Step 3: Commit CoreModule**

```bash
git add src/core/core.module.ts
git commit -m "feat(core): export HiveService from CoreModule"
```

---

### Task 6: Kiểm thử Tích hợp Thực tế & Kiểm chứng Hoán đổi Node

**Files:**
- Create: `test/hive-integration.spec.ts` (Integration test gọi trực tiếp Hive với API Key thật)

- [ ] **Step 1: Viết test tích hợp `test/hive-integration.spec.ts`**

Kiểm tra trực tiếp kết nối và cấu trúc Structured Output với model `zai-org/glm-5.3-flash`:

```typescript
import { ConfigService } from '@nestjs/config';
import { HiveService } from '../src/core/hive/hive.service';
import { IdentifiedKeywordListSchema } from '../src/plugins/story-shadowing/story-shadowing.schema';
import * as dotenv from 'dotenv';
dotenv.config();

describe('HiveService Live Integration', () => {
  let service: HiveService;

  beforeAll(() => {
    if (!process.env.HIVE_API_KEY) {
      console.warn('Bỏ qua Live Integration vì thiếu HIVE_API_KEY');
      return;
    }
    const mockConfig = new ConfigService();
    service = new HiveService(mockConfig);
    service.onModuleInit();
  });

  it('should extract structured keywords from english sentence', async () => {
    if (!process.env.HIVE_API_KEY) return;

    const res = await service.invokeStructured(
      IdentifiedKeywordListSchema,
      'The sudden downpour threw a wrench in our plans to explore the countryside.'
    );

    expect(res.parsed).toBeDefined();
    expect(res.parsed.items.length).toBeGreaterThan(0);
    expect(res.usage.totalTokens).toBeGreaterThan(0);
  }, 30000);
});
```

- [ ] **Step 2: Chạy Integration test**

Run: `npm test -- test/hive-integration.spec.ts`  
Expected: PASS, trích xuất thành công các từ/idiom (ví dụ `threw a wrench in`).

- [ ] **Step 3: Commit integration test**

```bash
git add test/hive-integration.spec.ts
git commit -m "test(hive): add live integration test for HiveService"
```

---
*Made by Anh Tu - Share to be share*
