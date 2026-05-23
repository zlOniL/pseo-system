import { Module } from '@nestjs/common';
import { TemplateEngineService } from './template-engine.service';
import { ContentsModule } from '../contents/contents.module';
import { ValidationModule } from '../validation/validation.module';
import { SitesModule } from '../sites/sites.module';

// CitiesModule is @Global() — no need to import it here

@Module({
  imports: [ContentsModule, ValidationModule, SitesModule],
  providers: [TemplateEngineService],
  exports: [TemplateEngineService],
})
export class TemplateEngineModule {}
