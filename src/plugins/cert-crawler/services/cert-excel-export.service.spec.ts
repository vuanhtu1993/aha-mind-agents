/**
 * @file cert-excel-export.service.spec.ts
 * @description Unit tests for CertExcelExportService
 *
 * Made by Anh Tu - Share to be share
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CertExcelExportService } from './cert-excel-export.service';
import { CertQuestion } from '../../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../../infra/database/database.constants';

describe('CertExcelExportService', () => {
  let service: CertExcelExportService;

  const mockQuestions = [
    {
      certId: 'cca-f',
      externalId: 1142,
      questionNo: 1,
      topic: 'D1 · Kiến trúc & điều phối agent',
      questionEn: 'Question EN',
      questionVi: 'Question VI',
      optionsEn: { A: 'A EN', B: 'B EN', C: 'C EN', D: 'D EN' },
      optionsVi: { A: 'A VI', B: 'B VI', C: 'C VI', D: 'D VI' },
      correctAnswer: 'A',
      explanationEn: 'Explanation EN',
      aiExpertVi: 'AI Expert VI',
      sourceUrl: 'https://platform.claude.com',
    },
  ];

  const mockModel = {
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQuestions),
      }),
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertExcelExportService,
        {
          provide: getModelToken(CertQuestion.name, AHA_TOOLS_CONNECTION),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<CertExcelExportService>(CertExcelExportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should export questions to a valid Excel Buffer', async () => {
    const result = await service.exportToExcel('cca-f');

    expect(result).toBeDefined();
    expect(result.fileName).toBe('cca-f-questions.xlsx');
    expect(result.totalQuestions).toBe(1);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(mockModel.find).toHaveBeenCalledWith({ certId: 'cca-f' });
  });
});
