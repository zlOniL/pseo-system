import { SectionAssemblerService } from './section-assembler.service';

describe('Hybrid integration formats', () => {
  it.each(['wordpress', 'ftp_html', 'whitelabel_api'])(
    'saves hybrid provenance for %s without calling the legacy replacer',
    async (integration) => {
      const manifest = { city: 'Faro', sections: [] };
      const rows = new Map([
        [
          'intro',
          {
            html: '<h1>Janelas em Faro</h1>',
            base_city: '',
            content_json: { hero: { h1: 'Janelas em Faro' } },
          },
        ],
      ]);
      const hybrid = {
        assemble: jest.fn().mockResolvedValue({ rows, manifest }),
      };
      const library = { getRandomVersions: jest.fn() };
      const contents = { save: jest.fn().mockResolvedValue({ id: 'draft' }) };
      const whitelabel = {
        assembleFromLibrary: jest.fn().mockResolvedValue({
          contentJson: {
            hero: { h1: 'Janelas em Faro' },
            article: { blocks: [] },
          },
          externalSlug: 'janelas-em-faro',
        }),
      };
      const ftp = {
        prepare: jest.fn(async () => (fragmentHtml: string) => ({
            html: fragmentHtml,
            externalSlug: 'janelas-em-faro',
            externalUrl: 'https://site.pt/janelas-em-faro.html',
            remotePage: { id: 'remote' },
          })),
      };
      const assembler = new SectionAssemblerService(
        library as never,
        { validate: () => ({ score: 90, issues: [] }) } as never,
        contents as never,
        {
          findById: () => Promise.resolve({ integration_type: integration }),
        } as never,
        whitelabel as never,
        { html: (html: string) => Promise.resolve(html) } as never,
        ftp as never,
        hybrid as never,
      );
      await assembler.assemble({
        service: {
          id: 's',
          site_id: 'site',
          name: 'Janelas',
          images: [],
          related_services: [],
          min_words: 1,
        } as never,
        serviceId: 's',
        city: 'Faro',
        mode: 'hybrid',
      });
      expect(library.getRandomVersions).not.toHaveBeenCalled();
      expect(contents.save).toHaveBeenCalledWith(
        expect.anything(),
        integration === 'whitelabel_api' ? null : '<h1>Janelas em Faro</h1>',
        expect.anything(),
        expect.any(String),
        'hybrid',
        expect.objectContaining({ hybrid_manifest: manifest }),
      );
      if (integration === 'whitelabel_api')
        expect(whitelabel.assembleFromLibrary).toHaveBeenCalledWith(
          expect.objectContaining({ alreadyLocalized: true }),
        );
    },
  );
});
