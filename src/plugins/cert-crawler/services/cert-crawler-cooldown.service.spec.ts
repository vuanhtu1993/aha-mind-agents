/**
 * @file cert-crawler-cooldown.service.spec.ts
 * @description Unit tests for CertCrawlerCooldownService
 *
 * Made by Anh Tu - Share to be share
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { CertCrawlerCooldownService } from './cert-crawler-cooldown.service';
import { CERT_CRAWLER_QUEUE, DEFAULT_CRAWLER_SOURCE } from '../cert-crawler.constants';

describe('CertCrawlerCooldownService', () => {
  let service: CertCrawlerCooldownService;
  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };
  const mockQueue = {
    client: Promise.resolve(mockRedisClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertCrawlerCooldownService,
        { provide: getQueueToken(CERT_CRAWLER_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<CertCrawlerCooldownService>(CertCrawlerCooldownService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return isLocked = false when no cooldown key exists in Redis', async () => {
    mockRedisClient.get.mockResolvedValueOnce(null);

    const status = await service.getCooldownStatus('hoccungsushi.com');
    expect(status.isLocked).toBe(false);
    expect(status.remainingMinutes).toBe(0);
    expect(status.lockedUntil).toBeNull();
    expect(status.source).toBe('hoccungsushi.com');
    expect(mockRedisClient.get).toHaveBeenCalledWith('cert_crawler:cooldown:hoccungsushi.com');
  });

  it('should return isLocked = true with remaining minutes when active lock exists', async () => {
    const futureTime = Date.now() + 30 * 60 * 1000; // Còn 30 phút
    mockRedisClient.get.mockResolvedValueOnce(futureTime.toString());

    const status = await service.getCooldownStatus('hoccungsushi.com');
    expect(status.isLocked).toBe(true);
    expect(status.remainingMinutes).toBeGreaterThanOrEqual(29);
    expect(status.remainingMinutes).toBeLessThanOrEqual(30);
    expect(status.lockedUntil).toEqual(new Date(futureTime));
  });

  it('should set cooldown with TTL in Redis for specific source', async () => {
    mockRedisClient.set.mockResolvedValueOnce('OK');

    await service.setCooldown('examtopics.com', 15 * 60 * 1000);

    expect(mockRedisClient.set).toHaveBeenCalledWith(
      'cert_crawler:cooldown:examtopics.com',
      expect.any(String),
      'PX',
      15 * 60 * 1000,
    );
  });

  it('should reset cooldown by deleting Redis key for specific source', async () => {
    mockRedisClient.del.mockResolvedValueOnce(1);

    await service.resetCooldown('hoccungsushi.com');

    expect(mockRedisClient.del).toHaveBeenCalledWith('cert_crawler:cooldown:hoccungsushi.com');
  });
});

