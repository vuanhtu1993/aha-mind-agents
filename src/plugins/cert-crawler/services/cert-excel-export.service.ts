/**
 * @file cert-excel-export.service.ts
 * @description Dịch vụ kết xuất ngân hàng câu hỏi chứng chỉ sang file Excel (.xlsx)
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { CertQuestion, CertQuestionDocument } from '../../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../../infra/database/database.constants';

@Injectable()
export class CertExcelExportService {
  private readonly logger = new Logger(CertExcelExportService.name);

  constructor(
    @InjectModel(CertQuestion.name, AHA_TOOLS_CONNECTION)
    private readonly certQuestionModel: Model<CertQuestionDocument>,
  ) {}

  /**
   * Tạo workbook Excel chứa toàn bộ câu hỏi của certId
   */
  async exportToExcel(certId: string): Promise<{ buffer: Buffer; fileName: string; totalQuestions: number }> {
    this.logger.log(`Đang truy vấn dữ liệu xuất Excel cho chứng chỉ: ${certId}`);

    const questions = await this.certQuestionModel
      .find({ certId })
      .sort({ questionNo: 1, externalId: 1 })
      .lean();

    if (!questions || questions.length === 0) {
      throw new NotFoundException(`Không tìm thấy câu hỏi nào trong CSDL cho chứng chỉ: ${certId}`);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Anh Tu - aha-mind-agents';
    workbook.created = new Date();

    const sheetName = certId.toUpperCase().slice(0, 31);
    const worksheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 1 }], // Cố định dòng Header
    });

    // Cấu hình 17 Cột
    worksheet.columns = [
      { header: 'No.', key: 'questionNo', width: 8 },
      { header: 'ID', key: 'externalId', width: 10 },
      { header: 'Chủ đề (Topic)', key: 'topic', width: 26 },
      { header: 'Đề bài (English)', key: 'questionEn', width: 50 },
      { header: 'Đề bài (Tiếng Việt)', key: 'questionVi', width: 50 },
      { header: 'Lựa chọn A (EN)', key: 'optA_EN', width: 32 },
      { header: 'Lựa chọn A (VI)', key: 'optA_VI', width: 32 },
      { header: 'Lựa chọn B (EN)', key: 'optB_EN', width: 32 },
      { header: 'Lựa chọn B (VI)', key: 'optB_VI', width: 32 },
      { header: 'Lựa chọn C (EN)', key: 'optC_EN', width: 32 },
      { header: 'Lựa chọn C (VI)', key: 'optC_VI', width: 32 },
      { header: 'Lựa chọn D (EN)', key: 'optD_EN', width: 32 },
      { header: 'Lựa chọn D (VI)', key: 'optD_VI', width: 32 },
      { header: 'Đáp án đúng', key: 'correctAnswer', width: 15 },
      { header: 'Giải thích (English)', key: 'explanationEn', width: 50 },
      { header: 'Phân tích sư phạm (AI Expert VI)', key: 'aiExpertVi', width: 65 },
      { header: 'Tài liệu tham chiếu', key: 'sourceUrl', width: 35 },
    ];

    // Tạo style cho dòng Header (Row 1)
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E79' }, // Xanh Navy đậm sang trọng
      };
      cell.font = {
        name: 'Segoe UI',
        color: { argb: 'FFFFFFFF' },
        bold: true,
        size: 11,
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFAAAAAA' } },
        left: { style: 'thin', color: { argb: 'FFAAAAAA' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FFAAAAAA' } },
      };
    });

    // Thêm từng dòng dữ liệu
    for (const q of questions) {
      const optionsEn = (q.optionsEn || {}) as Record<string, string>;
      const optionsVi = (q.optionsVi || {}) as Record<string, string>;

      const row = worksheet.addRow({
        questionNo: q.questionNo || '',
        externalId: q.externalId,
        topic: q.topic || '',
        questionEn: q.questionEn || '',
        questionVi: q.questionVi || '',
        optA_EN: optionsEn.A || '',
        optA_VI: optionsVi.A || '',
        optB_EN: optionsEn.B || '',
        optB_VI: optionsVi.B || '',
        optC_EN: optionsEn.C || '',
        optC_VI: optionsVi.C || '',
        optD_EN: optionsEn.D || '',
        optD_VI: optionsVi.D || '',
        correctAnswer: q.correctAnswer || '',
        explanationEn: q.explanationEn || '',
        aiExpertVi: q.aiExpertVi || '',
        sourceUrl: q.sourceUrl || '',
      });

      row.eachCell((cell, colNumber) => {
        // Căn chỉnh chung: căn trên và bật tự động xuống dòng
        cell.alignment = {
          vertical: 'top',
          horizontal: colNumber === 1 || colNumber === 2 || colNumber === 14 ? 'center' : 'left',
          wrapText: true,
        };
        cell.font = {
          name: 'Segoe UI',
          size: 10,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        };

        // Nổi bật cột Đáp án đúng (Cột 14)
        if (colNumber === 14) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF2CC' }, // Vàng nhạt nổi bật
          };
          cell.font = {
            name: 'Segoe UI',
            bold: true,
            size: 11,
            color: { argb: 'FFB25900' }, // Cam sẫm / nâu
          };
        }
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = `${certId}-questions.xlsx`;

    this.logger.log(`✅ Xuất thành công file Excel ${fileName} (${questions.length} câu hỏi, ${(buffer.length / 1024).toFixed(1)} KB)`);

    return {
      buffer,
      fileName,
      totalQuestions: questions.length,
    };
  }
}
