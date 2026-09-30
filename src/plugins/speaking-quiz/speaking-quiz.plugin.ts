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
    description: 'Tự động tạo câu hỏi phản biện và giàn giáo luyện nói PREP (Point, Reason, Example, Conclusion) từ bài học Storybook hoặc chủ đề tự do.',
    pipelines: [
      {
        id: 'generate',
        displayName: 'Sinh đề bài nói PREP',
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
            displayName: 'Tạo câu hỏi tranh luận phản biện',
            configurableOptions: ['systemPrompt', 'model', 'temperature'],
            defaultConfig: {
              temperature: 0.3,
            },
          },
          {
            id: 'prepSynthesizer',
            type: 'llm',
            displayName: 'Tổng hợp giàn giáo PREP & Model Answer',
            configurableOptions: ['systemPrompt', 'model', 'temperature'],
            defaultConfig: {
              temperature: 0.2,
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

  constructor(private readonly pipelineService: SpeakingQuizPipelineService) {}

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
