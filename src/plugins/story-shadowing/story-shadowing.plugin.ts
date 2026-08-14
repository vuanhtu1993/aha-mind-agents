import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AgentPlugin, AgentPluginMetadata, ExecutionContext, PipelineStep, ProgressEvent } from '../../core/plugin.interface';
import { TextPipelineService } from './pipelines/text.pipeline';
import { YoutubePipelineService } from './pipelines/youtube.pipeline';
import { z } from 'zod';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';
import { Storybook } from '../../infra/database/schemas/storybook.schema';

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
    pipelines: [
      {
        id: 'text',
        displayName: 'Xử lý Văn bản thuần',
        nodes: [
          {
            id: 'sentenceSplitter',
            type: 'llm',
            displayName: 'Phân tách câu & Phiên âm IPA',
            configurableOptions: ['systemPrompt', 'model', 'temperature'],
            defaultConfig: {
              systemPrompt: `You are a language learning assistant and phonetics expert.\nGiven a raw English text, break it down into natural, logical sentences for shadowing practice.`,
              temperature: 0.1
            }
          },
          {
            id: 'ttsGenerator',
            type: 'tool',
            displayName: 'Tạo giọng đọc (TTS)',
            configurableOptions: []
          },
          {
            id: 'keywordIdentifier',
            type: 'llm',
            displayName: 'Trích xuất từ vựng khó',
            configurableOptions: ['systemPrompt', 'model', 'temperature'],
            defaultConfig: {
              systemPrompt: `You are a professional lexicographer and curriculum designer for English learners. Your task is to identify and extract difficult vocabulary, idioms, and phrasal verbs from the provided English text.`,
              temperature: 0.1
            }
          },
          {
            id: 'keywordEnricher',
            type: 'llm',
            displayName: 'Giải nghĩa từ vựng',
            configurableOptions: ['systemPrompt', 'model', 'temperature'],
            defaultConfig: {
              systemPrompt: `You are an English teacher explaining vocabulary to a B1-B2 learner.\nFor EACH item, provide a clear, simple explanation (in Vietnamese if helpful, or simple English) of what this item means EXACTLY IN THIS CONTEXT.`,
              temperature: 0.1
            }
          }
        ],
        edges: [
          { source: 'sentenceSplitter', target: 'ttsGenerator' },
          { source: 'sentenceSplitter', target: 'keywordIdentifier' },
          { source: 'keywordIdentifier', target: 'keywordEnricher' }
        ]
      },
      {
        id: 'youtube',
        displayName: 'Xử lý Video YouTube',
        nodes: [
          {
            id: 'youtubeFetcher',
            type: 'tool',
            displayName: 'Tải phụ đề từ YouTube',
            configurableOptions: []
          },
          {
            id: 'youtubeConsolidator',
            type: 'llm',
            displayName: 'Xử lý gộp câu & Phiên âm IPA',
            configurableOptions: ['systemPrompt', 'model', 'temperature'],
            defaultConfig: {
              systemPrompt: `You are an expert linguist and audio synchronizer.\nYour task is to take a list of raw subtitle fragments from YouTube and consolidate them into complete, grammatically correct, natural-sounding sentences.`,
              temperature: 0.1
            }
          },
          {
            id: 'keywordIdentifier',
            type: 'llm',
            displayName: 'Trích xuất từ vựng khó',
            configurableOptions: ['systemPrompt', 'model', 'temperature'],
            defaultConfig: {
              systemPrompt: `You are a professional lexicographer and curriculum designer for English learners. Your task is to identify and extract difficult vocabulary, idioms, and phrasal verbs from the provided English text.`,
              temperature: 0.1
            }
          },
          {
            id: 'keywordEnricher',
            type: 'llm',
            displayName: 'Giải nghĩa từ vựng',
            configurableOptions: ['systemPrompt', 'model', 'temperature'],
            defaultConfig: {
              systemPrompt: `You are an English teacher explaining vocabulary to a B1-B2 learner.\nFor EACH item, provide a clear, simple explanation (in Vietnamese if helpful, or simple English) of what this item means EXACTLY IN THIS CONTEXT.`,
              temperature: 0.1
            }
          }
        ],
        edges: [
          { source: 'youtubeFetcher', target: 'youtubeConsolidator' },
          { source: 'youtubeConsolidator', target: 'keywordIdentifier' },
          { source: 'keywordIdentifier', target: 'keywordEnricher' }
        ]
      }
    ],
  };

  constructor(
    private readonly textPipeline: TextPipelineService,
    private readonly youtubePipeline: YoutubePipelineService,
    @InjectModel(Storybook.name, AHA_TOOLS_CONNECTION)
    private readonly storybookModel: Model<Storybook>,
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
    return new Observable<ProgressEvent>((subscriber) => {
      const steps = this.getSteps(pipeline);
      const entryNodeId = steps.length > 0 ? steps[0].id : undefined;
      let stream$: Observable<ProgressEvent>;

      if (pipeline === 'text') {
        stream$ = this.textPipeline.execute(input, context, entryNodeId);
      } else if (pipeline === 'youtube') {
        stream$ = this.youtubePipeline.execute(input, context, entryNodeId);
      } else {
        throw new Error(`Pipeline '${pipeline}' không tồn tại.`);
      }

      const subscription = stream$.subscribe({
        next: (event) => {
          subscriber.next(event);
          // Nếu event là done, tiến hành lưu vào DB
          if (event.status === 'done' && event.payload) {
            this.saveToDatabase(pipeline, input, event.payload, context).catch(err => {
              context.log('❌ Lỗi khi lưu vào Database', err);
            });
          }
        },
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      return () => subscription.unsubscribe();
    });
  }

  private async saveToDatabase(pipeline: string, input: any, finalState: any, context: ExecutionContext) {
    context.log('Đang lưu bài học vào CSDL Storybooks...');
    
    // Tạo originalText cho youtube nếu không có rawText
    let originalText = finalState.rawText;
    if (!originalText && finalState.sentences) {
      originalText = finalState.sentences.map((s: any) => s.text).join(' ');
    }
    if (!originalText) {
      originalText = input.youtubeUrl || 'Bản ghi không có nội dung gốc.';
    }

    const newStory = new this.storybookModel({
      title: pipeline === 'youtube' ? finalState.youtubeTitle : 'Bài luyện tập Text',
      thumbnail: pipeline === 'youtube' && finalState.youtubeVideoId ? `https://img.youtube.com/vi/${finalState.youtubeVideoId}/hqdefault.jpg` : undefined,
      originalText: originalText,
      youtubeVideoId: finalState.youtubeVideoId,
      sentences: finalState.sentences,
      keywords: finalState.keywords,
      level: finalState.level,
      voice: finalState.voice || 'FEMALE',
      speakingRate: finalState.speakingRate || 1.0,
      sourceType: pipeline,
    });
    
    const saved = await newStory.save();
    context.log(`✅ Đã lưu bài học thành công. ID: ${saved._id}`);
  }
}
