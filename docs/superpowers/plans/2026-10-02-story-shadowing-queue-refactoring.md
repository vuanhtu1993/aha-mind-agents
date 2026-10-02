# Story Shadowing Agent — Asynchronous Queue & SSE Refactoring Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển đổi module `story-shadowing` từ cơ chế đồng bộ trực tiếp trên Gateway (Direct HTTP POST Streaming) sang kiến trúc chuẩn doanh nghiệp bất đồng bộ phân tán (**Asynchronous Request-Reply Pattern**) sử dụng **BullMQ + Redis Pub/Sub + GET SSE**, đồng bộ giao thức 100% với module `speaking-quiz`.

**Architecture:** 
1. Client gửi yêu cầu tạo bài học qua `POST /api/agents/story-shadowing/jobs` $\rightarrow$ Nhận phản hồi `202 Accepted` chứa `jobId` và `sseUrl` (hoặc trả ngay bài có sẵn nếu trúng Idempotency).
2. Tác vụ được đẩy vào hàng đợi `story-shadowing-queue`.
3. Worker độc lập `StoryShadowingWorker` nhận job, chạy StateGraph đa chặng, phát sự kiện tiến độ qua `RedisPubSubService`.
4. Client mở kết nối chuẩn `new EventSource(sseUrl)` qua `GET /api/agents/story-shadowing/jobs/:jobId/progress` để cập nhật thanh tiến trình.
5. Khi hoàn tất, Worker lưu bài học vào MongoDB `storybooks` và phát sự kiện `completed`. Client dùng `storyId` tải bài học qua `GET /api/agents/story-shadowing/stories/:id`.

**Tech Stack:** NestJS 11, BullMQ, Redis (ioredis), LangGraph / LangChain, MongoDB Mongoose, Server-Sent Events (SSE), Jest.

---

## Danh sách Tệp tin Tác động (File Structure & Scope)

### Tệp tin tạo mới:
- `src/plugins/story-shadowing/dto/create-story-shadowing-job.dto.ts`: DTO hợp nhất dữ liệu đầu vào cho cả 2 pipeline (Text & YouTube) kèm validate Zod / class-validator.
- `src/plugins/story-shadowing/story-shadowing.service.ts`: Xử lý logic nghiệp vụ tạo Job, kiểm tra Idempotency, truy vấn bài học.
- `src/plugins/story-shadowing/story-shadowing.service.spec.ts`: Unit test cho `StoryShadowingService`.
- `src/plugins/story-shadowing/story-shadowing.worker.ts`: Worker BullMQ xử lý nền, điều phối LangGraph và bắn Redis Pub/Sub.
- `src/plugins/story-shadowing/story-shadowing.worker.spec.ts`: Unit test cho `StoryShadowingWorker`.
- `src/plugins/story-shadowing/story-shadowing.controller.ts`: REST API Controller quản lý Jobs, luồng GET SSE, và truy vấn Stories.
- `src/plugins/story-shadowing/story-shadowing.controller.spec.ts`: Unit test cho `StoryShadowingController`.
- `test/story-shadowing.e2e-spec.ts`: E2E Integration test kiểm tra toàn bộ chu trình 2-Phase.

### Tệp tin chỉnh sửa:
- `src/plugins/story-shadowing/story-shadowing.module.ts`: Đăng ký BullMQ Queue `story-shadowing-queue`, export Controller, Service, Worker.
- `docs/contracts/story-shadowing-api-contract.md`: Cập nhật đặc tả giao thức API đồng nhất với `speaking-quiz`.

---

## Chi tiết các Bước Thực hiện (Bite-Sized Tasks)

### Task 1: Định nghĩa DTO Hợp nhất cho Job Story Shadowing

**Files:**
- Create: `src/plugins/story-shadowing/dto/create-story-shadowing-job.dto.ts`

- [ ] **Step 1: Viết class `CreateStoryShadowingJobDto`**

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';

export type ShadowingPipelineType = 'text' | 'youtube';

export class CreateStoryShadowingJobDto {
  @ApiProperty({
    description: 'Loại pipeline cần thực thi',
    enum: ['text', 'youtube'],
    example: 'text',
  })
  @IsNotEmpty({ message: 'Pipeline không được để trống' })
  @IsEnum(['text', 'youtube'], { message: 'Pipeline phải là text hoặc youtube' })
  pipeline: ShadowingPipelineType;

  @ApiPropertyOptional({
    description: 'Đoạn văn bản tiếng Anh (bắt buộc nếu pipeline là text)',
    example: 'Habits are the compound interest of self-improvement.',
  })
  @ValidateIf((o) => o.pipeline === 'text')
  @IsNotEmpty({ message: 'Văn bản text không được để trống khi chọn pipeline text' })
  @IsString()
  text?: string;

