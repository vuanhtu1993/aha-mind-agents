/**
 * @file story-shadowing.service.ts
 * @description Service quản lý Hàng đợi BullMQ, Idempotency và truy vấn bài học Storybook
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Storybook } from '../../infra/database/schemas/storybook.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';
import { CreateStoryShadowingJobDto } from './dto/create-story-shadowing-job.dto';

@Injectable()
export class StoryShadowingService {
  private readonly logger = new Logger(StoryShadowingService.name);

  constructor(
    @InjectQueue('story-shadowing-queue')
    private readonly queue: Queue,
    @InjectModel(Storybook.name, AHA_TOOLS_CONNECTION)
    private readonly storybookModel: Model<Storybook>,
  ) {}

  /**
   * Tạo Job tạo bài học Shadowing và đẩy vào BullMQ
   */
  public async createJob(dto: CreateStoryShadowingJobDto) {
    // 1. Kiểm tra Idempotency đối với YouTube video nếu đã tồn tại bài học
    if (dto.pipeline === 'youtube' && dto.youtubeUrl && !dto.forceRegenerate) {
      const videoId = this.extractYoutubeId(dto.youtubeUrl);
      if (videoId) {
        const existing = await this.storybookModel.findOne({ youtubeVideoId: videoId }).lean();
        if (existing) {
          this.logger.log(`Tái sử dụng bài học có sẵn cho YouTube [${videoId}]`);
          return {
            jobId: `existing-${existing._id}`,
            status: 'completed',
            existingStoryId: existing._id.toString(),
            createdAt: (existing as any).createdAt || new Date().toISOString(),
          };
        }
      }
    }

    // 2. Đưa vào hàng đợi BullMQ
    const job = await this.queue.add('process-shadowing', dto, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.log(`Đã đẩy Job [${job.id}] vào hàng đợi story-shadowing-queue (Pipeline: ${dto.pipeline})`);

    return {
      jobId: job.id?.toString(),
      status: 'queued',
      sseUrl: `/api/agents/story-shadowing/jobs/${job.id}/progress`,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Lấy thông tin Job trong hàng đợi BullMQ
   */
  public async getJob(jobId: string) {
    return this.queue.getJob(jobId);
  }

  /**
   * Lấy chi tiết bài học Storybook theo ID
   */
  public async getStoryById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`ID bài học không hợp lệ: ${id}`);
    }
    const story = await this.storybookModel.findById(id).lean();
    if (!story) {
      throw new NotFoundException(`Không tìm thấy bài học có ID: ${id}`);
    }
    return story;
  }

  /**
   * Truy vấn danh sách bài học có phân trang và bộ lọc
   */
  public async getStories(filter?: { sourceType?: string; level?: string }) {
    const query: any = {};
    if (filter?.sourceType) query.sourceType = filter.sourceType;
    if (filter?.level) query.level = filter.level;
    const stories = await this.storybookModel.find(query).sort({ createdAt: -1 }).limit(50).lean();
    return { total: stories.length, stories };
  }

  /**
   * Trích xuất Video ID từ đường dẫn YouTube
   */
  private extractYoutubeId(url: string): string | null {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  }
}
