import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AhaMediaContentDocument = AhaMediaContent & Document;

@Schema({ timestamps: true, collection: 'aha_media_contents' })
export class AhaMediaContent {
  @Prop({ required: true, enum: ['giphy', 'youtube', 'threads', 'reddit', 'tiktok', 'generated'] })
  source: string;

  @Prop({ required: true })
  sourceId: string;

  @Prop({ required: true })
  sourceUrl: string;

  @Prop({ required: true, enum: ['gif', 'image', 'video', 'short_video'] })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  mediaUrl: string;

  @Prop()
  thumbnailUrl?: string;

  @Prop()
  attribution?: string;

  @Prop({ enum: ['grammar', 'vocabulary', 'pronunciation', 'idiom', 'conversation'] })
  topic?: string;

  @Prop({ enum: ['beginner', 'intermediate', 'advanced'] })
  level?: string;

  @Prop()
  whyFunny?: string;

  @Prop()
  youLearned?: string;

  @Prop()
  explanation?: string;

  @Prop({ type: Number, default: 0 })
  learningScore?: number;

  @Prop({
    type: Object,
    default: () => ({ views: 0, likes: 0, saves: 0, reports: 0 }),
  })
  stats: { views: number; likes: number; saves: number; reports: number };

  @Prop({
    required: true,
    enum: ['pending', 'published', 'rejected', 'hidden'],
    default: 'published',
  })
  status: string;

  @Prop({ default: () => new Date() })
  publishedAt: Date;
}

export const AhaMediaContentSchema = SchemaFactory.createForClass(AhaMediaContent);

// Index phục vụ tối ưu hóa Cursor Pagination cho TikTok Feed
AhaMediaContentSchema.index({ status: 1, topic: 1, publishedAt: -1 });
AhaMediaContentSchema.index({ source: 1, sourceId: 1 }, { unique: true });
