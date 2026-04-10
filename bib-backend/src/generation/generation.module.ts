import { Module } from '@nestjs/common';
import { GenerationService } from './generation.service';
import { GenerationController } from './generation.controller';
import { AiModule } from '../ai/ai.module';
import { ValidationModule } from '../validation/validation.module';
import { ContentsModule } from '../contents/contents.module';
import { CitiesModule } from '../cities/cities.module';

@Module({
  imports: [AiModule, ValidationModule, ContentsModule, CitiesModule],
  providers: [GenerationService],
  controllers: [GenerationController],
  exports: [GenerationService],
})
export class GenerationModule {}
