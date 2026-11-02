/**
 * @file cert-crawler.module.ts
 * @description NestJS Module đăng ký Controller, Producer, Processor và Queue
 *
 * Made by Anh Tu - Share to be share
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { CERT_CRAWLER_QUEUE } from './cert-crawler.constants';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { CertCrawlerProcessor } from './cert-crawler.processor';
import { CertCrawlerController } from './cert-crawler.controller';
import { CertQuestion, CertQuestionSchema } from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: CERT_CRAWLER_QUEUE,
    }),
    MongooseModule.forFeature(
      [{ name: CertQuestion.name, schema: CertQuestionSchema }],
      AHA_TOOLS_CONNECTION,
    ),
  ],
  controllers: [CertCrawlerController],
  providers: [CertCrawlerProducerService, CertCrawlerProcessor],
  exports: [CertCrawlerProducerService],
})
export class CertCrawlerModule {}
