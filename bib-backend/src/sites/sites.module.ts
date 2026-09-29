import { Module } from '@nestjs/common';
import { SupabaseModule } from '../common/supabase.module';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';
import { FtpSiteConfigsService } from '../integrations/ftp-html/ftp-site-configs.service';
import { BasicFtpRemoteFileClientFactory } from '../integrations/ftp-html/basic-ftp-remote-file.client';

@Module({
  imports: [SupabaseModule],
  controllers: [SitesController],
  providers: [
    SitesService,
    FtpSiteConfigsService,
    BasicFtpRemoteFileClientFactory,
  ],
  exports: [SitesService],
})
export class SitesModule {}
