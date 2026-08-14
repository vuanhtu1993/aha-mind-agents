import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Subject } from 'rxjs';
import { randomUUID } from 'crypto';

export interface JobEventPayload {
  type: 'JOB_STARTED' | 'JOB_STEP' | 'JOB_COMPLETED' | 'JOB_FAILED';
  jobId: string;
  pluginId?: string;
  pipeline?: string;
  timestamp: number;
  data?: unknown;
}

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private pubClient: Redis;
  private subClient: Redis;
  private readonly channel = 'dashboard:job-events';
  private readonly instanceId = randomUUID();

  // Luồng sự kiện nội bộ để các Controller/Service có thể subscribe (RxJS)
  public readonly events$ = new Subject<JobEventPayload>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisUri =
      this.configService.get<string>('REDIS_URI') ||
      this.configService.get<string>('REDIS_URL') ||
      process.env.REDIS_URI ||
      process.env.REDIS_URL ||
      'redis://localhost:6379';

    this.logger.log('Khởi tạo Redis Pub/Sub client...');

    // Khởi tạo Publisher Client
    this.pubClient = new Redis(redisUri, {
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      },
    });

    // Khởi tạo Subscriber Client
    this.subClient = new Redis(redisUri, {
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      },
    });

    this.pubClient.on('error', (err) =>
      this.logger.error(`Publisher Client Error: ${err.message}`),
    );
    this.subClient.on('error', (err) =>
      this.logger.error(`Subscriber Client Error: ${err.message}`),
    );

    this.pubClient.on('connect', () =>
      this.logger.log('✅ Publisher Client Connected.'),
    );
    this.subClient.on('connect', () => {
      this.logger.log('✅ Subscriber Client Connected.');
    });

    // Subscribe channel
    this.subClient.subscribe(this.channel).catch((err) => {
      this.logger.error(`Lỗi khi subscribe: ${err.message}`);
    });

    // Lắng nghe tin nhắn từ Redis và phát vào luồng RxJS nội bộ
    this.subClient.on('message', (ch, message) => {
      if (ch === this.channel) {
        try {
          const payload: JobEventPayload & { _instanceId?: string } =
            JSON.parse(message);
          // Bỏ qua nếu message đến từ chính instance này
          if (payload._instanceId && payload._instanceId === this.instanceId) {
            return;
          }
          this.events$.next(payload);
        } catch (error: unknown) {
          this.logger.error(`Lỗi khi parse tin nhắn từ Redis: ${message}`);
        }
      }
    });
  }

  onModuleDestroy() {
    this.pubClient?.disconnect();
    this.subClient?.disconnect();
    this.events$.complete();
  }

  /**
   * Phát (Publish) một sự kiện lên kênh thông báo (bắn vào events$ nội bộ ngay tức thì + publish lên Redis)
   */
  async publishEvent(payload: JobEventPayload): Promise<void> {
    // 1. Phát trực tiếp vào luồng nội bộ (RxJS) để SSE client lập tức nhận được (0ms latency)
    this.events$.next(payload);

    // 2. Broadcast qua Redis Pub/Sub cho các instance khác
    if (this.pubClient?.status === 'ready') {
      try {
        await this.pubClient.publish(
          this.channel,
          JSON.stringify({ ...payload, _instanceId: this.instanceId }),
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Lỗi khi publish sự kiện ${payload.type}: ${msg}`,
        );
      }
    }
  }
}
