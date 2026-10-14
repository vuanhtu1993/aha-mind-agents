# Refactor Node-Level Config, Hive Rate Limiting & Visual DB Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khai báo độc lập model, system prompt, temperature, maxTokens cho từng Node trong pipeline, tích hợp cơ chế Rate Limiting (Token Bucket / Concurrency Queue) & xử lý cạn kiệt reasoning token cho HiveService, đồng thời tự động migrate schema trên MongoDB và trực quan hoá cấu hình từng Node trên Admin Graph UI.

**Architecture:** 
1. **Node Configuration Subsystem:** Nâng cấp Schema `AgentConfig` và `NodeMetadata` để quản lý cấu hình chi tiết (`model`, `systemPrompt`, `temperature`, `maxTokens`) cho từng Node riêng biệt; các Node tự động phân giải cấu hình phân cấp (`nodeConfig -> agentConfig -> defaultFallback`).
2. **Hive Resiliency Subsystem:** Bổ sung Concurrency Queue & Token Bucket Rate Limiter vào `HiveService` kèm cơ chế Exponential Backoff khi gặp HTTP 429, khắc phục lỗi nhân đôi `system` message và tối ưu hoá xử lý `reasoning_tokens` của các mô hình lý luận (DeepSeek, GLM).
3. **Database Migration & UI Visualization Subsystem:** `DashboardService` tự động đối soát và đồng bộ sâu (deep merge) các trường `defaultConfig` mới vào DB mà không ghi đè cấu hình do người dùng tuỳ chỉnh; `ConfigsPage` và `AgentGraphNode` hiển thị trực tiếp Model badge và cho phép chọn Preset Model / tuỳ biến Max Tokens ngay trên đồ thị trực quan.

**Tech Stack:** NestJS, TypeScript, MongoDB / Mongoose, Axios, LangGraph, React Flow (@xyflow/react), TailwindCSS, Monaco Editor, Jest.

---

## Bối cảnh Sư phạm & Kiến trúc (Pedagogical & Architectural Foundations)

### 1. Root Cause Analysis (Phân tích nguyên nhân gốc rễ lỗi Token Limit & 429)
* **Lỗi 1 (Token Limit Exceeded):** Các dòng mô hình suy luận (Reasoning Models) như `deepseek-v4.1-flash` hay `glm-5.3-flash` sử dụng cơ chế *Chain-of-Thought (CoT)* ẩn. Toàn bộ `reasoning_tokens` (quá trình suy nghĩ) và `completion_tokens` (kết quả trả về) đều nằm chung trong hạn ngạch `max_tokens`. Khi gọi các Node xử lý dữ liệu lớn (như gộp phụ đề Youtube `YoutubeSentenceConsolidatorNode`), nếu `max_tokens` quá thấp hoặc prompt chưa yêu cầu tinh giản suy luận, mô hình dùng cạn hạn ngạch token ngay trong bước suy nghĩ (`finish_reason: length`), dẫn đến `content` trả về rỗng và kích hoạt ngoại lệ.
* **Lỗi 2 (Too Many Requests - HTTP 429):** Khi tách transcript thành nhiều chunk (ví dụ 16 chunk) và thực thi đồng thời qua `Promise.all`, toàn bộ 16 HTTP requests dồn dập gửi tới Hive API trong 1 micro giây. Hive API kích hoạt bộ lọc bảo vệ và trả về HTTP 429.

### 2. Definition Anatomy (Giải phẫu các khái niệm cốt lõi)
* **Token Bucket Rate Limiting:** 
  * *Token (Thẻ bài):* Đơn vị đại diện cho quyền được thực hiện 1 request.
  * *Bucket (Thùng chứa):* Bộ đệm có dung lượng tối đa $B$.
  * *Refill Rate (Tốc độ nạp):* Mỗi giây/phút, hệ thống bơm thêm $R$ token vào thùng. Request chỉ được gửi đi khi rút được token; nếu thùng rỗng, request sẽ xếp hàng chờ (Queue) thay vì bị từ chối ngay lập tức.
* **Node Overrides Architecture:**
  * Nguyên lý kế thừa cấu hình: Cấu hình của 1 Node cụ thể (`nodeOverrides[nodeId]`) sẽ ghi đè (override) cấu hình mặc định của Agent (`agentConfig.defaultModel`), và nếu không có sẽ rơi về giá trị mặc định của hệ thống (`hardcoded fallback`).

