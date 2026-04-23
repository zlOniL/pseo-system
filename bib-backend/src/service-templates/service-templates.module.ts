import { Module } from '@nestjs/common';
import { ServiceTemplatesService } from './service-templates.service';
import { SectionLibraryService } from './section-library.service';
import { SectionAssemblerService } from './section-assembler.service';
import { ServiceTemplatesController } from './service-templates.controller';
import { GenerationModule } from '../generation/generation.module';
import { ServicesModule } from '../services/services.module';
import { ContentsModule } from '../contents/contents.module';
import { ValidationModule } from '../validation/validation.module';

// CitiesModule is @Global() — available everywhere without explicit import

@Module({
  imports: [GenerationModule, ServicesModule, ContentsModule, ValidationModule],
  providers: [ServiceTemplatesService, SectionLibraryService, SectionAssemblerService],
  controllers: [ServiceTemplatesController],
  exports: [ServiceTemplatesService, SectionLibraryService, SectionAssemblerService],
})
export class ServiceTemplatesModule {}
