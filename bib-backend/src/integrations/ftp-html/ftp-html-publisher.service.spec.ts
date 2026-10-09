import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { FtpHtmlPublisherService } from './ftp-html-publisher.service';
import { FtpSiteConfigRow } from './ftp-site-configs.service';

const config: FtpSiteConfigRow = {
  site_id: 'site-1',
  host: 'ftp.urgentreparacoes.pt',
  port: 21,
  security_mode: 'plain',
  username: 'ftp-user',
  password_encrypted: 'encrypted',
  remote_root: 'public_html',
  backup_root: 'backups/pseo',
  public_base_url: 'https://urgentreparacoes.pt',
  passive_mode: true,
  connection_status: 'ok',
  created_at: '2026-09-25T00:00:00.000Z',
  updated_at: '2026-09-25T00:00:00.000Z',
};

const oldHtml = '<!DOCTYPE html><html><body>old</body></html>';
const newHtml = '<!DOCTYPE html><html><body>new</body></html>';

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function createRemoteClient(initial: Record<string, Buffer>) {
  const files = new Map(Object.entries(initial));
  const accountFiles = new Map<string, Buffer>();

  return {
    files,
    accountFiles,
    testConnection: jest.fn(),
    stat: jest.fn(async (remotePath: string) => {
      const value = files.get(remotePath);
      return value
        ? { path: remotePath, size: value.length, modifiedAt: new Date() }
        : null;
    }),
    statAccountPath: jest.fn(async (remotePath: string) => {
      const value = accountFiles.get(remotePath);
      return value
        ? { path: remotePath, size: value.length, modifiedAt: new Date() }
        : null;
    }),
    download: jest.fn(async (remotePath: string) => {
      const value = files.get(remotePath);
      if (!value) throw new Error(`missing ${remotePath}`);
      return value;
    }),
    ensureDirectory: jest.fn(),
    upload: jest.fn(async (remotePath: string, data: Buffer) => {
      files.set(remotePath, data);
    }),
    uploadAccountPath: jest.fn(async (remotePath: string, data: Buffer) => {
      accountFiles.set(remotePath, data);
    }),
    rename: jest.fn(async (from: string, to: string) => {
      const value = files.get(from);
      if (!value) throw new Error(`missing ${from}`);
      files.delete(from);
      files.set(to, value);
    }),
    remove: jest.fn(async (remotePath: string) => {
      files.delete(remotePath);
    }),
  };
}

function createSupabase(
  remoteHash = sha256(oldHtml),
  remotePageOverrides: Record<string, unknown> = {},
) {
  const updates: Record<string, jest.Mock> = {
    contents: jest.fn(),
    ftp_remote_pages: jest.fn(),
    ftp_publish_runs: jest.fn(),
  };
  const inserts: Record<string, jest.Mock> = {
    ftp_publish_runs: jest.fn(),
  };

  const remotePage = {
    id: 'remote-page-1',
    site_id: 'site-1',
    service_id: 'service-1',
    remote_path: 'reparacao-de-estores.html',
    public_url: 'https://urgentreparacoes.pt/reparacao-de-estores.html',
    last_seen_hash: remoteHash,
    last_seen_size: Buffer.byteLength(oldHtml),
    last_seen_modified_at: '2026-09-25T00:00:00.000Z',
    active_template_version_id: null,
    ...remotePageOverrides,
  };

  const client = {
    from: jest.fn((table: string) => {
      if (table === 'ftp_remote_pages') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: remotePage, error: null }),
            }),
          }),
          update: updates.ftp_remote_pages.mockImplementation(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      if (table === 'ftp_publish_runs') {
        return {
          insert: inserts.ftp_publish_runs.mockImplementation((row) => ({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'run-1', ...row },
                error: null,
              }),
            }),
          })),
          update: updates.ftp_publish_runs.mockImplementation(() => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      return {
        update: updates.contents.mockImplementation((row) => ({
          eq: jest.fn().mockReturnValue({
            error: null,
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'content-1',
                  site_id: 'site-1',
                  status: row.status,
                  deployment_status: row.deployment_status,
                  external_page_url: row.external_page_url,
                  html: row.html,
                },
                error: null,
              }),
            }),
          }),
        })),
      };
    }),
  };

  return { supabase: { getClient: () => client }, updates, inserts };
}

function createSubject(
  remoteHash = sha256(oldHtml),
  options: {
    content?: Record<string, unknown>;
    remotePage?: Record<string, unknown>;
  } = {},
) {
  const remoteClient = createRemoteClient({
    'reparacao-de-estores.html': Buffer.from(oldHtml),
  });
  const supabase = createSupabase(remoteHash, options.remotePage);
  const contents = {
    findById: jest.fn().mockResolvedValue({
      id: 'content-1',
      site_id: 'site-1',
      ftp_remote_page_id: 'remote-page-1',
      status: 'approved',
      html: newHtml,
      render_mode: 'full_document',
      service_id: 'service-1',
      service: 'Reparacao de Estores',
      city: '',
      main_keyword: 'Reparacao de Estores',
      meta_description: 'Descricao',
      external_page_type: 'service',
      ...options.content,
    }),
  };
  const ftpConfigs = {
    findRawBySiteId: jest.fn().mockResolvedValue(config),
    getPassword: jest.fn().mockResolvedValue('secret'),
  };
  const ftpClientFactory = { create: jest.fn().mockReturnValue(remoteClient) };
  const renderer = {
    render: jest.fn(),
    applySeo: jest.fn((html: string) => html),
    applyContentLayout: jest.fn((html: string) => html),
  };

  return {
    service: new FtpHtmlPublisherService(
      contents as never,
      supabase.supabase as never,
      ftpConfigs as never,
      ftpClientFactory as never,
      renderer as never,
    ),
    remoteClient,
    renderer,
    ...supabase,
  };
}

