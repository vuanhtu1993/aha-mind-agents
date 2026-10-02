/**
 * @file story-shadowing.worker.ts
 * @description BullMQ Background Processor thực thi LangGraph StateGraph cho Story Shadowing
 *
 * Made by Anh Tu - Share to be share
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Storybook } from '../../infra/database/schemas/storybook.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';
import { TextPipelineService } from './pipelines/text.pipeline';
import { YoutubePipelineService } from './pipelines/youtube.pipeline';
import { CreateStoryShadowingJobDto } from './dto/create-story-shadowing-job.dto';
import { ExecutionContext } from '../../core/plugin.interface';

@Processor('story-shadowing-queue')
export class StoryShadowingWorker extends WorkerHost {
  private readonly logger = new Logger(StoryShadowingWorker.name);

  constructor(
    private readonly textPipeline: TextPipelineService,
    private readonly youtubePipeline: YoutubePipelineService,
    private readonly redisPubSub: RedisPubSubService,
    @InjectModel(Storybook.name, AHA_TOOLS_CONNECTION)
    private readonly storybookModel: Model<Storybook>,
  ) {
    super();
  }

  async process(job: Job<CreateStoryShadowingJobDto, any, string>): Promise<any> {
    const jobId = job.id?.toString() || `job-ss-${Date.now()}`;
    const dto = job.data;
    this.logger.log(`Bắt đầu xử lý Job [${jobId}] cho Pipeline: ${dto.pipeline}`);

    await this.redisPubSub.publishEvent({
      type: 'JOB_STARTED',
      jobId,
      pluginId: 'story-shadowing',
      pipeline: dto.pipeline,
      timestamp: Date.now(),
    });

    const context: ExecutionContext = {
      jobId,
      log: (msg: string, meta?: any) =>
        this.logger.log(`[Job ${jobId}] ${msg} ${meta ? JSON.stringify(meta) : ''}`),
    };

    try {
      const stream$ =
        dto.pipeline === 'text'
          ? this.textPipeline.execute(
              { text: dto.text!, voice: dto.voice || 'FEMALE' },
              context,
            )
          : this.youtubePipeline.execute(
              { youtubeUrl: dto.youtubeUrl! },
              context,
            );

      let finalState: any = null;

      await new Promise<void>((resolve, reject) => {
        stream$.subscribe({
          next: async (event) => {
            // Gán đồng bộ trạng thái hoàn tất ngay lập tức
            if (event.status === 'done' && event.payload) {
              finalState = event.payload;
            }

            if (event.progress !== undefined) {
              await job.updateProgress(event.progress);
            }

            // Broadcast tiến trình qua Redis Pub/Sub cho SSE subscribers
            await this.redisPubSub.publishEvent({
              type: 'JOB_STEP',
              jobId,
              pluginId: 'story-shadowing',
              timestamp: Date.now(),
              data: {
                jobId,
                stepId: event.stepId,
                status: event.status,
                progress: event.progress,
                message: event.message,
              },
            });
          },
          error: (err) => reject(err),
          complete: () => resolve(),
        });
      });

      if (!finalState) {
        throw new Error('Pipeline hoàn thành nhưng không có dữ liệu trả về');
      }

      // Đảm bảo bài học đã được lưu và có storyId
      let storyId = finalState.storyId || finalState.id;
      if (!storyId) {
        const savedStory = await this.persistStory(dto, finalState);
        storyId = savedStory._id.toString();
        finalState.storyId = storyId;
        finalState.id = storyId;
      }

      await this.redisPubSub.publishEvent({
        type: 'JOB_COMPLETED',
        jobId,
        pluginId: 'story-shadowing',
        pipeline: dto.pipeline,
        timestamp: Date.now(),
        data: {
          status: 'done',
          progress: 100,
          message: 'Story shadowing lesson created and saved successfully',
          payload: {
            storyId,
            id: storyId,
            title: finalState.title || finalState.youtubeTitle || 'Bài luyện tập Shadowing',
            level: finalState.level,
            sentenceCount: finalState.sentences?.length || 0,
            sentences: finalState.sentences,
            keywords: finalState.keywords,
          },
        },
      });

      this.logger.log(`✅ Hoàn thành Job [${jobId}]. StoryId: ${storyId}`);
      return { storyId, ...finalState };
    } catch (err: any) {
      this.logger.error(`❌ Job [${jobId}] thất bại: ${err.message}`);
      await this.redisPubSub.publishEvent({
        type: 'JOB_FAILED',
        jobId,
        pluginId: 'story-shadowing',
        timestamp: Date.now(),
        data: { error: err.message },
      });
      throw err;
    }
  }

  private async persistStory(dto: CreateStoryShadowingJobDto, state: any) {
    let originalText = state.rawText;
    if (!originalText && state.sentences) {
      originalText = state.sentences.map((s: any) => s.text).join(' ');
    }
    if (!originalText) {
      originalText = dto.youtubeUrl || 'Nội dung bài học';
    }

    const doc = new this.storybookModel({
      title:
        dto.pipeline === 'youtube'
          ? state.youtubeTitle || 'Bài luyện tập YouTube'
          : 'Bài luyện tập Text',
      thumbnail:
        dto.pipeline === 'youtube' && state.youtubeVideoId
          ? `https://img.youtube.com/vi/${state.youtubeVideoId}/hqdefault.jpg`
          : undefined,
      originalText,
      youtubeVideoId: state.youtubeVideoId,
      sentences: state.sentences,
      keywords: state.keywords,
      level: state.level || 'medium',
      voice: state.voice || dto.voice || 'FEMALE',
      speakingRate: state.speakingRate || 1.0,
      sourceType: dto.pipeline,
    });

    return doc.save();
  }
}
