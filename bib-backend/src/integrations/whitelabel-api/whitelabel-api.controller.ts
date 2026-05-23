import { Controller, Param, Post } from '@nestjs/common';
import { SitesService } from '../../sites/sites.service';
import { WhitelabelApiClient } from './whitelabel-api.client';
import { WhitelabelPublisherService } from './whitelabel-publisher.service';

@Controller('sites/:siteId/whitelabel')
export class WhitelabelApiController {
  constructor(
    private readonly sites: SitesService,
    private readonly client: WhitelabelApiClient,
    private readonly publisher: WhitelabelPublisherService,
  ) {}

  @Post('blueprints/refresh')
  async refreshBlueprints(@Param('siteId') siteId: string) {
    const site = await this.sites.findById(siteId);
    const servicePage = await this.client.fetchBlueprint(site, 'service-page');
    const pseoRules = await this.client.fetchBlueprint(site, 'pseo-rules');
    await this.sites.saveBlueprint(site.id, 'service-page', servicePage);
    await this.sites.saveBlueprint(site.id, 'pseo-rules', pseoRules);
    return { ok: true, blueprints: ['service-page', 'pseo-rules'] };
  }

  @Post('test')
  async test(@Param('siteId') siteId: string) {
    const site = await this.sites.findById(siteId);
    await this.client.fetchBlueprint(site, 'service-page');
    return { ok: true };
  }

  @Post('services/:serviceId/image/sync')
  async syncServiceImage(
    @Param('siteId') siteId: string,
    @Param('serviceId') serviceId: string,
  ) {
    return this.publisher.syncServiceImage(serviceId, siteId);
  }
}