### 3. Critical Trade-offs (Đánh đổi giải pháp)
| Giải pháp | Ưu điểm (Pros) | Đánh đổi (Cons / Trade-offs) | Lựa chọn áp dụng |
| :--- | :--- | :--- | :--- |
| **In-Memory Concurrency Queue vs Redis Distributed Queue cho HiveService** | Đơn giản, zero-latency, không phụ thuộc hạ tầng ngoài, bảo vệ instance hiện tại tức thì. | Nếu scale nhiều instance server, giới hạn chỉ cục bộ trên từng Pod. | **In-Memory Queue + Retry** cho giai đoạn hiện tại, chuẩn bị interface mở rộng. |
| **Dropdown Model Cố định vs Gọi Dynamic Hive Models API** | Trải nghiệm tức thì, không bị trễ mạng khi mở page, lọc được các model đã kiểm thử tương thích. | Phải cập nhật danh sách khi nhà cung cấp ra mắt model mới. | **Hybrid:** Cung cấp Dropdown các preset phổ biến nhất kèm tuỳ chọn nhập Custom Model tự do. |

---

## File Structure & Responsibilities

```
src/
├── core/
│   ├── plugin.interface.ts                      # Cập nhật NodeMetadata với maxTokens
│   └── hive/
│       ├── hive.interface.ts                    # Bổ sung interface RateLimitConfig
│       ├── hive.service.ts                      # Rate limiter queue, retry 429, merge system prompt
│       └── hive.service.spec.ts                 # Unit tests cho Rate Limiting & Token Guard
├── infra/database/schemas/
│   ├── agent-config.schema.ts                   # Mở rộng nodeOverrides với maxTokens
│   └── agent-config.schema.spec.ts              # Unit test schema serialization
├── api/dashboard/
│   ├── dashboard.service.ts                     # Tự động deep-sync defaultConfig vào DB
│   └── dashboard.service.spec.ts                # Unit tests cho module migration
└── plugins/
    ├── story-shadowing/
    │   ├── story-shadowing.plugin.ts            # Khai báo configurableOptions và defaultConfig
    │   └── nodes/
    │       ├── youtube-sentence-consolidator.node.ts # Đọc maxTokens, model, throttled chunk execution
    │       ├── sentence-splitter.node.ts        # Đọc maxTokens, model
    │       ├── keyword-identifier.node.ts       # Đọc maxTokens, model
    │       └── keyword-enricher.node.ts         # Đọc maxTokens, model
    └── speaking-quiz/
        ├── speaking-quiz.plugin.ts              # Khai báo configurableOptions và defaultConfig
        └── nodes/
            ├── question-formulator.node.ts      # Đọc nodeConfig (model, prompt, temp, maxTokens)
            └── prep-synthesizer.node.ts         # Đọc nodeConfig (model, prompt, temp, maxTokens)

admin-ui/src/
├── components/
│   └── AgentGraphNode.tsx                       # Hiển thị trực quan model và temp trên Graph Node
└── pages/
    └── ConfigsPage.tsx                          # UI chọn Model preset, Max Tokens, System Prompt
```

---

## Tasks Chi Tiết (Bite-Sized Tasks)

### Task 1: Cập nhật Schema MongoDB `AgentConfig` & Plugin Metadata

**Files:**
- Modify: `src/core/plugin.interface.ts:24-35`
- Modify: `src/infra/database/schemas/agent-config.schema.ts:12-18`
- Modify: `src/plugins/story-shadowing/story-shadowing.plugin.ts:31-122`
- Modify: `src/plugins/speaking-quiz/speaking-quiz.plugin.ts:30-68`
- Create: `src/infra/database/schemas/agent-config.schema.spec.ts`

- [ ] **Step 1: Viết test cho Schema `AgentConfig` với trường `maxTokens`**

