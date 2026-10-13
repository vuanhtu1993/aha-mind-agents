/**
 * @file vocab-card.schema.ts
 * @description Mongoose Schema cho collection `vocab_cards` trong MongoDB aha-tools
 *
 * Made by Anh Tu - Share to be share
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class VocabExampleSentence {
  @Prop({ required: true })
  sentence: string;

  @Prop({ required: true })
  answer: string;
}
export const VocabExampleSentenceSchema = SchemaFactory.createForClass(VocabExampleSentence);

@Schema({ _id: false })
export class VocabWordFamily {
  @Prop({ required: true })
  word: string;

  @Prop()
  partOfSpeech?: string;

  @Prop()
  ipa?: string;

  @Prop({ required: true })
  explanation: string;
}
export const VocabWordFamilySchema = SchemaFactory.createForClass(VocabWordFamily);

@Schema({ _id: false })
export class VocabCollocation {
  @Prop({ required: true })
  collocation: string;

  @Prop({ required: true })
  explanation: string;
}
export const VocabCollocationSchema = SchemaFactory.createForClass(VocabCollocation);

@Schema({ _id: false })
export class FSRSCardState {
  @Prop({ type: Date, required: true, index: true })
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
  reps: number;

  @Prop({ type: Number, required: true, default: 0 })
  lapses: number;

  @Prop({ type: Number, required: true, default: 0 })
  state: number; // 0: New, 1: Learning, 2: Review, 3: Relearning

  @Prop({ type: Date, required: false })
  last_review?: Date;
}
export const FSRSCardStateSchema = SchemaFactory.createForClass(FSRSCardState);

@Schema({ timestamps: true, collection: 'vocab_cards' })
export class VocabCard extends Document {
  @Prop({ required: true, index: true })
  word: string;

  @Prop()
  ipa?: string;

  @Prop({ required: true })
  explanation: string;

  @Prop({
    required: true,
    enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    default: 'B1',
  })
  level: string;

  @Prop()
  audioUrl?: string;

  @Prop({ type: [VocabExampleSentenceSchema], default: [] })
  exampleSentences?: VocabExampleSentence[];

  @Prop({ type: [VocabWordFamilySchema], default: [] })
  wordFamily?: VocabWordFamily[];

  @Prop({ type: [VocabCollocationSchema], default: [] })
  collocations?: VocabCollocation[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Storybook', required: false })
  sourceStorybookId?: MongooseSchema.Types.ObjectId;

  @Prop()
  sourceStorybookTitle?: string;

  @Prop({ type: FSRSCardStateSchema, required: true })
  fsrs: FSRSCardState;
}

export const VocabCardSchema = SchemaFactory.createForClass(VocabCard);
