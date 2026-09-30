import { ServiceTemplatesController } from './service-templates.controller';

describe('ServiceTemplatesController FTP templates', () => {
  it('keeps locality links enabled for FTP main pages', async () => {
    const templates = { create: jest.fn(async () => ({ id: 'template-1' })) };
    const generation = {
      buildHtmlRaw: jest.fn(async () => ({
        html: '<section data-bib-locality-links="true">Também atendemos</section>',
        metaDescription: 'SEO',
      })),
    };
    const services = {
      findById: jest.fn(async () => ({
        id: 'service-1',
        site_id: 'site-1',
        name: 'Canalizador',
        images: [],
        video_url: null,
        related_services: [],
        service_notes: null,
        tone: '',
        min_words: 5000,
      })),
    };
    const sites = {
      findById: jest.fn(async () => ({
        id: 'site-1',
        integration_type: 'ftp_html',
      })),
    };
    const ftpHtmlContent = {
      compose: jest.fn(async ({ fragmentHtml }) => ({
        html: `<html><body>${fragmentHtml}</body></html>`,
        remotePage: { id: 'remote-1' },
        externalSlug: 'canalizador',
        externalUrl: 'https://site.pt/canalizador.html',
      })),
    };

    const controller = new ServiceTemplatesController(
      templates as never,
      {} as never,
      generation as never,
      services as never,
      { save: jest.fn(async () => ({ id: 'content-1' })) } as never,
      { replaceHtmlSections: jest.fn() } as never,
      { validate: jest.fn(() => ({ score: 90, issues: [] })) } as never,
      sites as never,
      {} as never,
      ftpHtmlContent as never,
    );

    await controller.generate('service-1', { is_main_page: true });

    expect(generation.buildHtmlRaw).toHaveBeenCalledWith(
      expect.not.objectContaining({ skip_backlinks: expect.anything() }),
      undefined,
    );
    expect(ftpHtmlContent.compose).toHaveBeenCalledWith(
      expect.objectContaining({
        fragmentHtml: expect.stringContaining('Também atendemos'),
      }),
    );
  });
});
