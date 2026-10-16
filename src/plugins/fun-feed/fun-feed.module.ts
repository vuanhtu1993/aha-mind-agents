import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';
import { HiveService } from '../../core/hive/hive.service';
import { AhaMediaContent, AhaMediaContentSchema } from './schemas/media-content.schema';
import { UserInteraction, UserInteractionSchema } from './schemas/user-interaction.schema';
import { GiphyAdapter } from './adapters/giphy.adapter';
import { YoutubeAdapter } from './adapters/youtube.adapter';
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
        new GiphyAdapter(config.get<string>('GIPHY_API_KEY', '')),
      inject: [ConfigService],
    },
    {
      provide: YoutubeAdapter,
      useFactory: (config: ConfigService) =>
        new YoutubeAdapter(config.get<string>('YOUTUBE_DATA_API_KEY', '')),
      inject: [ConfigService],
    },
    {
      provide: FunFeedIngestionService,
      useFactory: (mediaModel, hiveService, giphy, youtube) =>
        new FunFeedIngestionService(mediaModel, hiveService, giphy, youtube),
      inject: [
        getModelToken(AhaMediaContent.name, AHA_TOOLS_CONNECTION),
        HiveService,
        GiphyAdapter,
        YoutubeAdapter,
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
