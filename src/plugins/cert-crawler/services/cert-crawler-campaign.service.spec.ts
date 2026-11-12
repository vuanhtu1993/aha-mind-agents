/**
 * @file cert-crawler-campaign.service.spec.ts
 * @description Unit tests cho CertCrawlerCampaignService (Batch Session Aggregator)
 *
 * Made by Anh Tu - Share to be share
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { CertCrawlerCampaignService } from './cert-crawler-campaign.service';
import { AgentExecLog } from '../../../infra/database/schemas/agent-log.schema';
import { AHA_MIND_CONNECTION } from '../../../infra/database/database.constants';
import { RedisPubSubService } from '../../../core/services/redis-pubsub.service';
import { CERT_CRAWLER_QUEUE } from '../cert-crawler.constants';

describe('CertCrawlerCampaignService', () => {
  let service: CertCrawlerCampaignService;

  const mockAgentExecLogModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const mockRedisPubSub = {
    publishEvent: jest.fn(),
  };

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
  };

  const mockQueue = {
    client: Promise.resolve(mockRedisClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertCrawlerCampaignService,
        {
          provide: getModelToken(AgentExecLog.name, AHA_MIND_CONNECTION),
          useValue: mockAgentExecLogModel,
        },
        {
          provide: RedisPubSubService,
          useValue: mockRedisPubSub,
        },
        {
          provide: getQueueToken(CERT_CRAWLER_QUEUE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<CertCrawlerCampaignService>(CertCrawlerCampaignService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startCampaign', () => {
    it('khởi tạo AgentExecLog và publish JOB_STARTED', async () => {
      mockAgentExecLogModel.create.mockResolvedValueOnce({ _id: 'mongo-id-1' });

      const certId = 'ab-730';
      const campaignId = await service.startCampaign(certId, 100);

      expect(campaignId).toMatch(/^sync-ab-730-\d+$/);

      // 1. Kiểm tra lưu AgentExecLog trạng thái running
      expect(mockAgentExecLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: campaignId,
          agentId: 'cert-crawler',
          pipeline: 'sync',
          status: 'running',
          timeline: expect.arrayContaining([
            expect.objectContaining({
              nodeName: 'batch-crawling',
              status: 'running',
            }),
          ]),
        }),
      );

      // 2. Kiểm tra publish JOB_STARTED lên Redis SSE
      expect(mockRedisPubSub.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'JOB_STARTED',
          jobId: campaignId,
          pluginId: 'cert-crawler',
          pipeline: 'sync',
        }),
      );

      // 3. Khởi tạo counter Redis
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `cert_crawler:campaign:${campaignId}:progress`,
        '0',
        'EX',
        86400,
      );
    });
  });

  describe('recordProgress', () => {
    it('tăng biến đếm nhưng KHÔNG publish JOB_STEP khi chưa chạm mốc throttle 20 câu', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(5);

      const campaignId = 'sync-ab-730-12345';
      const count = await service.recordProgress(campaignId, 'ab-730', 100);

      expect(count).toBe(5);
      expect(mockRedisClient.incr).toHaveBeenCalledWith(`cert_crawler:campaign:${campaignId}:progress`);
      expect(mockRedisPubSub.publishEvent).not.toHaveBeenCalled();
    });

    it('publish JOB_STEP khi biến đếm chạm đúng mốc 20 câu (throttle heartbeat)', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(20);

      const campaignId = 'sync-ab-730-12345';
      const count = await service.recordProgress(campaignId, 'ab-730', 100);

      expect(count).toBe(20);
      expect(mockRedisPubSub.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'JOB_STEP',
          jobId: campaignId,
          pluginId: 'cert-crawler',
          data: expect.objectContaining({
            jobId: campaignId,
            stepId: 'batch-crawling',
            status: 'running',
            progress: 20,
          }),
        }),
      );
    });

    it('tự động gọi finishCampaign khi đạt tổng số câu hỏi (processed >= totalQuestions)', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(50);
      mockAgentExecLogModel.findOne.mockResolvedValueOnce({
        jobId: 'sync-ab-730-12345',
        status: 'running',
        createdAt: new Date(Date.now() - 5000),
      });

      const campaignId = 'sync-ab-730-12345';
      const count = await service.recordProgress(campaignId, 'ab-730', 50);

      expect(count).toBe(50);
      // Kiểm tra finishCampaign được kích hoạt
      expect(mockAgentExecLogModel.updateOne).toHaveBeenCalledWith(
        { jobId: campaignId },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'completed',
          }),
        }),
      );
      expect(mockRedisPubSub.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'JOB_COMPLETED',
          jobId: campaignId,
          pluginId: 'cert-crawler',
        }),
      );
    });
  });

  describe('finishCampaign', () => {
    it('cập nhật AgentExecLog thành completed và phát JOB_COMPLETED', async () => {
      const campaignId = 'sync-ab-730-12345';
      mockAgentExecLogModel.findOne.mockResolvedValueOnce({
        jobId: campaignId,
        status: 'running',
        createdAt: new Date(Date.now() - 2000),
      });

      await service.finishCampaign(campaignId, 'ab-730', 45);

      expect(mockAgentExecLogModel.updateOne).toHaveBeenCalledWith(
        { jobId: campaignId },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'completed',
            timeline: expect.arrayContaining([
              expect.objectContaining({
                nodeName: 'batch-crawling',
                status: 'completed',
              }),
            ]),
          }),
        }),
      );

      expect(mockRedisPubSub.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'JOB_COMPLETED',
          jobId: campaignId,
          pluginId: 'cert-crawler',
          data: expect.objectContaining({
            status: 'done',
            progress: 100,
          }),
        }),
      );
    });

    it('chống gọi trùng lặp nếu campaign đã completed trước đó (idempotency)', async () => {
      const campaignId = 'sync-ab-730-12345';
      mockAgentExecLogModel.findOne.mockResolvedValueOnce({
        jobId: campaignId,
        status: 'completed',
      });

      await service.finishCampaign(campaignId, 'ab-730', 45);

      expect(mockAgentExecLogModel.updateOne).not.toHaveBeenCalled();
      expect(mockRedisPubSub.publishEvent).not.toHaveBeenCalled();
    });
  });

  describe('failCampaign', () => {
    it('cập nhật AgentExecLog thành failed và phát JOB_FAILED', async () => {
      const campaignId = 'sync-ab-730-12345';
      mockAgentExecLogModel.findOne.mockResolvedValueOnce({
        jobId: campaignId,
        status: 'running',
        createdAt: new Date(Date.now() - 1000),
      });

      await service.failCampaign(campaignId, 'ab-730', 'Circuit breaker tripped: Rate limit 429');

      expect(mockAgentExecLogModel.updateOne).toHaveBeenCalledWith(
        { jobId: campaignId },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'failed',
            error: expect.objectContaining({
              message: 'Circuit breaker tripped: Rate limit 429',
            }),
            timeline: expect.arrayContaining([
              expect.objectContaining({
                nodeName: 'batch-crawling',
                status: 'failed',
              }),
            ]),
          }),
        }),
      );

      expect(mockRedisPubSub.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'JOB_FAILED',
          jobId: campaignId,
          pluginId: 'cert-crawler',
          data: expect.objectContaining({
            error: 'Circuit breaker tripped: Rate limit 429',
          }),
        }),
      );
    });
  });

  describe('Fail-Safe isolation', () => {
    it('không ném ngoại lệ khi Mongo/Redis bị lỗi, đảm bảo luồng cào không bị đứt gãy', async () => {
      mockAgentExecLogModel.create.mockRejectedValueOnce(new Error('Mongo connection timed out'));

      const campaignId = await service.startCampaign('ab-730', 100);
      expect(campaignId).toBeDefined();

      mockRedisClient.incr.mockRejectedValueOnce(new Error('Redis ECONNREFUSED'));
      const count = await service.recordProgress(campaignId, 'ab-730', 100);
      expect(count).toBe(0); // Vẫn an toàn trả về 0 thay vì throw
    });
  });
});

