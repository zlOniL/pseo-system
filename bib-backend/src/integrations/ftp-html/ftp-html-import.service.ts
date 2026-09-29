import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../../common/supabase.service';
import { DbResult } from '../../common/supabase.types';
import type { Service } from '../../services/services.service';
import { BasicFtpRemoteFileClientFactory } from './basic-ftp-remote-file.client';
import { FtpSiteConfigsService } from './ftp-site-configs.service';
import { normalizeRemotePath } from './ftp-path';
import { extractFtpTemplateParts } from './ftp-template-boundary';

interface FtpRemotePageRow {
  id: string;
  site_id: string;
  service_id: string | null;
  remote_path: string;
  public_url: string | null;
  last_seen_hash: string | null;
  last_seen_size: number | null;
  last_seen_modified_at: string | null;
  import_status: 'pending' | 'imported' | 'manual_boundary_required' | 'failed';
  active_template_version_id: string | null;
  created_at: string;
  updated_at: string;
}

interface FtpTemplateVersionRow {
  id: string;
  remote_page_id: string;
  version: number;
  original_html: string;
  document_prefix: string;
  document_suffix: string;
  source_hash: string;
  source_encoding: string;
  boundary_config: unknown;
  editable_fields: unknown;
  status: 'active' | 'archived' | 'invalid';
  created_at: string;
}

export interface FtpRemotePageCheckResult {
  status: 'found' | 'not_found' | 'unavailable';
  remote_path: string;
  attempted_ftp_path?: string;
  attempted_ftp_directory?: string;
  public_url?: string;
  size?: number;
  modified_at?: string | null;
  error?: string;
}

export interface FtpRemotePageImportResult {
  status: 'imported' | 'manual_boundary_required';
  remote_page: FtpRemotePageRow;
  template_version: FtpTemplateVersionRow | null;
  boundary_issue?: string;
  managed_content_preview?: string;
}

