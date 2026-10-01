import { FtpHtmlImportService } from './ftp-html-import.service';
import { FtpSiteConfigRow } from './ftp-site-configs.service';
import { Service } from '../../services/services.service';

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

const service: Service = {
  id: 'service-1',
  created_at: '2026-09-25T00:00:00.000Z',
  site_id: 'site-1',
  name: 'Reparacao de Estores',
  slug: 'reparacao-de-estores',
  video_url: null,
  images: [],
  related_services: [],
  service_notes: null,
  tone: 'profissional',
  min_words: 5000,
  status: 'active',
  wordpress_category: null,
  featured_image_asset_id: null,
  featured_image_alt: null,
  template_html: null,
  template_base_city: null,
  seo_title: null,
  seo_description: null,
};

function createSubject(html: string, indexHtml?: string) {
  const ftpClient = {
    resolveAttempt: jest.fn().mockReturnValue({
      path: 'public_html/reparacao-de-estores.html',
      directory: 'public_html',
    }),
    stat: jest.fn().mockResolvedValue({
      path: 'reparacao-de-estores.html',
      size: Buffer.byteLength(html),
      modifiedAt: new Date('2026-09-25T10:00:00.000Z'),
    }),
    download: jest.fn((path: string) => {
      if (path === 'index.html') {
        return indexHtml
          ? Promise.resolve(Buffer.from(indexHtml))
          : Promise.reject(new Error('missing index'));
      }
      return Promise.resolve(Buffer.from(html));
    }),
  };
  const ftpConfigs = {
    findRawBySiteId: jest.fn().mockResolvedValue(config),
    getPassword: jest.fn().mockResolvedValue('secret'),
  };
  const ftpClientFactory = {
    create: jest.fn().mockReturnValue(ftpClient),
  };
  const templateInsert = jest.fn();
  const remoteUpsert = jest.fn();
  const remoteUpdate = jest.fn();
  const client = {
    from: jest.fn((table: string) => {
      if (table === 'ftp_remote_pages') {
        return {
          upsert: remoteUpsert.mockImplementation((row) => ({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'remote-page-1',
                  active_template_version_id: null,
                  created_at: '2026-09-25T00:00:00.000Z',
                  ...row,
                },
                error: null,
              }),
            }),
          })),
          update: remoteUpdate.mockImplementation((row) => ({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'remote-page-1',
                    site_id: 'site-1',
                    service_id: 'service-1',
                    remote_path: 'reparacao-de-estores.html',
                    public_url: 'https://urgentreparacoes.pt/reparacao-de-estores.html',
                    import_status: 'imported',
                    created_at: '2026-09-25T00:00:00.000Z',
                    ...row,
                  },
                  error: null,
                }),
              }),
            }),
          })),
        };
      }

      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
        insert: templateInsert.mockImplementation((row) => ({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'template-1',
                created_at: '2026-09-25T00:00:00.000Z',
                ...row,
              },
              error: null,
            }),
          }),
        })),
      };
    }),
  };

  return {
    service: new FtpHtmlImportService(
      { getClient: () => client } as never,
      ftpConfigs as never,
      ftpClientFactory as never,
    ),
    ftpClient,
    templateInsert,
    remoteUpsert,
  };
}

describe('FtpHtmlImportService', () => {
  it('imports a remote HTML page as a template version', async () => {
    const html =
      '<!DOCTYPE html><html><body><main>Banner</main><section>Old</section><footer>Footer</footer></body></html>';
    const subject = createSubject(html);

    const result = await subject.service.importRemotePage(service);

    expect(subject.ftpClient.stat).toHaveBeenCalledWith(
      'reparacao-de-estores.html',
    );
    expect(subject.ftpClient.download).toHaveBeenCalledWith(
      'reparacao-de-estores.html',
    );
    expect(subject.templateInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        remote_page_id: 'remote-page-1',
        version: 1,
        original_html: html,
        document_prefix: '<!DOCTYPE html><html><body><main>Banner</main>',
        document_suffix: '<footer>Footer</footer></body></html>',
        source_encoding: 'utf-8',
        status: 'active',
      }),
    );
    expect(result.status).toBe('imported');
    expect(result.remote_page.active_template_version_id).toBe('template-1');
  });

  it('stores manual boundary status without creating a template version', async () => {
    const subject = createSubject('<html><body><main>sem fechamento<footer /></body></html>');

    const result = await subject.service.importRemotePage(service);

    expect(result.status).toBe('manual_boundary_required');
    expect(result.boundary_issue).toBe('missing_main_close');
    expect(subject.remoteUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ import_status: 'manual_boundary_required' }),
      { onConflict: 'site_id,remote_path' },
    );
    expect(subject.templateInsert).not.toHaveBeenCalled();
  });

  it('repairs an incomplete cookie banner from index.html during import', async () => {
    const brokenCookie =
      '<div class="ck-cookie-w"><div fs-cc="banner" class="ck-modal"><div class="ck-modal__btns-w is--small">Aceitar Cookies</div></div></div>';
    const fixedCookie =
      '<div class="ck-cookie-w"><div fs-cc="banner" class="ck-modal"><div class="ck-modal__content-w is--small"><div class="ck-title is--small">Configurações de Cookie</div><div class="ck-desc">Texto</div></div><div class="ck-modal__btns-w is--small">Aceitar Cookies</div></div></div>';
    const html = `<!DOCTYPE html><html><body><main>Banner</main><section>Old</section><footer>Footer</footer>${brokenCookie}<script src="site.js"></script></body></html>`;
    const indexHtml = `<!DOCTYPE html><html><body>${fixedCookie}<script src="site.js"></script></body></html>`;
    const subject = createSubject(html, indexHtml);

    const result = await subject.service.importRemotePage(service);

    expect(result.cookie_banner).toMatchObject({
      status: 'content_missing',
      repaired: true,
    });
    expect(subject.templateInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        original_html: expect.stringContaining('Configurações de Cookie'),
        document_suffix: expect.stringContaining('ck-modal__content-w'),
      }),
    );
  });
});
