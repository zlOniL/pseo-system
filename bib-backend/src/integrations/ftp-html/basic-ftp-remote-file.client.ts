import { Readable, Writable } from 'stream';
import { Client } from 'basic-ftp';
import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path/posix';
import {
  ConnectionResult,
  RemoteFileClient,
  RemoteFileAttempt,
  RemoteFileStat,
} from './remote-file-client';
import { FtpSiteConfigRow } from './ftp-site-configs.service';
import { normalizeFtpRoot, remoteDirname, resolveFtpPath } from './ftp-path';

type BasicFtpClient = Pick<
  Client,
  | 'access'
  | 'close'
  | 'list'
  | 'size'
  | 'downloadTo'
  | 'ensureDir'
  | 'uploadFrom'
  | 'rename'
  | 'remove'
>;

export type BasicFtpClientFactory = () => BasicFtpClient;

@Injectable()
export class BasicFtpRemoteFileClientFactory {
  create(config: FtpSiteConfigRow, password: string): RemoteFileClient {
    return new BasicFtpRemoteFileClient(config, password);
  }
}

export class BasicFtpRemoteFileClient implements RemoteFileClient {
  private readonly logger = new Logger(BasicFtpRemoteFileClient.name);

  constructor(
    private readonly config: FtpSiteConfigRow,
    private readonly password: string,
    private readonly clientFactory: BasicFtpClientFactory = () =>
      new Client(Number(process.env.FTP_TIMEOUT_MS ?? 30000)),
  ) {}

  async testConnection(): Promise<ConnectionResult> {
    try {
      await this.withClient(async (client) => {
        await client.list(normalizeFtpRoot(this.config.remote_root));
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        code: this.errorCode(err),
        message: this.safeError(err),
      };
    }
  }

  async stat(inputPath: string): Promise<RemoteFileStat | null> {
    return this.statResolvedPath(inputPath, this.remotePath(inputPath));
  }

  resolveAttempt(inputPath: string): RemoteFileAttempt {
    const remotePath = this.remotePath(inputPath);
    return {
      path: remotePath,
      directory: remoteDirname(remotePath),
    };
  }

  async statAccountPath(inputPath: string): Promise<RemoteFileStat | null> {
    return this.statResolvedPath(inputPath, normalizeFtpRoot(inputPath));
  }

  private async statResolvedPath(
    inputPath: string,
    remotePath: string,
  ): Promise<RemoteFileStat | null> {
    this.logger.log(
      `FTP lookup: root="${this.config.remote_root}" input="${inputPath}" resolved="${remotePath}" command="SIZE" host="${this.config.host}" user="${this.config.username}"`,
    );

    return this.withClient(async (client) => {
      try {
        const size = await client.size(remotePath);
        this.logger.log(
          `FTP lookup found: resolved="${remotePath}" size=${size}`,
        );
        return { path: inputPath, size, modifiedAt: null };
      } catch (err) {
        if (this.isNotFound(err)) {
          this.logger.warn(
            `FTP lookup failed: file not found resolved="${remotePath}" command="SIZE"`,
          );
          return null;
        }
        throw err;
      }
    });
  }

  async download(inputPath: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    });

    await this.withClient((client) =>
      client.downloadTo(writable, this.remotePath(inputPath)),
    );
    return Buffer.concat(chunks);
  }

  async ensureDirectory(inputPath: string): Promise<void> {
    await this.withClient((client) =>
      client.ensureDir(this.remotePath(inputPath)),
    );
  }

  async upload(inputPath: string, data: Buffer): Promise<void> {
    await this.uploadResolvedPath(this.remotePath(inputPath), data);
  }

  async uploadAccountPath(inputPath: string, data: Buffer): Promise<void> {
    await this.uploadResolvedPath(normalizeFtpRoot(inputPath), data);
  }

  private async uploadResolvedPath(remotePath: string, data: Buffer): Promise<void> {
    await this.withClient(async (client) => {
      await client.ensureDir(remoteDirname(remotePath));
      await client.uploadFrom(Readable.from(data), path.basename(remotePath));
    });
  }

  async rename(from: string, to: string): Promise<void> {
    await this.withClient((client) =>
      client.rename(this.remotePath(from), this.remotePath(to)),
    );
  }

  async remove(inputPath: string): Promise<void> {
    await this.withClient((client) => client.remove(this.remotePath(inputPath)));
  }

  private async withClient<T>(
    action: (client: BasicFtpClient) => Promise<T>,
  ): Promise<T> {
    const client = this.clientFactory();
    try {
      await client.access({
        host: this.config.host,
        port: this.config.port,
        user: this.config.username,
        password: this.password,
        secure: this.config.security_mode === 'explicit_tls',
      });
      return await action(client);
    } finally {
      client.close();
    }
  }

  private remotePath(path: string): string {
    return resolveFtpPath(this.config.remote_root, path);
  }

  private isNotFound(err: unknown): boolean {
    const message = (err as Error).message ?? '';
    return /\b(450|550)\b|not found|no such file/i.test(message);
  }

  private errorCode(err: unknown): ConnectionResult['code'] {
    const message = String((err as Error).message || err);
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns';
    if (code === 'ETIMEDOUT' || /timeout|timed out/i.test(message))
      return 'timeout';
    if (/\b(530|401|403)\b|auth|login|password/i.test(message)) return 'auth';
    if (this.isNotFound(err)) return 'not_found';
    return 'unknown';
  }

  private safeError(err: unknown): string {
    return String((err as Error).message || err)
      .replace(this.password, '***')
      .replace(this.config.username, '***');
  }
}
