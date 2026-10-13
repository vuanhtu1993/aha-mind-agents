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

const createStageSchema = (stageName: string) =>
  z.object({
    title: z.string().min(1).describe(`Title for ${stageName}`),
    signposts: z.array(z.string().min(1)).min(2, 'Cần tối thiểu 2 cụm từ nối (signposts)'),
    hint: z.string().min(5, 'Gợi ý giàn giáo phải cụ thể'),
    modelAnswer: z.string().min(10, 'Câu mẫu phải có nội dung hoàn chỉnh'),
  });

export const PrepSynthesizerOutputSchema = z.object({
  point: createStageSchema('point'),
  reason: createStageSchema('reason'),
  example: createStageSchema('example'),
  conclusion: createStageSchema('conclusion'),
});

export const FrameworkTypeSchema = z.enum(['PREP', 'PAR', 'STAR', 'CCR']);

export const TopicCollocationSchema = z.object({
  phrase: z.string().min(1, 'Collocation phrase không được để trống'),
  meaning: z.string().min(1, 'Ý nghĩa collocation không được để trống'),
  ipa: z.string().optional(),
});

export const ScaffoldStageItemSchema = z.object({
  stageKey: z.string().min(1, 'stageKey không được để trống'),
  title: z.string().min(1, 'title không được để trống'),
  signposts: z.array(z.string().min(1)).min(2, 'Cần tối thiểu 2 cụm từ nối (signposts)'),
  hint: z.string().min(5, 'Gợi ý giàn giáo phải cụ thể'),
  modelAnswer: z.string().min(10, 'Câu mẫu phải có nội dung hoàn chỉnh'),
});

export const AdaptiveScaffoldOutputSchema = z.object({
  frameworkType: FrameworkTypeSchema,
  frameworkName: z.string().min(1, 'frameworkName không được để trống'),
  frameworkDescription: z.string().min(5, 'frameworkDescription phải có ít nhất 5 ký tự'),
  topicCollocations: z.array(TopicCollocationSchema).min(2, 'Cần tối thiểu 2 cụm collocations theo chủ đề'),
  stages: z.object({
    stage1: ScaffoldStageItemSchema,
    stage2: ScaffoldStageItemSchema,
    stage3: ScaffoldStageItemSchema,
    stage4: ScaffoldStageItemSchema,
  }),
});

/**
 * Hàm cầu nối chuyển đổi AdaptiveScaffold sang PrepSynthesizerOutput (Legacy 4-stage structure)
 * Đảm bảo 100% tương thích ngược với code UI Next.js hiện hữu
 */
export function toLegacyPrepScaffold(adaptive: z.infer<typeof AdaptiveScaffoldOutputSchema>): z.infer<typeof PrepSynthesizerOutputSchema> {
  return {
    point: {
      title: adaptive.stages.stage1.title,
      signposts: adaptive.stages.stage1.signposts,
      hint: adaptive.stages.stage1.hint,
      modelAnswer: adaptive.stages.stage1.modelAnswer,
    },
    reason: {
      title: adaptive.stages.stage2.title,
      signposts: adaptive.stages.stage2.signposts,
      hint: adaptive.stages.stage2.hint,
      modelAnswer: adaptive.stages.stage2.modelAnswer,
    },
    example: {
      title: adaptive.stages.stage3.title,
      signposts: adaptive.stages.stage3.signposts,
      hint: adaptive.stages.stage3.hint,
      modelAnswer: adaptive.stages.stage3.modelAnswer,
    },
    conclusion: {
      title: adaptive.stages.stage4.title,
      signposts: adaptive.stages.stage4.signposts,
      hint: adaptive.stages.stage4.hint,
      modelAnswer: adaptive.stages.stage4.modelAnswer,
    },
  };
}

export type StorybookSpeakingInput = z.infer<typeof StorybookSpeakingInputSchema>;
export type CustomTopicSpeakingInput = z.infer<typeof CustomTopicSpeakingInputSchema>;
export type SpeakingQuizJobPayload = z.infer<typeof SpeakingQuizJobPayloadSchema>;
export type QuestionFormulatorOutput = z.infer<typeof QuestionFormulatorOutputSchema>;
export type PrepSynthesizerOutput = z.infer<typeof PrepSynthesizerOutputSchema>;
export type FrameworkType = z.infer<typeof FrameworkTypeSchema>;
export type TopicCollocation = z.infer<typeof TopicCollocationSchema>;
export type ScaffoldStageItem = z.infer<typeof ScaffoldStageItemSchema>;
export type AdaptiveScaffoldOutput = z.infer<typeof AdaptiveScaffoldOutputSchema>;

