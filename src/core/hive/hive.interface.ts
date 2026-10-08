export type HiveRole = 'system' | 'user' | 'assistant';

export interface HiveMessage {
  role: HiveRole;
  content: string;
}

export interface HiveCallOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  name?: string;
}

export interface HiveTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
}

export interface HiveInvokeResult {
  text: string;
  usage: HiveTokenUsage;
  reasoning?: string;
}

export interface HiveStructuredResult<T> {
  parsed: T;
  usage: HiveTokenUsage;
}

export interface HiveStreamChunk {
  content?: string;
  reasoning?: string;
  isDone: boolean;
  usage?: HiveTokenUsage;
}