function createSubjectForNewRemotePage() {
  const subject = createSubject(null as unknown as string);
  subject.remoteClient.files.delete('reparacao-de-estores.html');
  return subject;
}

describe('FtpHtmlPublisherService', () => {
  const originalFlag = process.env.FTP_HTML_INTEGRATION_ENABLED;

  afterEach(() => {
    process.env.FTP_HTML_INTEGRATION_ENABLED = originalFlag;
  });

  it('blocks publish while FTP_HTML_INTEGRATION_ENABLED is not true', async () => {
    process.env.FTP_HTML_INTEGRATION_ENABLED = 'false';
    const subject = createSubject();

    await expect(subject.service.publish('content-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('blocks a main page linked to a locality FTP destination', async () => {
    process.env.FTP_HTML_INTEGRATION_ENABLED = 'true';
    const subject = createSubject(sha256(oldHtml), {
      remotePage: {
        remote_path: 'reparacao-de-estores-em-oeiras.html',
        public_url:
          'https://urgentreparacoes.pt/reparacao-de-estores-em-oeiras.html',
      },
    });

    await expect(subject.service.publish('content-1')).rejects.toThrow(
      'destino FTP incorreto',
    );
    expect(subject.remoteClient.upload).not.toHaveBeenCalled();
    expect(subject.inserts.ftp_publish_runs).not.toHaveBeenCalled();
  });

  it('blocks a locality page linked to the main FTP destination', async () => {
    process.env.FTP_HTML_INTEGRATION_ENABLED = 'true';
    const subject = createSubject(sha256(oldHtml), {
      content: {
        city: 'Oeiras',
        main_keyword: 'Reparacao de Estores em Oeiras',
        external_page_type: 'service_location',
      },
    });

    await expect(subject.service.publish('content-1')).rejects.toThrow(
      'destino FTP incorreto',
    );
    expect(subject.remoteClient.upload).not.toHaveBeenCalled();
  });

  it('backs up, uploads a temporary file, swaps and marks content as published', async () => {
    process.env.FTP_HTML_INTEGRATION_ENABLED = 'true';
    const subject = createSubject();

    const result = await subject.service.publish('content-1');

    expect(subject.remoteClient.uploadAccountPath).toHaveBeenCalledWith(
      expect.stringMatching(/^backups\/pseo\/\d{4}-\d{2}-\d{2}\//),
      Buffer.from(oldHtml),
    );
    expect(subject.remoteClient.upload).toHaveBeenCalledWith(
      expect.stringContaining('.pseo-upload-'),
      Buffer.from(newHtml),
    );
    expect(subject.remoteClient.rename).toHaveBeenCalledWith(
      'reparacao-de-estores.html',
      expect.stringContaining('.pseo-recovery-'),
    );
    expect(subject.remoteClient.files.get('reparacao-de-estores.html')).toEqual(
      Buffer.from(newHtml),
    );
    expect(subject.updates.contents).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        render_mode: 'full_document',
        deployment_status: 'published',
        external_page_url: 'https://urgentreparacoes.pt/reparacao-de-estores.html',
      }),
    );
    expect(subject.renderer.applySeo).toHaveBeenCalledWith(
      newHtml,
      expect.objectContaining({
        title: 'Reparacao de Estores',
        canonicalUrl: 'https://urgentreparacoes.pt/reparacao-de-estores.html',
      }),
    );
    expect(result.status).toBe('published');
  });

  it('marks conflict and stops when the remote hash changed', async () => {
    process.env.FTP_HTML_INTEGRATION_ENABLED = 'true';
    const subject = createSubject('previous-hash');

    await expect(subject.service.publish('content-1')).rejects.toThrow(
      'Arquivo remoto mudou',
    );

    expect(subject.remoteClient.uploadAccountPath).not.toHaveBeenCalled();
    expect(subject.updates.contents).toHaveBeenCalledWith(
      expect.objectContaining({ deployment_status: 'conflict' }),
    );
    expect(subject.updates.ftp_publish_runs).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'conflict' }),
    );
  });

  it('publishes changed remote file when conflict is confirmed', async () => {
    process.env.FTP_HTML_INTEGRATION_ENABLED = 'true';
    const subject = createSubject('previous-hash');

    await subject.service.publish('content-1', { forceRemoteConflict: true });

    expect(subject.remoteClient.uploadAccountPath).toHaveBeenCalled();
    expect(subject.remoteClient.files.get('reparacao-de-estores.html')).toEqual(
      Buffer.from(newHtml),
    );
    expect(subject.updates.contents).toHaveBeenCalledWith(
      expect.objectContaining({ deployment_status: 'published' }),
    );
  });

  it('creates a new remote file without requiring an original backup', async () => {
    process.env.FTP_HTML_INTEGRATION_ENABLED = 'true';
    const subject = createSubjectForNewRemotePage();

    await subject.service.publish('content-1');

    expect(subject.remoteClient.uploadAccountPath).not.toHaveBeenCalled();
    expect(subject.remoteClient.rename).toHaveBeenCalledWith(
      expect.stringContaining('.pseo-upload-'),
      'reparacao-de-estores.html',
    );
    expect(subject.remoteClient.files.get('reparacao-de-estores.html')).toEqual(
      Buffer.from(newHtml),
    );
  });
});
