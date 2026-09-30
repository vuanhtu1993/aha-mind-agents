/**
 * @file speaking-question.schema.ts
 * @description Mongoose Schema cho collection `speaking_questions` trong aha-mind-agents
 *
 * Made by Anh Tu - Share to be share
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class TargetKeywordItem {
  @Prop({ required: true })
  word: string;

  @Prop()
  ipa?: string;

  @Prop({ required: true })
  meaning: string;
}

export const TargetKeywordItemSchema = SchemaFactory.createForClass(TargetKeywordItem);

@Schema({ _id: false })
export class SpeakingScaffoldStageItem {
  @Prop({ required: true, enum: ['point', 'reason', 'example', 'conclusion'] })
  stage: string;

  @Prop({ required: true })
  title: string;

  @Prop({ type: [String], required: true })
  signposts: string[];

  @Prop({ required: true })
  hint: string;

  @Prop({ required: true })
  modelAnswer: string;
}

export const SpeakingScaffoldStageItemSchema = SchemaFactory.createForClass(SpeakingScaffoldStageItem);

@Schema({ _id: false })
export class SpeakingPrepScaffold {
  @Prop({ type: SpeakingScaffoldStageItemSchema, required: true })
  point: SpeakingScaffoldStageItem;

  @Prop({ type: SpeakingScaffoldStageItemSchema, required: true })
  reason: SpeakingScaffoldStageItem;

  @Prop({ type: SpeakingScaffoldStageItemSchema, required: true })
  example: SpeakingScaffoldStageItem;

  @Prop({ type: SpeakingScaffoldStageItemSchema, required: true })
  conclusion: SpeakingScaffoldStageItem;
}

export const SpeakingPrepScaffoldSchema = SchemaFactory.createForClass(SpeakingPrepScaffold);

@Schema({ timestamps: true, collection: 'speaking_questions' })
export class SpeakingQuestion extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Storybook', required: false, index: true })
  storybookId?: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, index: true })
  topic: string;

  @Prop({ required: true })
  question: string;

  @Prop({ required: true, enum: ['B1', 'B2', 'C1'], default: 'B2', index: true })
  level: string;

  @Prop({ type: [TargetKeywordItemSchema], default: [] })
  targetKeywords: TargetKeywordItem[];

  @Prop({ type: SpeakingPrepScaffoldSchema, required: true })
  prepScaffold: SpeakingPrepScaffold;

  @Prop({ required: true, enum: ['active', 'archived'], default: 'active', index: true })
  status: string;

  @Prop({ required: false })
  generatedByModel?: string;
}

export const SpeakingQuestionSchema = SchemaFactory.createForClass(SpeakingQuestion);

SpeakingQuestionSchema.index({ storybookId: 1, status: 1 });
SpeakingQuestionSchema.index({ level: 1, status: 1 });
