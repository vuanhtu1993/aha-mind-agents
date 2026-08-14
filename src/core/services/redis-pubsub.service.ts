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
  data?: any;
}

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private pubClient: Redis;
  private subClient: Redis;
  private readonly channel = 'dashboard:job-events';
  private readonly instanceId = randomUUID();

  // Luồng sự kiện nội bộ để các Controller có thể subscribe (RxJS)
  public readonly events$ = new Subject<JobEventPayload>();

  constructor(private readonly configService: ConfigService) { }

  onModuleInit() {
    const redisUri = this.configService.get<string>('REDIS_URI') ||
      this.configService.get<string>('REDIS_URL') ||
      process.env.REDIS_URI ||
      process.env.REDIS_URL ||
      'redis://localhost:6379';

    this.logger.log(`Khởi tạo Redis Pub/Sub kết nối tới redis server
      `);

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
          const payload: JobEventPayload & { _instanceId?: string } = JSON.parse(message);
          // Bỏ qua nếu message đến từ chính instance này (đã được emit trực tiếp trong publishEvent)
          if (payload._instanceId && payload._instanceId === this.instanceId) {
            return;
          }
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
   * Phát (Publish) một sự kiện lên kênh thông báo (bắn vào events$ nội bộ ngay tức thì + publish lên Redis)
   */
  async publishEvent(payload: JobEventPayload) {
    // 1. Phát trực tiếp vào luồng nội bộ (RxJS) để SSE client lập tức nhận được (0ms latency)
    this.events$.next(payload);

    // 2. Broadcast qua Redis Pub/Sub cho các instance khác
    if (this.pubClient?.status === 'ready') {
      try {
        await this.pubClient.publish(this.channel, JSON.stringify({ ...payload, _instanceId: this.instanceId }));
      } catch (error: any) {
        this.logger.error(`Lỗi khi publish sự kiện ${payload.type}: ${error.message}`);
      }
    }
  }

  /**
   * Ghi nhận Job bắt đầu chạy vào Redis Hash (TTL 30 phút tự dọn sạch)
   */
  async registerActiveJob(jobId: string, data: {
    pluginId: string;
    pipeline: string;
    startedAt: number;
  }) {
    if (this.pubClient?.status !== 'ready') return;
    const key = `active_job:${jobId}`;
    await this.pubClient.hset(key,
      'jobId', jobId,
      'pluginId', data.pluginId,
      'pipeline', data.pipeline,
      'status', 'running',
      'currentStep', 'Đang khởi tạo Agent...',
      'steps', JSON.stringify([]),
      'startedAt', String(data.startedAt),
    );
    await this.pubClient.expire(key, 1800);
  }

  /**
   * Cập nhật currentStep và lưu lại danh sách các bước đã hoàn thành trong Redis Hash (0 DB Write, O(1))
   */
  async updateActiveJobStep(jobId: string, currentStep: string, completedStepName?: string) {
    if (this.pubClient?.status !== 'ready') return;
    const key = `active_job:${jobId}`;

    if (completedStepName) {
      try {
        const existingStepsRaw = await this.pubClient.hget(key, 'steps');
        const steps: string[] = existingStepsRaw ? JSON.parse(existingStepsRaw) : [];
        if (!steps.includes(completedStepName)) {
          steps.push(completedStepName);
          await this.pubClient.hset(key, 'steps', JSON.stringify(steps), 'currentStep', currentStep);
          return;
        }
      } catch (err) {
        this.logger.error(`Lỗi cập nhật steps trong Redis: ${err}`);
      }
    }

    await this.pubClient.hset(key, 'currentStep', currentStep);
  }

  /**
   * Xóa Active Job khỏi Redis khi Job kết thúc
   */
  async removeActiveJob(jobId: string) {
    if (this.pubClient?.status !== 'ready') return;
    await this.pubClient.del(`active_job:${jobId}`);
  }

  /**
   * Lấy tất cả Active Jobs đang chạy từ Redis Hash để trả về cho Dashboard khi Client reload
   */
  async getActiveJobs(): Promise<any[]> {
    if (this.pubClient?.status !== 'ready') return [];
    const keys = await this.pubClient.keys('active_job:*');
    if (!keys.length) return [];

    const jobs = await Promise.all(
      keys.map(key => this.pubClient.hgetall(key))
    );
    return jobs
      .filter(Boolean)
      .map(job => {
        let steps: string[] = [];
        try {
          steps = job.steps ? JSON.parse(job.steps) : [];
        } catch {
          steps = [];
        }

        // Xử lý an toàn cho startedAt để tránh RangeError: Invalid time value khi toISOString()
        let startTimeNum = Date.now();
        if (job.startedAt) {
          const parsedNum = Number(job.startedAt);
          if (!isNaN(parsedNum) && parsedNum > 0) {
            startTimeNum = parsedNum;
          } else {
            const parsedDate = new Date(job.startedAt).getTime();
            if (!isNaN(parsedDate) && parsedDate > 0) {
              startTimeNum = parsedDate;
            }
          }
        }

        return {
          ...job,
          _id: job.jobId || randomUUID(),
          steps,
          startedAt: startTimeNum,
          createdAt: new Date(startTimeNum).toISOString(),
          durationMs: Math.max(0, Date.now() - startTimeNum),
        };
      });
  }
}
