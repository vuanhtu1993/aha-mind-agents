/**
 * @file speaking-quiz.pipeline.ts
 * @description Pipeline điều phối LangGraph StateGraph cho Speaking Quiz Agent
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { StateGraph, END } from '@langchain/langgraph';
import { Observable } from 'rxjs';
import { ProgressEvent, ExecutionContext } from '../../../core/plugin.interface';
import { SpeakingQuizState, SpeakingQuizStateType } from '../speaking-quiz.state';
import { ContextResolverNode } from '../nodes/context-resolver.node';
import { QuestionFormulatorNode } from '../nodes/question-formulator.node';
import { PrepSynthesizerNode } from '../nodes/prep-synthesizer.node';
import { PersisterNode } from '../nodes/persister.node';

@Injectable()
export class SpeakingQuizPipelineService {
  private readonly logger = new Logger(SpeakingQuizPipelineService.name);

  constructor(
    private readonly contextResolver: ContextResolverNode,
    private readonly questionFormulator: QuestionFormulatorNode,
    private readonly prepSynthesizer: PrepSynthesizerNode,
    private readonly persister: PersisterNode,
  ) {}

  public execute(
    input: { storybookId?: string; customTopic?: string; level?: 'B1' | 'B2' | 'C1'; targetKeywords?: string[] },
    context: ExecutionContext,
  ): Observable<ProgressEvent> {
    return new Observable<ProgressEvent>((subscriber) => {
      subscriber.next({ status: 'init', message: 'Khởi tạo Speaking Quiz Pipeline...' });

      const workflow = new StateGraph(SpeakingQuizState)
        .addNode('contextResolver', (state) => this.contextResolver.invoke(state as SpeakingQuizStateType))
        .addNode('questionFormulator', (state) => this.questionFormulator.invoke(state as SpeakingQuizStateType))
        .addNode('prepSynthesizer', (state) => this.prepSynthesizer.invoke(state as SpeakingQuizStateType))
        .addNode('persister', (state) => this.persister.invoke(state as SpeakingQuizStateType))
        .addEdge('__start__', 'contextResolver')
        .addEdge('contextResolver', 'questionFormulator')
        .addEdge('questionFormulator', 'prepSynthesizer')
        .addEdge('prepSynthesizer', 'persister')
        .addEdge('persister', END);

      const app = workflow.compile();

      const runPipeline = async () => {
        try {
          const finalState: Partial<SpeakingQuizStateType> = {
            storybookId: input.storybookId,
            customTopic: input.customTopic,
            requestedLevel: input.level || 'B2',
            customKeywords: input.targetKeywords,
            config: context.config,
          };

          const stepDetails: Record<string, { progress: number; stage: string; message: string }> = {
            contextResolver: { progress: 25, stage: 'context_resolved', message: 'Context resolved successfully' },
            questionFormulator: { progress: 50, stage: 'question_formulated', message: 'Debate question formulated' },
            prepSynthesizer: { progress: 80, stage: 'prep_synthesized', message: 'PREP scaffold synthesized' },
            persister: { progress: 100, stage: 'completed', message: 'Speaking quiz successfully created and saved' },
          };

          for await (const chunk of await app.stream(finalState as any)) {
            const nodeKey = Object.keys(chunk)[0];
            if (nodeKey && chunk[nodeKey]) {
              Object.assign(finalState, chunk[nodeKey]);
              if (finalState.error) break;

              const stepInfo = stepDetails[nodeKey] || { progress: 50, stage: nodeKey, message: `Completed ${nodeKey}` };
              subscriber.next({
                jobId: context.jobId,
                stepId: nodeKey,
                stepName: stepInfo.stage,
                status: 'completed',
                progress: stepInfo.progress,
                message: stepInfo.message,
                payload: nodeKey === 'persister' ? { questionId: finalState.persistedId } : undefined,
              });
            }
          }

          if (finalState.error) {
            throw new Error(finalState.error);
          }

          subscriber.next({
            jobId: context.jobId,
            status: 'done',
            progress: 100,
            message: 'Speaking quiz generation completed',
            payload: {
              questionId: finalState.persistedId,
              topic: finalState.resolvedTopic,
              question: finalState.generatedQuestion,
              level: finalState.level,
              tokenUsage: finalState.tokenUsage,
            },
          });
          subscriber.complete();
        } catch (error: any) {
          subscriber.next({
            jobId: context.jobId,
            status: 'failed',
            message: `Pipeline failure: ${error.message}`,
          });
          subscriber.error(error);
        }
      };

      runPipeline();
    });
  }
}
