/**
 * @file speaking-quiz.schema.ts
 * @description Zod Schemas cho module Speaking Quiz (Validation & Structured Outputs)
 *
 * Made by Anh Tu - Share to be share
 */

import { z } from 'zod';

export const CefrLevelSchema = z.enum(['B1', 'B2', 'C1']);

export const StorybookSpeakingInputSchema = z.object({
  storybookId: z.string().min(1, 'storybookId không được để trống'),
  level: CefrLevelSchema.default('B2'),
  forceRegenerate: z.boolean().optional().default(false),
});

export const CustomTopicSpeakingInputSchema = z.object({
  customTopic: z.string().min(3, 'customTopic phải có ít nhất 3 ký tự'),
  level: CefrLevelSchema.default('B2'),
  targetKeywords: z.array(z.string()).optional(),
  forceRegenerate: z.boolean().optional().default(false),
});

export const SpeakingQuizJobPayloadSchema = z.object({
  storybookId: z.string().optional(),
  customTopic: z.string().optional(),
  level: CefrLevelSchema.default('B2'),
  targetKeywords: z.array(z.string()).optional(),
  forceRegenerate: z.boolean().optional().default(false),
}).refine(data => data.storybookId || data.customTopic, {
  message: 'Bắt buộc phải cung cấp storybookId hoặc customTopic',
});

export const QuestionFormulatorOutputSchema = z.object({
  topic: z.string().min(2, 'Topic không được để trống'),
  question: z.string().min(10, 'Câu hỏi tranh luận phải rõ ràng và chi tiết'),
});

const StageScaffoldSchema = z.object({
  title: z.string().min(1),
  signposts: z.array(z.string().min(1)).min(2, 'Cần tối thiểu 2 cụm từ nối (signposts)'),
  hint: z.string().min(5, 'Gợi ý giàn giáo phải cụ thể'),
  modelAnswer: z.string().min(10, 'Câu mẫu phải có nội dung hoàn chỉnh'),
});

export const PrepSynthesizerOutputSchema = z.object({
  point: StageScaffoldSchema,
  reason: StageScaffoldSchema,
  example: StageScaffoldSchema,
  conclusion: StageScaffoldSchema,
});

export type StorybookSpeakingInput = z.infer<typeof StorybookSpeakingInputSchema>;
export type CustomTopicSpeakingInput = z.infer<typeof CustomTopicSpeakingInputSchema>;
export type SpeakingQuizJobPayload = z.infer<typeof SpeakingQuizJobPayloadSchema>;
export type QuestionFormulatorOutput = z.infer<typeof QuestionFormulatorOutputSchema>;
export type PrepSynthesizerOutput = z.infer<typeof PrepSynthesizerOutputSchema>;
