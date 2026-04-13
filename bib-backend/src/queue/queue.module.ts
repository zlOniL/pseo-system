import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueWorker } from './queue.worker';
import { QueueController } from './queue.controller';
import { ServicesModule } from '../services/services.module';
import { GenerationModule } from '../generation/generation.module';
import { ContentsModule } from '../contents/contents.module';
import { TemplateEngineModule } from '../template-engine/template-engine.module';

@Module({
  imports: [ServicesModule, GenerationModule, ContentsModule, TemplateEngineModule],
  providers: [QueueService, QueueWorker],
  controllers: [QueueController],
  exports: [QueueService],
})
export class QueueModule {}
