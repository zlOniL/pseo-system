import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { SupabaseService } from '../../common/supabase.service';
import { DbError, DbResult } from '../../common/supabase.types';
import { UpsertFtpSiteConfigDto } from './dto/upsert-ftp-site-config.dto';
import { BasicFtpRemoteFileClientFactory } from './basic-ftp-remote-file.client';
import { ConnectionResult } from './remote-file-client';

export interface FtpSiteConfigRow {
  site_id: string;
  host: string;
  port: number;
  security_mode: 'plain' | 'explicit_tls';
  username: string;
  password_encrypted: string | null;
  remote_root: string;
  backup_root: string;
  public_base_url: string;
  passive_mode: boolean;
  connection_status: 'untested' | 'ok' | 'failed';
  created_at: string;
  updated_at: string;
}

export type PublicFtpSiteConfig = Omit<FtpSiteConfigRow, 'password_encrypted'> & {
  has_ftp_password: boolean;
};

@Injectable()
export class FtpSiteConfigsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly ftpClientFactory: BasicFtpRemoteFileClientFactory,
  ) {}

  async findPublicBySiteId(siteId: string): Promise<PublicFtpSiteConfig | null> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_site_configs')
      .select('*')
      .eq('site_id', siteId)
      .maybeSingle()) as DbResult<FtpSiteConfigRow>;

    if (error) this.throwFriendlyFtpConfigError(error);
    return data ? this.toPublic(data) : null;
  }

  async upsert(
    siteId: string,
    dto: UpsertFtpSiteConfigDto,
  ): Promise<PublicFtpSiteConfig> {
    const existing = await this.findRawBySiteId(siteId);
    const password_encrypted =
      dto.password !== undefined
        ? this.encrypt(dto.password)
        : existing?.password_encrypted ?? null;

    if (!password_encrypted) {
      throw new BadRequestException('Informe a senha FTP.');
    }

    const row = {
      site_id: siteId,
      host: dto.host.trim(),
      port: dto.port ?? 21,
      security_mode: dto.security_mode,
      username: dto.username.trim(),
      password_encrypted,
      remote_root: this.cleanRelativePath(dto.remote_root, 'remote_root', true),
      backup_root: this.cleanRelativePath(dto.backup_root, 'backup_root'),
      public_base_url: dto.public_base_url.trim().replace(/\/+$/, ''),
      passive_mode: dto.passive_mode ?? true,
      connection_status: 'untested',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_site_configs')
      .upsert(row, { onConflict: 'site_id' })
      .select()
      .single()) as DbResult<FtpSiteConfigRow>;

    if (error) this.throwFriendlyFtpConfigError(error);
    return this.toPublic(data as FtpSiteConfigRow);
  }

  async getPassword(siteId: string): Promise<string> {
    const config = await this.findRawBySiteId(siteId);
    if (!config?.password_encrypted) {
      throw new NotFoundException('Senha FTP nao configurada.');
    }
    return this.decrypt(config.password_encrypted);
  }

  async testConnection(siteId: string): Promise<ConnectionResult> {
    const config = await this.findRawBySiteId(siteId);
    if (!config) {
      throw new NotFoundException('Configuracao FTP nao encontrada.');
    }

    const password = await this.getPassword(siteId);
    const result = await this.ftpClientFactory
      .create(config, password)
      .testConnection();

    await this.updateConnectionStatus(siteId, result.ok ? 'ok' : 'failed');
    return result;
  }

  async findRawBySiteId(siteId: string): Promise<FtpSiteConfigRow | null> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('ftp_site_configs')
      .select('*')
      .eq('site_id', siteId)
      .maybeSingle()) as DbResult<FtpSiteConfigRow>;

    if (error) this.throwFriendlyFtpConfigError(error);
    return data ?? null;
  }

  private toPublic(row: FtpSiteConfigRow): PublicFtpSiteConfig {
    const { password_encrypted, ...rest } = row;
    return { ...rest, has_ftp_password: Boolean(password_encrypted) };
  }

  private async updateConnectionStatus(
    siteId: string,
    status: FtpSiteConfigRow['connection_status'],
  ): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('ftp_site_configs')
      .update({
        connection_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('site_id', siteId);

    if (error) this.throwFriendlyFtpConfigError(error);
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  private decrypt(value: string): string {
    const [version, ivRaw, tagRaw, ciphertextRaw] = value.split(':');
    if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
      throw new BadRequestException('Formato de senha FTP invalido.');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(ivRaw, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private encryptionKey(): Buffer {
    const secret = process.env.FTP_CREDENTIALS_KEY?.trim();
    if (!secret) {
      throw new BadRequestException('FTP_CREDENTIALS_KEY nao configurada.');
    }
    return createHash('sha256').update(secret).digest();
  }

  private cleanRelativePath(
    value: string,
    field: string,
    allowCurrentDir = false,
  ): string {
    const trimmed = value.trim();
    if (allowCurrentDir && (trimmed === '.' || trimmed === '/')) return '.';
    const path = trimmed.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!path || path.split('/').includes('..')) {
      throw new BadRequestException(`${field} invalido.`);
    }
    return path;
  }

  private throwFriendlyFtpConfigError(error: DbError): never {
    if (error.code === '42P01') {
      throw new BadRequestException(
        'Tabela ftp_site_configs nao encontrada. Execute a migration supabase-migration-ftp-html-phase-2.sql.',
      );
    }
    if (error.code === '23503') {
      throw new BadRequestException('O site informado nao existe no Supabase.');
    }
    throw new BadRequestException(error.message);
  }
}
