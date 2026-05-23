import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { WordPressService } from './wordpress.service';
import { ContentsService } from '../contents/contents.service';
import { BulkActionDto } from '../contents/dto/bulk-action.dto';
import { SitesService } from '../sites/sites.service';
import { WhitelabelPublisherService } from '../integrations/whitelabel-api/whitelabel-publisher.service';

@Controller('contents')
export class WordPressController {
  constructor(
    private readonly wordPressService: WordPressService,
    private readonly contentsService: ContentsService,
    private readonly sitesService: SitesService,
    private readonly whitelabelPublisher: WhitelabelPublisherService,
  ) {}

  @Post('bulk-approve')
  @HttpCode(200)
  bulkApprove(@Body() dto: BulkActionDto) {
    return this.contentsService.bulkUpdateStatus(dto.ids, 'approved');
  }

  @Post('bulk-publish')
  @HttpCode(200)
  async bulkPublish(@Body() dto: BulkActionDto) {
    const contents = await this.contentsService.findByIds(dto.ids);
    const whitelabelIds: string[] = [];
    const wordpressIds: string[] = [];
    const siteCache = new Map<string, string>();

    for (const content of contents) {
      if (!content.site_id) {
        wordpressIds.push(content.id);
        continue;
      }
      let integration = siteCache.get(content.site_id);
      if (!integration) {
        integration = (await this.sitesService.findById(content.site_id))
          .integration_type;
        siteCache.set(content.site_id, integration);
      }
      if (integration === 'whitelabel_api') whitelabelIds.push(content.id);
      else wordpressIds.push(content.id);
    }

    const results = wordpressIds.length
      ? await this.wordPressService.bulkPublish(wordpressIds)
      : [];
    for (const id of whitelabelIds) {
      try {
        const data = await this.whitelabelPublisher.publish(id);
        results.push({ id, success: true, data });
      } catch (err) {
        results.push({ id, success: false, error: (err as Error).message });
      }
    }
    return results;
  }

  @Post('bulk-delete')
  @HttpCode(200)
  bulkDelete(@Body() dto: BulkActionDto) {
    return this.contentsService.bulkDelete(dto.ids);
  }

  @Post(':id/publish')
  @HttpCode(200)
  async publish(@Param('id') id: string) {
    const content = await this.contentsService.findById(id);
    if (content.site_id) {
      const site = await this.sitesService.findById(content.site_id);
      if (site.integration_type === 'whitelabel_api') {
        return this.whitelabelPublisher.publish(id);
      }
    }
    return this.wordPressService.publish(id);
  }
}
