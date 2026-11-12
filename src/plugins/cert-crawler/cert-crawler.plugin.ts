/**
 * @file cert-crawler.plugin.ts
 * @description AgentPlugin implementation cho Cert Crawler Agent
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import {
  AgentPlugin,
  AgentPluginMetadata,
  ExecutionContext,
  PipelineStep,
  ProgressEvent,
} from '../../core/plugin.interface';
import { SyncCertDto } from './dto/sync-cert.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class CertCrawlerPlugin implements AgentPlugin {
  public metadata: AgentPluginMetadata = {
    id: 'cert-crawler',
    displayName: 'Cert Crawler Agent',
    description:
      'Tự động thu thập, bóc tách và chuẩn hóa ngân hàng câu hỏi chứng chỉ công nghệ (CCAF, CCAO-F...) kèm lời giải thích sư phạm AI Expert.',
    pipelines: [
      {
        id: 'sync',
        displayName: 'Đồng bộ câu hỏi chứng chỉ',
        nodes: [
          {
            id: 'attemptResolver',
            type: 'tool',
            displayName: 'Khởi tạo Attempt & Lấy danh sách ID',
            configurableOptions: [],
          },
          {
            id: 'batchQuestionFetcher',
            type: 'tool',
            displayName: 'Tải đề bài theo Batch 20 câu',
            configurableOptions: [],
          },
          {
            id: 'revealProcessor',
            type: 'tool',
            displayName: 'Bóc tách đáp án & Phân tích AI Expert',
            configurableOptions: [],
          },
          {
            id: 'persister',
            type: 'tool',
            displayName: 'Lưu trữ MongoDB (cert_questions)',
            configurableOptions: [],
          },
        ],
        edges: [
          { source: 'attemptResolver', target: 'batchQuestionFetcher' },
          { source: 'batchQuestionFetcher', target: 'revealProcessor' },
          { source: 'revealProcessor', target: 'persister' },
        ],
      },
    ],
  };

  public async validateInput(pipeline: string, input: any): Promise<any> {
    if (pipeline === 'sync') {
      const dto = plainToInstance(SyncCertDto, input);
      const errors = await validate(dto);
      if (errors.length > 0) {
        throw new Error(`Dữ liệu đầu vào không hợp lệ: ${errors.map((e) => Object.values(e.constraints || {})).join(', ')}`);
      }
      return dto;
    }
    throw new Error(`Pipeline '${pipeline}' không được hỗ trợ trong plugin ${this.metadata.id}`);
  }

  public getSteps(pipeline: string): PipelineStep[] {
    if (pipeline === 'sync') {
      return [
        { id: 'attemptResolver', name: 'Khởi tạo Attempt' },
        { id: 'batchQuestionFetcher', name: 'Tải đề bài theo batch' },
        { id: 'revealProcessor', name: 'Bóc tách đáp án & AI Expert' },
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
    if (pipeline === 'sync') {
      return of({
        status: 'done',
        progress: 100,
        message: `Yêu cầu đồng bộ ${input?.certId || ''} đã được tiếp nhận vào hàng đợi BullMQ.`,
      });
    }
    throw new Error(`Pipeline '${pipeline}' không tồn tại trong plugin ${this.metadata.id}`);
  }
}

