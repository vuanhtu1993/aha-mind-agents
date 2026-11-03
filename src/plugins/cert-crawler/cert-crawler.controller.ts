/**
 * @file cert-crawler.controller.ts
 * @description API Controller điều khiển tác vụ cào và xuất câu hỏi chứng chỉ
 *
 * Made by Anh Tu - Share to be share
 */

import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { CertExcelExportService } from './services/cert-excel-export.service';
import { SyncCertDto } from './dto/sync-cert.dto';
import { CertQuestion, CertQuestionDocument } from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

@Controller('crawler/cert')
export class CertCrawlerController {
  constructor(
    private readonly producerService: CertCrawlerProducerService,
    private readonly exportService: CertExcelExportService,
    @InjectModel(CertQuestion.name, AHA_TOOLS_CONNECTION)
    private readonly certQuestionModel: Model<CertQuestionDocument>,
  ) {}

  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async sync(@Body() dto: SyncCertDto) {
    return this.producerService.triggerSync(dto.certId);
  }

  @Get('status')
  async status(@Query('certId') certId: string) {
    const count = await this.certQuestionModel.countDocuments({ certId });
    return {
      certId,
      totalSaved: count,
    };
  }

  @Get('export')
  async export(
    @Query('certId') certId: string,
    @Res() res: Response,
  ) {
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
