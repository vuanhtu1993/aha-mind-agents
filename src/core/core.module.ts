import { Global, Module } from '@nestjs/common';
import { GeminiService } from './gemini/gemini.service';
import { GeminiRateLimiterService } from './gemini/gemini-rate-limiter.service';
import { PluginRegistryService } from './services/plugin-registry.service';
import { ActiveJobTrackerService } from './services/active-job-tracker.service';
import { RedisPubSubService } from './services/redis-pubsub.service';
import { TtsToolService } from './tools/tts.tool';
import { YoutubeToolService } from './tools/youtube.tool';
import { ScraperToolService } from './tools/scraper.tool';

@Global()
@Module({
  providers: [
    GeminiService,
    GeminiRateLimiterService,
    PluginRegistryService,
    RedisPubSubService,
    ActiveJobTrackerService,
    TtsToolService,
    YoutubeToolService,
    ScraperToolService,
  ],
  exports: [
    GeminiService,
    GeminiRateLimiterService,
    PluginRegistryService,
    RedisPubSubService,
    ActiveJobTrackerService,
    TtsToolService,
    YoutubeToolService,
    ScraperToolService,
  ],
})
export class CoreModule { }
