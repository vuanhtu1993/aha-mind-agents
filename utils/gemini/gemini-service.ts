import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { geminiRateLimiter } from "./rate-limiter";

export class GeminiService {
  private static instance: GeminiService;
  private llm!: ChatGoogleGenerativeAI;
  
  private apiKeys: string[] = [];
  private currentKeyIndex: number = 0;

  // Expose llm for cases where custom temp/maxTokens is needed, though prefer using methods below.
  public get baseLlm(): ChatGoogleGenerativeAI {
    return this.llm;
  }

  private constructor() {
    this.initKeys();
    this.initLlm();
  }

  private initKeys() {
    const keys: string[] = [];
    
    // Quét toàn bộ biến môi trường, lấy những biến bắt đầu bằng GOOGLE_API_KEY
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith("GOOGLE_API_KEY") && value) {
        // Cắt bằng dấu phẩy đề phòng user khai báo 1 biến có nhiều key, và dọn dẹp khoảng trắng
        const extractedKeys = value.split(",").map(k => k.trim()).filter(k => k.length > 0);
        keys.push(...extractedKeys);
      }
    }

    // Xóa các key trùng lặp
    this.apiKeys = Array.from(new Set(keys));

    if (this.apiKeys.length === 0) {
      console.error("[GeminiService] ❌ Không tìm thấy API Key nào trong .env (các biến bắt đầu bằng GOOGLE_API_KEY)");
      process.exit(1);
    }
  }

  private initLlm() {
    const currentKey = this.apiKeys[this.currentKeyIndex] || "";
    this.llm = new ChatGoogleGenerativeAI({
      apiKey: currentKey,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      temperature: 0.1, // Default temperature, can be customized locally if needed
      maxRetries: 2,
    });
  }

  public static getInstance(): GeminiService {
    if (!GeminiService.instance) {
      GeminiService.instance = new GeminiService();
    }
    return GeminiService.instance;
  }

  /**
   * Đổi sang API Key tiếp theo nếu có lỗi Quota.
   * Trả về true nếu đổi thành công, false nếu đã hết tất cả các keys.
   */
  private rotateKey(): boolean {
    this.currentKeyIndex++;
    if (this.currentKeyIndex >= this.apiKeys.length) {
      console.error(`[GeminiService] ❌ Đã dùng hết toàn bộ ${this.apiKeys.length} API Keys. Hệ thống sẽ dừng!`);
      return false; // Hết key
    }
    console.log(`\n[GeminiService] 🔄 Tự động chuyển sang API Key thứ ${this.currentKeyIndex + 1}/${this.apiKeys.length}...`);
    this.initLlm();
    return true;
  }

  /**
   * Helper function bọc execution block trong vòng lặp retry API Key.
   */
  private async executeWithRotation<T>(
    estimatedTokens: number, 
    operation: () => Promise<T>
  ): Promise<T> {
    while (true) {
      try {
        return await geminiRateLimiter.execute(estimatedTokens, async () => {
          return await operation();
        });
      } catch (error: any) {
        const errMsg = error?.message?.toLowerCase() || '';
        if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('exhausted') || errMsg.includes('503')) {
           console.warn(`[GeminiService] ⚠️ Lỗi Quota/429/503 ở API Key thứ ${this.currentKeyIndex + 1}. Đang thử Rotate Key...`);
           const hasNextKey = this.rotateKey();
           if (hasNextKey) {
             continue; // Thử lại vòng lặp với Key mới
           }
        }
        throw error; // Quăng lỗi ra nếu không phải lỗi quota hoặc hết key
      }
    }
  }

  /**
   * Khởi tạo một LLM tạm thời nếu cần override cấu hình (ví dụ temperature)
   * Vẫn sử dụng API key đang active (sau khi rotate).
   */
  private getModelWithOptions(options?: { temperature?: number, searchGrounding?: boolean }): ChatGoogleGenerativeAI {
    if (!options || (options.temperature === undefined && options.searchGrounding === undefined)) {
      return this.llm;
    }
    const config: any = {
      apiKey: this.apiKeys[this.currentKeyIndex] || "",
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      temperature: options.temperature !== undefined ? options.temperature : 0.1,
      maxRetries: 2,
    };
    if (options.searchGrounding) {
      config.searchGrounding = true;
    }
    return new ChatGoogleGenerativeAI(config);
  }

  /**
   * Gọi LLM thông thường (trả về nội dung dạng text).
   * Tự động ước tính số lượng tokens để truyền cho Rate Limiter.
   */
  public async invoke(messages: any[], options?: { temperature?: number, searchGrounding?: boolean }): Promise<any> {
    const textContent = messages.map(m => m.content?.toString() || "").join("\\n");
    const estimatedTokens = Math.ceil(textContent.length / 4);

    return await this.executeWithRotation(estimatedTokens, async () => {
      const model = this.getModelWithOptions(options);
      return await model.invoke(messages);
    });
  }

  /**
   * Gọi LLM trả về Structured Output (JSON).
   */
  public async invokeStructured(schema: any, prompt: string | any[], options?: { temperature?: number, name?: string }): Promise<any> {
    const promptText = typeof prompt === "string" 
      ? prompt 
      : prompt.map(m => m.content?.toString() || "").join("\\n");
      
    const estimatedTokens = Math.ceil(promptText.length / 4);

    return await this.executeWithRotation(estimatedTokens, async () => {
      const model = this.getModelWithOptions(options);
      const structuredOptions = options?.name ? { name: options.name } : undefined;
      const structuredLlm = model.withStructuredOutput(schema, structuredOptions);
      return await structuredLlm.invoke(prompt);
    });
  }
}

export const geminiService = GeminiService.getInstance();
