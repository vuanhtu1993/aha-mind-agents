import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';

export type UserInteractionDocument = UserInteraction & Document;

@Schema({ timestamps: true, collection: 'user_interactions' })
export class UserInteraction {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, type: SchemaTypes.ObjectId, ref: 'AhaMediaContent' })
  contentId: string;

  @Prop({ required: true, enum: ['view', 'like', 'skip', 'save', 'report'] })
  action: string;

  @Prop()
  reportReason?: string;
}

export const UserInteractionSchema = SchemaFactory.createForClass(UserInteraction);
UserInteractionSchema.index({ userId: 1, contentId: 1, action: 1 });