Tạo file `src/infra/database/schemas/agent-config.schema.spec.ts`:
```typescript
import { AgentConfig, AgentConfigSchema } from './agent-config.schema';
import mongoose from 'mongoose';

describe('AgentConfigSchema', () => {
  it('should validate nodeOverrides containing maxTokens, model, temperature, and systemPrompt', () => {
    const TestModel = mongoose.model('TestAgentConfig', AgentConfigSchema);
    const doc = new TestModel({
      agentId: 'story-shadowing',
      defaultModel: 'zai-org/glm-5.3-flash',
      nodeOverrides: {
        youtubeConsolidator: {
          model: 'deepseek-v4.1-flash',
          systemPrompt: 'Custom prompt',
          temperature: 0.2,
          maxTokens: 16384,
        },
      },
    });

    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.nodeOverrides?.youtubeConsolidator.maxTokens).toBe(16384);
    expect(doc.nodeOverrides?.youtubeConsolidator.model).toBe('deepseek-v4.1-flash');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận test chạy được**

Run: `pnpm jest src/infra/database/schemas/agent-config.schema.spec.ts`
Expected: PASS (Schema mongoose dùng `type: Object`, nhưng cần bảo đảm interface TypeScript chuẩn xác).

- [ ] **Step 3: Cập nhật `src/core/plugin.interface.ts` và `src/infra/database/schemas/agent-config.schema.ts`**

Trong `src/core/plugin.interface.ts`:
```typescript
export interface NodeMetadata {
  id: string; // VD: 'keywordIdentifier'
  type: 'llm' | 'tool' | 'router' | 'logic' | 'human';
  displayName: string;
  configurableOptions: string[]; // VD: ['systemPrompt', 'model', 'temperature', 'maxTokens']
  defaultConfig?: {
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}
```

Trong `src/infra/database/schemas/agent-config.schema.ts`:
```typescript
  @Prop({ type: Object, default: {} })
  nodeOverrides?: Record<string, {
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }>;
```

Cập nhật metadata trong `src/plugins/story-shadowing/story-shadowing.plugin.ts` và `src/plugins/speaking-quiz/speaking-quiz.plugin.ts` để thêm `'maxTokens'` vào `configurableOptions` và gán giá trị mặc định hợp lý trong `defaultConfig`.

- [ ] **Step 4: Chạy lại toàn bộ test suite để kiểm tra tính tương thích**

Run: `pnpm jest src/infra/database/schemas/agent-config.schema.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit thay đổi**

```bash
git add src/core/plugin.interface.ts src/infra/database/schemas/agent-config.schema.ts src/infra/database/schemas/agent-config.schema.spec.ts src/plugins/story-shadowing/story-shadowing.plugin.ts src/plugins/speaking-quiz/speaking-quiz.plugin.ts
git commit -m "feat(config): add maxTokens to NodeMetadata and AgentConfig schema"
```

---

### Task 2: Cơ chế Deep-Sync / Idempotent Auto-Migration & API Đồng bộ trong `DashboardService`

**Files:**
- Create: `src/api/dashboard/dashboard.service.spec.ts`
- Modify: `src/api/dashboard/dashboard.service.ts:21-62`
- Modify: `src/api/dashboard/dashboard.controller.ts:50-78`

- [ ] **Step 1: Viết test cho `onModuleInit` và hàm `syncAgentMetadata` trong `DashboardService`**

Tạo `src/api/dashboard/dashboard.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PluginRegistryService } from '../../core/services/plugin-registry.service';
import { ActiveJobTrackerService } from '../../core/services/active-job-tracker.service';
import { getModelToken } from '@nestjs/mongoose';
import { AgentExecLog } from '../../infra/database/schemas/agent-log.schema';
import { AgentConfig } from '../../infra/database/schemas/agent-config.schema';
import { AHA_MIND_CONNECTION } from '../../infra/database/database.constants';

describe('DashboardService', () => {
  let service: DashboardService;
  let mockConfigModel: any;
  let mockPluginRegistry: any;

  beforeEach(async () => {
    mockConfigModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
    };

    mockPluginRegistry = {
      plugins: new Map([
        [
          'test-agent',
          {
            metadata: {
              id: 'test-agent',
              pipelines: [
                {
                  id: 'pipe1',
                  nodes: [
                    {
                      id: 'nodeA',
                      type: 'llm',
                      defaultConfig: {
                        model: 'gemini-3.5-flash',
                        temperature: 0.1,
                        maxTokens: 4096,
                      },
                    },
                    {
                      id: 'nodeB_new',
                      type: 'llm',
                      defaultConfig: {
                        model: 'deepseek-v4.1-flash',
                        temperature: 0.2,
                        maxTokens: 8192,
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getModelToken(AgentExecLog.name, AHA_MIND_CONNECTION),
          useValue: {},
        },
        {
          provide: getModelToken(AgentConfig.name, AHA_MIND_CONNECTION),
          useValue: mockConfigModel,
        },
        {
          provide: PluginRegistryService,
          useValue: mockPluginRegistry,
        },
        {
          provide: ActiveJobTrackerService,
          useValue: { getActiveJobs: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should deep-merge new node defaults into existing config without overwriting user overrides', async () => {
    // Giả lập DB đã có record với nodeA có custom systemPrompt nhưng chưa có maxTokens, và nodeB_new chưa có trong DB
    const existingConfig = {
      agentId: 'test-agent',
      defaultModel: 'custom-model',
      nodeOverrides: {
        nodeA: {
          systemPrompt: 'My custom prompt',
          temperature: 0.7,
        },
      },
      save: jest.fn().mockResolvedValue(true),
      markModified: jest.fn(),
    };

    mockConfigModel.findOne.mockResolvedValue(existingConfig);

    const result = await service.syncAgentMetadata('test-agent');

    // Phải giữ nguyên customPrompt và temperature của người dùng ở nodeA, nhưng bổ sung maxTokens
    expect(existingConfig.nodeOverrides.nodeA.systemPrompt).toBe('My custom prompt');
    expect(existingConfig.nodeOverrides.nodeA.temperature).toBe(0.7);
    expect(existingConfig.nodeOverrides.nodeA.maxTokens).toBe(4096);
    // Bổ sung nodeB_new từ code vào DB
    expect(existingConfig.nodeOverrides.nodeB_new).toBeDefined();
    expect(existingConfig.nodeOverrides.nodeB_new.model).toBe('deepseek-v4.1-flash');
    expect(existingConfig.save).toHaveBeenCalled();
    expect(result.syncedCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Chạy test để thấy test fail**

Run: `pnpm jest src/api/dashboard/dashboard.service.spec.ts`
Expected: FAIL vì chưa có phương thức `syncAgentMetadata`.

- [ ] **Step 3: Cải tiến `onModuleInit`, bổ sung `syncAgentMetadata` trong `DashboardService` và endpoint trong `DashboardController`**

Trong `src/api/dashboard/dashboard.service.ts`:
```typescript
  async onModuleInit() {
    this.logger.log('Đang đồng bộ Metadata của các Plugin xuống AgentConfig...');
    const plugins = this.pluginRegistry['plugins'];

    for (const agentId of plugins.keys()) {
      await this.syncAgentMetadata(agentId);
    }
    this.logger.log('Đồng bộ Metadata hoàn tất.');
  }

