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
import { CertExcelExportService } from './services/cert-excel-export.service';
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
