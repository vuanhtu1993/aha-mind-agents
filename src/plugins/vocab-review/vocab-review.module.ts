/**
 * @file vocab-review.module.ts
 * @description NestJS Module đăng ký VocabReviewController và các dịch vụ FSRS
 *
 * Made by Anh Tu - Share to be share
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';
import { VocabCard, VocabCardSchema } from '../../infra/database/schemas/vocab-card.schema';
import { VocabReviewLog, VocabReviewLogSchema } from '../../infra/database/schemas/vocab-review-log.schema';
import { Storybook, StorybookSchema } from '../../infra/database/schemas/storybook.schema';
import { VocabReviewController } from './vocab-review.controller';
import { VocabReviewService } from './services/vocab-review.service';
import { FSRSService } from './services/fsrs.service';
import { DistractorService } from './services/distractor.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: VocabCard.name, schema: VocabCardSchema },
        { name: VocabReviewLog.name, schema: VocabReviewLogSchema },
        { name: Storybook.name, schema: StorybookSchema },
      ],
      AHA_TOOLS_CONNECTION,
    ),
  ],
  controllers: [VocabReviewController],
  providers: [VocabReviewService, FSRSService, DistractorService],
  exports: [VocabReviewService, FSRSService, DistractorService],
})
export class VocabReviewModule {}