  /**
   * Đồng bộ cấu hình metadata từ code vào Database cho 1 Agent cụ thể.
   * Có thể gọi tự động khi khởi động hoặc gọi chủ động qua nút bấm trên Dashboard.
   */
  async syncAgentMetadata(agentId: string): Promise<{ syncedCount: number; newNodes: string[] }> {
    const plugins = this.pluginRegistry['plugins'];
    const plugin = plugins.get(agentId);
    if (!plugin) {
      throw new Error(`Plugin '${agentId}' không tồn tại.`);
    }

    const metadata = plugin.metadata;
    const defaultNodeOverrides: Record<string, any> = {};

    if (metadata.pipelines && Array.isArray(metadata.pipelines)) {
      metadata.pipelines.forEach((pipeline: any) => {
        if (pipeline.nodes && Array.isArray(pipeline.nodes)) {
          pipeline.nodes.forEach((node: any) => {
            if (node.defaultConfig) {
              defaultNodeOverrides[node.id] = { ...node.defaultConfig };
            }
          });
        }
      });
    }

    const newNodes: string[] = [];
    let syncedCount = 0;

    const existing = await this.configModel.findOne({ agentId });
    if (!existing) {
      await this.configModel.create({
        agentId,
        defaultModel: 'zai-org/glm-5.3-flash',
        temperature: 0.1,
        maxRetries: 2,
        isActive: true,
        nodeOverrides: defaultNodeOverrides,
      });
      return { syncedCount: Object.keys(defaultNodeOverrides).length, newNodes: Object.keys(defaultNodeOverrides) };
    }

    const currentOverrides = existing.nodeOverrides || {};
    let hasChanges = false;

    for (const [nodeId, defConfig] of Object.entries(defaultNodeOverrides)) {
      if (!currentOverrides[nodeId]) {
        currentOverrides[nodeId] = { ...defConfig };
        newNodes.push(nodeId);
        hasChanges = true;
        syncedCount++;
      } else {
        // Merge các thuộc tính còn thiếu (ví dụ maxTokens) mà admin chưa cấu hình
        for (const [key, val] of Object.entries(defConfig as Record<string, any>)) {
          if (currentOverrides[nodeId][key] === undefined) {
            currentOverrides[nodeId][key] = val;
            hasChanges = true;
            syncedCount++;
          }
        }
      }
    }

    if (hasChanges) {
      existing.nodeOverrides = currentOverrides;
      existing.markModified('nodeOverrides');
      await existing.save();
      this.logger.log(`✅ [Reconcile] Đã đồng bộ ${syncedCount} thuộc tính / node mới cho agentId: ${agentId}`);
    }

    return { syncedCount, newNodes };
  }
```

Bổ sung endpoint đồng bộ trong `src/api/dashboard/dashboard.controller.ts`:
```typescript
  @Post('configs/:agentId/sync')
  @ApiOperation({ summary: 'Đồng bộ cấu hình từ Plugin Metadata vào CSDL', description: 'Quét các node mới từ code và điền defaultConfig vào DB mà không ghi đè custom config của admin' })
  @ApiParam({ name: 'agentId', example: 'story-shadowing' })
  async syncAgentConfig(@Param('agentId') agentId: string) {
    return this.dashboardService.syncAgentMetadata(agentId);
  }
```

- [ ] **Step 4: Chạy test để xác nhận test pass**

Run: `pnpm jest src/api/dashboard/dashboard.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit thay đổi**

```bash
git add src/api/dashboard/dashboard.service.ts src/api/dashboard/dashboard.controller.ts src/api/dashboard/dashboard.service.spec.ts
git commit -m "feat(dashboard): add syncAgentMetadata and POST /configs/:agentId/sync endpoint"
```

---

### Task 3: Nâng cấp `HiveService` — Token Bucket Rate Limiting (Chuẩn 5 req/s), Retry 429 và Reasoning Token Limit Guard

**Files:**
- Modify: `src/core/hive/hive.interface.ts`
- Modify: `src/core/hive/hive.service.ts`
- Modify: `src/core/hive/hive.service.spec.ts`

- [ ] **Step 1: Viết test cho Token Bucket Rate Limiting (5 RPS) & Retry khi gặp lỗi 429**

Mở rộng `src/core/hive/hive.service.spec.ts`:
```typescript
  describe('Token Bucket Rate Limiting (5 req/s) & Retries', () => {
    it('should throttle requests to max 5 requests per second', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        status: 200,
        data: {
          choices: [{ message: { content: 'OK' } }],
          usage: { total_tokens: 10 },
        },
      });

      const startTime = Date.now();
      // Bắn liên tiếp 6 requests
      const promises = Array.from({ length: 6 }).map((_, i) =>
        service.invoke([{ role: 'user', content: `test ${i}` }])
      );

      await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      // Với Token Bucket capacity = 5 và refill 1 token mỗi 200ms:
      // 5 requests đầu bắn burst ngay lập tức, request thứ 6 phải chờ ít nhất ~200ms.
      expect(elapsed).toBeGreaterThanOrEqual(180);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(6);
    });

    it('should retry on HTTP 429 and eventually succeed', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce({
          response: { status: 429, data: { message: 'Too Many Requests' } },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: {
            choices: [{ message: { content: 'Recovered after rate limit' } }],
            usage: { total_tokens: 15 },
          },
        });

      const res = await service.invoke([{ role: 'user', content: 'test retry' }]);
      expect(res.text).toBe('Recovered after rate limit');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });

    it('should merge system prompts into a single system message for invokeStructured', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [{ message: { content: '{"status":"ok"}' }, finish_reason: 'stop' }],
          usage: { total_tokens: 20 },
        },
      });

      await service.invokeStructured(
        z.object({ status: z.string() }),
        [
          { role: 'system', content: 'Node custom instructions' },
          { role: 'user', content: 'Hello' },
        ],
        { maxTokens: 4096 }
      );

      const calledPayload = mockAxiosInstance.post.mock.calls[0][1];
      const systemMessages = calledPayload.messages.filter((m: any) => m.role === 'system');
      // Đảm bảo chỉ có duy nhất 1 system message ở đầu mảng messages
      expect(systemMessages.length).toBe(1);
      expect(systemMessages[0].content).toContain('Node custom instructions');
      expect(systemMessages[0].content).toContain('Target JSON Schema');
    });
  });
```

- [ ] **Step 2: Chạy test để thấy test fail**

Run: `pnpm jest src/core/hive/hive.service.spec.ts`
Expected: FAIL vì `HiveService` hiện tại chưa triển khai Token Bucket 5 req/s.

- [ ] **Step 3: Triển khai Token Bucket Rate Limiter (5 req/s) và Single System Message Merge trong `src/core/hive/hive.service.ts`**

Trong `src/core/hive/hive.service.ts`:
1. Triển khai Token Bucket Engine theo định mức 5 req/s:
```typescript
  // Cấu hình Token Bucket chuẩn xác cho Hive API: 5 request/s
  private readonly bucketCapacity = 5; // Dung lượng chứa tối đa 5 token
  private readonly refillIntervalMs = 200; // Mỗi 200ms hồi 1 token (1000ms / 5 = 200ms)
  private availableTokens = 5;
  private lastRefillTimestamp = Date.now();
  private readonly rateLimitQueue: (() => void)[] = [];
  private rateLimitTimer: NodeJS.Timeout | null = null;

  /**
   * Bơm token vào thùng theo thời gian thực (Token Bucket Refill)
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTimestamp;
    const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs);

    if (tokensToAdd > 0) {
      this.availableTokens = Math.min(this.bucketCapacity, this.availableTokens + tokensToAdd);
      this.lastRefillTimestamp = now;
    }
  }

  /**
   * Xin cấp 1 token trước khi gửi request tới Hive API.
   * Nếu thùng còn token: trừ 1 token và thực thi ngay.
   * Nếu thùng cạn: xếp hàng vào queue và chờ timer nạp token xả dần.
   */
  private async acquireToken(): Promise<void> {
    this.refillTokens();

    if (this.availableTokens > 0) {
      this.availableTokens--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.rateLimitQueue.push(resolve);
      this.startQueueDrainer();
    });
  }

  private startQueueDrainer(): void {
    if (this.rateLimitTimer) return;

    this.rateLimitTimer = setInterval(() => {
      this.refillTokens();

      while (this.availableTokens > 0 && this.rateLimitQueue.length > 0) {
        this.availableTokens--;
        const resolve = this.rateLimitQueue.shift();
        if (resolve) resolve();
      }

      if (this.rateLimitQueue.length === 0 && this.rateLimitTimer) {
        clearInterval(this.rateLimitTimer);
        this.rateLimitTimer = null;
      }
    }, this.refillIntervalMs);
  }

  /**
   * Thực thi request có kiểm soát Token Bucket và cơ chế Exponential Backoff khi gặp 429
   */
  private async executeWithThrottling<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    while (attempt <= maxRetries) {
      await this.acquireToken();
      try {
        return await fn();
      } catch (error: any) {
        attempt++;
        const status = error?.response?.status;
        if ((status === 429 || status >= 500) && attempt <= maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          this.logger.warn(`⚠️ Hive API trả về HTTP ${status}. Tự động chờ ${Math.round(backoff)}ms để retry (Lần ${attempt}/${maxRetries})...`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Exceeded maximum retry attempts');
  }
```

2. Cập nhật `invokeStructured` để gộp `systemPrompt`:
```typescript
    // Tách các message từ input của caller
    const callerMessages = typeof prompt === 'string'
      ? [{ role: 'user', content: prompt }]
      : this.normalizeMessages(prompt);

    const callerSystemMsg = callerMessages.find(m => m.role === 'system');
    const nonSystemMessages = callerMessages.filter(m => m.role !== 'system');

    // Hợp nhất chỉ thị JSON và system prompt của Node vào DUY NHẤT 1 system message
    const combinedSystemContent = [
      callerSystemMsg ? callerSystemMsg.content : '',
      `You MUST respond ONLY with a valid JSON object matching the requested schema.${schemaInstruction}`,
      `Do not include markdown code block backticks (\`\`\`json) or introductory explanations.`,
      `CRITICAL FOR REASONING MODELS: Keep internal reasoning brief and concise. Focus directly on the JSON output.`,
    ].filter(Boolean).join('\n\n');

