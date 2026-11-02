/**
 * @file cert-crawler.producer.spec.ts
 * @description Unit tests for CertCrawlerProducerService
 *
 * Made by Anh Tu - Share to be share
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import axios from 'axios';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { CERT_CRAWLER_QUEUE } from './cert-crawler.constants';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CertCrawlerProducerService', () => {
  let service: CertCrawlerProducerService;
  const mockQueue = {
    addBulk: jest.fn().mockResolvedValue([]),
  };
  const mockConfig = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'HOCCUNGSUSHI_COOKIE') return 'mock_cookie';
      return null;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertCrawlerProducerService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: getQueueToken(CERT_CRAWLER_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<CertCrawlerProducerService>(CertCrawlerProducerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should trigger sync and enqueue jobs in batches', async () => {
    // Mock get attempts
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/api/cert/attempts?cert_id=')) {
        return Promise.resolve({ data: { attempt: { id: 5361 } } } as any);
      }
      if (url.includes('/api/cert/attempts/5361')) {
        return Promise.resolve({
          data: {
            attempt: { id: 5361, question_ids: [1142, 1143] },
          },
        } as any);
      }
      if (url.includes('/api/cert/cca-f?ids=')) {
        return Promise.resolve({
          data: {
            questions: [
              { id: 1142, question_no: 1, topic: 'Topic 1' },
              { id: 1143, question_no: 2, topic: 'Topic 2' },
            ],
          },
        } as any);
      }
      return Promise.reject(new Error('Unknown URL: ' + url));
    });

    const result = await service.triggerSync('cca-f');
    expect(result.certId).toBe('cca-f');
    expect(result.totalQuestions).toBe(2);
    expect(result.queuedJobs).toBe(2);
    expect(mockQueue.addBulk).toHaveBeenCalledTimes(1);
  });
});
