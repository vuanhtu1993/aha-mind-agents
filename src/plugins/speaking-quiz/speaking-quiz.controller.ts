/**
 * @file speaking-quiz.controller.ts
 * @description API Controller cho module Speaking Quiz (Jobs, SSE Streams, Questions)
 *
 * Made by Anh Tu - Share to be share
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { SpeakingQuizService } from './speaking-quiz.service';
import { CreateSpeakingQuizJobDto } from './dto/create-speaking-quiz-job.dto';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';

@ApiTags('Speaking Quiz Agent')
@Controller('agents/speaking-quiz')
export class SpeakingQuizController {
  private readonly logger = new Logger(SpeakingQuizController.name);

  constructor(
    private readonly speakingQuizService: SpeakingQuizService,
    private readonly redisPubSub: RedisPubSubService,
  ) { }

  @Post('jobs')
  @ApiOperation({ summary: 'Kích hoạt Job sinh câu hỏi luyện nói PREP (Bất đồng bộ)' })
  @ApiResponse({ status: 202, description: 'Job đã được tiếp nhận và xếp vào hàng đợi BullMQ' })
  @HttpCode(HttpStatus.ACCEPTED)
  async createJob(@Body() dto: CreateSpeakingQuizJobDto) {
    return this.speakingQuizService.createJob(dto);
  }

  @Get('jobs/:jobId/progress')
  @ApiOperation({ summary: 'Lắng nghe tiến trình thời gian thực của Job qua Server-Sent Events' })
  @ApiParam({ name: 'jobId', description: 'Mã định danh của Job' })
  async streamProgress(
    @Param('jobId') jobId: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Kiểm tra nếu job đã hoàn thành từ trước
    const existingJob = await this.speakingQuizService.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'completed') {
        res.write(`data: ${JSON.stringify({
          jobId,
          progress: 100,
          stage: 'completed',
          message: 'Speaking quiz successfully created and saved',
          result: existingJob.returnvalue,
          timestamp: new Date().toISOString(),
        })}\n\n`);
        res.end();
        return;
      }
    }

    // Subscribe vào luồng sự kiện Redis Pub/Sub
    const subscription = this.redisPubSub.events$.subscribe((event) => {
      if (event.jobId === jobId) {
        res.write(`data: ${JSON.stringify(event.data || event)}\n\n`);

        if (event.type === 'JOB_COMPLETED' || event.type === 'JOB_FAILED') {
          subscription.unsubscribe();
          res.end();
        }
      }
    });

    res.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @Get('questions/:id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết câu hỏi theo ID' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của câu hỏi' })
  async getQuestionById(@Param('id') id: string) {
    return this.speakingQuizService.getQuestionById(id);
  }

  @Get('questions')
  @ApiOperation({ summary: 'Truy vấn danh sách câu hỏi Speaking Quiz (hỗ trợ lọc theo Storybook hoặc xem tất cả)' })
  @ApiQuery({ name: 'storybookId', description: 'ID của bài học Storybook (không bắt buộc)', required: false })
  @ApiQuery({ name: 'level', description: 'Lọc theo cấp độ CEFR (B1, B2, C1)', required: false })
  async getQuestions(
    @Query('storybookId') storybookId?: string,
    @Query('level') level?: string,
  ) {
    return this.speakingQuizService.getQuestions({ storybookId, level });
  }
}
