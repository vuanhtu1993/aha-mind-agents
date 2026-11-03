/**
 * @file cert-crawler.producer.spec.ts
 * @description Unit tests for CertCrawlerProducerService
 *
 * Made by Anh Tu - Share to be share
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { getModelToken } from '@nestjs/mongoose';
import axios from 'axios';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { CertCrawlerCooldownService } from './services/cert-crawler-cooldown.service';
import { CERT_CRAWLER_QUEUE, DEFAULT_CRAWLER_SOURCE } from './cert-crawler.constants';
import { CertQuestion } from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

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
  const mockLean = jest.fn().mockResolvedValue([]);
  const mockSelect = jest.fn().mockReturnValue({ lean: mockLean });
  const mockModel = {
    find: jest.fn().mockReturnValue({ select: mockSelect }),
  };
  const mockCooldownService = {
    getCooldownStatus: jest.fn().mockResolvedValue({
      isLocked: false,
      remainingMinutes: 0,
      lockedUntil: null,
      source: DEFAULT_CRAWLER_SOURCE,
    }),
    resetCooldown: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockLean.mockResolvedValue([]);
    mockCooldownService.getCooldownStatus.mockResolvedValue({
      isLocked: false,
      remainingMinutes: 0,
      lockedUntil: null,
      source: DEFAULT_CRAWLER_SOURCE,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertCrawlerProducerService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: getQueueToken(CERT_CRAWLER_QUEUE), useValue: mockQueue },
        {
          provide: getModelToken(CertQuestion.name, AHA_TOOLS_CONNECTION),
          useValue: mockModel,
        },
        { provide: CertCrawlerCooldownService, useValue: mockCooldownService },
      ],
    }).compile();

    service = module.get<CertCrawlerProducerService>(CertCrawlerProducerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw HttpException 429 when source is currently in cooldown', async () => {
    mockCooldownService.getCooldownStatus.mockResolvedValueOnce({
      isLocked: true,
      remainingMinutes: 45,
      lockedUntil: new Date(),
      source: DEFAULT_CRAWLER_SOURCE,
    });

    await expect(service.triggerSync('cca-f')).rejects.toThrow(HttpException);

    expect(mockCooldownService.getCooldownStatus).toHaveBeenCalledWith(DEFAULT_CRAWLER_SOURCE);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('should reset cooldown and proceed when resetCooldown = true', async () => {
    mockCooldownService.getCooldownStatus.mockResolvedValue({
      isLocked: false,
      remainingMinutes: 0,
      lockedUntil: null,
      source: DEFAULT_CRAWLER_SOURCE,
    });

    mockLean.mockResolvedValueOnce([]);
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/api/cert/attempts?cert_id=')) {
        return Promise.resolve({ data: { attempt: { id: 5361 } } } as any);
      }
      if (url.includes('/api/cert/attempts/5361')) {
        return Promise.resolve({
          data: {
            attempt: { id: 5361, question_ids: [1142] },
          },
        } as any);
      }
      if (url.includes('/api/cert/cca-f?ids=')) {
        return Promise.resolve({
          data: {
            questions: [{ id: 1142, question_no: 1, topic: 'T1' }],
          },
        } as any);
      }
      return Promise.reject(new Error('Unexpected URL: ' + url));
    });

    await service.triggerSync('cca-f', false, true);

    expect(mockCooldownService.resetCooldown).toHaveBeenCalledWith(DEFAULT_CRAWLER_SOURCE);
  });

  it('should skip already completed questions during delta sync (force = false)', async () => {
    mockLean.mockResolvedValueOnce([{ externalId: 1142 }]);

    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/api/cert/attempts?cert_id=')) {
        return Promise.resolve({ data: { attempt: { id: 5361 } } } as any);
      }
      if (url.includes('/api/cert/attempts/5361')) {
        return Promise.resolve({
          data: {
            attempt: { id: 5361, question_ids: [1142, 1143, 1144] },
          },
        } as any);
      }
      if (url.includes('/api/cert/cca-f?ids=1143,1144')) {
        return Promise.resolve({
          data: {
            questions: [
              { id: 1143, question_no: 2, topic: 'Topic 2' },
              { id: 1144, question_no: 3, topic: 'Topic 3' },
            ],
          },
        } as any);
      }
      return Promise.reject(new Error('Unexpected URL: ' + url));
    });

    const result = await service.triggerSync('cca-f');

    expect(result).toEqual({
      certId: 'cca-f',
      attemptId: 5361,
      totalQuestions: 3,
      skippedQuestions: 1,
      queuedJobs: 2,
    });
    expect(mockQueue.addBulk).toHaveBeenCalledTimes(1);
    const addedJobs = mockQueue.addBulk.mock.calls[0][0];
    expect(addedJobs).toHaveLength(2);
    expect(addedJobs[0].opts).toEqual(
      expect.objectContaining({
        jobId: 'cca-f-1143',
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    );
  });

  it('should return queuedJobs = 0 without calling batch API when all questions are already completed', async () => {
    mockLean.mockResolvedValueOnce([{ externalId: 1142 }]);

    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/api/cert/attempts?cert_id=')) {
        return Promise.resolve({ data: { attempt: { id: 5361 } } } as any);
      }
      if (url.includes('/api/cert/attempts/5361')) {
        return Promise.resolve({
          data: {
            attempt: { id: 5361, question_ids: [1142] },
          },
        } as any);
      }
      return Promise.reject(new Error('Should not call batch API: ' + url));
    });

    const result = await service.triggerSync('cca-f');

    expect(result).toEqual({
      certId: 'cca-f',
      attemptId: 5361,
      totalQuestions: 1,
      skippedQuestions: 1,
      queuedJobs: 0,
    });
    expect(mockQueue.addBulk).not.toHaveBeenCalled();
  });

  it('should crawl all questions when force = true even if DB has completed records', async () => {
    mockLean.mockResolvedValueOnce([{ externalId: 1142 }]);

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
      if (url.includes('/api/cert/cca-f?ids=1142,1143')) {
        return Promise.resolve({
          data: {
            questions: [
              { id: 1142, question_no: 1, topic: 'Topic 1' },
              { id: 1143, question_no: 2, topic: 'Topic 2' },
            ],
          },
        } as any);
      }
      return Promise.reject(new Error('Unexpected URL: ' + url));
    });

    const result = await service.triggerSync('cca-f', true);

    expect(result).toEqual({
      certId: 'cca-f',
      attemptId: 5361,
      totalQuestions: 2,
      skippedQuestions: 0,
      queuedJobs: 2,
    });
    expect(mockModel.find).not.toHaveBeenCalled();
    expect(mockQueue.addBulk).toHaveBeenCalledTimes(1);
  });
});
