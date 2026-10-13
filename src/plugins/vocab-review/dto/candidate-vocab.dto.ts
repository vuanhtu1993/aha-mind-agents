/**
 * @file candidate-vocab.dto.ts
 * @description Type definitions cho từ vựng trích xuất tích hợp vào Speaking Quiz
 *
 * Made by Anh Tu - Share to be share
 */

export interface CandidateVocabItem {
  word: string;
  explanation: string;
  level: string;
  srsStatus: 'due' | 'learning' | 'mastered' | 'new';
}
