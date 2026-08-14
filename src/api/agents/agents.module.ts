import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { JobExecutionService } from './job-execution.service';

@Module({
  controllers: [AgentsController],
  providers: [JobExecutionService],
})
export class AgentsModule { }
