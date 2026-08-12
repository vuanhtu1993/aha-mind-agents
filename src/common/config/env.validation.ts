import { z } from 'zod';

/**
 * Schema kiểm tra nghiêm ngặt toàn bộ biến môi trường của hệ thống aha-mind-agents.
 *
 * Triết lý thiết kế (Fail-fast Principle):
 * Nếu thiếu các cấu hình cốt lõi (như MONGODB_URI hay GOOGLE_API_KEY),
 * ứng dụng sẽ dừng ngay lập tức tại thời điểm khởi động (Bootstrapping Phase)
 * thay vì đợi đến lúc người dùng gọi API mới gặp lỗi runtime bí ẩn.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Cơ sở dữ liệu MongoDB Atlas (Bắt buộc)
  MONGODB_URI: z.string().min(1, 'MONGODB_URI không được để trống'),

  // Cấu hình Redis (Cho BullMQ Job Queue và SSE Pub/Sub)
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Google Gemini AI Configuration
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),

  // Google Cloud TTS Key (Cho giọng đọc và ngữ âm IPA)
  GOOGLE_CLOUD_TTS_KEY: z.string().optional(),
  GOOGLE_TTS_RATE_LIMIT_RPM: z.coerce.number().default(30),
  GOOGLE_CLOUD_TTS_MODEL: z.string().default('en-US-Journey-F'),

  // Bảo mật Dashboard & Internal Webhooks
  CRON_SECRET: z.string().default('aha-mind-secret-2026'),
}).passthrough();

export type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Hàm validation được tích hợp trực tiếp vào NestJS ConfigModule.
 * Tự động parse và chuẩn hóa kiểu dữ liệu cho toàn bộ project.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = EnvSchema.safeParse(config);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => `  - [${err.path.join('.')}] ${err.message}`)
      .join('\n');

    throw new Error(
      `\n❌ [EnvValidation] Phát hiện lỗi cấu hình biến môi trường (.env):\n${formattedErrors}\n`
    );
  }

  return result.data;
}
