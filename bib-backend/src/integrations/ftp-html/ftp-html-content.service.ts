import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase.service';
import { DbResult } from '../../common/supabase.types';
import { Service } from '../../services/services.service';
import { slugify } from '../../common/slug';
import { normalizeRemotePath } from './ftp-path';
import { FtpHtmlDocumentRenderer } from './ftp-html-document-renderer.service';
import { FtpSiteConfigsService } from './ftp-site-configs.service';
import { createHash } from 'crypto';
import { FTP_BASE_TEMPLATE } from './ftp-base-template';

export interface FtpHtmlRemotePage {
  id: string;
  site_id: string;
  service_id: string | null;
  remote_path: string;
  public_url: string | null;
  active_template_version_id: string | null;
}

interface FtpTemplateVersionRow {
  id: string;
  document_prefix: string;
  document_suffix: string;
}

export interface ComposeFtpHtmlInput {
  service: Service;
  fragmentHtml: string;
  mainKeyword: string;
  metaDescription?: string | null;
  city?: string | null;
}

export interface ComposedFtpHtml {
  html: string;
  remotePage: FtpHtmlRemotePage;
  externalSlug: string;
  externalUrl: string | null;
  templateSource: 'ftp' | 'base_template';
}

@Injectable()
export class FtpHtmlContentService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly ftpConfigs: FtpSiteConfigsService,
    private readonly renderer: FtpHtmlDocumentRenderer,
  ) {}

  async compose(input: ComposeFtpHtmlInput): Promise<ComposedFtpHtml> {
    if (!input.service.site_id) {
      throw new BadRequestException('Servico FTP sem site associado.');
    }

    const remotePage = await this.resolveRemotePage(input.service, input);
    if (!remotePage.active_template_version_id) {
      throw new BadRequestException('Template FTP ativo nao encontrado.');
    }

    const template = await this.findTemplate(
      remotePage.active_template_version_id,
    );
    const html = this.renderer.render({
      template,
      fragmentHtml: input.fragmentHtml,
      seo: {
        title: input.mainKeyword,
        description: input.metaDescription,
        canonicalUrl: remotePage.public_url,
      },
      textReplacements: [
        {
          from: input.service.name,
          to: input.mainKeyword,
        },
      ],
      videoUrl: input.service.video_url,
      bannerImageUrl: this.getBannerUrl(input.service),
      bannerImageAlt:
        input.service.featured_image_alt ?? `${input.service.name} - assistência profissional`,
    });

    return {
      html,
      remotePage,
      externalSlug: stripHtmlExtension(remotePage.remote_path),
      externalUrl: remotePage.public_url,
      templateSource: template.document_prefix.includes('{{BANNER_SECTION}}')
        ? 'base_template'
        : 'ftp',
    };
  }

  private async resolveRemotePage(
    service: Service,
    input: ComposeFtpHtmlInput,
  ): Promise<FtpHtmlRemotePage> {
    const basePage = await this.findBaseRemotePage(service);
    if (!input.city?.trim()) return basePage;

    const config = await this.ftpConfigs.findRawBySiteId(service.site_id!);
    if (!config)
      throw new BadRequestException('Configuracao FTP nao encontrada.');

    const remotePath = normalizeRemotePath(
      `${slugify(input.mainKeyword)}.html`,
    );
    const publicUrl = `${config.public_base_url.replace(/\/+$/, '')}/${remotePath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;

    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_remote_pages')
      .upsert(
        {
          site_id: service.site_id,
          service_id: service.id,
          remote_path: remotePath,
          public_url: publicUrl,
          import_status: 'imported',
          active_template_version_id: basePage.active_template_version_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'site_id,remote_path' },
      )
      .select()
      .single()) as DbResult<FtpHtmlRemotePage>;

    if (error) throw new BadRequestException(error.message);
    return data as FtpHtmlRemotePage;
  }

  private async findBaseRemotePage(
    service: Service,
  ): Promise<FtpHtmlRemotePage> {
    const expectedRemotePath = normalizeRemotePath(`${service.slug}.html`);
    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_remote_pages')
      .select('*')
      .eq('service_id', service.id)
      .eq('site_id', service.site_id)
      .eq('remote_path', expectedRemotePath)
      .maybeSingle()) as DbResult<FtpHtmlRemotePage>;

    if (error) throw new BadRequestException(error.message);
    if (data) return data;

    const config = await this.ftpConfigs.findRawBySiteId(service.site_id!);
    if (!config) throw new BadRequestException('Configuracao FTP nao encontrada.');

    const publicUrl = `${config.public_base_url.replace(/\/+$/, '')}/${expectedRemotePath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
    const client = this.supabase.getClient();
    const remoteInsert = (await client
      .from('ftp_remote_pages')
      .insert({
        site_id: service.site_id,
        service_id: service.id,
        remote_path: expectedRemotePath,
        public_url: publicUrl,
        import_status: 'imported',
      })
      .select()
      .single()) as DbResult<FtpHtmlRemotePage>;
    if (remoteInsert.error || !remoteInsert.data) {
      throw new BadRequestException(remoteInsert.error?.message ?? 'Falha ao criar pagina FTP base.');
    }

    const originalHtml = `${FTP_BASE_TEMPLATE.documentPrefix}${FTP_BASE_TEMPLATE.documentSuffix}`;
    const templateInsert = (await client
      .from('ftp_template_versions')
      .insert({
        remote_page_id: remoteInsert.data.id,
        version: 1,
        original_html: originalHtml,
        document_prefix: FTP_BASE_TEMPLATE.documentPrefix,
        document_suffix: FTP_BASE_TEMPLATE.documentSuffix,
        source_hash: createHash('sha256').update(originalHtml).digest('hex'),
        source_encoding: 'utf-8',
        boundary_config: { source: 'base_template' },
        editable_fields: { banner: true },
        status: 'active',
      })
      .select('id')
      .single()) as DbResult<{ id: string }>;
    if (templateInsert.error || !templateInsert.data) {
      throw new BadRequestException(templateInsert.error?.message ?? 'Falha ao criar template FTP base.');
    }

    const updated = (await client
      .from('ftp_remote_pages')
      .update({ active_template_version_id: templateInsert.data.id })
      .eq('id', remoteInsert.data.id)
      .select()
      .single()) as DbResult<FtpHtmlRemotePage>;
    if (updated.error || !updated.data) {
      throw new BadRequestException(updated.error?.message ?? 'Falha ao ativar template FTP base.');
    }
    return updated.data;
  }

  private async findTemplate(id: string): Promise<FtpTemplateVersionRow> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_template_versions')
      .select('id, document_prefix, document_suffix')
      .eq('id', id)
      .single()) as DbResult<FtpTemplateVersionRow>;

    if (error || !data) {
      throw new BadRequestException('Template FTP ativo nao encontrado.');
    }
    return data;
  }

  private getBannerUrl(service: Service): string | null {
    return service.featured_image_url ?? service.images?.find(Boolean) ?? null;
  }
}

function stripHtmlExtension(remotePath: string): string {
  return remotePath.replace(/\.html?$/i, '');
}
