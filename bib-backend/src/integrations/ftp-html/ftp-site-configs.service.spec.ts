import { FtpSiteConfigsService, FtpSiteConfigRow } from './ftp-site-configs.service';

describe('FtpSiteConfigsService', () => {
  const originalKey = process.env.FTP_CREDENTIALS_KEY;

  afterEach(() => {
    process.env.FTP_CREDENTIALS_KEY = originalKey;
  });

  function createSubject(initialRow: FtpSiteConfigRow | null = null) {
    let row = initialRow;
    const ftpClient = {
      testConnection: jest.fn().mockResolvedValue({ ok: true }),
    };
    const ftpClientFactory = {
      create: jest.fn().mockReturnValue(ftpClient),
    };
    const table = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockImplementation(async () => ({
            data: row,
            error: null,
          })),
        }),
      }),
      upsert: jest.fn().mockImplementation((input) => {
        row = {
          created_at: '2026-09-25T00:00:00.000Z',
          ...input,
        };
        return {
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: row,
              error: null,
            }),
          }),
        };
      }),
      update: jest.fn().mockImplementation((patch) => ({
        eq: jest.fn().mockImplementation(async () => {
          row = row ? { ...row, ...patch } : row;
          return { error: null };
        }),
      })),
    };
    const client = {
      from: jest.fn().mockReturnValue(table),
    };

    return {
      service: new FtpSiteConfigsService({
        getClient: () => client,
      } as never, ftpClientFactory as never),
      getRow: () => row,
      ftpClient,
      ftpClientFactory,
    };
  }

  const dto = {
    host: 'ftp.urgentreparacoes.pt',
    port: 21,
    security_mode: 'plain' as const,
    username: 'ftp-user',
    password: 'super-secret',
    remote_root: 'public_html/',
    backup_root: '/backups/pseo',
    public_base_url: 'https://urgentreparacoes.pt/',
    passive_mode: true,
  };

  it('encrypts the FTP password and redacts it from public responses', async () => {
    process.env.FTP_CREDENTIALS_KEY = 'local-test-key';
    const { service, getRow } = createSubject();

    const result = await service.upsert('site-1', dto);

    const row = getRow()!;
    expect(row.password_encrypted).toMatch(/^v1:/);
    expect(row.password_encrypted).not.toContain('super-secret');
    expect(result).toMatchObject({
      site_id: 'site-1',
      host: 'ftp.urgentreparacoes.pt',
      remote_root: 'public_html',
      backup_root: 'backups/pseo',
      public_base_url: 'https://urgentreparacoes.pt',
      has_ftp_password: true,
    });
    expect(result).not.toHaveProperty('password_encrypted');
  });

  it('decrypts the password only through the internal accessor', async () => {
    process.env.FTP_CREDENTIALS_KEY = 'local-test-key';
    const { service } = createSubject();

    await service.upsert('site-1', dto);

    await expect(service.getPassword('site-1')).resolves.toBe('super-secret');
  });

  it('preserves the previous encrypted password when update omits password', async () => {
    process.env.FTP_CREDENTIALS_KEY = 'local-test-key';
    const { service, getRow } = createSubject();
    await service.upsert('site-1', dto);
    const firstPassword = getRow()!.password_encrypted;

    await service.upsert('site-1', {
      ...dto,
      host: 'ftp2.urgentreparacoes.pt',
      password: undefined,
    });

    expect(getRow()!.host).toBe('ftp2.urgentreparacoes.pt');
    expect(getRow()!.password_encrypted).toBe(firstPassword);
  });

  it('allows current FTP directory as remote root', async () => {
    process.env.FTP_CREDENTIALS_KEY = 'local-test-key';
    const { service } = createSubject();

    const result = await service.upsert('site-1', {
      ...dto,
      remote_root: '.',
    });

    expect(result.remote_root).toBe('.');
  });

  it('tests saved FTP config and marks connection ok', async () => {
    process.env.FTP_CREDENTIALS_KEY = 'local-test-key';
    const { service, getRow, ftpClientFactory } = createSubject();
    await service.upsert('site-1', dto);

    await expect(service.testConnection('site-1')).resolves.toEqual({
      ok: true,
    });

    expect(ftpClientFactory.create).toHaveBeenCalledWith(
      expect.objectContaining({ site_id: 'site-1' }),
      'super-secret',
    );
    expect(getRow()!.connection_status).toBe('ok');
  });

  it('marks failed when FTP connection test fails without exposing password', async () => {
    process.env.FTP_CREDENTIALS_KEY = 'local-test-key';
    const { service, getRow, ftpClient } = createSubject();
    ftpClient.testConnection.mockResolvedValue({
      ok: false,
      code: 'auth',
      message: 'login failed for ***',
    });
    await service.upsert('site-1', dto);

    const result = await service.testConnection('site-1');

    expect(result).toEqual({
      ok: false,
      code: 'auth',
      message: 'login failed for ***',
    });
    expect(JSON.stringify(result)).not.toContain('super-secret');
    expect(getRow()!.connection_status).toBe('failed');
  });
});
