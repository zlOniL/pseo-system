import { FtpHtmlContentService } from './ftp-html-content.service';
import { FtpHtmlDocumentRenderer } from './ftp-html-document-renderer.service';
import { Service } from '../../services/services.service';

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

function createSubject() {
  const remotePage = {
    id: 'remote-page-main',
    site_id: 'site-1',
    service_id: 'service-1',
    remote_path: 'reparacao-de-estores.html',
    public_url: 'https://urgentreparacoes.pt/reparacao-de-estores.html',
    active_template_version_id: 'template-1',
  };
  const template = {
    id: 'template-1',
    document_prefix:
      '<!DOCTYPE html><html><head><title>Old</title><meta name="description" content="Old"><link rel="canonical" href="https://old.example/"></head><body><main><h1>Reparacao de Estores</h1></main>',
    document_suffix: '<footer>Footer</footer></body></html>',
  };
  const remoteUpsert = jest.fn();
  const remoteSelectEq = jest.fn().mockReturnThis();
  const remoteSelect = {
    eq: remoteSelectEq,
    maybeSingle: jest.fn().mockResolvedValue({
      data: remotePage,
      error: null,
    }),
  };
  const client = {
    from: jest.fn((table: string) => {
      if (table === 'ftp_remote_pages') {
        return {
          select: jest.fn().mockReturnValue(remoteSelect),
          upsert: remoteUpsert.mockImplementation((row) => ({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'remote-page-locality',
                  ...row,
                },
                error: null,
              }),
            }),
          })),
        };
      }
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: template, error: null }),
          }),
        }),
      };
    }),
  };
  const ftpConfigs = {
    findRawBySiteId: jest.fn().mockResolvedValue({
      public_base_url: 'https://urgentreparacoes.pt',
    }),
  };

  return {
    service: new FtpHtmlContentService(
      { getClient: () => client } as never,
      ftpConfigs as never,
      new FtpHtmlDocumentRenderer(),
    ),
    remoteUpsert,
    remoteSelectEq,
  };
}

describe('FtpHtmlContentService', () => {
  it('renders the main FTP page as a full document using the imported template', async () => {
    const subject = createSubject();

    const result = await subject.service.compose({
      service,
      fragmentHtml: '<section>Conteudo PSEO</section>',
      mainKeyword: 'Reparacao de Estores',
      metaDescription: 'Descricao nova',
    });

    expect(result.remotePage.id).toBe('remote-page-main');
    expect(result.html).toContain('<title>Reparacao de Estores</title>');
    expect(result.html).toContain('content="Descricao nova"');
    expect(result.html).toContain('<section>Conteudo PSEO</section>');
    expect(subject.remoteUpsert).not.toHaveBeenCalled();
    expect(subject.remoteSelectEq).toHaveBeenCalledWith(
      'remote_path',
      'reparacao-de-estores.html',
    );
  });

  it('creates a locality remote page using the service template', async () => {
    const subject = createSubject();

    const result = await subject.service.compose({
      service,
      fragmentHtml: '<section>Conteudo Lisboa</section>',
      mainKeyword: 'Reparacao de Estores em Lisboa',
      metaDescription: 'Descricao Lisboa',
      city: 'Lisboa',
    });

    expect(subject.remoteUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        remote_path: 'reparacao-de-estores-em-lisboa.html',
        public_url:
          'https://urgentreparacoes.pt/reparacao-de-estores-em-lisboa.html',
        active_template_version_id: 'template-1',
      }),
      { onConflict: 'site_id,remote_path' },
    );
    expect(result.html).toContain('<h1>Reparacao de Estores em Lisboa</h1>');
  });
});
