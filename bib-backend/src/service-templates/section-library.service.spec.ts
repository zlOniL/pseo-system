import { SectionLibraryService } from './section-library.service';
import { SectionKey } from './service-templates.types';

describe('SectionLibraryService', () => {
  function setup(
    existing: Array<{ section_key: string; version: number }> = [],
  ) {
    const query = {
      select: jest.fn(),
      eq: jest.fn(),
      in: jest.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockResolvedValue({ data: existing, error: null });

    const insert = jest.fn().mockResolvedValue({ error: null });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(query)
        .mockReturnValueOnce({ insert }),
    };
    const service = new SectionLibraryService({
      getClient: () => client,
    } as never);

    return { service, client, query, insert };
  }

  it('saves all JSON sections with one version query and one bulk insert', async () => {
    const { service, client, insert } = setup([
      { section_key: 'intro', version: 2 },
      { section_key: 'intro', version: 4 },
      { section_key: 'assistencia_especializada', version: 1 },
    ]);
    const sections = new Map<SectionKey, unknown>([
      ['intro', { hero: { title: 'Canalizador em Lisboa' } }],
      ['assistencia_especializada', [{ type: 'paragraph', text: 'Texto' }]],
    ]);

    await service.saveAllJson(
      'service-1',
      'template-1',
      sections,
      'Lisboa',
      'site-1',
    );

    expect(client.from).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        section_key: 'intro',
        version: 5,
        html: null,
        content_json: { hero: { title: 'Canalizador em Lisboa' } },
      }),
      expect.objectContaining({
        section_key: 'assistencia_especializada',
        version: 2,
        html: null,
        content_json: [{ type: 'paragraph', text: 'Texto' }],
      }),
    ]);
  });

  it('saves all HTML sections in the same two calls', async () => {
    const { service, client, insert } = setup();
    const sections = new Map<SectionKey, string>([
      ['intro', '<section>Introducao</section>'],
      ['servicos', '<section>Servicos</section>'],
    ]);

    await service.saveAll('service-1', 'template-1', sections, 'Lisboa');

    expect(client.from).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        section_key: 'intro',
        version: 1,
        html: '<section>Introducao</section>',
        content_json: null,
      }),
      expect.objectContaining({
        section_key: 'servicos',
        version: 1,
        html: '<section>Servicos</section>',
        content_json: null,
      }),
    ]);
  });
});
