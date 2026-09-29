import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as path from 'path/posix';
import { Content } from '../../contents/contents.service';
import { ContentPublisher } from '../../publishing/content-publisher';
import { ContentsService } from '../../contents/contents.service';
import { SupabaseService } from '../../common/supabase.service';
import { DbResult } from '../../common/supabase.types';
import { BasicFtpRemoteFileClientFactory } from './basic-ftp-remote-file.client';
import { FtpSiteConfigsService } from './ftp-site-configs.service';
import { RemoteFileClient } from './remote-file-client';
import { FtpHtmlDocumentRenderer } from './ftp-html-document-renderer.service';

interface FtpRemotePageRow {
  id: string;
  site_id: string;
  service_id: string | null;
  remote_path: string;
  public_url: string | null;
  last_seen_hash: string | null;
  last_seen_size: number | null;
  last_seen_modified_at: string | null;
  active_template_version_id: string | null;
}

interface FtpTemplateVersionRow {
  id: string;
  document_prefix: string;
  document_suffix: string;
}

interface FtpPublishRunRow {
  id: string;
  content_id: string;
  remote_page_id: string;
  status: FtpPublishStatus;
}

type FtpPublishStatus =
  | 'preparing'
  | 'remote_checked'
  | 'backed_up'
  | 'uploaded'
  | 'swapped'
  | 'verified'
  | 'published'
  | 'conflict'
  | 'failed'
  | 'rolled_back';

@Injectable()
export class FtpHtmlPublisherService implements ContentPublisher {
  private static readonly locks = new Set<string>();

  constructor(
    private readonly contents: ContentsService,
    private readonly supabase: SupabaseService,
    private readonly ftpConfigs: FtpSiteConfigsService,
    private readonly ftpClientFactory: BasicFtpRemoteFileClientFactory,
    private readonly renderer: FtpHtmlDocumentRenderer,
  ) {}

  async publish(contentId: string): Promise<Content> {
    if (process.env.FTP_HTML_INTEGRATION_ENABLED !== 'true') {
      throw new BadRequestException(
        'Integracao FTP HTML desabilitada por FTP_HTML_INTEGRATION_ENABLED.',
      );
    }

    const content = await this.contents.findById(contentId);
    if (content.status !== 'approved') {
      throw new BadRequestException('Aprove o conteudo antes de publicar no FTP.');
    }
    if (!content.site_id || !content.ftp_remote_page_id) {
      throw new BadRequestException(
        'Conteudo FTP sem site ou pagina remota associada.',
      );
    }

    const remotePage = await this.findRemotePage(content.ftp_remote_page_id);
    const lockKey = `${remotePage.site_id}:${remotePage.remote_path}`;

    return this.withLock(lockKey, () => this.publishLocked(content, remotePage));
  }

