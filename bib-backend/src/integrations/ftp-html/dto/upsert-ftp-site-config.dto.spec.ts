import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertFtpSiteConfigDto } from './upsert-ftp-site-config.dto';

describe('UpsertFtpSiteConfigDto', () => {
  it('accepts a valid FTP config', async () => {
    const dto = plainToInstance(UpsertFtpSiteConfigDto, {
      host: 'ftp.urgentreparacoes.pt',
      port: '21',
      security_mode: 'plain',
      username: 'ftp-user',
      password: 'secret',
      remote_root: 'public_html',
      backup_root: 'backups/pseo',
      public_base_url: 'https://urgentreparacoes.pt',
      passive_mode: true,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.port).toBe(21);
  });

  it('rejects invalid port and security mode', async () => {
    const dto = plainToInstance(UpsertFtpSiteConfigDto, {
      host: 'ftp.urgentreparacoes.pt',
      port: 70000,
      security_mode: 'implicit_tls',
      username: 'ftp-user',
      remote_root: 'public_html',
      backup_root: 'backups/pseo',
      public_base_url: 'https://urgentreparacoes.pt',
    });

    const fields = (await validate(dto)).map((error) => error.property);

    expect(fields).toEqual(expect.arrayContaining(['port', 'security_mode']));
  });
});
