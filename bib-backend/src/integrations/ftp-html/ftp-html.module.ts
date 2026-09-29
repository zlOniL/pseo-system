import { Module } from '@nestjs/common';
import { FtpHtmlPublisherService } from './ftp-html-publisher.service';
import { FtpSiteConfigsService } from './ftp-site-configs.service';
import { SupabaseModule } from '../../common/supabase.module';
import { BasicFtpRemoteFileClientFactory } from './basic-ftp-remote-file.client';
import { FtpHtmlImportService } from './ftp-html-import.service';
import { FtpHtmlDocumentRenderer } from './ftp-html-document-renderer.service';
import { ContentsModule } from '../../contents/contents.module';
import { FtpHtmlContentService } from './ftp-html-content.service';

@Module({
  imports: [SupabaseModule, ContentsModule],
  providers: [
    FtpHtmlPublisherService,
    FtpSiteConfigsService,
    BasicFtpRemoteFileClientFactory,
    FtpHtmlImportService,
    FtpHtmlDocumentRenderer,
    FtpHtmlContentService,
  ],
  exports: [
    FtpHtmlPublisherService,
    FtpSiteConfigsService,
    BasicFtpRemoteFileClientFactory,
    FtpHtmlImportService,
    FtpHtmlDocumentRenderer,
    FtpHtmlContentService,
  ],
})
export class FtpHtmlModule {}
