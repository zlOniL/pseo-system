import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { DbError, DbResult } from '../common/supabase.types';
import { CreateSiteDto, IntegrationType } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

export interface Site {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  domain: string;
  integration_type: IntegrationType;
  api_token: string | null;
  wordpress_base_url: string | null;
  wordpress_secret: string | null;
  wordpress_proxy_base: string | null;
  status: 'active' | 'archived';
}

export type PublicSite = Omit<Site, 'api_token' | 'wordpress_secret'> & {
  has_api_token: boolean;
  has_wordpress_secret: boolean;
};

interface SiteBlueprintRow {
  name: string;
  payload: unknown;
  fetched_at: string;
}

@Injectable()
export class SitesService {
  constructor(private readonly supabase: SupabaseService) {}

  toPublic(site: Site): PublicSite {
    const { api_token, wordpress_secret, ...rest } = site;
    return {
      ...rest,
      has_api_token: Boolean(api_token),
      has_wordpress_secret: Boolean(wordpress_secret),
    };
  }

  normalizeDomain(domain: string): string {
    return domain
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }

  apiBase(site: Site): string {
    const domain = this.normalizeDomain(site.domain);
    return `https://${domain}/api`;
  }

  wordpressBase(site: Site): string {
    const explicit = site.wordpress_base_url?.trim();
    if (explicit) return explicit.replace(/\/$/, '');

    const legacy = process.env.WP_BASE_URL?.trim();
    if (legacy && this.isLegacyWordPressSite(site))
      return legacy.replace(/\/$/, '');

    return `https://${this.normalizeDomain(site.domain)}`;
  }

  wordpressProxyBase(site: Site): string | null {
    const explicit = site.wordpress_proxy_base?.trim();
    if (explicit && site.integration_type === 'wordpress')
      return explicit.replace(/\/$/, '');

    const legacy = process.env.WP_PROXY_BASE?.trim();
    const legacyWpBase = process.env.WP_BASE_URL?.trim();
    if (!legacy || !legacyWpBase || site.integration_type !== 'wordpress')
      return null;

    const siteBase = this.normalizeDomain(this.wordpressBase(site));
    const proxyTargetBase = this.normalizeDomain(legacyWpBase);
    if (siteBase === proxyTargetBase) return legacy.replace(/\/$/, '');

    return null;
  }

  wordpressSecret(site: Site): string | null {
    if (site.wordpress_secret?.trim()) return site.wordpress_secret.trim();
    if (site.api_token?.trim() && site.integration_type === 'wordpress')
      return site.api_token.trim();

    const legacy = process.env.WP_SECRET?.trim();
    const legacyWpBase = process.env.WP_BASE_URL?.trim();
    if (legacy && legacyWpBase && site.integration_type === 'wordpress') {
      const siteBase = this.normalizeDomain(this.wordpressBase(site));
      const legacyBase = this.normalizeDomain(legacyWpBase);
      if (siteBase === legacyBase) return legacy;
    }

    return null;
  }

  private isLegacyWordPressSite(site: Site): boolean {
    return (
      site.integration_type === 'wordpress' &&
      !site.wordpress_base_url &&
      !site.wordpress_secret &&
      !site.wordpress_proxy_base
    );
  }

  async create(dto: CreateSiteDto): Promise<PublicSite> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('sites')
      .insert({
        name: dto.name.trim(),
        domain: this.normalizeDomain(dto.domain),
        integration_type: dto.integration_type,
        api_token: dto.api_token?.trim() || null,
        wordpress_base_url:
          dto.wordpress_base_url?.trim().replace(/\/$/, '') || null,
        wordpress_secret: dto.wordpress_secret?.trim() || null,
        wordpress_proxy_base:
          dto.wordpress_proxy_base?.trim().replace(/\/$/, '') || null,
      })
      .select()
      .single()) as DbResult<Site>;

    if (error) this.throwFriendlySiteError(error);
    return this.toPublic(data as Site);
  }

  async findAll(): Promise<PublicSite[]> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('sites')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })) as DbResult<Site[]>;

    if (error) this.throwFriendlySiteError(error);
    return (data ?? []).map((site) => this.toPublic(site));
  }

  async findById(id: string): Promise<Site> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('sites')
      .select('*')
      .eq('id', id)
      .single()) as DbResult<Site>;

    if (error || !data) {
      if (error) this.throwFriendlySiteError(error);
      throw new NotFoundException(`Site ${id} not found`);
    }
    return data;
  }

  async findPublicById(id: string): Promise<PublicSite> {
    return this.toPublic(await this.findById(id));
  }

  async update(id: string, dto: UpdateSiteDto): Promise<PublicSite> {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.domain !== undefined)
      patch.domain = this.normalizeDomain(dto.domain);
    if (dto.integration_type !== undefined)
      patch.integration_type = dto.integration_type;
    if (dto.api_token !== undefined)
      patch.api_token = dto.api_token.trim() || null;
    if (dto.wordpress_base_url !== undefined)
      patch.wordpress_base_url =
        dto.wordpress_base_url.trim().replace(/\/$/, '') || null;
    if (dto.wordpress_secret !== undefined)
      patch.wordpress_secret = dto.wordpress_secret.trim() || null;
    if (dto.wordpress_proxy_base !== undefined)
      patch.wordpress_proxy_base =
        dto.wordpress_proxy_base.trim().replace(/\/$/, '') || null;
    if (dto.status !== undefined) patch.status = dto.status;

    const { data, error } = (await this.supabase
      .getClient()
      .from('sites')
      .update(patch)
      .eq('id', id)
      .select()
      .single()) as DbResult<Site>;

    if (error || !data) {
      if (error) this.throwFriendlySiteError(error);
      throw new NotFoundException(`Site ${id} not found`);
    }
    return this.toPublic(data);
  }

  async saveBlueprint(
    siteId: string,
    name: 'service-page' | 'pseo-rules',
    payload: unknown,
  ): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('site_blueprints')
      .upsert(
        {
          site_id: siteId,
          name,
          payload,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'site_id,name' },
      );

    if (error) this.throwFriendlySiteError(error);
  }

  async getBlueprints(siteId: string): Promise<Record<string, unknown>> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('site_blueprints')
      .select('name,payload,fetched_at')
      .eq('site_id', siteId)) as DbResult<SiteBlueprintRow[]>;

    if (error) this.throwFriendlySiteError(error);
    return Object.fromEntries(
      (data ?? []).map((row) => [row.name, row.payload]),
    );
  }

  private throwFriendlySiteError(error: DbError): never {
    if (error.code === '42P01') {
      throw new BadRequestException(
        'Tabela de sites não encontrada. Execute a migration supabase-migration-sites-whitelabel.sql no Supabase.',
      );
    }
    if (error.code === '42703') {
      throw new BadRequestException(
        `Coluna ausente em sites/site_blueprints: ${error.message}. Execute a migration multi-site atualizada.`,
      );
    }
    if (error.code === '23505') {
      throw new BadRequestException(
        'Já existe um site configurado com este domínio.',
      );
    }
    throw new BadRequestException(error.message);
  }
}
