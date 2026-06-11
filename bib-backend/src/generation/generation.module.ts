import { forwardRef, Module } from '@nestjs/common';
import { GenerationService } from './generation.service';
import { GenerationController } from './generation.controller';
import { AiModule } from '../ai/ai.module';
import { ValidationModule } from '../validation/validation.module';
import { ContentsModule } from '../contents/contents.module';
import { CitiesModule } from '../cities/cities.module';
import { SitesModule } from '../sites/sites.module';
import { WhitelabelApiModule } from '../integrations/whitelabel-api/whitelabel-api.module';
import { PromptContextModule } from '../prompt-context/prompt-context.module';

@Module({
  imports: [
    AiModule,
    ValidationModule,
    ContentsModule,
    CitiesModule,
    SitesModule,
    PromptContextModule,
    forwardRef(() => WhitelabelApiModule),
  ],
  providers: [GenerationService],
  controllers: [GenerationController],
  exports: [GenerationService],
})
export class GenerationModule {}
