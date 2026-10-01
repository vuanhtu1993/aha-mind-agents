/**
 * @file speaking-quiz.module.ts
 * @description NestJS Module đăng ký Speaking Quiz Agent Plugin, Worker và BullMQ Queue
 *
 * Made by Anh Tu - Share to be share
 */

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';
import { Storybook, StorybookSchema } from '../../infra/database/schemas/storybook.schema';
import { SpeakingQuestion, SpeakingQuestionSchema } from '../../infra/database/schemas/speaking-question.schema';
import { PluginRegistryService } from '../../core/services/plugin-registry.service';
import { ContextResolverNode } from './nodes/context-resolver.node';
import { QuestionFormulatorNode } from './nodes/question-formulator.node';
import { PrepSynthesizerNode } from './nodes/prep-synthesizer.node';
import { PersisterNode } from './nodes/persister.node';
import { SpeakingQuizPipelineService } from './pipelines/speaking-quiz.pipeline';
import { SpeakingQuizPlugin } from './speaking-quiz.plugin';
import { SpeakingQuizWorker } from './speaking-quiz.worker';
import { SpeakingQuizService } from './speaking-quiz.service';
import { SpeakingQuizController } from './speaking-quiz.controller';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: Storybook.name, schema: StorybookSchema },
        { name: SpeakingQuestion.name, schema: SpeakingQuestionSchema },
      ],
      AHA_TOOLS_CONNECTION,
    ),
    BullModule.registerQueue({
      name: 'speaking-quiz-queue',
    }),
  ],
  controllers: [SpeakingQuizController],
  providers: [
    ContextResolverNode,
    QuestionFormulatorNode,
    PrepSynthesizerNode,
    PersisterNode,
    SpeakingQuizPipelineService,
    SpeakingQuizPlugin,
    SpeakingQuizWorker,
    SpeakingQuizService,
  ],
  exports: [SpeakingQuizPlugin, SpeakingQuizService],
})
export class SpeakingQuizModule implements OnModuleInit {
  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly speakingQuizPlugin: SpeakingQuizPlugin,
  ) { }

  onModuleInit() {
    this.pluginRegistry.register(this.speakingQuizPlugin);
  }
}
