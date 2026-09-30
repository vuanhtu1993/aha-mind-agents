/**
 * @file speaking-quiz.state.ts
 * @description LangGraph State Annotation cho Speaking Quiz Agent Pipeline
 *
 * Made by Anh Tu - Share to be share
 */

import { Annotation } from '@langchain/langgraph';
import { PrepSynthesizerOutput } from './speaking-quiz.schema';

export interface TargetKeywordItemType {
  word: string;
  ipa?: string;
  meaning: string;
}

export const SpeakingQuizState = Annotation.Root({
  // Input parameters
  storybookId: Annotation<string | undefined>(),
  customTopic: Annotation<string | undefined>(),
  requestedLevel: Annotation<'B1' | 'B2' | 'C1'>(),
  customKeywords: Annotation<string[] | undefined>({
    reducer: (_, y) => y,
  }),

  // Agent Runtime Config
  config: Annotation<any>(),

  // Resolved context (Node 1)
  resolvedTopic: Annotation<string>(),
  sourceContentSummary: Annotation<string>(),
  targetKeywords: Annotation<TargetKeywordItemType[]>({
    reducer: (_, y) => y,
    default: () => [],
  }),
  level: Annotation<'B1' | 'B2' | 'C1'>(),

  // LLM Outputs (Node 2 & Node 3)
  generatedQuestion: Annotation<string | undefined>(),
  prepScaffold: Annotation<PrepSynthesizerOutput | undefined>({
    reducer: (_, y) => y,
  }),

  // Execution result & tokens (Node 4)
  persistedId: Annotation<string | undefined>(),
  error: Annotation<string | null>(),
  tokenUsage: Annotation<{ promptTokens: number; completionTokens: number; totalTokens: number }>({
    reducer: (prev, curr) => ({
      promptTokens: (prev?.promptTokens || 0) + (curr?.promptTokens || 0),
      completionTokens: (prev?.completionTokens || 0) + (curr?.completionTokens || 0),
      totalTokens: (prev?.totalTokens || 0) + (curr?.totalTokens || 0),
    }),
    default: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
  }),
});

export type SpeakingQuizStateType = typeof SpeakingQuizState.State;
