/**
 * @file cert-crawler.processor.spec.ts
 * @description Unit tests for CertCrawlerProcessor
 *
 * Made by Anh Tu - Share to be share
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import axios from 'axios';
import { CertCrawlerProcessor } from './cert-crawler.processor';
import { CertQuestion } from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CertCrawlerProcessor', () => {
  let processor: CertCrawlerProcessor;
  const mockModel = {
    findOneAndUpdate: jest.fn().mockResolvedValue({}),
  };
  const mockConfig = {
    get: jest.fn().mockReturnValue('mock_cookie'),
  };

  const baseMockJob: any = {
    attemptsMade: 0,
    data: {
      certId: 'cca-f',
      attemptId: 5361,
      question: {
        id: 1142,
        question_no: 1,
        question_en: 'Question EN',
        question_vi: 'Question VI',
        options: { A: 'Opt A', B: 'Opt B' },
        options_vi: { A: 'Lua chon A', B: 'Lua chon B' },
        is_multi: false,
        topic: 'D1 · Kiến trúc',
        guide_ref: 'Tool use',
      },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertCrawlerProcessor,
        { provide: ConfigService, useValue: mockConfig },
        { provide: getModelToken(CertQuestion.name, AHA_TOOLS_CONNECTION), useValue: mockModel },
      ],
    }).compile();

    processor = module.get<CertCrawlerProcessor>(CertCrawlerProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should process job, fetch reveal, and upsert question into MongoDB', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        row: {
          answer_key: 'A',
          explanation: 'Test explanation',
          ai_expert: 'Kiến thức cần nhớ: Test AI Expert',
          source_url: 'https://platform.claude.com',
          source_ref: 'test-source-ref',
        },
      },
    } as any);

    await processor.process(baseMockJob);

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/cert/attempts/5361/reveal?q=1142&detail=1'),
      expect.any(Object),
    );

    expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
      { certId: 'cca-f', externalId: 1142 },
      {
        $set: expect.objectContaining({
          certId: 'cca-f',
          externalId: 1142,
          correctAnswer: 'A',
          aiExpertVi: 'Kiến thức cần nhớ: Test AI Expert',
        }),
      },
      { upsert: true, new: true },
    );
  });

  it('should upsert base question and rethrow error on HTTP 429 so BullMQ retries', async () => {
    mockedAxios.get.mockRejectedValueOnce({
      response: {
        status: 429,
        data: { error: 'Too many requests' },
      },
      message: 'Request failed with status code 429',
    });

    await expect(processor.process(baseMockJob)).rejects.toThrow(/Rate limit 429/);

    expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
      { certId: 'cca-f', externalId: 1142 },
      {
        $set: expect.objectContaining({
          certId: 'cca-f',
          externalId: 1142,
          questionEn: 'Question EN',
        }),
      },
      { upsert: true, new: true },
    );
  });

  it('should upsert base question and rethrow error on network timeout or 5xx error so BullMQ retries', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('timeout of 10000ms exceeded'));

    await expect(processor.process(baseMockJob)).rejects.toThrow(/timeout of 10000ms exceeded/);

    expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
      { certId: 'cca-f', externalId: 1142 },
      {
        $set: expect.objectContaining({
          certId: 'cca-f',
          externalId: 1142,
          questionEn: 'Question EN',
        }),
      },
      { upsert: true, new: true },
    );
  });
});
