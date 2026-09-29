import { Module } from '@nestjs/common';
import { LocalityLinksModule } from '../cities/locality-links.module';
import { ServiceTemplatesService } from './service-templates.service';
import { SectionLibraryService } from './section-library.service';
import { SectionAssemblerService } from './section-assembler.service';
import { ServiceTemplatesController } from './service-templates.controller';
import { GenerationModule } from '../generation/generation.module';
import { ServicesModule } from '../services/services.module';
import { ContentsModule } from '../contents/contents.module';
import { ValidationModule } from '../validation/validation.module';
import { SitesModule } from '../sites/sites.module';
import { WhitelabelApiModule } from '../integrations/whitelabel-api/whitelabel-api.module';
import { FtpHtmlModule } from '../integrations/ftp-html/ftp-html.module';

// CitiesModule is @Global() — available everywhere without explicit import

@Module({
  imports: [
    LocalityLinksModule,
    GenerationModule,
    ServicesModule,
    ContentsModule,
    ValidationModule,
    SitesModule,
    WhitelabelApiModule,
    FtpHtmlModule,
  ],
  providers: [
    ServiceTemplatesService,
    SectionLibraryService,
    SectionAssemblerService,
  ],
  controllers: [ServiceTemplatesController],
  exports: [
    ServiceTemplatesService,
    SectionLibraryService,
    SectionAssemblerService,
  ],
})
export class ServiceTemplatesModule {}
