/**
 * @file cert-question.schema.ts
 * @description Mongoose Schema lưu trữ câu hỏi chứng chỉ (CCAF, CCAO-F, ...)
 *
 * Made by Anh Tu - Share to be share
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CertQuestionDocument = CertQuestion & Document;

@Schema({ timestamps: true, collection: 'cert_questions' })
export class CertQuestion {
  @Prop({ required: true, index: true })
  certId: string;

  @Prop({ required: true, index: true })
  externalId: number;

  @Prop()
  questionNo: number;

  @Prop({ required: true })
  topic: string;

  @Prop()
  guideRef?: string;

  @Prop({ required: true })
  questionEn: string;

  @Prop()
  questionVi?: string;

  @Prop()
  questionJa?: string;

  @Prop({ type: Object, required: true })
  optionsEn: Record<string, string>;

  @Prop({ type: Object })
  optionsVi?: Record<string, string>;

  @Prop({ type: Object })
  optionsJa?: Record<string, string>;

  @Prop({ default: false })
  isMulti: boolean;

  @Prop({ required: true })
  correctAnswer: string;

  @Prop()
  explanationEn?: string;

  @Prop()
  aiExpertVi?: string;

  @Prop()
  aiExpertJa?: string;

  @Prop()
  sourceUrl?: string;

  @Prop()
  reviewConfidence?: string;
}

export const CertQuestionSchema = SchemaFactory.createForClass(CertQuestion);
CertQuestionSchema.index({ certId: 1, externalId: 1 }, { unique: true });
