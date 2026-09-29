import { Module } from '@nestjs/common';
import { LocalityLinksModule } from '../cities/locality-links.module';
import { AiModule } from '../ai/ai.module';
import { ValidationModule } from '../validation/validation.module';
import { ContentsService } from './contents.service';
import { ContentsController } from './contents.controller';
import { ContentSectionsService } from './content-sections.service';
import { ContentLocalityLinksService } from './content-locality-links.service';

@Module({
  imports: [AiModule, ValidationModule, LocalityLinksModule],
  providers: [
    ContentsService,
    ContentSectionsService,
    ContentLocalityLinksService,
  ],
  controllers: [ContentsController],
  exports: [ContentsService, ContentSectionsService],
})
export class ContentsModule {}
