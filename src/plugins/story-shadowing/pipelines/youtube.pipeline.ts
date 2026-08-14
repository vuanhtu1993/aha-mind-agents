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
    entryNodeId?: string,
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

      let activeStepId = entryNodeId || 'youtubeFetcher';

      const runPipeline = async () => {
        try {
          const heartbeatInterval = setInterval(() => {
            subscriber.next({ status: 'running', message: 'Heartbeat ping' });
          }, 15000);

          const finalState: Partial<StoryShadowingStateType> = {
            youtubeUrl: input.youtubeUrl,
            config: context.config,
          };
          
          const stepDetails: Record<string, { progress: number; message: string }> = {
            youtubeFetcher: { progress: 30, message: 'Đã tải phụ đề từ YouTube' },
            youtubeConsolidator: { progress: 50, message: 'Đã gộp câu và phiên âm IPA' },
            keywordIdentifier: { progress: 75, message: 'Đã trích xuất từ vựng khó' },
            keywordEnricher: { progress: 95, message: 'Hoàn thành giải nghĩa từ vựng' },
          };

          for await (const chunk of await app.stream(finalState)) {
            const nodeKey = Object.keys(chunk)[0];
            if (nodeKey && chunk[nodeKey]) {
              activeStepId = nodeKey;
              Object.assign(finalState, chunk[nodeKey]);
              if (finalState.error) break;

              const stepInfo = stepDetails[nodeKey] || { progress: 50, message: `Hoàn thành node ${nodeKey}` };
              subscriber.next({
                stepId: nodeKey,
                status: 'completed',
                progress: stepInfo.progress,
                message: stepInfo.message,
              });
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
          subscriber.next({ stepId: activeStepId, status: 'failed', message: `Lỗi tại node [${activeStepId}]: ${error.message}` });
          subscriber.complete();
        }
      };

      runPipeline();
    });
  }
}
