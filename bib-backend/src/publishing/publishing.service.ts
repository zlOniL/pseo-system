import { BadRequestException, Injectable } from '@nestjs/common';
import { ContentsService, Content } from '../contents/contents.service';
import { SitesService } from '../sites/sites.service';
import { WordPressService, BulkPublishResult } from '../wordpress/wordpress.service';
import { WhitelabelPublisherService } from '../integrations/whitelabel-api/whitelabel-publisher.service';
import { FtpHtmlPublisherService } from '../integrations/ftp-html/ftp-html-publisher.service';
import { ContentPublisher } from './content-publisher';

@Injectable()
export class PublishingService {
  constructor(
    private readonly contents: ContentsService,
    private readonly sites: SitesService,
    private readonly wordpress: WordPressService,
    private readonly whitelabel: WhitelabelPublisherService,
    private readonly ftpHtml: FtpHtmlPublisherService,
  ) {}

  async publish(contentId: string): Promise<Content> {
    const publisher = await this.publisherForContentId(contentId);
    return publisher.publish(contentId);
  }

  async bulkPublish(ids: string[]): Promise<BulkPublishResult[]> {
    const contents = await this.contents.findByIds(ids);
    const wordpressIds: string[] = [];
    const individual: Array<{ id: string; publisher: ContentPublisher }> = [];
    const results: BulkPublishResult[] = [];
    const ftpRemotePageIds = new Set<string>();

    for (const content of contents) {
      try {
        const publisher = await this.publisherForContent(content);
        if (publisher === this.wordpress) {
          wordpressIds.push(content.id);
          continue;
        }
        if (publisher === this.ftpHtml && content.ftp_remote_page_id) {
          if (ftpRemotePageIds.has(content.ftp_remote_page_id)) {
            results.push({
              id: content.id,
              success: false,
              error: 'Duas paginas do lote apontam para o mesmo arquivo FTP.',
            });
            continue;
          }
          ftpRemotePageIds.add(content.ftp_remote_page_id);
        }
        individual.push({ id: content.id, publisher });
      } catch (err) {
        results.push({
          id: content.id,
          success: false,
          error: (err as Error).message,
        });
      }
    }

    if (wordpressIds.length) {
      results.unshift(...(await this.wordpress.bulkPublish(wordpressIds)));
    }

    for (const item of individual) {
      try {
        const data = await item.publisher.publish(item.id);
        results.push({ id: item.id, success: true, data });
      } catch (err) {
        results.push({
          id: item.id,
          success: false,
          error: (err as Error).message,
        });
      }
    }

    return results;
  }

  private async publisherForContentId(
    contentId: string,
  ): Promise<ContentPublisher> {
    return this.publisherForContent(await this.contents.findById(contentId));
  }

  private async publisherForContent(content: Content): Promise<ContentPublisher> {
    if (!content.site_id) return this.wordpress;

    const site = await this.sites.findById(content.site_id);
    switch (site.integration_type as string) {
      case 'wordpress':
        return this.wordpress;
      case 'whitelabel_api':
        return this.whitelabel;
      case 'ftp_html':
        return this.ftpHtml;
      default:
        throw new BadRequestException(
          `Integracao desconhecida para o site "${site.name}": ${site.integration_type}`,
        );
    }
  }
}
