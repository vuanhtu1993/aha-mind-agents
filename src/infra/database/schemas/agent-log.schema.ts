import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class TokenUsage {
  @Prop({ required: true })
  promptTokens: number;

  @Prop({ required: true })
  completionTokens: number;

  @Prop({ required: true })
  totalTokens: number;
}

const TokenUsageSchema = SchemaFactory.createForClass(TokenUsage);

@Schema({ _id: false })
export class TimelineEvent {
  @Prop({ required: true })
  nodeName: string;

  @Prop({ required: true, enum: ['running', 'completed', 'failed'] })
  status: string;

  @Prop({ required: true })
  durationMs: number;

  @Prop({ required: true })
  timestamp: Date;
}

const TimelineEventSchema = SchemaFactory.createForClass(TimelineEvent);

@Schema({ timestamps: true, collection: 'agent_exec_logs' })
export class AgentExecLog extends Document {
  @Prop({ required: true, unique: true })
  jobId: string;

  @Prop({ required: true })
  agentId: string; // e.g. 'story-shadowing', 'opta'

  @Prop({ required: true })
  pipeline: string; // e.g. 'text', 'youtube'

  @Prop({ required: true, enum: ['pending', 'running', 'completed', 'failed'] })
  status: string;

  @Prop()
  durationMs?: number;

  @Prop({ type: TokenUsageSchema })
  tokenUsage?: TokenUsage;

  @Prop({ type: [TimelineEventSchema] })
  timeline?: TimelineEvent[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  error?: any;
}

export const AgentExecLogSchema = SchemaFactory.createForClass(AgentExecLog);
