import { forwardRef, Module } from '@nestjs/common';
import { GenerationService } from './generation.service';
import { GenerationController } from './generation.controller';
import { AiModule } from '../ai/ai.module';
import { ValidationModule } from '../validation/validation.module';
import { ContentsModule } from '../contents/contents.module';
import { CitiesModule } from '../cities/cities.module';
import { LocalityLinksModule } from '../cities/locality-links.module';
import { SitesModule } from '../sites/sites.module';
import { WhitelabelApiModule } from '../integrations/whitelabel-api/whitelabel-api.module';
import { PromptContextModule } from '../prompt-context/prompt-context.module';
import { FtpHtmlModule } from '../integrations/ftp-html/ftp-html.module';

@Module({
  imports: [
    AiModule,
    ValidationModule,
    ContentsModule,
    CitiesModule,
    LocalityLinksModule,
    SitesModule,
    PromptContextModule,
    FtpHtmlModule,
    forwardRef(() => WhitelabelApiModule),
  ],
  providers: [GenerationService],
  controllers: [GenerationController],
  exports: [GenerationService],
})
export class GenerationModule {}
