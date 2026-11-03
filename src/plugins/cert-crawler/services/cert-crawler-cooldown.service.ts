/**
 * @file cert-crawler-cooldown.service.ts
 * @description Dịch vụ quản lý cờ Cooldown và Giãn cách Rate Limit theo từng nguồn (Source-Scoped)
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CERT_CRAWLER_QUEUE,
  CERT_COOLDOWN_PREFIX,
  DEFAULT_CRAWLER_SOURCE,
  DEFAULT_COOLDOWN_DURATION_MS,
} from '../cert-crawler.constants';

export interface CooldownStatus {
  isLocked: boolean;
  remainingMinutes: number;
  lockedUntil: Date | null;
  source: string;
}

@Injectable()
export class CertCrawlerCooldownService {
  private readonly logger = new Logger(CertCrawlerCooldownService.name);

  constructor(
    @InjectQueue(CERT_CRAWLER_QUEUE) private readonly crawlerQueue: Queue,
  ) {}

  /**
   * Tạo key Redis chuẩn hóa theo từng nguồn
   */
  private getCooldownKey(source: string): string {
    const cleanSource = source.trim().toLowerCase() || DEFAULT_CRAWLER_SOURCE;
    return `${CERT_COOLDOWN_PREFIX}:${cleanSource}`;
  }

  /**
   * Lấy Redis client từ BullMQ Queue
   */
  private async getRedisClient() {
    return this.crawlerQueue.client;
  }

  /**
   * Kiểm tra trạng thái giãn cách (cooldown) của một nguồn
   */
  async getCooldownStatus(source: string = DEFAULT_CRAWLER_SOURCE): Promise<CooldownStatus> {
    const redis = await this.getRedisClient();
    const key = this.getCooldownKey(source);
    const lockedUntilVal = await redis.get(key);

    if (!lockedUntilVal) {
      return {
        isLocked: false,
        remainingMinutes: 0,
        lockedUntil: null,
        source,
      };
    }

    const lockedUntilMs = parseInt(lockedUntilVal, 10);
    const remainingMs = lockedUntilMs - Date.now();

    if (isNaN(lockedUntilMs) || remainingMs <= 0) {
      // Khóa đã hết hạn nhưng Redis chưa kịp dọn
      await redis.del(key);
      return {
        isLocked: false,
        remainingMinutes: 0,
        lockedUntil: null,
        source,
      };
    }

    return {
      isLocked: true,
      remainingMinutes: Math.ceil(remainingMs / 60000),
      lockedUntil: new Date(lockedUntilMs),
      source,
    };
  }

  /**
   * Kích hoạt cờ cooldown cho một nguồn
   */
  async setCooldown(
    source: string = DEFAULT_CRAWLER_SOURCE,
    durationMs: number = DEFAULT_COOLDOWN_DURATION_MS,
  ): Promise<void> {
    const redis = await this.getRedisClient();
    const key = this.getCooldownKey(source);
    const lockedUntilMs = Date.now() + durationMs;

    // Lưu mốc thời gian hết hạn và đặt TTL dạng millisecond (PX)
    await (redis as any).set(key, lockedUntilMs.toString(), 'PX', durationMs);

    this.logger.warn(
      `🛑 [Cooldown Activated] Nguồn [${source}] bị kích hoạt giãn cách ${Math.ceil(durationMs / 60000)} phút (Mở lại lúc: ${new Date(lockedUntilMs).toISOString()})`,
    );
  }

  /**
   * Mở khóa thủ công cho một nguồn (ví dụ khi người dùng đổi Cookie mới)
   */
  async resetCooldown(source: string = DEFAULT_CRAWLER_SOURCE): Promise<void> {
    const redis = await this.getRedisClient();
    const key = this.getCooldownKey(source);
    await redis.del(key);

    this.logger.log(`🟢 [Cooldown Reset] Đã mở khóa giãn cách thủ công cho nguồn [${source}]`);
  }
}
