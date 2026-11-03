/**
 * @file cert-crawler.controller.ts
 * @description API Controller điều khiển tác vụ cào, xuất câu hỏi chứng chỉ và quản lý Cooldown
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
import { CERT_CRAWLER_QUEUE, DEFAULT_CRAWLER_SOURCE } from './cert-crawler.constants';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { CertExcelExportService } from './services/cert-excel-export.service';
import { CertCrawlerCooldownService } from './services/cert-crawler-cooldown.service';
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
    private readonly cooldownService: CertCrawlerCooldownService,
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
    return this.producerService.triggerSync(dto.certId, dto.force, dto.resetCooldown);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Kiểm tra tiến độ câu hỏi đã lưu, đã hoàn tất, trạng thái hàng đợi BullMQ và cờ Cooldown',
  })
  @ApiQuery({
    name: 'certId',
    required: true,
    description: 'Mã chứng chỉ cần kiểm tra tiến độ',
    example: 'ccao-f',
  })
  @ApiQuery({
    name: 'source',
    required: false,
    description: 'Tên nguồn dữ liệu để kiểm tra cooldown (mặc định: hoccungsushi.com)',
    example: 'hoccungsushi.com',
  })
  async status(
    @Query('certId') certId: string,
    @Query('source') source?: string,
  ) {
    const targetSource = source || DEFAULT_CRAWLER_SOURCE;
    const [totalSaved, completedCount, jobCounts, cooldown] = await Promise.all([
      this.certQuestionModel.countDocuments({ certId }),
      this.certQuestionModel.countDocuments({
        certId,
        correctAnswer: { $exists: true, $nin: ['', null] },
        aiExpertVi: { $exists: true, $nin: ['', null] },
      }),
      this.crawlerQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      this.cooldownService.getCooldownStatus(targetSource),
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
      cooldown,
    };
  }

  @Post('cooldown/reset')
  @ApiOperation({
    summary: 'Mở khóa giãn cách Rate Limit Cooldown thủ công cho một nguồn cào cụ thể',
  })
  async resetCooldown(@Body() body?: { source?: string } | string) {
    let targetSource = DEFAULT_CRAWLER_SOURCE;
    if (typeof body === 'string' && body.trim()) {
      targetSource = body.trim();
    } else if (typeof body === 'object' && body !== null && body.source) {
      targetSource = body.source.trim();
    }

    await this.cooldownService.resetCooldown(targetSource);
    return {
      success: true,
      message: `Đã mở khóa cooldown cho nguồn [${targetSource}] thành công`,
      source: targetSource,
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
