import { Module } from '@nestjs/common';
import { ContentsService } from './contents.service';
import { ContentsController } from './contents.controller';

@Module({
  providers: [ContentsService],
  controllers: [ContentsController],
  exports: [ContentsService],
})
export class ContentsModule {}