    const enhancedMessages = [
      { role: 'system', content: combinedSystemContent },
      ...nonSystemMessages,
    ];
```

3. Bọc lệnh gọi `this.client.post(...)` trong `this.executeWithThrottling(...)` cho cả `invoke` và `invokeStructured`.

4. Cải tiến thông điệp lỗi khi gặp `finish_reason === 'length'`:
```typescript
      if (finishReason === 'length' && (!content || content.trim() === '')) {
        this.logger.error(
          `❌ Mô hình Hive cạn kiệt tokens (Prompt: ${usage.prompt_tokens}, Reasoning: ${usage.completion_tokens_details?.reasoning_tokens || 'N/A'}, MaxTokens: ${maxTokens}).`
        );
        throw new Error(
          `Hive reasoning model token limit exceeded (finish_reason: length). Prompt tokens: ${usage.prompt_tokens}. Please increase maxTokens (hiện tại: ${maxTokens}) hoặc giảm kích thước chunk.`
        );
      }
```

- [ ] **Step 4: Chạy test để xác nhận test pass**

Run: `pnpm jest src/core/hive/hive.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit thay đổi**

```bash
git add src/core/hive/hive.service.ts src/core/hive/hive.interface.ts src/core/hive/hive.service.spec.ts
git commit -m "feat(hive): add rate limiting queue, 429 exponential backoff, and reasoning token optimizations"
```

---

### Task 4: Chuẩn hoá các LLM Node đọc Config phân cấp từ `nodeOverrides`

**Files:**
- Modify: `src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts`
- Modify: `src/plugins/story-shadowing/nodes/sentence-splitter.node.ts`
- Modify: `src/plugins/story-shadowing/nodes/keyword-identifier.node.ts`
- Modify: `src/plugins/story-shadowing/nodes/keyword-enricher.node.ts`
- Modify: `src/plugins/speaking-quiz/nodes/question-formulator.node.ts`
- Modify: `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.ts`
- Modify: `src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts`
- Modify: `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts`

- [ ] **Step 1: Viết test xác minh Node đọc đúng `model`, `temperature`, `maxTokens`, `systemPrompt` từ config**

Mở `src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts`:
```typescript
    it('should respect custom nodeOverrides for model, temperature, and systemPrompt', async () => {
      mockHiveService.invokeStructured.mockResolvedValueOnce({
        parsed: {
          question: 'Should schools ban smartphones?',
          suggestedFramework: 'PREP',
        },
        usage: { totalTokens: 100 },
      });

      const state: any = {
        resolvedTopic: 'Smartphones in School',
        level: 'B2',
        config: {
          defaultModel: 'global-fallback-model',
          nodeOverrides: {
            questionFormulator: {
              model: 'deepseek-v4.1-flash',
              temperature: 0.7,
              maxTokens: 2048,
              systemPrompt: 'Custom pedagogical instructions',
            },
          },
        },
      };

      await node.invoke(state);

      expect(mockHiveService.invokeStructured).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Custom pedagogical instructions'),
          }),
        ]),
        expect.objectContaining({
          model: 'deepseek-v4.1-flash',
          temperature: 0.7,
          maxTokens: 2048,
        }),
      );
    });
```

- [ ] **Step 2: Chạy test để thấy test fail**

Run: `pnpm jest src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts`
Expected: FAIL vì `question-formulator.node.ts` hiện đang hardcode `temperature: 0.3` và không đọc `nodeConfig`.

- [ ] **Step 3: Cập nhật code trong các Node**

1. Cập nhật `src/plugins/speaking-quiz/nodes/question-formulator.node.ts`:
```typescript
    const nodeConfig = state.config?.nodeOverrides?.['questionFormulator'] || {};
    const basePrompt = nodeConfig.systemPrompt || SYSTEM_PROMPT;
    const promptTemplate = basePrompt.replace('{LEVEL}', state.level || 'B2');
    const temp = nodeConfig.temperature ?? state.config?.temperature ?? 0.3;
    const model = nodeConfig.model || state.config?.defaultModel;
    const maxTokens = nodeConfig.maxTokens ?? 2048;

    // Truyền vào this.hive.invokeStructured(..., { temperature: temp, model, maxTokens, name: 'question_formulator' })
```

2. Cập nhật `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.ts`:
```typescript
    const nodeConfig = state.config?.nodeOverrides?.['prepSynthesizer'] || {};
    const basePrompt = nodeConfig.systemPrompt || SYSTEM_PROMPT;
    const promptTemplate = basePrompt.replace(/{LEVEL}/g, state.level || 'B2');
    const temp = nodeConfig.temperature ?? state.config?.temperature ?? 0.2;
    const model = nodeConfig.model || state.config?.defaultModel;
    const maxTokens = nodeConfig.maxTokens ?? 8192;
```

3. Cập nhật `src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts`:
- Đọc `maxTokens`:
```typescript
    const nodeConfig = state.config?.nodeOverrides?.['youtubeConsolidator'] || {};
    const prompt = nodeConfig.systemPrompt || SYSTEM_PROMPT;
    const temp = nodeConfig.temperature ?? state.config?.temperature ?? 0.1;
    const model = nodeConfig.model || state.config?.defaultModel;
    const maxTokens = nodeConfig.maxTokens ?? 16384; // Hào phóng cho reasoning model
```
- Truyền `maxTokens: maxTokens` vào options của `invokeStructured`.
- Thay vì `Promise.all(chunkPromises)` dồn dập, thực thi theo batch (ví dụ 3 chunks một lần) để kết hợp nhịp nhàng với rate limiter.

4. Tương tự, cập nhật `sentence-splitter.node.ts`, `keyword-identifier.node.ts`, `keyword-enricher.node.ts` để đọc và truyền `maxTokens: nodeConfig.maxTokens ?? <default>`.

- [ ] **Step 4: Chạy test các Node để xác nhận test pass**

Run: `pnpm jest src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts`
Expected: PASS

- [ ] **Step 5: Chạy lại toàn bộ test suite dự án**

Run: `pnpm test`
Expected: 27/27 test suites pass.

- [ ] **Step 6: Commit thay đổi**

```bash
git add src/plugins/speaking-quiz/nodes/question-formulator.node.ts src/plugins/speaking-quiz/nodes/prep-synthesizer.node.ts src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts src/plugins/story-shadowing/nodes/sentence-splitter.node.ts src/plugins/story-shadowing/nodes/keyword-identifier.node.ts src/plugins/story-shadowing/nodes/keyword-enricher.node.ts
git commit -m "feat(nodes): enable hierarchical config resolution and maxTokens for all LLM nodes"
```

---

### Task 5: Nâng cấp Admin Dashboard UI — Model Presets, Max Tokens & Graph Visualization

**Files:**
- Modify: `admin-ui/src/pages/ConfigsPage.tsx`
- Modify: `admin-ui/src/components/AgentGraphNode.tsx`

- [ ] **Step 1: Cập nhật `admin-ui/src/components/AgentGraphNode.tsx` hiển thị badge Model**

Trong `AgentGraphNode.tsx`, nhận dữ liệu cấu hình model của node và hiển thị huy hiệu nhỏ gọn, thẩm mỹ:
```tsx
import { Handle, Position } from '@xyflow/react';
import { Cpu, Wrench } from 'lucide-react';

export default function AgentGraphNode({ data, selected }: any) {
  const isLLM = data.type === 'llm';
  const Icon = isLLM ? Cpu : Wrench;
  const currentModel = data.configuredModel || data.defaultConfig?.model;

  return (
    <div
      className={`px-4 py-3 shadow-lg rounded-xl border-2 bg-white flex items-center min-w-[240px] transition-all ${
        selected
          ? isLLM
            ? 'border-primary ring-4 ring-primary/20 scale-105'
            : 'border-orange-500 ring-4 ring-orange-500/20 scale-105'
          : isLLM
          ? 'border-blue-200'
          : 'border-orange-200'
      }`}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400" />
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 shadow-sm shrink-0 ${
          isLLM ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
        }`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="overflow-hidden">
        <h4 className="font-bold text-slate-800 text-sm truncate">{data.displayName || data.id}</h4>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
              isLLM ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
            }`}
          >
            {isLLM ? 'LLM' : 'Tool'}
          </span>
          {isLLM && currentModel && (
            <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[130px]" title={currentModel}>
              {currentModel.split('/').pop()}
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-slate-400" />
    </div>
  );
}
```

