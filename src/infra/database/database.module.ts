import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

import {
  AHA_TOOLS_CONNECTION,
  AHA_MIND_CONNECTION,
} from './database.constants';

import { Storybook, StorybookSchema } from './schemas/storybook.schema';
import { AgentExecLog, AgentExecLogSchema } from './schemas/agent-log.schema';
import { AgentConfig, AgentConfigSchema } from './schemas/agent-config.schema';

@Global()
@Module({
  imports: [
    // 1. Connection cho aha-tools (PWA Data - Collection: storybooks)
    MongooseModule.forRootAsync({
      connectionName: AHA_TOOLS_CONNECTION,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
        // Tối ưu Connection Pooling cho Serverless
        maxPoolSize: 10,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }),
      inject: [ConfigService],
    }),

    // 2. Connection cho aha-mind (Management Data - Collections: agent_exec_logs, agent_configs)
    // Nếu không cấu hình MONGODB_URI_AHA_MIND, fallback về chung cụm MONGODB_URI
    MongooseModule.forRootAsync({
      connectionName: AHA_MIND_CONNECTION,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URI_AHA_MIND') || configService.get<string>('MONGODB_URI');
        return {
          uri,
          maxPoolSize: 5,
          minPoolSize: 1,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        };
      },
      inject: [ConfigService],
    }),

    // 3. Đăng ký các Models vào đúng Connection
    MongooseModule.forFeature(
      [{ name: Storybook.name, schema: StorybookSchema }],
      AHA_TOOLS_CONNECTION,
    ),
    MongooseModule.forFeature(
      [
        { name: AgentExecLog.name, schema: AgentExecLogSchema },
        { name: AgentConfig.name, schema: AgentConfigSchema },
      ],
      AHA_MIND_CONNECTION,
    ),
  ],
  exports: [MongooseModule], // Export MongooseModule để các module khác có thể inject Model
})
export class DatabaseModule {}
