import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AgentPlugin, AgentPluginMetadata, ExecutionContext, PipelineStep, ProgressEvent } from '../../core/plugin.interface';
import { TextPipelineService } from './pipelines/text.pipeline';
import { YoutubePipelineService } from './pipelines/youtube.pipeline';
import { z } from 'zod';

const TextPipelineInputSchema = z.object({
  text: z.string().min(10, 'Văn bản quá ngắn.').max(10000, 'Văn bản quá dài.'),
  voice: z.string().optional(),
});

const YoutubePipelineInputSchema = z.object({
  youtubeUrl: z.string().url('Link YouTube không hợp lệ.'),
});

@Injectable()
export class StoryShadowingPlugin implements AgentPlugin {
  public metadata: AgentPluginMetadata = {
    id: 'story-shadowing',
    displayName: 'Story Shadowing Agent',
    description: 'Tạo bài học tiếng Anh theo phương pháp Shadowing từ văn bản thuần hoặc video YouTube.',
    pipelines: ['text', 'youtube'],
  };

  constructor(
    private readonly textPipeline: TextPipelineService,
    private readonly youtubePipeline: YoutubePipelineService,
  ) {}

  public async validateInput(pipeline: string, input: any): Promise<any> {
    if (pipeline === 'text') {
      return TextPipelineInputSchema.parse(input);
    }
    if (pipeline === 'youtube') {
      return YoutubePipelineInputSchema.parse(input);
    }
    throw new Error(`Pipeline '${pipeline}' không được hỗ trợ trong plugin ${this.metadata.id}`);
  }

  public getSteps(pipeline: string): PipelineStep[] {
    if (pipeline === 'text') {
      return [
        { id: 'sentenceSplitter', name: 'Phân tách câu & Phiên âm IPA' },
        { id: 'ttsGenerator', name: 'Tạo giọng đọc (TTS)' },
        { id: 'keywordIdentifier', name: 'Trích xuất từ vựng khó' },
        { id: 'keywordEnricher', name: 'Giải nghĩa từ vựng' },
      ];
    }
    if (pipeline === 'youtube') {
      return [
        { id: 'youtubeFetcher', name: 'Tải phụ đề từ YouTube' },
        { id: 'youtubeConsolidator', name: 'Xử lý gộp câu & Phiên âm IPA' },
        { id: 'keywordIdentifier', name: 'Trích xuất từ vựng khó' },
        { id: 'keywordEnricher', name: 'Giải nghĩa từ vựng' },
      ];
    }
    return [];
  }

  public execute(
    pipeline: string,
    input: any,
    context: ExecutionContext,
  ): Observable<ProgressEvent> {
    if (pipeline === 'text') {
      return this.textPipeline.execute(input, context);
    }
    if (pipeline === 'youtube') {
      return this.youtubePipeline.execute(input, context);
    }
    throw new Error(`Pipeline '${pipeline}' không tồn tại.`);
  }
}