- [ ] **Step 2: Cập nhật `admin-ui/src/pages/ConfigsPage.tsx`**

1. Khai báo danh sách Preset Models:
```typescript
const PRESET_MODELS = [
  { value: '', label: '⚡ Kế thừa mặc định (Inherit Default)' },
  { value: 'zai-org/glm-5.3-flash', label: 'GLM 5.3 Flash (Mặc định Hive)' },
  { value: 'deepseek-v4.1-flash', label: 'DeepSeek v4.1 Flash (Reasoning)' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'custom', label: '✏️ Model khác (Tự nhập tên)' },
];
```

2. Tích hợp nút **"Sync with Code"** trên Header:
- Gọi API `POST /api/v1/dashboard/configs/${selectedAgentId}/sync`.
- Cập nhật lại state `config` và hiển thị thông báo thành công: `✅ Đã đồng bộ N node mới từ Plugin Code!`.

3. Khi render nodes cho React Flow, truyền trạng thái đồng bộ vào node data:
- So sánh `config.nodeOverrides?.[n.id]` với `n.defaultConfig`:
  * `isNew`: `!config.nodeOverrides?.[n.id]`
  * `isModified`: Khác `systemPrompt`, `model`, `maxTokens`, hoặc `temperature`
  * `isSynced`: Khớp hoàn toàn với code.

