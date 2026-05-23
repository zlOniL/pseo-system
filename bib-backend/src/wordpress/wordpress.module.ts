import { Module } from '@nestjs/common';
import { WordPressService } from './wordpress.service';
import { WordPressController } from './wordpress.controller';
import { WordPressCategoriesController } from './wordpress-categories.controller';
import { WordPressMediaController } from './wordpress-media.controller';
import { ContentsModule } from '../contents/contents.module';
import { ServicesModule } from '../services/services.module';
import { WhitelabelApiModule } from '../integrations/whitelabel-api/whitelabel-api.module';
import { SitesModule } from '../sites/sites.module';

@Module({
  imports: [ContentsModule, ServicesModule, SitesModule, WhitelabelApiModule],
  providers: [WordPressService],
  controllers: [
    WordPressController,
    WordPressCategoriesController,
    WordPressMediaController,
  ],
  exports: [WordPressService],
})
export class WordPressModule {}
