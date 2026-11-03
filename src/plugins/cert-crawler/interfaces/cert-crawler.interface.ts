/**
 * @file cert-crawler.interface.ts
 * @description Định nghĩa các kiểu dữ liệu cho Cert Crawler
 *
 * Made by Anh Tu - Share to be share
 */

export interface RawQuestionItem {
  id: number;
  question_no: number;
  question_en: string;
  question_vi?: string;
  question_ja?: string;
  options: Record<string, string>;
  options_vi?: Record<string, string>;
  options_ja?: Record<string, string>;
  is_multi: boolean;
  topic: string;
  guide_ref?: string;
  review_confidence?: string;
}

export interface CrawlQuestionJobData {
  certId: string;
  attemptId: number;
  question: RawQuestionItem;
}

export interface RevealResponse {
  answer_key?: string;
  correct?: string;
  correct_verified?: string;
  explanation?: string;
  ai_expert?: string;
  ai_expert_ja?: string;
  source_url?: string;
  source_ref?: string;
  guide_ref?: string;
}
