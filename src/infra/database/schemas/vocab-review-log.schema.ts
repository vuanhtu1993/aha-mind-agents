/**
 * @file vocab-review-log.schema.ts
 * @description Mongoose Schema cho collection `vocab_review_logs` lưu lịch sử ôn tập FSRS
 *
 * Made by Anh Tu - Share to be share
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true, collection: 'vocab_review_logs' })
export class VocabReviewLog extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'VocabCard', required: true, index: true })
  vocabCardId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  word: string;

  @Prop({ required: true })
  rating: number; // 1: Again, 2: Hard, 3: Good, 4: Easy

  @Prop({ required: true, default: 0 })
  state: number;

  @Prop({ type: Date, required: true, default: Date.now })
  due: Date;

  @Prop({ type: Number, required: true, default: 0 })
  stability: number;

  @Prop({ type: Number, required: true, default: 0 })
  difficulty: number;

  @Prop({ type: Number, required: true, default: 0 })
  elapsed_days: number;

  @Prop({ type: Number, required: true, default: 0 })
  scheduled_days: number;

  @Prop({ type: Number, required: true, default: 0 })
  responseTimeMs: number;

  @Prop({ required: true })
  isCorrect: boolean;

  @Prop({ type: Date, default: Date.now, index: true })
  reviewedAt: Date;
}

export const VocabReviewLogSchema = SchemaFactory.createForClass(VocabReviewLog);
