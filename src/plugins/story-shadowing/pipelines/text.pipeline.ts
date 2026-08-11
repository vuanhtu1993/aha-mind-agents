import { Injectable, Logger } from '@nestjs/common';
import { StateGraph, END } from '@langchain/langgraph';
import { Observable } from 'rxjs';
import { ProgressEvent, ExecutionContext } from '../../../core/plugin.interface';
import { StoryShadowingState, StoryShadowingStateType } from '../story-shadowing.state';
import { SentenceSplitterNode } from '../nodes/sentence-splitter.node';
import { TtsGeneratorNode } from '../nodes/tts-generator.node';
import { KeywordIdentifierNode } from '../nodes/keyword-identifier.node';
import { KeywordEnricherNode } from '../nodes/keyword-enricher.node';

@Injectable()
export class TextPipelineService {
  private readonly logger = new Logger(TextPipelineService.name);

  constructor(
    private readonly sentenceSplitter: SentenceSplitterNode,
    private readonly ttsGenerator: TtsGeneratorNode,
    private readonly keywordIdentifier: KeywordIdentifierNode,
    private readonly keywordEnricher: KeywordEnricherNode,
  ) {}

  public execute(
    input: { text: string; voice: string },
    context: ExecutionContext,
  ): Observable<ProgressEvent> {
    return new Observable<ProgressEvent>((subscriber) => {
      subscriber.next({ status: 'init', message: 'Khởi tạo Text Pipeline...' });

      const workflow = new StateGraph(StoryShadowingState)
        .addNode('sentenceSplitter', (state) => this.sentenceSplitter.invoke(state as StoryShadowingStateType))
        .addNode('ttsGenerator', (state) => this.ttsGenerator.invoke(state as StoryShadowingStateType))
        .addNode('keywordIdentifier', (state) => this.keywordIdentifier.invoke(state as StoryShadowingStateType))
        .addNode('keywordEnricher', (state) => this.keywordEnricher.invoke(state as StoryShadowingStateType))
        .addEdge('__start__', 'sentenceSplitter')
        .addEdge('sentenceSplitter', 'ttsGenerator')
        .addEdge('sentenceSplitter', 'keywordIdentifier') // Chạy song song với TTS
        .addEdge('keywordIdentifier', 'keywordEnricher')
        .addEdge('ttsGenerator', END)
        .addEdge('keywordEnricher', END);

      const app = workflow.compile();

      const runPipeline = async () => {
        try {
          // Bắt đầu nhịp tim giả (Heartbeat) mỗi 15s để chống Vercel timeout
          const heartbeatInterval = setInterval(() => {
            subscriber.next({ status: 'running', message: 'Heartbeat ping' });
          }, 15000);

          const finalState: Partial<StoryShadowingStateType> = {
            rawText: input.text,
            voice: input.voice || 'FEMALE',
            config: context.config,
          };
          
          for await (const chunk of await app.stream(finalState)) {
            // Phát event cập nhật tiến độ
            if (chunk.sentenceSplitter) {
              Object.assign(finalState, chunk.sentenceSplitter);
              if (finalState.error) break;
              subscriber.next({ stepId: 'sentenceSplitter', status: 'completed', progress: 30, message: 'Đã phân tách câu và IPA' });
            }
            if (chunk.ttsGenerator) {
              Object.assign(finalState, chunk.ttsGenerator);
              if (finalState.error) break;
              subscriber.next({ stepId: 'ttsGenerator', status: 'completed', progress: 80, message: 'Hoàn thành tổng hợp âm thanh TTS' });
            }
            if (chunk.keywordIdentifier) {
              Object.assign(finalState, chunk.keywordIdentifier);
              if (finalState.error) break;
              subscriber.next({ stepId: 'keywordIdentifier', status: 'completed', progress: 50, message: 'Đã trích xuất từ vựng khó' });
            }
            if (chunk.keywordEnricher) {
              Object.assign(finalState, chunk.keywordEnricher);
              if (finalState.error) break;
              subscriber.next({ stepId: 'keywordEnricher', status: 'completed', progress: 95, message: 'Hoàn thành giải nghĩa từ vựng' });
            }
          }

          clearInterval(heartbeatInterval);

          if (finalState.error) {
            throw new Error(finalState.error);
          }

          subscriber.next({ 
            status: 'done', 
            progress: 100, 
            message: 'Hoàn thành toàn bộ Text Pipeline', 
            payload: finalState 
          });
          subscriber.complete();
        } catch (error: any) {
          subscriber.next({ status: 'failed', message: `Lỗi: ${error.message}` });
          subscriber.complete();
        }
      };

      runPipeline();
    });
  }
}
