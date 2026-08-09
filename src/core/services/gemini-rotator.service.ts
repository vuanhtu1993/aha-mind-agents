import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

/**
 * Service quản lý xoay vòng API Keys của Google Gemini.
 * Giải quyết bài toán Rate Limiting (429) và Service Unavailable (503) trên Serverless
 * bằng cách tự động nhảy sang API Key dự phòng (Failover) khi Key hiện tại gặp giới hạn.
 */
@Injectable()
export class GeminiRotatorService implements OnModuleInit {
  private readonly logger = new Logger(GeminiRotatorService.name);
  
  private apiKeys: string[] = [];
  private currentKeyIndex: number = 0;

  // Lưu trữ thời điểm bị khóa (Cooldown) của từng key: { [apiKey]: timestamp_ms }
  private cooldownMap: Record<string, number> = {};
  private readonly COOLDOWN_DURATION_MS = 5 * 60 * 1000; // 5 phút

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initKeys();
  }

  /**
   * Tự động quét và nạp toàn bộ các biến môi trường cấu hình API Key.
   * Hỗ trợ khai báo: GOOGLE_API_KEY, GOOGLE_API_KEY_1, GOOGLE_API_KEY_2...
   */
  private initKeys() {
    const keys: string[] = [];
    
    // Đọc tất cả các biến môi trường
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('GOOGLE_API_KEY') && value) {
        // Cắt bằng dấu phẩy đề phòng user khai báo 1 biến có nhiều key
        const extractedKeys = value.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
        keys.push(...extractedKeys);
      }
    }

    // Lọc trùng lặp
    this.apiKeys = Array.from(new Set(keys));

    if (this.apiKeys.length === 0) {
      this.logger.error('❌ Không tìm thấy API Key nào trong .env (các biến bắt đầu bằng GOOGLE_API_KEY)');
      // Trong môi trường production, có thể quăng lỗi để app dừng lại (Fail-fast)
      throw new Error('Missing Google API Keys');
    }

    this.logger.log(`✅ Đã nạp thành công ${this.apiKeys.length} Google API Keys vào bộ xoay vòng.`);
  }

  /**
   * Lấy một instance của LLM với Key đang khả dụng.
   */
  public getModelWithOptions(options?: { temperature?: number, searchGrounding?: boolean }): ChatGoogleGenerativeAI {
    const activeKey = this.getActiveKey();
    
    const config: any = {
      apiKey: activeKey,
      model: this.configService.get<string>('GEMINI_MODEL', 'gemini-2.5-flash'),
      temperature: options?.temperature ?? 0.1,
      maxRetries: 2,
    };

    if (options?.searchGrounding) {
      config.searchGrounding = true;
    }

    return new ChatGoogleGenerativeAI(config);
  }

  /**
   * Trả về API Key hiện tại đang không bị khóa.
   * Nếu Key hiện tại bị khóa (Cooldown), tự động tìm Key tiếp theo.
   */
  private getActiveKey(): string {
    const startIndex = this.currentKeyIndex;
    let attempts = 0;
    const totalKeys = this.apiKeys.length;

    while (attempts < totalKeys) {
      const key = this.apiKeys[this.currentKeyIndex];
      const cooldownUntil = this.cooldownMap[key];

      if (!cooldownUntil || Date.now() > cooldownUntil) {
        // Key này an toàn
        if (cooldownUntil) {
           this.logger.log(`🔓 Key thứ ${this.currentKeyIndex + 1} đã hết thời gian Cooldown. Đưa vào sử dụng lại.`);
           delete this.cooldownMap[key];
        }
        return key;
      }

      // Nếu key đang bị khóa, nhảy sang key kế tiếp
      this.currentKeyIndex = (this.currentKeyIndex + 1) % totalKeys;
      attempts++;
    }

    // Nếu tất cả các keys đều đang bị khóa, quăng lỗi.
    this.logger.error(`❌ Toàn bộ ${totalKeys} API Keys đều đang bị khóa do vượt Quota (Cooldown). Vui lòng thử lại sau vài phút!`);
    throw new Error('ALL_KEYS_EXHAUSTED');
  }

  /**
   * Đánh dấu Key hiện tại bị lỗi (ví dụ do 429 Quota) và chuyển sang Key kế.
   */
  private markKeyAsExhausted(key: string) {
    this.cooldownMap[key] = Date.now() + this.COOLDOWN_DURATION_MS;
    this.logger.warn(`⚠️ Đã đánh dấu khóa Key thứ ${this.currentKeyIndex + 1} trong 5 phút. Tự động chuyển sang Key kế tiếp.`);
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
  }

  /**
   * Bọc hàm thực thi với cơ chế tự động thử lại khi gặp Quota.
   */
  private async executeWithFailover<T>(operation: () => Promise<T>): Promise<T> {
    const totalKeys = this.apiKeys.length;
    let attempts = 0;

    while (attempts <= totalKeys) {
      try {
        return await operation();
      } catch (error: any) {
        const errMsg = error?.message?.toLowerCase() || '';
        if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('exhausted') || errMsg.includes('503')) {
          const failedKey = this.apiKeys[this.currentKeyIndex];
          this.markKeyAsExhausted(failedKey);
          attempts++;
          continue; // Vòng lặp sẽ gọi lại getActiveKey() trong operation() để lấy key mới
        }
        // Nếu lỗi do logic hoặc bad request (400), ném luôn ra ngoài, không retry
        throw error;
      }
    }

    throw new Error('ALL_KEYS_EXHAUSTED');
  }

  /**
   * Gọi LLM trả về text.
   */
  public async invoke(messages: any[], options?: { temperature?: number, searchGrounding?: boolean }): Promise<any> {
    return this.executeWithFailover(async () => {
      const model = this.getModelWithOptions(options);
      return await model.invoke(messages);
    });
  }

  /**
   * Gọi LLM trả về JSON Structured Output.
   */
  public async invokeStructured(schema: any, prompt: string | any[], options?: { temperature?: number, name?: string }): Promise<any> {
    return this.executeWithFailover(async () => {
      const model = this.getModelWithOptions(options);
      const structuredOptions = options?.name ? { name: options.name } : undefined;
      const structuredLlm = model.withStructuredOutput(schema, structuredOptions);
      return await structuredLlm.invoke(prompt);
    });
  }
}
