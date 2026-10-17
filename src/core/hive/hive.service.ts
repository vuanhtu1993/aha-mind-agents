import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  HiveCallOptions,
  HiveInvokeResult,
  HiveMessage,
  HiveRole,
  HiveStructuredResult,
  HiveStreamChunk,
} from './hive.interface';

/**
 * Service tích hợp Hive AI (mô hình GLM-5.3-Flash).
 *
 * Triết lý thiết kế (Design Philosophy):
 * - Độc lập (Decoupled): Không phụ thuộc vào SDK ngoại lai nặng nề, sử dụng trực tiếp Axios và Zod.
 * - Tuân thủ nguyên lý Liskov Substitution Principle (LSP): Giữ nguyên 100% chữ ký hàm
 *   (invoke, invokeStructured, invokeStream) tương đương với GeminiService để các Agent Node
 *   có thể hoán đổi linh hoạt mà không phải sửa logic nghiệp vụ.
 * - Xử lý đặc thù Reasoning Model: Model GLM-5.3 sinh reasoning tokens trước khi đưa ra kết quả,
 *   do đó service cấu hình dự phòng max_tokens mặc định 4096 và thời gian chờ (timeout) 90s.
 */
@Injectable()
export class HiveService implements OnModuleInit {
  private readonly logger = new Logger(HiveService.name);
  private client: AxiosInstance;
  private apiKey: string;
  private defaultModel: string;
  private baseUrl: string;

