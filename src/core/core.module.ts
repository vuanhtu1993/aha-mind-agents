import { Global, Module } from '@nestjs/common';
import { GeminiRotatorService } from './services/gemini-rotator.service';

@Global()
@Module({
  providers: [GeminiRotatorService],
  exports: [GeminiRotatorService],
})
export class CoreModule {}
