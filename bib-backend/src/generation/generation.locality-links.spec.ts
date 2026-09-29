import { GenerationService } from './generation.service';
import { LocalityLinksService } from '../cities/locality-links.service';

describe('generation includes locality links before persistence', () => {
  const originalFlag = process.env.SECTION_GENERATION_ENABLED;
  const originalFormats = process.env.SECTION_GENERATION_FORMATS;
  afterEach(() => {
    if (originalFlag === undefined)
      delete process.env.SECTION_GENERATION_ENABLED;
    else process.env.SECTION_GENERATION_ENABLED = originalFlag;
    if (originalFormats === undefined)
      delete process.env.SECTION_GENERATION_FORMATS;
    else process.env.SECTION_GENERATION_FORMATS = originalFormats;
  });
  it.each(['sections', 'monolithic'])(
    'adds city links after the %s pipeline, preserving metadata and skip_backlinks',
    async (mode) => {
      process.env.SECTION_GENERATION_ENABLED =
        mode === 'sections' ? 'true' : 'false';
      process.env.SECTION_GENERATION_FORMATS = 'html';
      const raw =
        '<!-- BIB_META: Descrição original --><h1>Janelas</h1><h2>Perguntas Frequentes</h2><p>Texto</p>';
      const locality = new LocalityLinksService(
        { getCityNames: () => ['Lisboa', 'Porto'] } as never,
        {
          findById: async () => ({ integration_type: 'wordpress' }),
          localityLinksBase: () => 'https://site.pt',
        } as never,
      );
      const subject = new GenerationService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        locality,
        {} as never,
      );
      const pipeline = subject as unknown as {
        generateHtmlRawBySections: () => Promise<string>;
        generateHtmlRawMonolithic: () => Promise<string>;
      };
      jest.spyOn(pipeline, 'generateHtmlRawBySections').mockResolvedValue(raw);
      jest.spyOn(pipeline, 'generateHtmlRawMonolithic').mockResolvedValue(raw);
      const dto = {
        service: 'Janelas',
        main_keyword: 'Janelas',
        site_id: 'site',
      };
      const result = await subject.buildHtmlRaw(dto);
      expect(result.metaDescription).toBe('Descrição original');
      expect(result.html).toContain('https://site.pt/janelas-no-porto/');
      expect(result.html.indexOf('Também atendemos')).toBeLessThan(
        result.html.indexOf('Perguntas Frequentes'),
      );
      expect(
        (await subject.buildHtmlRaw({ ...dto, skip_backlinks: true })).html,
      ).not.toContain('Também atendemos');
    },
  );
});
