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
    entryNodeId?: string,
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

      let activeStepId = entryNodeId || 'sentenceSplitter';

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
          
          const stepDetails: Record<string, { progress: number; message: string }> = {
            sentenceSplitter: { progress: 30, message: 'Đã phân tách câu và IPA' },
            ttsGenerator: { progress: 80, message: 'Hoàn thành tổng hợp âm thanh TTS' },
            keywordIdentifier: { progress: 50, message: 'Đã trích xuất từ vựng khó' },
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
            message: 'Hoàn thành toàn bộ Text Pipeline', 
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
