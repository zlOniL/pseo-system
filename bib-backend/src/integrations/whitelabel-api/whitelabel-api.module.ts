import { forwardRef, Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { ContentsModule } from '../../contents/contents.module';
import { ServicesModule } from '../../services/services.module';
import { SitesModule } from '../../sites/sites.module';
import { WhitelabelApiClient } from './whitelabel-api.client';
import { WhitelabelApiController } from './whitelabel-api.controller';
import { WhitelabelContentService } from './whitelabel-content.service';
import { WhitelabelPublisherService } from './whitelabel-publisher.service';

@Module({
  imports: [
    AiModule,
    ContentsModule,
    forwardRef(() => ServicesModule),
    SitesModule,
  ],
  controllers: [WhitelabelApiController],
  providers: [
    WhitelabelApiClient,
    WhitelabelContentService,
    WhitelabelPublisherService,
  ],
  exports: [
    WhitelabelApiClient,
    WhitelabelContentService,
    WhitelabelPublisherService,
  ],
})
export class WhitelabelApiModule {}