  private async publishLocked(
    content: Content,
    remotePage: FtpRemotePageRow,
  ): Promise<Content> {
    const config = await this.ftpConfigs.findRawBySiteId(content.site_id!);
    if (!config) throw new NotFoundException('Configuracao FTP nao encontrada.');

    const password = await this.ftpConfigs.getPassword(content.site_id!);
    const client = this.ftpClientFactory.create(config, password);
    const generatedHtml = await this.renderContent(content, remotePage);
    const generatedBytes = Buffer.from(generatedHtml, 'utf8');
    const generatedHash = sha256(generatedBytes);
    const run = await this.insertRun({
      content_id: content.id,
      remote_page_id: remotePage.id,
      status: 'preparing',
      generated_hash: generatedHash,
    });
    await this.markPending(content.id, run.id);

    const remotePath = remotePage.remote_path;
    const timestamp = timestampForPath();
    const recoveryPath = siblingPath(
      remotePath,
      `.pseo-recovery-${timestamp}-${path.basename(remotePath)}`,
    );
    const temporaryPath = siblingPath(
      remotePath,
      `.pseo-upload-${timestamp}-${path.basename(remotePath)}.tmp`,
    );
    let originalMoved = false;
    let terminalStatus: FtpPublishStatus | null = null;

    try {
      const originalBytes = await this.downloadIfExists(client, remotePath);
      const remoteHashBefore = originalBytes ? sha256(originalBytes) : null;
      await this.updateRun(run.id, {
        status: 'remote_checked',
        remote_hash_before: remoteHashBefore,
      });

      if (
        originalBytes &&
        remotePage.last_seen_hash &&
        remotePage.last_seen_hash !== remoteHashBefore
      ) {
        await this.markConflict(content.id, run.id);
        await this.updateRun(run.id, {
          status: 'conflict',
          error:
            'Arquivo remoto mudou desde a ultima importacao. Reimporte antes de publicar.',
          finished_at: new Date().toISOString(),
        });
        terminalStatus = 'conflict';
        throw new BadRequestException(
          'Arquivo remoto mudou desde a ultima importacao. Reimporte antes de publicar.',
        );
      }

      if (originalBytes) {
        const backupPath = backupPathFor(
          config.backup_root,
          remotePath,
          timestamp,
          remoteHashBefore!,
        );
        await this.writeVerifiedBackup(client, backupPath, originalBytes);
        await this.updateRun(run.id, {
          status: 'backed_up',
          backup_path: backupPath,
        });
      }

      await client.upload(temporaryPath, generatedBytes);
      const temporaryHash = sha256(await client.download(temporaryPath));
      if (temporaryHash !== generatedHash) {
        throw new BadRequestException('Hash do arquivo temporario FTP divergiu.');
      }
      await this.updateRun(run.id, {
        status: 'uploaded',
        temporary_path: temporaryPath,
      });

      if (originalBytes) {
        await client.rename(remotePath, recoveryPath);
        originalMoved = true;
      }
      await client.rename(temporaryPath, remotePath);
      await this.updateRun(run.id, { status: 'swapped' });

      const finalBytes = await client.download(remotePath);
      if (sha256(finalBytes) !== generatedHash) {
        throw new BadRequestException('Hash final do arquivo FTP divergiu.');
      }
      await this.updateRun(run.id, { status: 'verified' });

      await client.remove(recoveryPath).catch(() => undefined);
      await this.updateRemotePageAfterPublish(remotePage.id, generatedHash, finalBytes);

      const published = await this.markPublished(
        content.id,
        remotePage,
        config.public_base_url,
        generatedHtml,
        run.id,
      );
      await this.updateRun(run.id, {
        status: 'published',
        finished_at: new Date().toISOString(),
      });
      return published;
    } catch (err) {
      if (terminalStatus === 'conflict') throw err;
      if (originalMoved) {
        await this.tryRollback(client, remotePath, recoveryPath, content.id, run.id);
      } else {
        await this.markFailed(content.id, run.id, err);
      }
      throw err;
    }
  }

  private async renderContent(
    content: Content,
    remotePage: FtpRemotePageRow,
  ): Promise<string> {
    if (!content.html?.trim()) {
      throw new BadRequestException('Conteudo FTP sem HTML para publicar.');
    }

    if (content.render_mode === 'full_document') {
      this.assertNoPreviewArtifacts(content.html);
      return this.renderer.applyContentLayout(content.html);
    }

    if (!remotePage.active_template_version_id) {
      throw new BadRequestException('Pagina remota sem template ativo.');
    }

    const template = await this.findTemplate(remotePage.active_template_version_id);
    const html = this.renderer.render({
      template,
      fragmentHtml: content.html,
      seo: {
        title: content.main_keyword,
        description: content.meta_description,
        canonicalUrl: remotePage.public_url,
      },
    });
    this.assertNoPreviewArtifacts(html);
    return html;
  }

  private assertNoPreviewArtifacts(html: string): void {
    if (/<base\b[^>]*>|data-pseo-preview-lock|script disabled in PSEO preview/i.test(html)) {
      throw new BadRequestException(
        'HTML FTP contem artefatos de preview e nao pode ser publicado.',
      );
    }
  }

  private async writeVerifiedBackup(
    client: RemoteFileClient,
    backupPath: string,
    originalBytes: Buffer,
  ): Promise<void> {
    await client.uploadAccountPath(backupPath, originalBytes);
    const backupStat = await client.statAccountPath(backupPath);
    if (!backupStat || backupStat.size !== originalBytes.length) {
      throw new BadRequestException('Backup FTP nao confirmou o tamanho original.');
    }
  }

  private async downloadIfExists(
    client: RemoteFileClient,
    remotePath: string,
  ): Promise<Buffer | null> {
    try {
      return await client.download(remotePath);
    } catch (err) {
      const message = String((err as Error).message || err);
      if (/\b(450|550)\b|not found|no such file|missing/i.test(message)) {
        return null;
      }
      throw err;
    }
  }

  private async tryRollback(
    client: RemoteFileClient,
    remotePath: string,
    recoveryPath: string,
    contentId: string,
    runId: string,
  ): Promise<void> {
    try {
      await client.remove(remotePath).catch(() => undefined);
      await client.rename(recoveryPath, remotePath);
      await this.supabase
        .getClient()
        .from('contents')
        .update({ deployment_status: 'rolled_back', last_publish_run_id: runId })
        .eq('id', contentId);
      await this.updateRun(runId, {
        status: 'rolled_back',
        finished_at: new Date().toISOString(),
      });
    } catch (rollbackErr) {
      await this.supabase
        .getClient()
        .from('contents')
        .update({ deployment_status: 'failed', last_publish_run_id: runId })
        .eq('id', contentId);
      await this.updateRun(runId, {
        status: 'failed',
        error: `Rollback falhou: ${String((rollbackErr as Error).message || rollbackErr)}`,
        finished_at: new Date().toISOString(),
      });
    }
  }