@Injectable()
export class FtpHtmlImportService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly ftpConfigs: FtpSiteConfigsService,
    private readonly ftpClientFactory: BasicFtpRemoteFileClientFactory,
  ) {}

  async checkRemotePage(
    service: Service,
    remotePathInput?: string,
  ): Promise<FtpRemotePageCheckResult> {
    const { config, remotePath, client } = await this.prepare(
      service,
      remotePathInput,
    );
    const attempt = client.resolveAttempt(remotePath);

    try {
      const stat = await client.stat(remotePath);
      if (!stat) {
        return {
          status: 'not_found',
          remote_path: remotePath,
          attempted_ftp_path: attempt.path,
          attempted_ftp_directory: attempt.directory,
          public_url: this.publicUrl(config.public_base_url, remotePath),
        };
      }

      return {
        status: 'found',
        remote_path: remotePath,
        attempted_ftp_path: attempt.path,
        attempted_ftp_directory: attempt.directory,
        public_url: this.publicUrl(config.public_base_url, remotePath),
        size: stat.size,
        modified_at: stat.modifiedAt?.toISOString() ?? null,
      };
    } catch (err) {
      return {
        status: 'unavailable',
        remote_path: remotePath,
        attempted_ftp_path: attempt.path,
        attempted_ftp_directory: attempt.directory,
        public_url: this.publicUrl(config.public_base_url, remotePath),
        error: String((err as Error).message || err),
      };
    }
  }

  async importRemotePage(
    service: Service,
    remotePathInput?: string,
  ): Promise<FtpRemotePageImportResult> {
    const { config, remotePath, client } = await this.prepare(
      service,
      remotePathInput,
    );
    const stat = await client.stat(remotePath);
    if (!stat) throw new NotFoundException('Pagina remota nao encontrada.');

    const bytes = await client.download(remotePath);
    const html = decodeHtml(bytes);
    const sourceHash = sha256(bytes);
    const parts = extractFtpTemplateParts(html);
    const now = new Date().toISOString();

    if ('reason' in parts) {
      const remotePage = await this.upsertRemotePage({
        site_id: service.site_id!,
        service_id: service.id,
        remote_path: remotePath,
        public_url: this.publicUrl(config.public_base_url, remotePath),
        last_seen_hash: sourceHash,
        last_seen_size: bytes.length,
        last_seen_modified_at: stat.modifiedAt?.toISOString() ?? null,
        import_status: 'manual_boundary_required',
        updated_at: now,
      });
      return {
        status: 'manual_boundary_required',
        remote_page: remotePage,
        template_version: null,
        boundary_issue: parts.reason,
      };
    }

    const remotePage = await this.upsertRemotePage({
      site_id: service.site_id!,
      service_id: service.id,
      remote_path: remotePath,
      public_url: this.publicUrl(config.public_base_url, remotePath),
      last_seen_hash: sourceHash,
      last_seen_size: bytes.length,
      last_seen_modified_at: stat.modifiedAt?.toISOString() ?? null,
      import_status: 'imported',
      updated_at: now,
    });
    const version = await this.nextTemplateVersion(remotePage.id);
    const templateVersion = await this.insertTemplateVersion({
      remote_page_id: remotePage.id,
      version,
      original_html: html,
      document_prefix: parts.documentPrefix,
      document_suffix: parts.documentSuffix,
      source_hash: sourceHash,
      source_encoding: 'utf-8',
      boundary_config: parts.boundaryConfig,
      editable_fields: {},
      status: 'active',
    });
    const updatedRemotePage = await this.setActiveTemplateVersion(
      remotePage.id,
      templateVersion.id,
    );

    return {
      status: 'imported',
      remote_page: updatedRemotePage,
      template_version: templateVersion,
      managed_content_preview: parts.managedContent.slice(0, 500),
    };
  }

  private async prepare(service: Service, remotePathInput?: string) {
    if (!service.site_id) {
      throw new BadRequestException('Servico nao esta vinculado a um site.');
    }
    const config = await this.ftpConfigs.findRawBySiteId(service.site_id);
    if (!config) throw new NotFoundException('Configuracao FTP nao encontrada.');
    const password = await this.ftpConfigs.getPassword(service.site_id);
    const remotePath = normalizeRemotePath(remotePathInput || `${service.slug}.html`);
    const client = this.ftpClientFactory.create(config, password);
    return { config, remotePath, client };
  }

  private async upsertRemotePage(
    row: Partial<FtpRemotePageRow> & {
      site_id: string;
      remote_path: string;
    },
  ): Promise<FtpRemotePageRow> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_remote_pages')
      .upsert(row, { onConflict: 'site_id,remote_path' })
      .select()
      .single()) as DbResult<FtpRemotePageRow>;

    if (error) throw new BadRequestException(error.message);
    return data as FtpRemotePageRow;
  }

  private async nextTemplateVersion(remotePageId: string): Promise<number> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_template_versions')
      .select('version')
      .eq('remote_page_id', remotePageId)
      .order('version', { ascending: false })
      .limit(1)) as DbResult<Array<{ version: number }>>;

    if (error) throw new BadRequestException(error.message);
    return (data?.[0]?.version ?? 0) + 1;
  }

  private async insertTemplateVersion(
    row: Omit<FtpTemplateVersionRow, 'id' | 'created_at'>,
  ): Promise<FtpTemplateVersionRow> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_template_versions')
      .insert(row)
      .select()
      .single()) as DbResult<FtpTemplateVersionRow>;

    if (error) throw new BadRequestException(error.message);
    return data as FtpTemplateVersionRow;
  }

  private async setActiveTemplateVersion(
    remotePageId: string,
    templateVersionId: string,
  ): Promise<FtpRemotePageRow> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_remote_pages')
      .update({
        active_template_version_id: templateVersionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', remotePageId)
      .select()
      .single()) as DbResult<FtpRemotePageRow>;

    if (error) throw new BadRequestException(error.message);
    return data as FtpRemotePageRow;
  }

  private publicUrl(baseUrl: string, remotePath: string): string {
    const encodedPath = remotePath.split('/').map(encodeURIComponent).join('/');
    return `${baseUrl.replace(/\/+$/, '')}/${encodedPath}`;
  }
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function decodeHtml(data: Buffer): string {
  if (
    data.length >= 3 &&
    data[0] === 0xef &&
    data[1] === 0xbb &&
    data[2] === 0xbf
  ) {
    return data.subarray(3).toString('utf8');
  }
  return data.toString('utf8');
}