  @ApiPropertyOptional({
    description: 'Giọng đọc TTS (cho text pipeline)',
    example: 'FEMALE',
    default: 'FEMALE',
  })
  @IsOptional()
  @IsString()
  voice?: string;

  @ApiPropertyOptional({
    description: 'Link YouTube hợp lệ (bắt buộc nếu pipeline là youtube)',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  @ValidateIf((o) => o.pipeline === 'youtube')
  @IsNotEmpty({ message: 'URL YouTube không được để trống khi chọn pipeline youtube' })
  @IsUrl({}, { message: 'URL YouTube không hợp lệ' })
  youtubeUrl?: string;

  @ApiPropertyOptional({
    description: 'Bỏ qua kiểm tra bài đã tồn tại trong CSDL, ép buộc sinh lại',
    default: false,
  })
  @IsOptional()
  forceRegenerate?: boolean;
}
```

- [ ] **Step 2: Kiểm tra biên dịch**
Run: `npm run build`
Expected: PASS

---

### Task 2: Xây dựng `StoryShadowingService` (Nghiệp vụ Hàng đợi & Idempotency)

**Files:**
- Create: `src/plugins/story-shadowing/story-shadowing.service.ts`
- Test: `src/plugins/story-shadowing/story-shadowing.service.spec.ts`

- [ ] **Step 1: Viết Unit Test kiểm tra Idempotency và Enqueue Job**

Tạo `src/plugins/story-shadowing/story-shadowing.service.spec.ts`:
- Test 1: Khi `pipeline === 'youtube'` và video đã tồn tại trong DB + `forceRegenerate === false`, service trả về `{ status: 'completed', existingStoryId }`.
- Test 2: Khi video chưa tồn tại, service đẩy job vào BullMQ và trả về `{ status: 'queued', jobId, sseUrl }`.
- Test 3: `getStoryById` trả về document từ MongoDB.

- [ ] **Step 2: Chạy test xác nhận thất bại**
Run: `npx jest src/plugins/story-shadowing/story-shadowing.service.spec.ts`
Expected: FAIL (Service chưa tồn tại)

- [ ] **Step 3: Triển khai `StoryShadowingService`**

```typescript
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

  public async createJob(dto: CreateStoryShadowingJobDto) {
    // 1. Kiểm tra Idempotency đối với YouTube video
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

  public async getJob(jobId: string) {
    return this.queue.getJob(jobId);
  }

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

  public async getStories(filter?: { sourceType?: string; level?: string }) {
    const query: any = {};
    if (filter?.sourceType) query.sourceType = filter.sourceType;
    if (filter?.level) query.level = filter.level;
    const stories = await this.storybookModel.find(query).sort({ createdAt: -1 }).limit(50).lean();
    return { total: stories.length, stories };
  }

  private extractYoutubeId(url: string): string | null {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  }
}
```

- [ ] **Step 4: Chạy lại test**
Run: `npx jest src/plugins/story-shadowing/story-shadowing.service.spec.ts`
Expected: PASS

---

### Task 3: Xây dựng `StoryShadowingWorker` (Xử lý nền & Redis Pub/Sub)

**Files:**
- Create: `src/plugins/story-shadowing/story-shadowing.worker.ts`
- Test: `src/plugins/story-shadowing/story-shadowing.worker.spec.ts`

- [ ] **Step 1: Viết Unit Test cho Worker**
Kiểm tra Worker nhận Job từ BullMQ, gọi Pipeline tương ứng (`textPipeline` hoặc `youtubePipeline`), bắn các event `JOB_STARTED`, `JOB_STEP`, `JOB_COMPLETED` qua `RedisPubSubService`.

- [ ] **Step 2: Chạy test xác nhận thất bại**
Run: `npx jest src/plugins/story-shadowing/story-shadowing.worker.spec.ts`
Expected: FAIL (Worker chưa tồn tại)

- [ ] **Step 3: Triển khai `StoryShadowingWorker`**

```typescript
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
import { ExecutionContext, ProgressEvent } from '../../core/plugin.interface';

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

  async process(job: Job<CreateStoryShadowingJobDto>): Promise<any> {
    const jobId = job.id?.toString() || 'unknown';
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
      log: (msg: string, meta?: any) => this.logger.log(`[Job ${jobId}] ${msg} ${meta ? JSON.stringify(meta) : ''}`),
    };

    return new Promise((resolve, reject) => {
      const stream$ = dto.pipeline === 'text'
        ? this.textPipeline.execute({ text: dto.text!, voice: dto.voice || 'FEMALE' }, context)
        : this.youtubePipeline.execute({ youtubeUrl: dto.youtubeUrl! }, context);

      let finalState: any = null;

      stream$.subscribe({
        next: async (event: ProgressEvent) => {
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

          if (event.status === 'done' && event.payload) {
            finalState = event.payload;
          }
        },
        error: async (err: Error) => {
          this.logger.error(`Job [${jobId}] gặp lỗi: ${err.message}`);
          await this.redisPubSub.publishEvent({
            type: 'JOB_FAILED',
            jobId,
            pluginId: 'story-shadowing',
            timestamp: Date.now(),
            data: { error: err.message },
          });
          reject(err);
        },
        complete: async () => {
          try {
            if (!finalState) {
              throw new Error('Pipeline hoàn thành nhưng không có dữ liệu trả về');
            }

            // Lưu vào CSDL MongoDB
            const savedStory = await this.persistStory(dto, finalState);
            const storyId = savedStory._id.toString();

            await this.redisPubSub.publishEvent({
              type: 'JOB_COMPLETED',
              jobId,
              pluginId: 'story-shadowing',
              timestamp: Date.now(),
              data: {
                status: 'done',
                progress: 100,
                message: 'Story shadowing lesson created and saved successfully',
                payload: {
                  storyId,
                  id: storyId,
                  title: savedStory.title,
                  level: savedStory.level,
                  sentenceCount: savedStory.sentences.length,
                },
              },
            });

            this.logger.log(`✅ Hoàn thành Job [${jobId}]. StoryId: ${storyId}`);
            resolve({ storyId });
          } catch (persistErr) {
            reject(persistErr);
          }
        },
      });
    });
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
      title: dto.pipeline === 'youtube' ? (state.youtubeTitle || 'Bài luyện tập YouTube') : 'Bài luyện tập Text',
      thumbnail: dto.pipeline === 'youtube' && state.youtubeVideoId ? `https://img.youtube.com/vi/${state.youtubeVideoId}/hqdefault.jpg` : undefined,
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
```

- [ ] **Step 4: Chạy lại test**
Run: `npx jest src/plugins/story-shadowing/story-shadowing.worker.spec.ts`
Expected: PASS

---

### Task 4: Xây dựng `StoryShadowingController` (REST Endpoints & Chuẩn SSE)

**Files:**
- Create: `src/plugins/story-shadowing/story-shadowing.controller.ts`
- Test: `src/plugins/story-shadowing/story-shadowing.controller.spec.ts`

- [ ] **Step 1: Viết Unit Test cho Controller**
Kiểm tra:
- `POST /jobs` trả về `202 Accepted` với `{ jobId, sseUrl }`.
- `GET /jobs/:jobId/progress` thiết lập headers SSE và phát chunk từ Redis Pub/Sub.
- `GET /stories/:id` trả về bài học chi tiết.

- [ ] **Step 2: Chạy test xác nhận thất bại**
Run: `npx jest src/plugins/story-shadowing/story-shadowing.controller.spec.ts`
Expected: FAIL (Controller chưa tồn tại)

- [ ] **Step 3: Triển khai `StoryShadowingController`**

```typescript
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
```

- [ ] **Step 4: Chạy lại test**
Run: `npx jest src/plugins/story-shadowing/story-shadowing.controller.spec.ts`
Expected: PASS

---

### Task 5: Đăng ký Hàng đợi vào Module & Kiểm thử Tích hợp E2E

**Files:**
- Modify: `src/plugins/story-shadowing/story-shadowing.module.ts`
- Create: `test/story-shadowing.e2e-spec.ts`

- [ ] **Step 1: Cập nhật `StoryShadowingModule`**
Đăng ký BullMQ Queue `story-shadowing-queue`, controllers `StoryShadowingController`, và providers `StoryShadowingService`, `StoryShadowingWorker`.

- [ ] **Step 2: Viết E2E Integration Test `test/story-shadowing.e2e-spec.ts`**
Kiểm tra trọn vẹn luồng:
1. `POST /api/agents/story-shadowing/jobs` $\rightarrow$ 202 Accepted với `jobId` & `sseUrl`.
2. Kiểm tra Idempotency khi gọi lại với cùng video YouTube.
3. `GET /api/agents/story-shadowing/stories` trả về mảng kết quả 200 OK.

- [ ] **Step 3: Chạy toàn bộ Test Suites**
Run: `npm test`
Expected: 100% tests PASS

---

### Task 6: Cập nhật Hợp đồng API `story-shadowing-api-contract.md`

**Files:**
- Modify: `docs/contracts/story-shadowing-api-contract.md`

- [ ] **Step 1: Cập nhật đặc tả Endpoint & Sequence Diagram**
Cập nhật hợp đồng API với mô hình 2-Phase (`POST /jobs` + `GET /jobs/:jobId/progress` chuẩn EventSource), đồng bộ hóa hoàn toàn với `speaking-quiz-api-contract.md`.

- [ ] **Step 2: Commit toàn bộ công việc**
Run: `git add . && git commit -m "feat(story-shadowing): refactor to async queue and sse architecture"`
Expected: Commit thành công.