  private async markConflict(contentId: string, runId: string): Promise<void> {
    await this.supabase
      .getClient()
      .from('contents')
      .update({ deployment_status: 'conflict', last_publish_run_id: runId })
      .eq('id', contentId);
  }

  private async markPending(contentId: string, runId: string): Promise<void> {
    await this.supabase
      .getClient()
      .from('contents')
      .update({ deployment_status: 'pending', last_publish_run_id: runId })
      .eq('id', contentId);
  }

  private async markFailed(
    contentId: string,
    runId: string,
    err: unknown,
  ): Promise<void> {
    await this.supabase
      .getClient()
      .from('contents')
      .update({ deployment_status: 'failed', last_publish_run_id: runId })
      .eq('id', contentId);
    await this.updateRun(runId, {
      status: 'failed',
      error: String((err as Error).message || err),
      finished_at: new Date().toISOString(),
    });
  }

  private async markPublished(
    contentId: string,
    remotePage: FtpRemotePageRow,
    publicBaseUrl: string,
    html: string,
    runId: string,
  ): Promise<Content> {
    const externalUrl =
      remotePage.public_url ?? publicUrl(publicBaseUrl, remotePage.remote_path);
    const { data, error } = (await this.supabase
      .getClient()
      .from('contents')
      .update({
        status: 'published',
        html,
        render_mode: 'full_document',
        deployment_status: 'published',
        last_publish_run_id: runId,
        external_slug: stripHtmlExtension(remotePage.remote_path),
        external_page_url: externalUrl,
        wp_post_url: externalUrl,
      })
      .eq('id', contentId)
      .select()
      .single()) as DbResult<Content>;

    if (error) throw new BadRequestException(error.message);
    return data as Content;
  }

  private async updateRemotePageAfterPublish(
    remotePageId: string,
    hash: string,
    bytes: Buffer,
  ): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('ftp_remote_pages')
      .update({
        last_seen_hash: hash,
        last_seen_size: bytes.length,
        last_seen_modified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', remotePageId);
    if (error) throw new BadRequestException(error.message);
  }

  private async findRemotePage(id: string): Promise<FtpRemotePageRow> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_remote_pages')
      .select('*')
      .eq('id', id)
      .single()) as DbResult<FtpRemotePageRow>;

    if (error || !data) throw new NotFoundException('Pagina remota FTP nao encontrada.');
    return data;
  }

  private async findTemplate(id: string): Promise<FtpTemplateVersionRow> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_template_versions')
      .select('id, document_prefix, document_suffix')
      .eq('id', id)
      .single()) as DbResult<FtpTemplateVersionRow>;

    if (error || !data) throw new NotFoundException('Template FTP nao encontrado.');
    return data;
  }

  private async insertRun(
    row: Record<string, unknown>,
  ): Promise<FtpPublishRunRow> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_publish_runs')
      .insert(row)
      .select()
      .single()) as DbResult<FtpPublishRunRow>;

    if (error) throw new BadRequestException(error.message);
    return data as FtpPublishRunRow;
  }

  private async updateRun(
    id: string,
    row: Partial<Record<string, unknown>> & { status: FtpPublishStatus },
  ): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('ftp_publish_runs')
      .update(row)
      .eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }

  private async withLock<T>(key: string, action: () => Promise<T>): Promise<T> {
    if (FtpHtmlPublisherService.locks.has(key)) {
      throw new BadRequestException('Publicacao FTP ja em andamento para esta pagina.');
    }

    FtpHtmlPublisherService.locks.add(key);
    try {
      return await action();
    } finally {
      FtpHtmlPublisherService.locks.delete(key);
    }
  }
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function timestampForPath(): string {
  return new Date().toISOString().replace(/[-:.]/g, '').replace('T', 'T');
}

function siblingPath(remotePath: string, name: string): string {
  const dir = path.dirname(remotePath);
  return dir === '.' ? name : path.join(dir, name);
}

function backupPathFor(
  backupRoot: string,
  remotePath: string,
  timestamp: string,
  hash: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const parsed = path.parse(remotePath);
  const name = `${parsed.name}--${timestamp}--${hash.slice(0, 12)}${parsed.ext || '.html'}`;
  return path.join(backupRoot, date, parsed.dir, name);
}

function stripHtmlExtension(remotePath: string): string {
  return remotePath.replace(/\.html?$/i, '');
}

function publicUrl(baseUrl: string, remotePath: string): string {
  const encodedPath = remotePath.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/${encodedPath}`;
}
