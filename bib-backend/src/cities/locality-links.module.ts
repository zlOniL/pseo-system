import { Module } from '@nestjs/common';
import { CitiesModule } from './cities.module';
import { SitesModule } from '../sites/sites.module';
import { LocalityLinksService } from './locality-links.service';

@Module({
  imports: [CitiesModule, SitesModule],
  providers: [LocalityLinksService],
  exports: [LocalityLinksService],
})
export class LocalityLinksModule {}
