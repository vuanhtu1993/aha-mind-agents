/**
 * @file speaking-quiz.plugin.ts
 * @description AgentPlugin implementation cho Speaking Quiz Agent
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  AgentPlugin,
  AgentPluginMetadata,
  ExecutionContext,
  PipelineStep,
  ProgressEvent,
} from '../../core/plugin.interface';
import { SpeakingQuizPipelineService } from './pipelines/speaking-quiz.pipeline';
import { SpeakingQuizJobPayloadSchema } from './speaking-quiz.schema';

@Injectable()
export class SpeakingQuizPlugin implements AgentPlugin {
  public metadata: AgentPluginMetadata = {
    id: 'speaking-quiz',
    displayName: 'Speaking Quiz Agent',
    description: 'Tự động tạo câu hỏi thảo luận đa chiều và tổng hợp giàn giáo luyện nói thích ứng (PREP, PAR, STAR, CCR) kèm câu trả lời mẫu từ bài học Storybook hoặc chủ đề tự do.',
    pipelines: [
      {
        id: 'generate',
        displayName: 'Sinh đề bài & Giàn giáo luyện nói thích ứng',
        nodes: [
          {
            id: 'contextResolver',
            type: 'tool',
            displayName: 'Phân giải ngữ cảnh Storybook / Custom Topic',
            configurableOptions: [],
          },
          {
            id: 'questionFormulator',
            type: 'llm',
            displayName: 'Tạo câu hỏi luyện nói đa chiều (Thought-provoking Prompt)',
            configurableOptions: ['systemPrompt', 'model', 'temperature', 'maxTokens'],
            defaultConfig: {
              systemPrompt: `You are an expert English language educator and communicative speech coach.\nYour task is to craft a thought-provoking, concise, and punchy open-ended question based on the provided topic, context, and target keywords. Tailor strictly to CEFR level {LEVEL}.\nSelect the most engaging angle: Debate/Opinion (PREP), Suggestion/Problem-Solving (PAR), Situational/Decision-Making (CCR), or Experience/Reflection (STAR).`,
              temperature: 0.3,
              maxTokens: 2048,
            },
          },
          {
            id: 'prepSynthesizer',
            type: 'llm',
            displayName: 'Tổng hợp giàn giáo thích ứng (PREP, PAR, STAR, CCR) & Model Answer',
            configurableOptions: ['systemPrompt', 'model', 'temperature', 'maxTokens'],
            defaultConfig: {
              systemPrompt: `You are a master speech coach, communication strategist, and English pedagogue.\nYour objective is to build an adaptive 4-stage speaking scaffold and linguistic toolkit tailored to the question's communicative intent for CEFR level {LEVEL}.\nAnalyze the question and select the single best framework from: PREP (Opinion/Debate), PAR (Advice/Problem-solving), STAR (Story/Behavioral), or CCR (Trade-offs/Nuance).`,
              temperature: 0.2,
              maxTokens: 8192,
            },
          },
          {
            id: 'persister',
            type: 'tool',
            displayName: 'Kiểm duyệt Zod & Ghi MongoDB',
            configurableOptions: [],
          },
        ],
        edges: [
          { source: 'contextResolver', target: 'questionFormulator' },
          { source: 'questionFormulator', target: 'prepSynthesizer' },
          { source: 'prepSynthesizer', target: 'persister' },
        ],
      },
    ],
  };

  constructor(private readonly pipelineService: SpeakingQuizPipelineService) { }

  public async validateInput(pipeline: string, input: any): Promise<any> {
    if (pipeline === 'generate') {
      return SpeakingQuizJobPayloadSchema.parse(input);
    }
    throw new Error(`Pipeline '${pipeline}' không được hỗ trợ trong plugin ${this.metadata.id}`);
  }

  public getSteps(pipeline: string): PipelineStep[] {
    if (pipeline === 'generate') {
      return [
        { id: 'contextResolver', name: 'Phân giải ngữ cảnh' },
        { id: 'questionFormulator', name: 'Sinh câu hỏi tranh luận' },
        { id: 'prepSynthesizer', name: 'Tổng hợp giàn giáo PREP' },
        { id: 'persister', name: 'Lưu trữ CSDL' },
      ];
    }
    return [];
  }

  public execute(
    pipeline: string,
    input: any,
    context: ExecutionContext,
  ): Observable<ProgressEvent> {
    if (pipeline === 'generate') {
      return this.pipelineService.execute(input, context);
    }
    throw new Error(`Pipeline '${pipeline}' không tồn tại trong plugin ${this.metadata.id}`);
  }
}
