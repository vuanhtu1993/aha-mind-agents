* [ ] 

# Hive Service Upgrade & Story Shadowing Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp `HiveService` với cơ chế Tự chữa lỗi (Auto-healing) và Token Guard, đồng thời tối ưu hóa phân rã chunk (`CHUNK_SIZE = 25`) cho `YoutubeSentenceConsolidatorNode` và chuẩn hóa prompt cho `KeywordEnricherNode` để giải quyết triệt để lỗi cạn kiệt token và lỗi Zod Schema Validation.

**Architecture:** Mở rộng `HiveService.invokeStructured()` theo Định luật Postel (Robustness Principle) để tự động chuẩn hóa các biến thể cấu trúc JSON từ LLM (`items: [...]`) trước khi validate với Zod. Tối ưu kích thước batch của các Agent Node để phù hợp với đặc thù Reasoning Token của mô hình `zai-org/glm-5.3-flash`. Khắc phục toàn bộ các lỗi gán kiểu trong unit test để đảm bảo mã nguồn biên dịch sạch sẽ.

**Tech Stack:** NestJS, TypeScript, Axios, Zod, zod-to-json-schema, Jest, LangGraph.

---

### Task 1: Thêm Unit Test cho Auto-healing và Token Guard trong HiveService

**Files:**

- Modify: `src/core/hive/hive.service.spec.ts:135-160`

- [ ] **Step 1: Viết failing test cases cho Auto-healing và Token Guard trong `hive.service.spec.ts`**

Mở file `src/core/hive/hive.service.spec.ts` và thêm các test case kiểm tra:

1. Khi LLM trả về array `[{ greeting: 'Xin chào', count: 1 }]` nhưng schema yêu cầu `{ items: z.array(...) }`.
2. Khi LLM trả về `{ data: [...] }` thay vì `{ items: [...] }`.
3. Khi LLM cạn kiệt token reasoning (`finish_reason: 'length'` và `content: null`).

```typescript
    const ItemsSchema = z.object({
      items: z.array(
        z.object({
          greeting: z.string(),
          count: z.number(),
        })
      ),
    });

    it('should auto-heal when LLM returns an array directly instead of { items: [...] }', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify([{ greeting: 'Chào bạn', count: 3 }]),
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        },
      });

      const result = await service.invokeStructured(ItemsSchema, 'Generate greetings');
      expect(result.parsed).toEqual({
        items: [{ greeting: 'Chào bạn', count: 3 }],
      });
    });

    it('should auto-heal when LLM wraps items under a different key like data or keywords', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({ data: [{ greeting: 'Alo', count: 1 }] }),
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        },
      });

      const result = await service.invokeStructured(ItemsSchema, 'Generate greetings');
      expect(result.parsed).toEqual({
        items: [{ greeting: 'Alo', count: 1 }],
      });
    });

    it('should throw descriptive error when reasoning token limit is exceeded', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              finish_reason: 'length',
              message: {
                content: null,
                reasoning: 'Thinking too long...',
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 4096, total_tokens: 4196 },
        },
      });

      await expect(
        service.invokeStructured(ItemsSchema, 'Task too large')
      ).rejects.toThrow('Hive reasoning model token limit exceeded');
    });
```

- [ ] **Step 2: Chạy test để xác nhận test thất bại (Red)**

Run: `npm test -- src/core/hive/hive.service.spec.ts`
Expected: FAIL vì `HiveService` hiện tại chưa có cơ chế bọc auto-heal và chưa kiểm tra `finish_reason === 'length'`.

---

### Task 2: Cài đặt Auto-healing và Token Guard trong HiveService

**Files:**

- Modify: `src/core/hive/hive.service.ts:120-205`

- [ ] **Step 1: Triển khai logic Auto-healing và Token Guard trong `src/core/hive/hive.service.ts`**

Cập nhật phương thức `invokeStructured` trong `src/core/hive/hive.service.ts`:

