/**
 * @file speaking-quiz.worker.ts
 * @description BullMQ Background Processor thực thi LangGraph StateGraph cho Speaking Quiz
 *
 * Made by Anh Tu - Share to be share
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SpeakingQuizPipelineService } from './pipelines/speaking-quiz.pipeline';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';

@Processor('speaking-quiz-queue')
export class SpeakingQuizWorker extends WorkerHost {
  private readonly logger = new Logger(SpeakingQuizWorker.name);

  constructor(
    private readonly pipelineService: SpeakingQuizPipelineService,
    private readonly redisPubSub: RedisPubSubService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const jobId = job.id || `job-sq-${Date.now()}`;
    this.logger.log(`Bắt đầu xử lý Job [${jobId}] trong hàng đợi speaking-quiz-queue...`);

    const context = {
      jobId,
      log: (msg: string, meta?: any) => {
        this.logger.log(`[Job ${jobId}] ${msg} ${meta ? JSON.stringify(meta) : ''}`);
      },
    };

    // Bắn sự kiện khởi chạy
    await this.redisPubSub.publishEvent({
      type: 'JOB_STARTED',
      jobId,
      pluginId: 'speaking-quiz',
      pipeline: 'generate',
      timestamp: Date.now(),
    });

    try {
      const stream$ = this.pipelineService.execute(job.data, context);

      let finalResult: any = null;

      await new Promise<void>((resolve, reject) => {
        stream$.subscribe({
          next: (event) => {
            // Gán finalResult đồng bộ ngay khi nhận event hoàn tất
            if (event.status === 'done' && event.payload) {
              finalResult = event.payload;
            } else if (event.payload?.questionId && !finalResult) {
              finalResult = event.payload;
            }

            if (event.progress !== undefined) {
              job.updateProgress(event.progress).catch(() => {});
            }

            // Broadcast tiến trình qua Redis Pub/Sub cho SSE subscribers
            this.redisPubSub.publishEvent({
              type: event.status === 'done' ? 'JOB_COMPLETED' : 'JOB_STEP',
              jobId,
              pluginId: 'speaking-quiz',
              timestamp: Date.now(),
              data: event,
            }).catch((err) => {
              this.logger.error(`Redis publish error: ${err.message}`);
            });
          },
          error: (err) => reject(err),
          complete: () => resolve(),
        });
      });

      // Bắn sự kiện tổng kết cuối cùng với payload đầy đủ
      await this.redisPubSub.publishEvent({
        type: 'JOB_COMPLETED',
        jobId,
        pluginId: 'speaking-quiz',
        pipeline: 'generate',
        timestamp: Date.now(),
        data: {
          jobId,
          status: 'done',
          progress: 100,
          message: 'Speaking quiz generation completed',
          payload: finalResult,
          result: finalResult,
        },
      });

      this.logger.log(`✅ Hoàn thành Job [${jobId}] thành công.`);
      return finalResult;
    } catch (err: any) {
      this.logger.error(`❌ Job [${jobId}] thất bại: ${err.message}`);

      await this.redisPubSub.publishEvent({
        type: 'JOB_FAILED',
        jobId,
        pluginId: 'speaking-quiz',
        pipeline: 'generate',
        timestamp: Date.now(),
        data: { error: err.message },
      });

      throw err;
    }
  }
}
