import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueWorker } from './queue.worker';
import { QueueController } from './queue.controller';
import { ServicesModule } from '../services/services.module';
import { GenerationModule } from '../generation/generation.module';
import { ContentsModule } from '../contents/contents.module';

@Module({
  imports: [ServicesModule, GenerationModule, ContentsModule],
  providers: [QueueService, QueueWorker],
  controllers: [QueueController],
  exports: [QueueService],
})
export class QueueModule {}
