import { Global, Module } from '@nestjs/common';
import { GeminiRotatorService } from './services/gemini-rotator.service';
import { PluginRegistryService } from './services/plugin-registry.service';
import { TtsToolService } from './tools/tts.tool';
import { YoutubeToolService } from './tools/youtube.tool';
import { ScraperToolService } from './tools/scraper.tool';

@Global()
@Module({
  providers: [
    GeminiRotatorService,
    PluginRegistryService,
    TtsToolService,
    YoutubeToolService,
    ScraperToolService,
  ],
  exports: [
    GeminiRotatorService,
    PluginRegistryService,
    TtsToolService,
    YoutubeToolService,
    ScraperToolService,
  ],
})
export class CoreModule {}
