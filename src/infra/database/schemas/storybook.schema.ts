import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class StorybookSentenceWord {
  @Prop({ required: true })
  word: string;

  @Prop()
  ipa?: string;
}

const StorybookSentenceWordSchema = SchemaFactory.createForClass(StorybookSentenceWord);

@Schema({ _id: false })
export class StorybookSentence {
  @Prop({ required: true })
  id: number;

  @Prop({ required: true })
  text: string;

  @Prop()
  audioBase64?: string;

  @Prop({ type: [StorybookSentenceWordSchema] })
  words?: StorybookSentenceWord[];

  @Prop()
  startMs?: number;

  @Prop()
  endMs?: number;
}

const StorybookSentenceSchema = SchemaFactory.createForClass(StorybookSentence);

@Schema({ _id: false })
export class WordFamilyItem {
  @Prop({ required: true })
  word: string;

  @Prop()
  partOfSpeech?: string;

  @Prop()
  ipa?: string;

  @Prop({ required: true })
  explanation: string;
}

const WordFamilyItemSchema = SchemaFactory.createForClass(WordFamilyItem);

@Schema({ _id: false })
export class CollocationItem {
  @Prop({ required: true })
  collocation: string;

  @Prop({ required: true })
  explanation: string;
}

const CollocationItemSchema = SchemaFactory.createForClass(CollocationItem);

@Schema({ _id: false })
export class StorybookKeyword {
  @Prop({ required: true })
  word: string;

  @Prop()
  ipa?: string;

  @Prop()
  audioUrl?: string;

  @Prop({ required: true })
  explanation: string;

  @Prop({ required: true, enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  level: string;

  @Prop({ type: [WordFamilyItemSchema] })
  wordFamily?: WordFamilyItem[];

  @Prop({ type: [CollocationItemSchema] })
  collocations?: CollocationItem[];
}

const StorybookKeywordSchema = SchemaFactory.createForClass(StorybookKeyword);

@Schema({ timestamps: true, collection: 'storybooks' })
export class Storybook extends Document {
  @Prop({ required: true })
  title: string;

  @Prop()
  thumbnail?: string;

  @Prop({ required: true })
  originalText: string;

  @Prop({ type: [StorybookSentenceSchema], required: true })
  sentences: StorybookSentence[];

  @Prop({ type: [StorybookKeywordSchema] })
  keywords?: StorybookKeyword[];

  @Prop({ required: true, enum: ['easy', 'medium', 'hard'] })
  level: string;

  @Prop({ required: true })
  voice: string;

  @Prop({ required: true })
  speakingRate: number;

  @Prop({ required: true, enum: ['text', 'youtube'], default: 'text' })
  sourceType: string;

  @Prop()
  youtubeVideoId?: string;

  // Phase 7 series fields
  @Prop()
  seriesId?: string;

  @Prop()
  partIndex?: number;

  @Prop()
  partTitle?: string;

  @Prop()
  totalParts?: number;
}

export const StorybookSchema = SchemaFactory.createForClass(Storybook);
