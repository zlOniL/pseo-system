import { Injectable, BadRequestException } from '@nestjs/common';
import { CitiesService } from './cities.service';
import { SitesService, Site } from '../sites/sites.service';
import {
  buildLocalityLinks,
  withLocalityLinksHtml,
  withLocalityLinksJson,
} from '../common/locality-links';
import type { WhitelabelContentJson } from '../integrations/whitelabel-api/whitelabel.types';
import { stripLocalityBacklinksSection } from '../common/locality-backlinks-stripper';

export interface LocalityLinksInput {
  service: string;
  city?: string | null;
  site_id?: string | null;
  skip_backlinks?: boolean;
}

@Injectable()
export class LocalityLinksService {
  constructor(
    private readonly cities: CitiesService,
    private readonly sites: SitesService,
  ) {}

  async links(input: LocalityLinksInput, knownSite?: Site) {
    if (input.skip_backlinks) return [];
    const site =
      knownSite ??
      (input.site_id ? await this.sites.findById(input.site_id) : null);
    // Only explicitly selected public HTML integrations may generate this block.
    if (!site || !['wordpress', 'ftp_html'].includes(site.integration_type))
      return [];
    const city = input.city?.trim();
    const region = city ? this.cities.findRegion(city) : null;
    const localities = city
      ? region
        ? this.cities.getLocalities(region, city)
        : []
      : this.cities.getMainLocalities();
    if (!localities.length) return [];
    const base = await this.sites.localityLinksBase(site);
    if (!base || !/^https?:\/\//i.test(base))
      throw new BadRequestException(
        'Configure o dominio publico do site para gerar os links de localidades.',
      );
    return buildLocalityLinks(
      localities,
      input.service,
      base,
      site.integration_type === 'ftp_html' ? '.html' : '/',
    );
  }

  async html(
    html: string,
    input: LocalityLinksInput,
    site?: Site,
  ): Promise<string> {
    if (input.skip_backlinks) return stripLocalityBacklinksSection(html);
    return withLocalityLinksHtml(html, await this.links(input, site));
  }

  async json(
    content: WhitelabelContentJson,
    input: LocalityLinksInput,
    site?: Site,
  ): Promise<WhitelabelContentJson> {
    return withLocalityLinksJson(content, await this.links(input, site));
  }
}
