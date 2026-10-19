import { HybridService } from './hybrid.service';
import { SECTION_KEYS, SectionLibraryRow } from './service-templates.types';
import { slotDocument, sourceHash } from './hybrid-slots';

describe('Hybrid generation', () => {
  function setup() {
    const ai = { generateText: jest.fn() };
    const links = {
      research: jest.fn().mockResolvedValue([
        {
          type: 'local_authority',
          entity: 'Câmara de Faro',
          final_url: 'https://cm-faro.pt/',
          page_title: 'Faro',
          page_description: 'Município de Faro',
        },
      ]),
    };
    const service = new HybridService(
      {} as never,
      ai as never,
      { findRegion: () => 'Algarve' } as never,
      links as never,
    );
    const rows = SECTION_KEYS.map((key) => {
      const html =
        key === 'contexto_local'
          ? '<h2>Contexto Local em Lisboa</h2><p>Alfama</p><a href="https://lisboa.pt/">Câmara de Lisboa</a>'
          : '<p>Reparação em Lisboa</p>';
      return {
        id: key,
        section_key: key,
        version: 1,
        base_city: 'Lisboa',
        output_format: 'html',
        html,
        hybrid_config: {
          revision: 1,
          source_hash: sourceHash(html),
          strategy: key === 'contexto_local' ? 'local' : 'generic',
          values: { s0: 'Reparação {{LOCATION}}' },
          reason: '',
        },
      } as unknown as SectionLibraryRow;
    });
    jest.spyOn(service, 'rows').mockResolvedValue(rows);
    const local = rows.find((r) => r.section_key === 'contexto_local')!;
    const values = Object.fromEntries(
      slotDocument(local.html, 'html').slots.map((s) => [
        s.id,
        s.kind === 'link'
          ? 'https://cm-faro.pt/'
          : s.value.startsWith('Contexto')
            ? 'Contexto Local em Faro'
            : 'Câmara de Faro',
      ]),
    );
    ai.generateText
      .mockResolvedValueOnce(JSON.stringify({ values, geography_valid: true }))
      .mockResolvedValueOnce(JSON.stringify({ valid: true }));
    return { service, ai, links, rows, values };
  }

  it('reuses neutral generic sections, rewrites local facts and saves provenance', async () => {
    const { service, ai } = setup();
    const checkpoint = jest.fn(async () => {});
    const result = await service.assemble({
      serviceId: 'service',
      service: 'Janelas',
      city: 'Faro',
      format: 'html',
      checkpoint,
    });
    expect(result.rows.get('intro')?.html).toBe('<p>Reparação em Faro</p>');
    expect(result.rows.get('contexto_local')?.html).not.toMatch(
      /Lisboa|Alfama|lisboa\.pt/,
    );
    expect(result.rows.get('contexto_local')?.html).toContain(
      'https://cm-faro.pt/',
    );
    expect(ai.generateText).toHaveBeenCalledTimes(2);
    expect(result.manifest.sections).toHaveLength(15);
    expect(checkpoint).toHaveBeenCalledTimes(16);
  });

  it('blocks unprepared or edited legacy sections', async () => {
    const { service, rows, links } = setup();
    rows[0].html = '<p>Alfama alterada</p>';
    await expect(
      service.assemble({
        serviceId: 'service',
        service: 'Janelas',
        city: 'Faro',
        format: 'html',
      }),
    ).rejects.toThrow('Prepare');
    expect(links.research).not.toHaveBeenCalled();
  });

  it('does not fall back to old city links when verification fails', async () => {
    const { service, links } = setup();
    links.research.mockResolvedValue([]);
    await expect(
      service.assemble({
        serviceId: 'service',
        service: 'Janelas',
        city: 'Faro',
        format: 'html',
      }),
    ).rejects.toThrow('Sem referências');
  });

  it('rejects invented URLs even when the AI claims geography is valid', async () => {
    const { service, ai, values } = setup();
    ai.generateText.mockReset();
    const linkId = Object.keys(values).find((id) =>
      values[id].startsWith('https'),
    )!;
    ai.generateText.mockResolvedValue(
      JSON.stringify({
        values: { ...values, [linkId]: 'https://fake-faro.pt/' },
        geography_valid: true,
      }),
    );
    await expect(
      service.assemble({
        serviceId: 'service',
        service: 'Janelas',
        city: 'Faro',
        format: 'html',
      }),
    ).rejects.toThrow('URL fora');
    expect(ai.generateText).toHaveBeenCalledTimes(3);
  });

  it('resumes completed sections without regenerating or randomizing them', async () => {
    const { service, ai } = setup();
    const first = await service.assemble({
      serviceId: 'service',
      service: 'Janelas',
      city: 'Faro',
      format: 'html',
    });
    ai.generateText.mockClear();
    const second = await service.assemble({
      serviceId: 'service',
      service: 'Janelas',
      city: 'Faro',
      format: 'html',
      previous: first.manifest,
    });
    expect(second.manifest).toEqual(first.manifest);
    expect(ai.generateText).not.toHaveBeenCalled();
  });
});
