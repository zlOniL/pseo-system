import { Module } from '@nestjs/common';
import { WordPressService } from './wordpress.service';
import { WordPressController } from './wordpress.controller';
import { WordPressMediaController } from './wordpress-media.controller';
import { ContentsModule } from '../contents/contents.module';

@Module({
  imports: [ContentsModule],
  providers: [WordPressService],
  controllers: [WordPressController, WordPressMediaController],
  exports: [WordPressService],
})
export class WordPressModule {}
