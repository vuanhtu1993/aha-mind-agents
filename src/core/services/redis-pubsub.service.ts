import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Subject } from 'rxjs';

export interface JobEventPayload {
  type: 'JOB_STARTED' | 'JOB_STEP' | 'JOB_COMPLETED' | 'JOB_FAILED';
  jobId: string;
  pluginId?: string;
  pipeline?: string;
  timestamp: number;
  data?: any;
}

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private pubClient: Redis;
  private subClient: Redis;
  private readonly channel = 'dashboard:job-events';

  // Luồng sự kiện nội bộ để các Controller có thể subscribe (RxJS)
  public readonly events$ = new Subject<JobEventPayload>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisUri = this.configService.get<string>('REDIS_URI') || 
                     this.configService.get<string>('REDIS_URL') || 
                     process.env.REDIS_URI || 
                     process.env.REDIS_URL || 
                     'redis://localhost:6379';
    
    this.logger.log(`Khởi tạo Redis Pub/Sub kết nối tới: ${redisUri}`);

    // Khởi tạo Publisher Client
    this.pubClient = new Redis(redisUri, {
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      }
    });

    // Khởi tạo Subscriber Client
    this.subClient = new Redis(redisUri, {
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      }
    });

    this.pubClient.on('error', (err) => this.logger.error(`Publisher Client Error: ${err.message}`));
    this.subClient.on('error', (err) => this.logger.error(`Subscriber Client Error: ${err.message}`));
    
    this.pubClient.on('connect', () => this.logger.log('✅ Publisher Client Connected.'));
    
    this.subClient.on('connect', () => {
      this.logger.log('✅ Subscriber Client Connected.');
    });

    // Chỉ đăng ký subscribe 1 lần duy nhất (ioredis sẽ tự động quản lý việc reconnect và queue)
    this.subClient.subscribe(this.channel).catch(err => {
      this.logger.error(`Lỗi khi subscribe: ${err.message}`);
    });

    // Lắng nghe tin nhắn từ Redis và phát vào luồng RxJS nội bộ
    this.subClient.on('message', (ch, message) => {
      if (ch === this.channel) {
        try {
          const payload: JobEventPayload = JSON.parse(message);
          this.events$.next(payload);
        } catch (error) {
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
   * Phát (Publish) một sự kiện lên kênh thông báo
   */
  async publishEvent(payload: JobEventPayload) {
    if (this.pubClient.status !== 'ready') return;
    
    try {
      await this.pubClient.publish(this.channel, JSON.stringify(payload));
    } catch (error: any) {
      this.logger.error(`Lỗi khi publish sự kiện ${payload.type}: ${error.message}`);
    }
  }
}
