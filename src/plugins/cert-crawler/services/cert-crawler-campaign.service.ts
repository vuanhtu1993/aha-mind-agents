/**
 * @file cert-crawler-campaign.service.ts
 * @description Quản lý vòng đời chiến dịch đồng bộ (Batch Campaign Aggregator) cho Cert Crawler
 * Giảm tải ghi vết và SSE Heartbeat throttling cho Admin Dashboard
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { AgentExecLog } from '../../../infra/database/schemas/agent-log.schema';
import { AHA_MIND_CONNECTION } from '../../../infra/database/database.constants';
import { RedisPubSubService } from '../../../core/services/redis-pubsub.service';
import {
  CERT_CRAWLER_QUEUE,
  CERT_CAMPAIGN_PREFIX,
  CERT_CAMPAIGN_THROTTLE_STEP,
} from '../cert-crawler.constants';

@Injectable()
export class CertCrawlerCampaignService {
  private readonly logger = new Logger(CertCrawlerCampaignService.name);

  constructor(
    @InjectModel(AgentExecLog.name, AHA_MIND_CONNECTION)
    private readonly agentExecLogModel: Model<AgentExecLog>,
    private readonly redisPubSub: RedisPubSubService,
    @InjectQueue(CERT_CRAWLER_QUEUE)
    private readonly crawlerQueue: Queue,
  ) {}

  /**
   * Lấy Redis Client từ BullMQ Queue
   */
  private async getRedisClient() {
    return await this.crawlerQueue.client;
  }

  /**
   * Tạo Redis Key đếm tiến độ câu hỏi cho Campaign
   */
  private getProgressKey(campaignId: string): string {
    return `${CERT_CAMPAIGN_PREFIX}:${campaignId}:progress`;
  }

  /**
   * Khởi tạo chiến dịch đồng bộ mới: tạo 1 bản ghi AgentExecLog đại diện và publish JOB_STARTED
   */
  async startCampaign(certId: string, totalQuestions: number): Promise<string> {
    const campaignId = `sync-${certId}-${Date.now()}`;

    try {
      // 1. Tạo bản ghi cha đại diện cho toàn bộ batch campaign trong MongoDB
      await this.agentExecLogModel.create({
        jobId: campaignId,
        agentId: 'cert-crawler',
        pipeline: 'sync',
        status: 'running',
        timeline: [
          {
            nodeName: 'batch-crawling',
            status: 'running',
            durationMs: 0,
            timestamp: new Date(),
          },
        ],
      });

      // 2. Publish sự kiện JOB_STARTED lên Redis Pub/Sub để Dashboard hiển thị tiến trình
      await this.redisPubSub.publishEvent({
        type: 'JOB_STARTED',
        jobId: campaignId,
        pluginId: 'cert-crawler',
        pipeline: 'sync',
        timestamp: Date.now(),
      });

      // 3. Khởi tạo biến đếm số câu đã cào trong Redis với TTL 24 giờ
      const redis = await this.getRedisClient();
      await (redis as any).set(this.getProgressKey(campaignId), '0', 'EX', 86400);

      this.logger.log(
        `🚀 [Campaign Started] [${campaignId}] Bắt đầu cào ${totalQuestions} câu hỏi cho [${certId}]`,
      );
    } catch (err: any) {
      // Fail-Safe: Lỗi tracking không làm gãy luồng xử lý cào chính
      this.logger.error(`[Campaign ${campaignId}] Lỗi startCampaign: ${err.message}`);
    }

    return campaignId;
  }

  /**
   * Ghi nhận tiến độ sau mỗi câu hỏi hoàn tất.
   * Điều tiết SSE (Throttling) chỉ phát tín hiệu mỗi 20 câu hoặc khi hoàn tất toàn bộ.
   */
  async recordProgress(
    campaignId?: string,
    certId?: string,
    totalQuestions?: number,
  ): Promise<number> {
    if (!campaignId) return 0;

    try {
      const redis = (await this.getRedisClient()) as any;
      const progressKey = this.getProgressKey(campaignId);
      const count = await redis.incr(progressKey);
      await redis.expire(progressKey, 86400);

      const total = totalQuestions || 0;

      // Nếu đã hoàn thành tất cả câu hỏi trong batch
      if (total > 0 && count >= total) {
        await this.finishCampaign(campaignId, certId || '', count);
        return count;
      }

      // Throttling: Chỉ bắn sự kiện SSE khi đạt mốc bộ số của 20
      if (count % CERT_CAMPAIGN_THROTTLE_STEP === 0) {
        const progress = total > 0 ? Math.min(Math.round((count / total) * 100), 99) : 0;
        await this.redisPubSub.publishEvent({
          type: 'JOB_STEP',
          jobId: campaignId,
          pluginId: 'cert-crawler',
          pipeline: 'sync',
          timestamp: Date.now(),
          data: {
            jobId: campaignId,
            stepId: 'batch-crawling',
            status: 'running',
            progress,
            message: `Đang cào dữ liệu: đã hoàn thành ${count}/${total} câu hỏi`,
          },
        });
      }

      return count;
    } catch (err: any) {
      this.logger.error(`[Campaign ${campaignId}] Lỗi recordProgress: ${err.message}`);
      return 0;
    }
  }

  /**
   * Đánh dấu chiến dịch hoàn tất thành công (Idempotent)
   */
  async finishCampaign(
    campaignId?: string,
    certId?: string,
    successCount: number = 0,
  ): Promise<void> {
    if (!campaignId) return;

    try {
      const existing = await this.agentExecLogModel.findOne({ jobId: campaignId });
      if (!existing || existing.status === 'completed') {
        return;
      }

      const startTime = (existing as any)?.createdAt
        ? new Date((existing as any).createdAt).getTime()
        : Date.now();
      const durationMs = Math.max(0, Date.now() - startTime);

      await this.agentExecLogModel.updateOne(
        { jobId: campaignId },
        {
          $set: {
            status: 'completed',
            durationMs,
            timeline: [
              {
                nodeName: 'batch-crawling',
                status: 'completed',
                durationMs,
                timestamp: new Date(),
              },
            ],
          },
        },
      );

      await this.redisPubSub.publishEvent({
        type: 'JOB_COMPLETED',
        jobId: campaignId,
        pluginId: 'cert-crawler',
        pipeline: 'sync',
        timestamp: Date.now(),
        data: {
          status: 'done',
          progress: 100,
          message: `Đồng bộ hoàn tất chứng chỉ [${certId || ''}]: thành công ${successCount} câu hỏi`,
        },
      });

      this.logger.log(
        `🎉 [Campaign Completed] [${campaignId}] Đã cào thành công ${successCount} câu trong ${durationMs}ms`,
      );
    } catch (err: any) {
      this.logger.error(`[Campaign ${campaignId}] Lỗi finishCampaign: ${err.message}`);
    }
  }

  /**
   * Đánh dấu chiến dịch thất bại (ví dụ khi dính Circuit Breaker 429) (Idempotent)
   */
  async failCampaign(
    campaignId?: string,
    certId?: string,
    errorMsg: string = '',
  ): Promise<void> {
    if (!campaignId) return;

    try {
      const existing = await this.agentExecLogModel.findOne({ jobId: campaignId });
      if (!existing || existing.status === 'failed') {
        return;
      }

      const startTime = (existing as any)?.createdAt
        ? new Date((existing as any).createdAt).getTime()
        : Date.now();
      const durationMs = Math.max(0, Date.now() - startTime);

      await this.agentExecLogModel.updateOne(
        { jobId: campaignId },
        {
          $set: {
            status: 'failed',
            durationMs,
            error: { message: errorMsg },
            timeline: [
              {
                nodeName: 'batch-crawling',
                status: 'failed',
                durationMs,
                timestamp: new Date(),
              },
            ],
          },
        },
      );

      await this.redisPubSub.publishEvent({
        type: 'JOB_FAILED',
        jobId: campaignId,
        pluginId: 'cert-crawler',
        pipeline: 'sync',
        timestamp: Date.now(),
        data: {
          error: errorMsg,
        },
      });

      this.logger.warn(
        `🛑 [Campaign Failed] [${campaignId}] Thất bại sau ${durationMs}ms: ${errorMsg}`,
      );
    } catch (err: any) {
      this.logger.error(`[Campaign ${campaignId}] Lỗi failCampaign: ${err.message}`);
    }
  }
}
