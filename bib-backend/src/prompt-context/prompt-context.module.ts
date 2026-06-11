import { Module } from '@nestjs/common';
import { PromptContextService } from './prompt-context.service';

@Module({
  providers: [PromptContextService],
  exports: [PromptContextService],
})
export class PromptContextModule {}
