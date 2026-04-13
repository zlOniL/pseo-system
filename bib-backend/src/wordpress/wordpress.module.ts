import { Module } from '@nestjs/common';
import { WordPressService } from './wordpress.service';
import { WordPressController } from './wordpress.controller';
import { WordPressCategoriesController } from './wordpress-categories.controller';
import { WordPressMediaController } from './wordpress-media.controller';
import { ContentsModule } from '../contents/contents.module';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [ContentsModule, ServicesModule],
  providers: [WordPressService],
  controllers: [WordPressController, WordPressCategoriesController, WordPressMediaController],
  exports: [WordPressService],
})
export class WordPressModule {}
