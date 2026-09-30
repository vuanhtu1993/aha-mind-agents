/**
 * @file queue.module.ts
 * @description Cấu hình BullMQ Queue Module kết nối Redis
 *
 * Made by Anh Tu - Share to be share
 */

import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUri =
          configService.get<string>('REDIS_URI') ||
          configService.get<string>('REDIS_URL') ||
          'redis://localhost:6379';

        try {
          const parsed = new URL(redisUri);
          return {
            connection: {
              host: parsed.hostname || 'localhost',
              port: parseInt(parsed.port, 10) || 6379,
              username: parsed.username || undefined,
              password: parsed.password || undefined,
              maxRetriesPerRequest: null,
            },
          };
        } catch {
          return {
            connection: {
              host: 'localhost',
              port: 6379,
              maxRetriesPerRequest: null,
            },
          };
        }
      },
      inject: [ConfigService],
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
