import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ValidationModule } from '../validation/validation.module';
import { ContentsService } from './contents.service';
import { ContentsController } from './contents.controller';
import { ContentSectionsService } from './content-sections.service';

@Module({
  imports: [AiModule, ValidationModule],
  providers: [ContentsService, ContentSectionsService],
  controllers: [ContentsController],
  exports: [ContentsService, ContentSectionsService],
})
export class ContentsModule {}
