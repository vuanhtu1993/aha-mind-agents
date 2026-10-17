import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';
import { HiveService } from '../../core/hive/hive.service';
import { AhaMediaContent, AhaMediaContentSchema } from './schemas/media-content.schema';
import { UserInteraction, UserInteractionSchema } from './schemas/user-interaction.schema';
import { GiphyAdapter } from './adapters/giphy.adapter';
import { YoutubeAdapter } from './adapters/youtube.adapter';
import { RedditAdapter } from './adapters/reddit.adapter';
import { ThreadsAdapter } from './adapters/threads.adapter';
import { FunFeedIngestionService } from './services/fun-feed-ingestion.service';
import { FunFeedService } from './services/fun-feed.service';
import { FunFeedController } from './controllers/fun-feed.controller';
import { FunFeedCronController } from './controllers/fun-feed-cron.controller';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: AhaMediaContent.name, schema: AhaMediaContentSchema },
        { name: UserInteraction.name, schema: UserInteractionSchema },
      ],
      AHA_TOOLS_CONNECTION,
    ),
  ],
  controllers: [FunFeedController, FunFeedCronController],
  providers: [
    {
      provide: GiphyAdapter,
      useFactory: (config: ConfigService) =>
        new GiphyAdapter(config.get<string>('GIPHY_API_KEY', process.env.GIPHY_API_KEY || '')),
      inject: [ConfigService],
    },
    {
      provide: YoutubeAdapter,
      useFactory: (config: ConfigService) =>
        new YoutubeAdapter(config.get<string>('YOUTUBE_DATA_API_KEY', process.env.YOUTUBE_DATA_API_KEY || '')),
      inject: [ConfigService],
    },
    {
      provide: RedditAdapter,
      useFactory: () => new RedditAdapter(),
    },
    {
      provide: ThreadsAdapter,
      useFactory: (config: ConfigService) =>
        new ThreadsAdapter(
          config.get<string>('THREADS_ACCESS_TOKEN', process.env.THREADS_ACCESS_TOKEN || ''),
          config.get<string>('THREADS_RAPIDAPI_KEY', process.env.THREADS_RAPIDAPI_KEY || ''),
        ),
      inject: [ConfigService],
    },
    {
      provide: FunFeedIngestionService,
      useFactory: (mediaModel, hiveService, giphy, youtube, reddit, threads) =>
        new FunFeedIngestionService(mediaModel, hiveService, giphy, youtube, reddit, threads),
      inject: [
        getModelToken(AhaMediaContent.name, AHA_TOOLS_CONNECTION),
        HiveService,
        GiphyAdapter,
        YoutubeAdapter,
        RedditAdapter,
        ThreadsAdapter,
      ],
    },
    {
      provide: FunFeedService,
      useFactory: (mediaModel, interactionModel) =>
        new FunFeedService(mediaModel, interactionModel),
      inject: [
        getModelToken(AhaMediaContent.name, AHA_TOOLS_CONNECTION),
        getModelToken(UserInteraction.name, AHA_TOOLS_CONNECTION),
      ],
    },
  ],
  exports: [FunFeedService, FunFeedIngestionService],
})
export class FunFeedModule {}
