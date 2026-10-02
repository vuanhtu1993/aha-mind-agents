/**
 * @file story-shadowing.controller.ts
 * @description API Controller cho module Story Shadowing (Jobs, SSE Streams, Stories)
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
import { StoryShadowingService } from './story-shadowing.service';
import { CreateStoryShadowingJobDto } from './dto/create-story-shadowing-job.dto';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';

@ApiTags('Story Shadowing Agent')
@Controller('agents/story-shadowing')
export class StoryShadowingController {
  private readonly logger = new Logger(StoryShadowingController.name);

  constructor(
    private readonly storyShadowingService: StoryShadowingService,
    private readonly redisPubSub: RedisPubSubService,
  ) {}

  @Post('jobs')
  @ApiOperation({ summary: 'Kích hoạt Job tạo bài học Shadowing (Bất đồng bộ qua Queue)' })
  @ApiResponse({ status: 202, description: 'Job đã được đưa vào hàng đợi BullMQ' })
  @HttpCode(HttpStatus.ACCEPTED)
  async createJob(@Body() dto: CreateStoryShadowingJobDto) {
    return this.storyShadowingService.createJob(dto);
  }

  @Get('jobs/:jobId/progress')
  @ApiOperation({ summary: 'Lắng nghe tiến trình thời gian thực của Job (Chuẩn EventSource GET)' })
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
    const existingJob = await this.storyShadowingService.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'completed') {
        res.write(`data: ${JSON.stringify({
          jobId,
          progress: 100,
          status: 'done',
          message: 'Story shadowing lesson already completed',
          payload: existingJob.returnvalue,
          timestamp: new Date().toISOString(),
        })}\n\n`);
        res.end();
        return;
      }
    }

    // Đăng ký nhận sự kiện từ Redis Pub/Sub
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

  @Get('stories/:id')
  @ApiOperation({ summary: 'Lấy dữ liệu chi tiết bài học Storybook theo ID' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của bài học' })
  async getStoryById(@Param('id') id: string) {
    return this.storyShadowingService.getStoryById(id);
  }

  @Get('stories')
  @ApiOperation({ summary: 'Lấy danh sách các bài học Storybook' })
  @ApiQuery({ name: 'sourceType', required: false, enum: ['text', 'youtube'] })
  @ApiQuery({ name: 'level', required: false, enum: ['easy', 'medium', 'hard'] })
  async getStories(
    @Query('sourceType') sourceType?: string,
    @Query('level') level?: string,
  ) {
    return this.storyShadowingService.getStories({ sourceType, level });
  }
}
