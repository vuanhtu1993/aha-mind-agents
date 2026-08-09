import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'agent_configs' })
export class AgentConfig extends Document {
  @Prop({ required: true, unique: true })
  agentId: string; // e.g. 'story-shadowing', 'opta'

  @Prop({ required: true, default: 'gemini-2.5-flash' })
  defaultModel: string;

  @Prop()
  systemPromptOverride?: string;

  @Prop({ default: 0.1, min: 0, max: 1 })
  temperature: number;

  @Prop({ default: 2, min: 0 })
  maxRetries: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const AgentConfigSchema = SchemaFactory.createForClass(AgentConfig);
