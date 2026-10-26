import { ServiceTemplatesController } from './service-templates.controller';
import { SECTION_KEYS } from './service-templates.types';

describe('ServiceTemplatesController section re-extraction', () => {
  it('preserves existing library rows when the extracted intro is incomplete', async () => {
    const templates = {
      findById: jest.fn(async () => ({
        id: 'template-1',
        is_main_page: false,
        output_format: 'html',
        html: SECTION_KEYS.map((key) => {
          const content =
            key === 'intro'
              ? '<h1>Título sem introdução</h1>'
              : `<h2>${key}</h2><p>Conteúdo da seção.</p>`;
          return `<!-- BIB_SECTION:${key} -->${content}<!-- /BIB_SECTION:${key} -->`;
        }).join('\n'),
      })),
    };
    const library = {
      deleteByTemplate: jest.fn(),
      saveAll: jest.fn(),
    };
    const controller = new ServiceTemplatesController(
      templates as never,
      library as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.reextract('service-1', 'template-1'),
    ).rejects.toThrow(/Introdução incompleta/);
    expect(library.deleteByTemplate).not.toHaveBeenCalled();
    expect(library.saveAll).not.toHaveBeenCalled();
  });
});

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
      {} as never,
      {} as never,
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

  it('rejects a second template generation while one is still running', async () => {
    let releaseService!: (value: Record<string, unknown>) => void;
    const pendingService = new Promise<Record<string, unknown>>((resolve) => {
      releaseService = resolve;
    });
    const templates = {
      create: jest.fn(async () => ({
        id: 'template-1',
        version: 1,
        is_main_page: true,
      })),
    };
    const generation = {
      buildHtmlRaw: jest.fn(async () => ({
        html: '<section>Conteudo</section>',
        metaDescription: 'SEO',
      })),
    };
    const services = {
      findById: jest.fn(() => pendingService),
    };
    const controller = new ServiceTemplatesController(
      templates as never,
      {} as never,
      generation as never,
      services as never,
      { save: jest.fn(async () => ({ id: 'content-1' })) } as never,
      { replaceHtmlSections: jest.fn() } as never,
      { validate: jest.fn(() => ({ score: 90, issues: [] })) } as never,
      {
        findById: jest.fn(async () => ({ integration_type: 'wordpress' })),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const first = controller.generate('service-1', { is_main_page: true });

    await expect(
      controller.generate('service-2', { is_main_page: true }),
    ).rejects.toMatchObject({ status: 409 });

    releaseService({
      id: 'service-1',
      site_id: 'site-1',
      name: 'Canalizador',
      images: [],
      video_url: null,
      related_services: [],
      service_notes: null,
      tone: '',
      min_words: 5000,
    });
    await expect(first).resolves.toMatchObject({
      template: { id: 'template-1' },
      content: { id: 'content-1' },
    });
  });
});
