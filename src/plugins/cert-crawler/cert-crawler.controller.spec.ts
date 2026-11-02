/**
 * @file cert-crawler.controller.spec.ts
 * @description Unit tests for CertCrawlerController
 *
 * Made by Anh Tu - Share to be share
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CertCrawlerController } from './cert-crawler.controller';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { CertQuestion } from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

describe('CertCrawlerController', () => {
  let controller: CertCrawlerController;
  const mockProducer = {
    triggerSync: jest.fn().mockResolvedValue({
      certId: 'cca-f',
      attemptId: 5361,
      totalQuestions: 169,
      queuedJobs: 169,
    }),
  };
  const mockModel = {
    countDocuments: jest.fn().mockResolvedValue(100),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CertCrawlerController],
      providers: [
        { provide: CertCrawlerProducerService, useValue: mockProducer },
        { provide: getModelToken(CertQuestion.name, AHA_TOOLS_CONNECTION), useValue: mockModel },
      ],
    }).compile();

    controller = module.get<CertCrawlerController>(CertCrawlerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should trigger sync', async () => {
    const result = await controller.sync({ certId: 'cca-f' });
    expect(result.totalQuestions).toBe(169);
    expect(mockProducer.triggerSync).toHaveBeenCalledWith('cca-f');
  });

  it('should get sync status', async () => {
    const result = await controller.status('cca-f');
    expect(result.certId).toBe('cca-f');
    expect(result.totalSaved).toBe(100);
    expect(mockModel.countDocuments).toHaveBeenCalledWith({ certId: 'cca-f' });
  });
});
