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

interface FtpTemplateReference {
  document_prefix: string;
  document_suffix: string;
  remote_path: string;
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
    const prepared = await this.prepare(input);
    return prepared(input.fragmentHtml, input.metaDescription);
  }

  async prepare(input: Omit<ComposeFtpHtmlInput, 'fragmentHtml'>) {
    if (!input.service.site_id) {
      throw new BadRequestException('Servico FTP sem site associado.');
    }

    const config = await this.ftpConfigs.findRawBySiteId(input.service.site_id);
    if (!config) throw new BadRequestException('Configuracao FTP nao encontrada.');
    if (!/^https?:\/\//i.test(config.public_base_url ?? '')) {
      throw new BadRequestException('URL publica FTP invalida.');
    }
    const remotePage = await this.resolveRemotePage(input.service, { ...input, fragmentHtml: '' });
    if (!remotePage.active_template_version_id) {
      throw new BadRequestException('Template FTP ativo nao encontrado.');
    }

    const template = await this.findTemplate(
      remotePage.active_template_version_id,
    );
    const compose = (fragmentHtml: string, metaDescription?: string | null): ComposedFtpHtml => {
      return this.renderPrepared({ ...input, fragmentHtml, metaDescription }, remotePage, template);
    };
    // Exercise the real renderer before any paid AI calls, using the same snapshot.
    compose('<section>Validacao previa</section>', input.mainKeyword);
    return compose;
  }

  private renderPrepared(
    input: ComposeFtpHtmlInput,
    remotePage: FtpHtmlRemotePage,
    template: FtpTemplateVersionRow,
  ): ComposedFtpHtml {
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
          from: '{{SERVICE_NAME}}',
          to: input.mainKeyword,
        },
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
    const reference = await this.findTemplateReference(
      service.site_id!,
      config.default_template_remote_path,
    );
    const template = reference
      ? {
          documentPrefix: reference.document_prefix,
          documentSuffix: reference.document_suffix,
        }
      : FTP_BASE_TEMPLATE;
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

    const originalHtml = `${template.documentPrefix}${template.documentSuffix}`;
    const templateInsert = (await client
      .from('ftp_template_versions')
      .insert({
        remote_page_id: remoteInsert.data.id,
        version: 1,
        original_html: originalHtml,
        document_prefix: template.documentPrefix,
        document_suffix: template.documentSuffix,
        source_hash: createHash('sha256').update(originalHtml).digest('hex'),
        source_encoding: 'utf-8',
        boundary_config: reference
          ? {
              source: 'site_reference',
              reference_remote_path: reference.remote_path,
            }
          : { source: 'base_template' },
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

  private async findTemplateReference(
    siteId: string,
    remotePath?: string | null,
  ): Promise<FtpTemplateReference | null> {
    if (!remotePath) return null;

    const { data: remotePage, error: remoteError } = (await this.supabase
      .getClient()
      .from('ftp_remote_pages')
      .select('service_id, active_template_version_id')
      .eq('site_id', siteId)
      .eq('remote_path', remotePath)
      .maybeSingle()) as DbResult<{
      service_id: string | null;
      active_template_version_id: string | null;
    }>;
    if (remoteError) throw new BadRequestException(remoteError.message);
    if (!remotePage?.service_id || !remotePage.active_template_version_id) {
      throw new BadRequestException(
        `Template visual FTP "${remotePath}" nao esta importado ou ativo.`,
      );
    }

    const [template, service] = await Promise.all([
      this.findTemplate(remotePage.active_template_version_id),
      this.findReferenceService(remotePage.service_id),
    ]);
    const documentPrefix = template.document_prefix.split(service.name).join(
      '{{SERVICE_NAME}}',
    );
    if (!documentPrefix.includes('{{SERVICE_NAME}}')) {
      throw new BadRequestException(
        `Template visual FTP "${remotePath}" nao contem o nome do servico de referencia.`,
      );
    }
    if (!/<\/main>\s*$/i.test(documentPrefix)) {
      throw new BadRequestException(
        `Template visual FTP "${remotePath}" nao termina no banner principal.`,
      );
    }

    const prefixWithBannerBackground = documentPrefix.replace(
      /<main\b([^>]*)>/i,
      (main, attributes: string) => {
        if (/\sstyle\s*=/i.test(attributes)) {
          return main.replace(
            /(\sstyle\s*=\s*["'])([^"']*)(["'])/i,
            '$1$2;{{BANNER_BACKGROUND_STYLE}}$3',
          );
        }
        return `<main${attributes} style="{{BANNER_BACKGROUND_STYLE}}">`;
      },
    );
    if (!prefixWithBannerBackground.includes('{{BANNER_BACKGROUND_STYLE}}')) {
      throw new BadRequestException(
        `Template visual FTP "${remotePath}" nao contem o banner principal.`,
      );
    }

    return {
      document_prefix: prefixWithBannerBackground,
      document_suffix: template.document_suffix,
      remote_path: remotePath,
    };
  }

  private async findReferenceService(id: string): Promise<{ name: string }> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('services')
      .select('name')
      .eq('id', id)
      .single()) as DbResult<{ name: string }>;
    if (error || !data?.name) {
      throw new BadRequestException('Servico do template visual FTP nao encontrado.');
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
