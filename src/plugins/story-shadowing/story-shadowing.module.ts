/**
 * @file story-shadowing.module.ts
 * @description NestJS Module đăng ký Story Shadowing Agent Plugin, Worker, Service và BullMQ Queue
 *
 * Made by Anh Tu - Share to be share
 */

import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { PluginRegistryService } from '../../core/services/plugin-registry.service';
import { StoryShadowingPlugin } from './story-shadowing.plugin';

// Nodes
import { SentenceSplitterNode } from './nodes/sentence-splitter.node';
import { TtsGeneratorNode } from './nodes/tts-generator.node';
import { KeywordIdentifierNode } from './nodes/keyword-identifier.node';
import { KeywordEnricherNode } from './nodes/keyword-enricher.node';
import { YoutubeTranscriptFetcherNode } from './nodes/youtube-transcript-fetcher.node';
import { YoutubeSentenceConsolidatorNode } from './nodes/youtube-sentence-consolidator.node';

// Pipelines
import { TextPipelineService } from './pipelines/text.pipeline';
import { YoutubePipelineService } from './pipelines/youtube.pipeline';

// Mongoose & BullMQ
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { Storybook, StorybookSchema } from '../../infra/database/schemas/storybook.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

// Queue Components
import { StoryShadowingService } from './story-shadowing.service';
import { StoryShadowingWorker } from './story-shadowing.worker';
import { StoryShadowingController } from './story-shadowing.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Storybook.name, schema: StorybookSchema }], AHA_TOOLS_CONNECTION),
    BullModule.registerQueue({
      name: 'story-shadowing-queue',
    }),
  ],
  controllers: [StoryShadowingController],
  providers: [
    // Nodes
    SentenceSplitterNode,
    TtsGeneratorNode,
    KeywordIdentifierNode,
    KeywordEnricherNode,
    YoutubeTranscriptFetcherNode,
    YoutubeSentenceConsolidatorNode,

    // Pipelines
    TextPipelineService,
    YoutubePipelineService,

    // Service & Worker
    StoryShadowingService,
    StoryShadowingWorker,

    // Plugin
    StoryShadowingPlugin,
  ],
  exports: [StoryShadowingPlugin, StoryShadowingService],
})
export class StoryShadowingModule implements OnModuleInit {
  private readonly logger = new Logger(StoryShadowingModule.name);

  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly storyShadowingPlugin: StoryShadowingPlugin,
  ) {}

  onModuleInit() {
    this.pluginRegistry.register(this.storyShadowingPlugin);
    this.logger.log('Đã đăng ký StoryShadowingPlugin vào PluginRegistry.');
  }
}
