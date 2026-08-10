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

// Mongoose
import { MongooseModule } from '@nestjs/mongoose';
import { Storybook, StorybookSchema } from '../../infra/database/schemas/storybook.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Storybook.name, schema: StorybookSchema }], AHA_TOOLS_CONNECTION),
  ],
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
    
    // Plugin
    StoryShadowingPlugin,
  ],
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
