/**
 * @file cert-crawler.module.ts
 * @description NestJS Module đăng ký Controller, Producer, Processor, ExportService, CooldownService, Plugin và Queue
 *
 * Made by Anh Tu - Share to be share
 */

import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { CERT_CRAWLER_QUEUE } from './cert-crawler.constants';
import { CertCrawlerProducerService } from './cert-crawler.producer';
import { CertCrawlerProcessor } from './cert-crawler.processor';
import { CertExcelExportService } from './services/cert-excel-export.service';
import { CertCrawlerCooldownService } from './services/cert-crawler-cooldown.service';
import { CertCrawlerCampaignService } from './services/cert-crawler-campaign.service';
import { CertCrawlerController } from './cert-crawler.controller';
import { CertCrawlerPlugin } from './cert-crawler.plugin';
import { PluginRegistryService } from '../../core/services/plugin-registry.service';
import {
  CertQuestion,
  CertQuestionSchema,
} from '../../infra/database/schemas/cert-question.schema';
import {
  AgentExecLog,
  AgentExecLogSchema,
} from '../../infra/database/schemas/agent-log.schema';
import {
  AHA_MIND_CONNECTION,
  AHA_TOOLS_CONNECTION,
} from '../../infra/database/database.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: CERT_CRAWLER_QUEUE,
    }),
    MongooseModule.forFeature(
      [{ name: CertQuestion.name, schema: CertQuestionSchema }],
      AHA_TOOLS_CONNECTION,
    ),
    MongooseModule.forFeature(
      [{ name: AgentExecLog.name, schema: AgentExecLogSchema }],
      AHA_MIND_CONNECTION,
    ),
  ],
  controllers: [CertCrawlerController],
  providers: [
    CertCrawlerProducerService,
    CertCrawlerProcessor,
    CertExcelExportService,
    CertCrawlerCooldownService,
    CertCrawlerCampaignService,
    CertCrawlerPlugin,
  ],
  exports: [
    CertCrawlerProducerService,
    CertExcelExportService,
    CertCrawlerCooldownService,
    CertCrawlerCampaignService,
    CertCrawlerPlugin,
  ],
})
export class CertCrawlerModule implements OnModuleInit {
  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly certCrawlerPlugin: CertCrawlerPlugin,
  ) {}

  onModuleInit() {
    this.pluginRegistry.register(this.certCrawlerPlugin);
  }
}