```typescript
  public async invokeStructured<T = any>(
    schema: z.ZodSchema<T> | any,
    prompt: string | HiveMessage[] | any[],
    options?: HiveCallOptions
  ): Promise<HiveStructuredResult<T>> {
    this.ensureApiKey();

    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.1;
    const maxTokens = options?.maxTokens ?? 8192; // Tăng mặc định lên 8192 để dự phòng reasoning tokens

    const rawMessages = typeof prompt === 'string'
      ? [{ role: 'user', content: prompt }]
      : this.normalizeMessages(prompt);

    // Trích xuất JSON Schema từ Zod để hướng dẫn model sinh đúng cấu trúc và tên trường
    let schemaInstruction = '';
    if (schema && typeof schema.parse === 'function') {
      try {
        const jsonSchema = zodToJsonSchema(schema, 'ResponseSchema');
        const schemaDef = (jsonSchema as any).definitions?.ResponseSchema || jsonSchema;
        schemaInstruction = `\nTarget JSON Schema:\n${JSON.stringify(schemaDef, null, 2)}`;
      } catch {
        // Fallback nếu không phải Zod schema hợp lệ
      }
    }

    // Bổ sung chỉ thị xuất JSON thuần túy vào system instruction
    const systemPrompt: HiveMessage = {
      role: 'system',
      content:
        `You are an AI assistant that MUST respond ONLY with a valid JSON object matching the requested schema.${schemaInstruction}\nDo not include markdown code block backticks (\`\`\`json) or introductory explanations. Keep reasoning concise.`,
    };

    const enhancedMessages = [systemPrompt, ...rawMessages];

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

      const choice = response.data?.choices?.[0];
      const finishReason = choice?.finish_reason;
      const content = choice?.message?.content;
      const usage = response.data?.usage || {};

      // 1. Kiểm tra Token Limit Guard đối với Reasoning Model
      if (finishReason === 'length' && (!content || content.trim() === '')) {
        this.logger.error('❌ Mô hình Hive cạn kiệt tokens trước khi kịp sinh content.');
        throw new Error(
          'Hive reasoning model token limit exceeded (finish_reason: length). Please reduce prompt length or chunk size.'
        );
      }

      let parsedJson: any;
      try {
        const sanitizedContent = (content || '{}').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        parsedJson = JSON.parse(sanitizedContent);
      } catch (jsonErr: any) {
        this.logger.error(`❌ Hive trả về chuỗi JSON không hợp lệ: ${content}`);
        throw new Error(`Hive API returned invalid JSON: ${jsonErr.message}`);
      }

      // 2. Xác thực và Auto-healing (Định luật Postel: mềm dẻo với dữ liệu nhận về)
      let validatedData: any;
      if (schema && typeof schema.parse === 'function') {
        try {
          validatedData = schema.parse(parsedJson);
        } catch (firstErr: any) {
          let healed = false;

          // Biến thể A: LLM trả về array [...] thay vì { items: [...] }
          if (Array.isArray(parsedJson)) {
            try {
              validatedData = schema.parse({ items: parsedJson });
              healed = true;
            } catch {}
          }

          // Biến thể B: LLM trả về { data: [...] } hoặc { keywords: [...] } thay vì { items: [...] }
          if (!healed && parsedJson && typeof parsedJson === 'object') {
            const arrayKey = Object.keys(parsedJson).find(k => Array.isArray(parsedJson[k]));
            if (arrayKey && arrayKey !== 'items') {
              try {
                validatedData = schema.parse({ items: parsedJson[arrayKey] });
                healed = true;
              } catch {}
            }
          }

          // Biến thể C: LLM trả về 1 object đơn lẻ { word: "...", explanation: "..." } thay vì { items: [{...}] }
          if (!healed && parsedJson && typeof parsedJson === 'object' && parsedJson.word) {
            try {
              validatedData = schema.parse({ items: [parsedJson] });
              healed = true;
            } catch {}
          }

          if (!healed) {
            throw firstErr;
          }
        }
      } else {
        validatedData = parsedJson;
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
```

- [ ] **Step 2: Chạy test để xác nhận test vượt qua (Green)**

Run: `npm test -- src/core/hive/hive.service.spec.ts`Expected: PASS toàn bộ test cases trong `hive.service.spec.ts`.

- [ ] **Step 3: Commit thay đổi Task 1 & 2**

```bash
git add src/core/hive/hive.service.ts src/core/hive/hive.service.spec.ts
git commit -m "feat(hive): add auto-healing and reasoning token guard to invokeStructured"
```

---

### Task 3: Tối ưu hóa Prompt và Batching trong KeywordEnricherNode

**Files:**

- Modify: `src/plugins/story-shadowing/nodes/keyword-enricher.node.ts:13-35`

- [ ] **Step 1: Chuẩn hóa prompt `getBatchEnrichmentUserPrompt` để ép định dạng `{ items: [...] }`**

Mở file `src/plugins/story-shadowing/nodes/keyword-enricher.node.ts` và sửa đổi `getBatchEnrichmentUserPrompt`:

```typescript
  private getBatchEnrichmentUserPrompt(items: IdentifiedKeywordItem[]) {
    const itemsListStr = items.map((item, i) => `
[Item ${i + 1}]
- Word/Phrase: "${item.word}"
- Type: ${item.type}
- Context: "${item.context}"`).join('\n');

    return `The student encountered the following items in a reading text:
${itemsListStr}

For EACH item, provide:
1. "word": the exact Word/Phrase from the input to match them.
2. "explanation": A clear, simple explanation of what this item means EXACTLY IN THIS CONTEXT.
3. "wordFamily": 1-3 related words (e.g. noun form, adjective form).
4. "collocations": 1-3 common collocations for this item.

You MUST output a valid JSON object with the "items" key matching the schema:
{
  "items": [
    {
      "word": "...",
      "explanation": "...",
      "wordFamily": [...],
      "collocations": [...]
    }
  ]
}`;
  }
```

- [ ] **Step 2: Commit thay đổi**

```bash
git add src/plugins/story-shadowing/nodes/keyword-enricher.node.ts
git commit -m "fix(story-shadowing): enforce items object structure in keyword-enricher prompt"
```

---

### Task 4: Tối ưu hóa CHUNK_SIZE và Token Budget trong YoutubeSentenceConsolidatorNode

**Files:**

- Modify: `src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts:45-85`

- [ ] **Step 1: Giảm `CHUNK_SIZE = 25` và truyền `maxTokens: 8192`**

Mở file `src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts` và cập nhật:

1. `CHUNK_SIZE = 25` (giảm từ 100 xuống 25 để mỗi chunk chỉ chứa ~200 từ, tránh cạn kiệt token reasoning của GLM-5.3).
2. Thêm `maxTokens: 8192` vào options của `this.hive.invokeStructured`.

```typescript
      const MAX_BLOCKS = 400;
      const CHUNK_SIZE = 25; // Tối ưu cho reasoning model: ~200 từ/chunk tránh cạn kiệt 4096 tokens
      const transcriptToProcess = state.youtubeTranscript.slice(0, MAX_BLOCKS);

      const chunkPromises = [];
      const chunkOffsets: number[] = [];

      const nodeConfig = state.config?.nodeOverrides?.['youtubeConsolidator'] || {};
      const prompt = nodeConfig.systemPrompt || SYSTEM_PROMPT;
      const temp = nodeConfig.temperature ?? state.config?.temperature ?? 0.1;
      const model = nodeConfig.model || state.config?.defaultModel;

      for (let i = 0; i < transcriptToProcess.length; i += CHUNK_SIZE) {
        const chunk = transcriptToProcess.slice(i, i + CHUNK_SIZE);
        const timeOffset = chunk[0].offset;
        chunkOffsets.push(timeOffset);

        const shiftedChunk = chunk.map(c => ({
          ...c,
          start: c.offset - timeOffset, // Map offset to start for the prompt
        }));

        const inputText = JSON.stringify(shiftedChunk);

        chunkPromises.push(
          this.hive.invokeStructured(
            YoutubeConsolidatedSchema,
            [
              { role: 'system', content: prompt },
              { role: 'user', content: inputText },
            ],
            {
              temperature: temp,
              model: model,
              maxTokens: 8192,
              name: 'youtube_sentence_consolidator',
            }
          )
        );
      }
```

- [ ] **Step 2: Commit thay đổi**

```bash
git add src/plugins/story-shadowing/nodes/youtube-sentence-consolidator.node.ts
git commit -m "perf(story-shadowing): optimize chunk size to 25 and token budget for youtube consolidator"
```

---

### Task 5: Sửa lỗi TypeScript gán kiểu trong Unit Tests của Speaking-Quiz

**Files:**

- Modify: `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts:1-15`
- Modify: `src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts:1-15`

- [ ] **Step 1: Cập nhật mock service từ GeminiService sang HiveService trong `prep-synthesizer.node.spec.ts`**

Mở file `src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts`:

```typescript
import { PrepSynthesizerNode } from './prep-synthesizer.node';
import { HiveService } from 'src/core/hive/hive.service';

describe('PrepSynthesizerNode', () => {
  let node: PrepSynthesizerNode;
  let mockHiveService: Partial<HiveService>;

  beforeEach(() => {
    mockHiveService = {
      invokeStructured: jest.fn(),
    };
    node = new PrepSynthesizerNode(mockHiveService as HiveService);
  });
```

(và thay thế các lời gọi `mockGeminiService` trong file thành `mockHiveService`).

- [ ] **Step 2: Cập nhật mock service từ GeminiService sang HiveService trong `question-formulator.node.spec.ts`**

Mở file `src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts`:

```typescript
import { QuestionFormulatorNode } from './question-formulator.node';
import { HiveService } from 'src/core/hive/hive.service';

describe('QuestionFormulatorNode', () => {
  let node: QuestionFormulatorNode;
  let mockHiveService: Partial<HiveService>;

  beforeEach(() => {
    mockHiveService = {
      invokeStructured: jest.fn(),
    };
    node = new QuestionFormulatorNode(mockHiveService as HiveService);
  });
```

(và thay thế các lời gọi `mockGeminiService` trong file thành `mockHiveService`).

- [ ] **Step 3: Kiểm tra biên dịch TypeScript toàn dự án**

Run: `npx tsc --noEmit`Expected: 0 errors (biên dịch hoàn tất thành công).

- [ ] **Step 4: Chạy test cho speaking-quiz specs**

Run: `npm test -- src/plugins/speaking-quiz/`Expected: PASS toàn bộ test cases.

- [ ] **Step 5: Commit thay đổi**

```bash
git add src/plugins/speaking-quiz/nodes/prep-synthesizer.node.spec.ts src/plugins/speaking-quiz/nodes/question-formulator.node.spec.ts
git commit -m "test(speaking-quiz): update mocks from GeminiService to HiveService"
```

---

### Task 6: Kiểm thử toàn trình (End-to-End Verification)

**Files:**

- N/A (Verification qua HTTP curl và Server Log)

- [ ] **Step 1: Chạy lại lệnh curl kiểm thử Pipeline YouTube**

Run:

```bash
curl -X 'POST' \
  'http://localhost:3001/api/agents/story-shadowing/jobs' \
  -H 'accept: */*' \
  -H 'Content-Type: application/json' \
  -d '{
  "pipeline": "youtube",
  "youtubeUrl": "https://youtu.be/GPbPAC0xS1s?si=1bBkJdcdD4A6TsiC",
  "forceRegenerate": true
}'
```

- [ ] **Step 2: Kiểm tra log của Worker**

Expected trong log terminal:

1. `[YoutubeTranscriptFetcherNode] ✅ Hoàn thành lấy phụ đề YouTube (99 đoạn).`
2. `[YoutubeSentenceConsolidatorNode] Đang gộp phụ đề và căn chỉnh thời gian bằng AI...`
3. 4 chunk nhỏ (mỗi chunk 25 blocks) hoàn thành gộp câu và phiên âm IPA thành công mà không bị timeout.
4. `[KeywordIdentifierNode] ✅ Trích xuất thành công các từ vựng khó.`
5. `[KeywordEnricherNode] ✅ Giải nghĩa thành công từ vựng (Auto-healing hoạt động trơn tru).`
6. `[StoryShadowingWorker] ✅ Hoàn thành Job. StoryId: ...`
