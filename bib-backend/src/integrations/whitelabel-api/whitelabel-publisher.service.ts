import { BadRequestException, Injectable } from '@nestjs/common';
import { ContentsService, Content } from '../../contents/contents.service';
import { ServicesService } from '../../services/services.service';
import { SitesService } from '../../sites/sites.service';
import { WhitelabelApiClient } from './whitelabel-api.client';
import { buildExternalSlug } from './whitelabel-json';
import { WhitelabelPublishResult } from './whitelabel.types';

@Injectable()
export class WhitelabelPublisherService {
  constructor(
    private readonly contents: ContentsService,
    private readonly services: ServicesService,
    private readonly sites: SitesService,
    private readonly client: WhitelabelApiClient,
  ) {}

  async publish(contentId: string): Promise<Content> {
    const content = await this.contents.findById(contentId);
    if (!content.site_id)
      throw new BadRequestException('Conteudo sem site associado.');
    if (!content.content_json)
      throw new BadRequestException(
        'Conteudo sem content_json para API Whitelabel.',
      );

    const site = await this.sites.findById(content.site_id);
    const service = content.service_id
      ? await this.services.findById(content.service_id)
      : null;
    const pageType =
      content.external_page_type ??
      (content.city ? 'service_location' : 'service');
    const slug =
      content.external_slug ??
      buildExternalSlug(content.service, content.city || undefined);
    const publicUrl = `https://${this.sites.normalizeDomain(site.domain)}/${slug}`;

    const payload: Record<string, unknown> = {
      slug,
      status: 'published',
      template: 'service-default',
      title: content.main_keyword,
      seo_title: content.main_keyword,
      seo_description: content.meta_description ?? '',
      content_json: content.content_json,
      related_pages_json: [],
    };

    let result: { data: WhitelabelPublishResult };
    if (pageType === 'service') {
      const servicePayload = {
        ...payload,
        type: 'service',
        parent_page_id: null,
        service_slug: null,
        location_name: null,
        show_on_home: true,
        home_card_title: service?.name ?? content.service,
        home_card_excerpt: content.meta_description ?? '',
        home_card_icon: (service?.name ?? content.service)
          .slice(0, 2)
          .toUpperCase(),
        service_image_url: service?.featured_image_url ?? undefined,
        service_image_alt:
          service?.featured_image_alt ?? service?.name ?? content.service,
      };
      result = await this.client.publishService(site, servicePayload);
    } else {
      const serviceLocationPayload = {
        ...payload,
        type: 'service_location',
        show_on_home: false,
        location_name: content.city,
        service_slug: service?.slug ?? buildExternalSlug(content.service),
      };
      result = await this.client.publishServiceLocation(
        site,
        serviceLocationPayload,
      );
    }

    return this.contents.setExternalPublished(
      content.id,
      typeof result.data.id === 'number' ? result.data.id : null,
      result.data.slug || slug,
      result.data.link || publicUrl,
    );
  }

  async syncServiceImage(
    serviceId: string,
    expectedSiteId?: string,
  ): Promise<{ data: Record<string, unknown> }> {
    const service = await this.services.findById(serviceId);
    if (!service.site_id) {
      throw new BadRequestException('Servico sem site associado.');
    }
    if (expectedSiteId && service.site_id !== expectedSiteId) {
      throw new BadRequestException('Servico nao pertence ao site informado.');
    }
    if (!service.featured_image_url) {
      throw new BadRequestException('Servico sem imagem principal WhiteLabel.');
    }

    const site = await this.sites.findById(service.site_id);
    if (site.integration_type !== 'whitelabel_api') {
      throw new BadRequestException(
        'O site do servico nao usa API Whitelabel.',
      );
    }

    return this.client.updateServiceImage(site, service.slug, {
      service_image_url: service.featured_image_url,
      service_image_alt: service.featured_image_alt ?? service.name,
    });
  }
}
