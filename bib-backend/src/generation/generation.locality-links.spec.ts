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
        { getMainLocalities: () => ['Lisboa', 'Porto'] } as never,
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

  it('removes visible SEO text before the H1 and uses it as metadata', async () => {
    process.env.SECTION_GENERATION_ENABLED = 'true';
    process.env.SECTION_GENERATION_FORMATS = 'html';
    const raw = [
      '<!-- BIB_META: descricao SEO com 140-160 caracteres, citando atendimento 24h -->',
      '<!-- BIB_SECTION:intro -->',
      'Reparação de Estores em Lisboa | Técnicos Especializados 24H/7. Assistência rápida a estores elétricos, manuais e blackout. Ligue já.',
      '<h1 style="color: #320000;">Reparação de Estores em Lisboa | Técnicos Especializados 24H/7</h1>',
      '<p>Texto</p>',
      '<!-- /BIB_SECTION:intro -->',
    ].join('\n');
    const subject = new GenerationService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { html: async (html: string) => html } as never,
      {} as never,
    );
    jest
      .spyOn(
        subject as unknown as {
          generateHtmlRawBySections: () => Promise<string>;
        },
        'generateHtmlRawBySections',
      )
      .mockResolvedValue(raw);

    const result = await subject.buildHtmlRaw({
      service: 'Reparação de Estores',
      main_keyword: 'Reparação de Estores em Lisboa',
      city: 'Lisboa',
    });

    expect(result.metaDescription).toBe(
      'Reparação de Estores em Lisboa | Técnicos Especializados 24H/7. Assistência rápida a estores elétricos, manuais e blackout. Ligue já.',
    );
    expect(result.html).not.toContain('Assistência rápida a estores');
    expect(result.html).toContain('<h1 style="color: #320000;">');
  });
});
