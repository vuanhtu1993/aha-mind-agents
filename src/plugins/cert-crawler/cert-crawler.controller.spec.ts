/**
 * @file cert-crawler.controller.spec.ts
 * @description Unit tests for CertCrawlerController
 *
 * Made by Anh Tu - Share to be share
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { CertCrawlerController } from './cert-crawler.controller';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { CertExcelExportService } from './services/cert-excel-export.service';
import { CERT_CRAWLER_QUEUE } from './cert-crawler.constants';
import { CertQuestion } from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

describe('CertCrawlerController', () => {
  let controller: CertCrawlerController;
  const mockProducer = {
    triggerSync: jest.fn().mockResolvedValue({
      certId: 'ccao-f',
      attemptId: 5361,
      totalQuestions: 736,
      skippedQuestions: 0,
      queuedJobs: 736,
    }),
  };
  const mockModel = {
    countDocuments: jest.fn(),
  };
  const mockQueue = {
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 10,
      active: 2,
      delayed: 1,
      failed: 0,
    }),
  };
  const mockExportService = {
    exportToExcel: jest.fn().mockResolvedValue({
      buffer: Buffer.from('mock excel data'),
      fileName: 'cca-f-questions.xlsx',
      totalQuestions: 169,
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CertCrawlerController],
      providers: [
        { provide: CertCrawlerProducerService, useValue: mockProducer },
        { provide: CertExcelExportService, useValue: mockExportService },
        { provide: getModelToken(CertQuestion.name, AHA_TOOLS_CONNECTION), useValue: mockModel },
        { provide: getQueueToken(CERT_CRAWLER_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    controller = module.get<CertCrawlerController>(CertCrawlerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should trigger sync and pass force option to producer', async () => {
    const result = await controller.sync({ certId: 'ccao-f', force: true });
    expect(result.totalQuestions).toBe(736);
    expect(mockProducer.triggerSync).toHaveBeenCalledWith('ccao-f', true);
  });

  it('should get detailed sync status including completedCount, incompleteCount and queue counts', async () => {
    mockModel.countDocuments
      .mockResolvedValueOnce(100) // totalSaved
      .mockResolvedValueOnce(95); // completedCount

    const result = await controller.status('ccao-f');
    expect(result).toEqual({
      certId: 'ccao-f',
      totalSaved: 100,
      completedCount: 95,
      incompleteCount: 5,
      queue: {
        waiting: 10,
        active: 2,
        delayed: 1,
        failed: 0,
      },
    });
    expect(mockModel.countDocuments).toHaveBeenCalledTimes(2);
    expect(mockQueue.getJobCounts).toHaveBeenCalledWith('waiting', 'active', 'delayed', 'failed');
  });

  it('should export excel file with proper attachment headers', async () => {
    const mockRes: any = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await controller.export('cca-f', mockRes);

    expect(mockExportService.exportToExcel).toHaveBeenCalledWith('cca-f');
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="cca-f-questions.xlsx"',
    );
    expect(mockRes.send).toHaveBeenCalledWith(expect.any(Buffer));
  });
});
