/**
 * @file cert-crawler.controller.ts
 * @description API Controller điều khiển tác vụ cào và xuất câu hỏi chứng chỉ
 *
 * Made by Anh Tu - Share to be share
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { CERT_CRAWLER_QUEUE } from './cert-crawler.constants';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { CertExcelExportService } from './services/cert-excel-export.service';
import { SyncCertDto } from './dto/sync-cert.dto';
import {
  CertQuestion,
  CertQuestionDocument,
} from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

@ApiTags('Cert Crawler')
@Controller('crawler/cert')
export class CertCrawlerController {
  constructor(
    private readonly producerService: CertCrawlerProducerService,
    private readonly exportService: CertExcelExportService,
    @InjectModel(CertQuestion.name, AHA_TOOLS_CONNECTION)
    private readonly certQuestionModel: Model<CertQuestionDocument>,
    @InjectQueue(CERT_CRAWLER_QUEUE)
    private readonly crawlerQueue: Queue,
  ) {}

  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Kích hoạt đồng bộ câu hỏi chứng chỉ (mặc định chỉ cào tiếp các câu còn thiếu)',
  })
  async sync(@Body() dto: SyncCertDto) {
    return this.producerService.triggerSync(dto.certId, dto.force);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Kiểm tra tiến độ câu hỏi đã lưu, đã hoàn tất và trạng thái hàng đợi BullMQ',
  })
  @ApiQuery({
    name: 'certId',
    required: true,
    description: 'Mã chứng chỉ cần kiểm tra tiến độ',
    example: 'ccao-f',
  })
  async status(@Query('certId') certId: string) {
    const [totalSaved, completedCount, jobCounts] = await Promise.all([
      this.certQuestionModel.countDocuments({ certId }),
      this.certQuestionModel.countDocuments({
        certId,
        correctAnswer: { $exists: true, $nin: ['', null] },
        aiExpertVi: { $exists: true, $nin: ['', null] },
      }),
      this.crawlerQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
    ]);

    return {
      certId,
      totalSaved,
      completedCount,
      incompleteCount: Math.max(0, totalSaved - completedCount),
      queue: {
        waiting: jobCounts.waiting ?? 0,
        active: jobCounts.active ?? 0,
        delayed: jobCounts.delayed ?? 0,
        failed: jobCounts.failed ?? 0,
      },
    };
  }

  @Get('export')
  @ApiOperation({
    summary: 'Kết xuất toàn bộ ngân hàng câu hỏi của chứng chỉ ra file Excel (.xlsx)',
  })
  @ApiQuery({
    name: 'certId',
    required: true,
    description: 'Mã chứng chỉ cần xuất file Excel',
    example: 'cca-f',
  })
  async export(@Query('certId') certId: string, @Res() res: Response) {
    const { buffer, fileName } = await this.exportService.exportToExcel(certId);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );

    res.send(buffer);
  }
}
