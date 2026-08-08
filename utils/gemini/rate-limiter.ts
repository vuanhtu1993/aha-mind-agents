export class GeminiRateLimiter {
  private static instance: GeminiRateLimiter;

  // Giới hạn theo Gemini Free Tier (Minute Limit)
  private readonly RPM_LIMIT = 5;
  private readonly TPM_LIMIT = 250000;

  // Trạng thái cục bộ (per minute)
  private requestsThisMinute = 0;
  private tokensThisMinute = 0;
  private lastMinuteResetTime = Date.now();

  // Hàng đợi các request đang chờ
  private queue: Array<() => void> = [];
  private isProcessing = false;

  private constructor() {}

  public static getInstance(): GeminiRateLimiter {
    if (!GeminiRateLimiter.instance) {
      GeminiRateLimiter.instance = new GeminiRateLimiter();
    }
    return GeminiRateLimiter.instance;
  }

  /**
   * Hàm sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset bộ đếm phút nếu đã trôi qua 60 giây
   */
  private checkAndResetMinuteInterval() {
    const now = Date.now();
    if (now - this.lastMinuteResetTime >= 60000) {
      this.requestsThisMinute = 0;
      this.tokensThisMinute = 0;
      this.lastMinuteResetTime = now;
      console.log('[GeminiRateLimiter] 🔄 Đã reset quota của phút hiện tại.');
    }
  }

  /**
   * Hàm gọi chính để bọc các request LLM
   * @param estimatedTokens Số token ước tính của request
   * @param operation Khối lệnh gọi LLM (VD: `chain.invoke()`)
   */
  public async execute<T>(estimatedTokens: number, operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Đưa request vào hàng đợi
      this.queue.push(async () => {
        try {
          const result = await this.processRequest(estimatedTokens, operation);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      // Nếu hàng đợi chưa chạy, kích hoạt
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Logic xử lý hàng đợi
   */
  private async processQueue() {
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
      }
    }

    this.isProcessing = false;
  }

  /**
   * Chạy request và quản lý delay phút
   */
  private async processRequest<T>(estimatedTokens: number, operation: () => Promise<T>): Promise<T> {
    // 1. Kiểm tra RPM & TPM
    this.checkAndResetMinuteInterval();

    const willExceedRPM = this.requestsThisMinute + 1 > this.RPM_LIMIT;
    const willExceedTPM = this.tokensThisMinute + estimatedTokens > this.TPM_LIMIT;

    if (willExceedRPM || willExceedTPM) {
      const waitTimeMs = 60000 - (Date.now() - this.lastMinuteResetTime);
      console.log(`[GeminiRateLimiter] ⏳ Đạt giới hạn phút (RPM: ${this.requestsThisMinute}/${this.RPM_LIMIT}, TPM: ${this.tokensThisMinute}/${this.TPM_LIMIT}). Đang sleep ${Math.ceil(waitTimeMs / 1000)} giây...`);

      await this.sleep(waitTimeMs);

      // Sau khi sleep xong, reset lại bộ đếm phút ngay
      this.requestsThisMinute = 0;
      this.tokensThisMinute = 0;
      this.lastMinuteResetTime = Date.now();
    }

    // 2. Đánh dấu đã dùng request và token
    this.requestsThisMinute += 1;
    this.tokensThisMinute += estimatedTokens;

    console.log(`[GeminiRateLimiter] 🚀 Thực thi request (RPM: ${this.requestsThisMinute}/${this.RPM_LIMIT}, Tokens ~ ${estimatedTokens})`);

    // 3. Thực thi operation, catch lỗi RPD (429) và hiển thị warning
    try {
      return await operation();
    } catch (error: any) {
      throw error;
    }
  }
}

// Export một instance dùng chung cho toàn bộ agent
export const geminiRateLimiter = GeminiRateLimiter.getInstance();
