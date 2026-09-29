import { Writable } from 'stream';
import { BasicFtpRemoteFileClient } from './basic-ftp-remote-file.client';
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
  connection_status: 'untested',
  created_at: '2026-09-25T00:00:00.000Z',
  updated_at: '2026-09-25T00:00:00.000Z',
};

function createClient(overrides: Record<string, jest.Mock> = {}) {
  const client = {
    access: jest.fn().mockResolvedValue({ code: 220, message: 'ok' }),
    close: jest.fn(),
    list: jest.fn().mockResolvedValue([]),
    size: jest.fn().mockResolvedValue(10),
    downloadTo: jest.fn().mockImplementation(async (dest: Writable) => {
      dest.write(Buffer.from('hello'));
      dest.end();
    }),
    ensureDir: jest.fn().mockResolvedValue(undefined),
    uploadFrom: jest.fn().mockResolvedValue({ code: 226, message: 'ok' }),
    rename: jest.fn().mockResolvedValue({ code: 250, message: 'ok' }),
    remove: jest.fn().mockResolvedValue({ code: 250, message: 'ok' }),
    ...overrides,
  };
  return client;
}

describe('BasicFtpRemoteFileClient', () => {
  it('tests connection by listing the configured root and closes the client', async () => {
    const ftp = createClient();
    const client = new BasicFtpRemoteFileClient(config, 'secret', () => ftp);

    await expect(client.testConnection()).resolves.toEqual({ ok: true });

    expect(ftp.access).toHaveBeenCalledWith({
      host: 'ftp.urgentreparacoes.pt',
      port: 21,
      user: 'ftp-user',
      password: 'secret',
      secure: false,
    });
    expect(ftp.list).toHaveBeenCalledWith('public_html');
    expect(ftp.close).toHaveBeenCalled();
  });

  it('masks username and password in connection test errors', async () => {
    const ftp = createClient({
      list: jest.fn().mockRejectedValue(
        new Error('login failed for ftp-user with password secret'),
      ),
    });
    const client = new BasicFtpRemoteFileClient(config, 'secret', () => ftp);

    const result = await client.testConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain('***');
    expect(result.message).not.toContain('ftp-user');
    expect(result.message).not.toContain('secret');
  });

  it('stats an existing remote file directly with SIZE', async () => {
    const ftp = createClient({
      size: jest.fn().mockResolvedValue(42),
    });
    const client = new BasicFtpRemoteFileClient(config, 'secret', () => ftp);

    await expect(client.stat('reparacao-de-estores.html')).resolves.toEqual({
      path: 'reparacao-de-estores.html',
      size: 42,
      modifiedAt: null,
    });
    expect(ftp.size).toHaveBeenCalledWith(
      'public_html/reparacao-de-estores.html',
    );
    expect(ftp.list).not.toHaveBeenCalled();
  });

  it('supports FTP accounts that already start at the content root', async () => {
    const ftp = createClient({
      size: jest.fn().mockResolvedValue(42),
    });
    const client = new BasicFtpRemoteFileClient(
      { ...config, remote_root: '.' },
      'secret',
      () => ftp,
    );

    await expect(client.stat('reparacao-de-estores.html')).resolves.toEqual({
      path: 'reparacao-de-estores.html',
      size: 42,
      modifiedAt: null,
    });

    expect(ftp.size).toHaveBeenCalledWith('reparacao-de-estores.html');
    await client.download('reparacao-de-estores.html');
    expect(ftp.downloadTo).toHaveBeenCalledWith(
      expect.any(Writable),
      'reparacao-de-estores.html',
    );
  });

  it('returns null when SIZE reports not found', async () => {
    const ftp = createClient({
      size: jest.fn().mockRejectedValue(new Error('550 not found')),
    });
    const client = new BasicFtpRemoteFileClient(config, 'secret', () => ftp);

    await expect(client.stat('missing.html')).resolves.toBeNull();
  });

  it('downloads bytes without changing them', async () => {
    const ftp = createClient();
    const client = new BasicFtpRemoteFileClient(config, 'secret', () => ftp);

    const result = await client.download('reparacao-de-estores.html');

    expect(result).toEqual(Buffer.from('hello'));
    expect(ftp.downloadTo).toHaveBeenCalledWith(
      expect.any(Writable),
      'public_html/reparacao-de-estores.html',
    );
  });

  it('uploads bytes after ensuring the parent directory', async () => {
    const ftp = createClient();
    const client = new BasicFtpRemoteFileClient(config, 'secret', () => ftp);

    await client.upload('tmp/page.html', Buffer.from('html'));

    expect(ftp.ensureDir).toHaveBeenCalledWith('public_html/tmp');
    expect(ftp.uploadFrom).toHaveBeenCalledWith(
      expect.anything(),
      'page.html',
    );
  });

  it('uploads account backup paths without prefixing the content root', async () => {
    const ftp = createClient({
      size: jest.fn().mockResolvedValue(42),
    });
    const client = new BasicFtpRemoteFileClient(config, 'secret', () => ftp);

    await client.uploadAccountPath('backups/pseo/page.html', Buffer.from('html'));
    await client.statAccountPath('backups/pseo/page.html');

    expect(ftp.ensureDir).toHaveBeenCalledWith('backups/pseo');
    expect(ftp.uploadFrom).toHaveBeenCalledWith(
      expect.anything(),
      'page.html',
    );
    expect(ftp.size).toHaveBeenCalledWith('backups/pseo/page.html');
  });

  it('renames and removes normalized remote paths', async () => {
    const ftp = createClient();
    const client = new BasicFtpRemoteFileClient(config, 'secret', () => ftp);

    await client.rename('tmp/page.html', 'reparacao-de-estores.html');
    await client.remove('tmp/page.html');

    expect(ftp.rename).toHaveBeenCalledWith(
      'public_html/tmp/page.html',
      'public_html/reparacao-de-estores.html',
    );
    expect(ftp.remove).toHaveBeenCalledWith('public_html/tmp/page.html');
  });
});
