import { Injectable, Logger } from '@nestjs/common';
import { StateGraph, END } from '@langchain/langgraph';
import { Observable } from 'rxjs';
import { ProgressEvent, ExecutionContext } from '../../../core/plugin.interface';
import { StoryShadowingState, StoryShadowingStateType } from '../story-shadowing.state';
import { YoutubeTranscriptFetcherNode } from '../nodes/youtube-transcript-fetcher.node';
import { YoutubeSentenceConsolidatorNode } from '../nodes/youtube-sentence-consolidator.node';
import { KeywordIdentifierNode } from '../nodes/keyword-identifier.node';
import { KeywordEnricherNode } from '../nodes/keyword-enricher.node';

@Injectable()
export class YoutubePipelineService {
  private readonly logger = new Logger(YoutubePipelineService.name);

  constructor(
    private readonly youtubeFetcher: YoutubeTranscriptFetcherNode,
    private readonly youtubeConsolidator: YoutubeSentenceConsolidatorNode,
    private readonly keywordIdentifier: KeywordIdentifierNode,
    private readonly keywordEnricher: KeywordEnricherNode,
  ) {}

  public execute(
    input: { youtubeUrl: string },
    context: ExecutionContext,
  ): Observable<ProgressEvent> {
    return new Observable<ProgressEvent>((subscriber) => {
      subscriber.next({ status: 'init', message: 'Khởi tạo YouTube Pipeline...' });

      const workflow = new StateGraph(StoryShadowingState)
        .addNode('youtubeFetcher', (state) => this.youtubeFetcher.invoke(state as StoryShadowingStateType))
        .addNode('youtubeConsolidator', (state) => this.youtubeConsolidator.invoke(state as StoryShadowingStateType))
        .addNode('keywordIdentifier', (state) => this.keywordIdentifier.invoke(state as StoryShadowingStateType))
        .addNode('keywordEnricher', (state) => this.keywordEnricher.invoke(state as StoryShadowingStateType))
        .addEdge('__start__', 'youtubeFetcher')
        .addEdge('youtubeFetcher', 'youtubeConsolidator')
        .addEdge('youtubeConsolidator', 'keywordIdentifier') 
        .addEdge('keywordIdentifier', 'keywordEnricher')
        .addEdge('keywordEnricher', END);

      const app = workflow.compile();

      const runPipeline = async () => {
        try {
          const heartbeatInterval = setInterval(() => {
            subscriber.next({ status: 'running', message: 'Heartbeat ping' });
          }, 15000);

          let finalState: any = { youtubeUrl: input.youtubeUrl };
          
          for await (const chunk of await app.stream(finalState)) {
            if (chunk.youtubeFetcher) {
              subscriber.next({ stepId: 'youtubeFetcher', status: 'completed', progress: 20, message: 'Đã tải phụ đề từ YouTube' });
              finalState = { ...finalState, ...chunk.youtubeFetcher };
            }
            if (chunk.youtubeConsolidator) {
              subscriber.next({ stepId: 'youtubeConsolidator', status: 'completed', progress: 50, message: 'Đã gộp câu và tạo IPA bằng AI' });
              finalState = { ...finalState, ...chunk.youtubeConsolidator };
            }
            if (chunk.keywordIdentifier) {
              subscriber.next({ stepId: 'keywordIdentifier', status: 'completed', progress: 70, message: 'Đã trích xuất từ vựng khó' });
              finalState = { ...finalState, ...chunk.keywordIdentifier };
            }
            if (chunk.keywordEnricher) {
              subscriber.next({ stepId: 'keywordEnricher', status: 'completed', progress: 95, message: 'Hoàn thành giải nghĩa từ vựng' });
              finalState = { ...finalState, ...chunk.keywordEnricher };
            }
          }

          clearInterval(heartbeatInterval);

          if (finalState.error) {
            throw new Error(finalState.error);
          }

          subscriber.next({ 
            status: 'done', 
            progress: 100, 
            message: 'Hoàn thành toàn bộ YouTube Pipeline', 
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