  // Cấu hình Token Bucket chuẩn xác cho Hive API: 5 request/s
  private readonly bucketCapacity = 5; // Dung lượng chứa tối đa 5 token
  private readonly refillIntervalMs = 200; // Mỗi 200ms hồi 1 token (1000ms / 5 = 200ms)
  private availableTokens = 5;
  private lastRefillTimestamp = Date.now();
  private readonly rateLimitQueue: (() => void)[] = [];
  private rateLimitTimer: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) { }

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
      // Timeout 90 giây vì mô hình reasoning có thể mất vài giây suy luận trước khi emit tokens
      timeout: 90000,
    });
  }

  onModuleDestroy() {
    if (this.rateLimitTimer) {
      clearInterval(this.rateLimitTimer);
      this.rateLimitTimer = null;
    }
  }

  /**
   * Bơm token vào thùng theo thời gian thực (Token Bucket Refill)
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTimestamp;
    const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs);

    if (tokensToAdd > 0) {
      this.availableTokens = Math.min(this.bucketCapacity, this.availableTokens + tokensToAdd);
      this.lastRefillTimestamp = this.lastRefillTimestamp + tokensToAdd * this.refillIntervalMs;
    }
  }

  /**
   * Xin cấp 1 token trước khi gửi request tới Hive API.
   * Nếu thùng còn token: trừ 1 token và thực thi ngay.
   * Nếu thùng cạn: xếp hàng vào queue và chờ drainer nạp token xả dần.
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
    }, 40); // Chu kỳ kiểm tra 40ms để giải phóng token ngay khi refill
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
          this.logger.warn(
            `⚠️ Hive API trả về HTTP ${status}. Tự động chờ ${Math.round(backoff)}ms để retry (Lần ${attempt}/${maxRetries})...`
          );
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Exceeded maximum retry attempts');
  }

  /**
   * Gọi LLM trả về văn bản thông thường và token usage.
   *
   * @param messages Danh sách tin nhắn dạng mảng { role, content }
   * @param options Tuỳ chọn tham số (temperature, maxTokens, model)
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
      const response = await this.executeWithThrottling(() =>
        this.client.post('/chat/completions', payload, {
          headers: {
            authorization: `Bearer ${this.apiKey}`,
          },
        })
      );

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
   * Gọi LLM trả về JSON Structured Output tuân theo Zod Schema.
   * Signature tương thích 100% với GeminiService.invokeStructured() để các Node cắm rút tức thì.
   *
   * @param schema Zod Schema hoặc đối tượng kiểm tra cấu trúc
   * @param prompt Câu lệnh hoặc mảng tin nhắn đầu vào
   * @param options Tuỳ chọn (temperature, model, maxTokens, name)
   */
  public async invokeStructured<T = any>(
    schema: z.ZodSchema<T> | any,
    prompt: string | HiveMessage[] | any[],
    options?: HiveCallOptions
  ): Promise<HiveStructuredResult<T>> {
    this.ensureApiKey();

    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.1;
    const maxTokens = options?.maxTokens ?? 16384;

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

    // Tách riêng system message từ caller nếu có để hợp nhất vào DUY NHẤT 1 system message
    const callerSystemMsg = rawMessages.find((m) => m.role === 'system');
    const nonSystemMessages = rawMessages.filter((m) => m.role !== 'system');

    const combinedSystemContent = [
      callerSystemMsg ? callerSystemMsg.content : '',
      `You are an AI assistant that MUST respond ONLY with a valid JSON object matching the requested schema.${schemaInstruction}`,
      `Do not include markdown code block backticks (\`\`\`json) or introductory explanations.`,
      `CRITICAL FOR REASONING MODELS: Keep internal reasoning brief and concise (< 500 tokens). Focus directly on outputting the final JSON object immediately. Do not loop or overthink.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const enhancedMessages = [
      { role: 'system' as HiveRole, content: combinedSystemContent },
      ...nonSystemMessages,
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
      const response = await this.executeWithThrottling(() =>
        this.client.post('/chat/completions', payload, {
          headers: {
            authorization: `Bearer ${this.apiKey}`,
          },
        })
      );

      const choice = response.data?.choices?.[0];
      const finishReason = choice?.finish_reason;
      const content = choice?.message?.content;
      const usage = response.data?.usage || {};

      // 1. Fail-Fast Token Limit Guard: Khi model bị ngắt do chạm trần max_tokens, dừng ngay và báo lỗi rõ ràng
      if (finishReason === 'length') {
        const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 'N/A';
        this.logger.error(
          `❌ Mô hình Hive cạn kiệt tokens (finish_reason: length). Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens}, Reasoning: ${reasoningTokens}, MaxTokens: ${maxTokens}.`
        );
        throw new Error(
          `Hive reasoning model token limit exceeded (finish_reason: length). Prompt: ${usage.prompt_tokens}, Reasoning: ${reasoningTokens}, Max: ${maxTokens}. Please reduce prompt length, chunk size, or increase maxTokens.`
        );
      }

      let parsedJson: any;
      try {
        // Làm sạch chuỗi JSON nếu model sơ suất kẹp backticks ```json ... ```
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
            } catch { }
          }

          // Biến thể B: LLM trả về { data: [...] } hoặc { keywords: [...] } thay vì { items: [...] }
          if (!healed && parsedJson && typeof parsedJson === 'object') {
            const arrayKey = Object.keys(parsedJson).find(k => Array.isArray(parsedJson[k]));
            if (arrayKey && arrayKey !== 'items') {
              try {
                validatedData = schema.parse({ items: parsedJson[arrayKey] });
                healed = true;
              } catch { }
            }
          }

          // Biến thể C: LLM chỉ trả về 1 object đơn lẻ { word: "...", explanation: "..." } thay vì { items: [{...}] }
          if (!healed && parsedJson && typeof parsedJson === 'object' && parsedJson.word) {
            try {
              validatedData = schema.parse({ items: [parsedJson] });
              healed = true;
            } catch { }
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

  /**
   * Gọi LLM ở chế độ Streaming SSE thời gian thực.
   *
   * @param messages Mảng tin nhắn
   * @param options Tuỳ chọn tham số
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
          // Bỏ qua nếu dòng data bị ngắt nửa chừng
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
    if (!Array.isArray(messages)) {
      return [];
    }
    return messages.map((m) => ({
      role: m?.role || 'user',
      content: typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content),
    }));
  }
}