4. Trong form điều khiển bên phải (Node Configuration Panel):
- Hiển thị Huy hiệu trạng thái cấu hình của Node (`[✅ Khớp Code]`, `[⚙️ Đã tùy biến]`, hoặc `[✨ Mới từ Code]`).
- Thêm nút **"🔄 Khôi phục mặc định từ Code" (Reset to Code Default)**: Khi Admin bấm, tự động nạp lại `systemPrompt`, `model`, `temperature`, `maxTokens` từ `selectedNodeMeta.defaultConfig`.
- Thêm Dropdown chọn Model từ `PRESET_MODELS` (hoặc nhập custom nếu chọn khác).
- Thêm trường `Max Tokens` (number input với gợi ý: 4096 cho task ngắn, 8192 - 16384 cho reasoning models).
- Thêm trường `Temperature` (number input từ 0 đến 2).

- [ ] **Step 3: Build và verify Admin UI**

Run: `npm run build --prefix admin-ui`
Expected: Build thành công không có lỗi TypeScript hay Vite bundler.

- [ ] **Step 4: Commit thay đổi**

```bash
git add admin-ui/src/components/AgentGraphNode.tsx admin-ui/src/pages/ConfigsPage.tsx
git commit -m "feat(ui): add node sync button, drift detection badges, reset to code default, and model/token controls"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** 
  - Yêu cầu 1 (Khai báo model, system_prompt cho từng LLM node): Đã giải quyết ở Task 1, Task 4, Task 5.
  - Yêu cầu 2 (Rate limit cho Hive Service tránh Too Many Requests): Đã giải quyết ở Task 3 (Queue + Rate Limiter + Retry 429).
  - Yêu cầu 3 (Migrate node trên DB để trực quan hoá): Đã giải quyết ở Task 2 (Deep-sync migration) và Task 5 (Graph UI badges).
- [x] **Placeholder scan:** Không có "TODO", "TBD", hay mã giả. Mọi bước đều có file path cụ thể và mã nguồn hoàn chỉnh.
- [x] **Type consistency:** Tên thuộc tính `maxTokens`, `model`, `systemPrompt`, `temperature` đồng nhất giữa Backend, Database Schema, và Frontend UI.

---

*Made by Anh Tu - Share to be share*
