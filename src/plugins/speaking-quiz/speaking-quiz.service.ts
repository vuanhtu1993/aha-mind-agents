/**
 * @file speaking-quiz.service.ts
 * @description Service xử lý Business Logic và Queue Interaction cho Speaking Quiz
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';
import { SpeakingQuestion } from '../../infra/database/schemas/speaking-question.schema';
import { CreateSpeakingQuizJobDto } from './dto/create-speaking-quiz-job.dto';

@Injectable()
export class SpeakingQuizService {
  private readonly logger = new Logger(SpeakingQuizService.name);

  constructor(
    @InjectQueue('speaking-quiz-queue')
    private readonly queue: Queue,
    @InjectModel(SpeakingQuestion.name, AHA_TOOLS_CONNECTION)
    private readonly questionModel: Model<SpeakingQuestion>,
  ) { }

  public async createJob(dto: CreateSpeakingQuizJobDto) {
    // 1. Kiểm tra Idempotency nếu đã có câu hỏi cho storybookId
    if (dto.storybookId && !dto.forceRegenerate && Types.ObjectId.isValid(dto.storybookId)) {
      const existing = await this.questionModel
        .findOne({ storybookId: new Types.ObjectId(dto.storybookId), status: 'active' })
        .lean();

      if (existing) {
        this.logger.log(`Tái sử dụng câu hỏi có sẵn cho Storybook [${dto.storybookId}]`);
        return {
          jobId: `existing-${(existing as any)._id}`,
          status: 'completed',
          existingQuestionId: (existing as any)._id.toString(),
          createdAt: (existing as any).createdAt ? (existing as any).createdAt.toISOString() : new Date().toISOString(),
        };
      }
    }

    // 2. Đẩy job vào BullMQ Queue
    const job = await this.queue.add(
      'generate-speaking-quiz',
      {
        storybookId: dto.storybookId,
        customTopic: dto.customTopic,
        level: dto.level || 'B2',
        targetKeywords: dto.targetKeywords,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    const jobId = job.id || `job-sq-${Date.now()}`;

    return {
      jobId,
      status: 'queued',
      sseUrl: `/api/agents/speaking-quiz/jobs/${jobId}/progress`,
      createdAt: new Date().toISOString(),
    };
  }

  public async getQuestions(filter?: { storybookId?: string; level?: string }) {
    const query: Record<string, any> = { status: 'active' };

    if (filter?.storybookId) {
      if (!Types.ObjectId.isValid(filter.storybookId)) {
        return { total: 0, questions: [] };
      }
      query.storybookId = new Types.ObjectId(filter.storybookId);
    }

    if (filter?.level) {
      query.level = filter.level;
    }

    const docs = await this.questionModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean();

    return {
      total: docs.length,
      questions: docs.map((doc: any) => ({
        id: doc._id.toString(),
        storybookId: doc.storybookId ? doc.storybookId.toString() : undefined,
        topic: doc.topic,
        question: doc.question,
        level: doc.level,
        targetKeywords: doc.targetKeywords,
        prepScaffold: doc.prepScaffold,
      })),
    };
  }

  public async getQuestionById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`ID câu hỏi không hợp lệ: ${id}`);
    }
    const question = await this.questionModel.findById(id).lean();
    if (!question) {
      throw new NotFoundException(`Không tìm thấy câu hỏi với ID: ${id}`);
    }
    return {
      id: (question as any)._id.toString(),
      storybookId: (question as any).storybookId ? (question as any).storybookId.toString() : undefined,
      topic: (question as any).topic,
      question: (question as any).question,
      level: (question as any).level,
      targetKeywords: (question as any).targetKeywords,
      prepScaffold: (question as any).prepScaffold,
    };
  }

  public async getQuestionsByStorybook(storybookId: string) {
    return this.getQuestions({ storybookId });
  }

  public async getJob(jobId: string) {
    return this.queue.getJob(jobId);
  }
}
