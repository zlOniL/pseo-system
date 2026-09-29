import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase.service';
import { DbResult } from '../../common/supabase.types';
import { Service } from '../../services/services.service';
import { slugify } from '../../common/slug';
import { normalizeRemotePath } from './ftp-path';
import { FtpHtmlDocumentRenderer } from './ftp-html-document-renderer.service';
import { FtpSiteConfigsService } from './ftp-site-configs.service';

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
      throw new BadRequestException(
        'Importe a pagina FTP do servico antes de gerar conteudo.',
      );
    }

    const template = await this.findTemplate(remotePage.active_template_version_id);
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
    });

    return {
      html,
      remotePage,
      externalSlug: stripHtmlExtension(remotePage.remote_path),
      externalUrl: remotePage.public_url,
    };
  }

  private async resolveRemotePage(
    service: Service,
    input: ComposeFtpHtmlInput,
  ): Promise<FtpHtmlRemotePage> {
    const basePage = await this.findBaseRemotePage(service);
    if (!input.city?.trim()) return basePage;

    const config = await this.ftpConfigs.findRawBySiteId(service.site_id!);
    if (!config) throw new BadRequestException('Configuracao FTP nao encontrada.');

    const remotePath = normalizeRemotePath(`${slugify(input.mainKeyword)}.html`);
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

  private async findBaseRemotePage(service: Service): Promise<FtpHtmlRemotePage> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_remote_pages')
      .select('*')
      .eq('service_id', service.id)
      .eq('site_id', service.site_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as DbResult<FtpHtmlRemotePage>;

    if (error) throw new BadRequestException(error.message);
    if (!data) {
      throw new BadRequestException(
        'Importe a pagina FTP do servico antes de gerar conteudo.',
      );
    }
    return data;
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
}

function stripHtmlExtension(remotePath: string): string {
  return remotePath.replace(/\.html?$/i, '');
}
