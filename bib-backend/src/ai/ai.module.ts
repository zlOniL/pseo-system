import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiUsageService } from './ai-usage.service';

@Module({
  providers: [AiService, AiUsageService],
  exports: [AiService, AiUsageService],
})
export class AiModule {}
