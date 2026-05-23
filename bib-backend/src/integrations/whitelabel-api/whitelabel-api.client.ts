import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Site, SitesService } from '../../sites/sites.service';
import { WhitelabelPublishResult } from './whitelabel.types';

interface WhitelabelApiEnvelope<T> {
  data: T;
}

export class WhitelabelApiError extends HttpException {
  constructor(
    readonly upstreamStatus: number,
    readonly body: string,
  ) {
    const message = `Whitelabel API ${upstreamStatus}: ${body}`;
    super(
      message,
      upstreamStatus >= 500 ? HttpStatus.BAD_GATEWAY : HttpStatus.BAD_REQUEST,
    );
  }
}

@Injectable()
export class WhitelabelApiClient {
  private readonly logger = new Logger(WhitelabelApiClient.name);

  constructor(private readonly sites: SitesService) {}

  async fetchBlueprint(
    site: Site,
    name: 'service-page' | 'pseo-rules',
  ): Promise<unknown> {
    return this.request(site, `/blueprints/${name}`);
  }

  async getPage(
    site: Site,
    slug: string,
  ): Promise<WhitelabelApiEnvelope<Record<string, unknown>>> {
    return this.request(site, `/pages/${encodeURIComponent(slug)}`);
  }

  async updatePage(
    site: Site,
    slug: string,
    payload: Record<string, unknown>,
  ): Promise<WhitelabelApiEnvelope<Record<string, unknown>>> {
    return this.request(site, `/pages/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async publishService(
    site: Site,
    payload: Record<string, unknown>,
  ): Promise<WhitelabelApiEnvelope<WhitelabelPublishResult>> {
    return this.request(site, '/page-service', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async publishServiceLocation(
    site: Site,
    payload: Record<string, unknown>,
  ): Promise<WhitelabelApiEnvelope<WhitelabelPublishResult>> {
    return this.request(site, '/page-service-location', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateServiceImage(
    site: Site,
    slug: string,
    payload: { service_image_url: string; service_image_alt?: string | null },
  ): Promise<WhitelabelApiEnvelope<Record<string, unknown>>> {
    return this.request(
      site,
      `/page-service/${encodeURIComponent(slug)}/image`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  }

  private async request<T>(
    site: Site,
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    if (!site.api_token) {
      throw new BadRequestException(`Site "${site.name}" sem token da API`);
    }

    const url = `${this.sites.apiBase(site)}${path}`;
    const method = init?.method ?? 'GET';
    const requestBody = typeof init?.body === 'string' ? init.body : undefined;

    this.logger.log(
      `[${site.domain}] ${method} ${url}${requestBody ? ` payload=${requestBody}` : ''}`,
    );

    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${site.api_token}`,
        ...(init?.headers ?? {}),
      },
    });

    const body = await response.text();

    this.logger.log(
      `[${site.domain}] ${method} ${url} -> ${response.status}${body ? ` body=${body}` : ''}`,
    );

    if (!response.ok) {
      throw new WhitelabelApiError(response.status, body);
    }

    return (body ? JSON.parse(body) : null) as T;
  }
}
