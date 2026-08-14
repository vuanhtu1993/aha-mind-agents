import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

export interface ActiveJobData {
  pluginId: string;
  pipeline: string;
  startedAt: number;
}

export interface FormattedActiveJob {
  _id: string;
  jobId: string;
  pluginId: string;
  pipeline: string;
  status: string;
  currentStep: string;
  steps: string[];
  startedAt: number;
  createdAt: string;
  durationMs: number;
  [key: string]: unknown;
}

@Injectable()
export class ActiveJobTrackerService {
  private readonly logger = new Logger(ActiveJobTrackerService.name);
  private redisClient: Redis;
  private readonly activeJobSetKey = 'active_jobs_set';

  constructor(private readonly configService: ConfigService) {
    const redisUri =
      this.configService.get<string>('REDIS_URI') ||
      this.configService.get<string>('REDIS_URL') ||
      process.env.REDIS_URI ||
      process.env.REDIS_URL ||
      'redis://localhost:6379';

    this.redisClient = new Redis(redisUri, {
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      },
    });

    this.redisClient.on('error', (err) =>
      this.logger.error(`ActiveJobTracker Redis Client Error: ${err.message}`),
    );
  }

  /**
   * Ghi nhận Job bắt đầu chạy vào Redis Hash + Thêm ID vào Redis Set (TTL 30 phút tự dọn sạch)
   */
  async registerActiveJob(jobId: string, data: ActiveJobData): Promise<void> {
    if (this.redisClient?.status !== 'ready') return;
    const key = `active_job:${jobId}`;
    try {
      await this.redisClient.hset(
        key,
        'jobId',
        jobId,
        'pluginId',
        data.pluginId,
        'pipeline',
        data.pipeline,
        'status',
        'running',
        'currentStep',
        'Đang khởi tạo Agent...',
        'steps',
        JSON.stringify([]),
        'startedAt',
        String(data.startedAt),
      );
      await this.redisClient.expire(key, 1800);
      await this.redisClient.sadd(this.activeJobSetKey, jobId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lỗi khi registerActiveJob [${jobId}]: ${msg}`);
    }
  }

  /**
   * Cập nhật currentStep và lưu lại danh sách các bước đã hoàn thành trong Redis Hash
   */
  async updateActiveJobStep(
    jobId: string,
    currentStep: string,
    completedStepName?: string,
  ): Promise<void> {
    if (this.redisClient?.status !== 'ready') return;
    const key = `active_job:${jobId}`;

    if (completedStepName) {
      try {
        const existingStepsRaw = await this.redisClient.hget(key, 'steps');
        const steps: string[] = existingStepsRaw ? JSON.parse(existingStepsRaw) : [];
        if (!steps.includes(completedStepName)) {
          steps.push(completedStepName);
          await this.redisClient.hset(
            key,
            'steps',
            JSON.stringify(steps),
            'currentStep',
            currentStep,
          );
          return;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Lỗi cập nhật steps trong Redis cho Job [${jobId}]: ${msg}`,
        );
      }
    }

    try {
      await this.redisClient.hset(key, 'currentStep', currentStep);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lỗi cập nhật currentStep trong Redis: ${msg}`);
    }
  }

  /**
   * Xóa Active Job khỏi Redis Hash và Redis Set khi Job kết thúc
   */
  async removeActiveJob(jobId: string): Promise<void> {
    if (this.redisClient?.status !== 'ready') return;
    try {
      await this.redisClient.del(`active_job:${jobId}`);
      await this.redisClient.srem(this.activeJobSetKey, jobId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lỗi khi removeActiveJob [${jobId}]: ${msg}`);
    }
  }

  /**
   * Lấy tất cả Active Jobs đang chạy từ Redis Hash bằng Redis Set (O(1) lookup thay vì KEYS * O(N))
   */
  async getActiveJobs(): Promise<FormattedActiveJob[]> {
    if (this.redisClient?.status !== 'ready') return [];
    try {
      const jobIds = await this.redisClient.smembers(this.activeJobSetKey);
      if (!jobIds.length) return [];

      const jobsRaw = await Promise.all(
        jobIds.map(async (id) => {
          const key = `active_job:${id}`;
          const jobData = await this.redisClient.hgetall(key);
          if (!jobData || !Object.keys(jobData).length) {
            // Dangling ID trong set mà key hash đã expire -> Dọn dẹp
            await this.redisClient.srem(this.activeJobSetKey, id);
            return null;
          }
          return jobData;
        }),
      );

      const validJobs = jobsRaw.filter(
        (job): job is Record<string, string> => job !== null,
      );

      return validJobs.map((job) => {
        let steps: string[] = [];
        try {
          steps = job.steps ? JSON.parse(job.steps) : [];
        } catch {
          steps = [];
        }

        const startTimeNum = Number(job.startedAt) || Date.now();

        return {
          ...job,
          _id: job.jobId || randomUUID(),
          jobId: job.jobId || '',
          pluginId: job.pluginId || '',
          pipeline: job.pipeline || '',
          status: job.status || 'running',
          currentStep: job.currentStep || '',
          steps,
          startedAt: startTimeNum,
          createdAt: new Date(startTimeNum).toISOString(),
          durationMs: Math.max(0, Date.now() - startTimeNum),
        };
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lỗi khi getActiveJobs: ${msg}`);
      return [];
    }
  }
}
