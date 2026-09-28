import { LocalityLinksService } from './locality-links.service';

function setup() {
  const cities = {
    getCityNames: jest.fn(() => ['Lisboa', 'Porto', 'Amadora']),
    findRegion: jest.fn((city: string) =>
      city === 'Lisboa' ? 'Lisboa' : null,
    ),
    getLocalities: jest.fn(() => ['Belém', 'Benfica']),
  };
  const sites = {
    findById: jest.fn(async () => ({
      integration_type: 'wordpress',
      domain: 'selected.pt',
    })),
    wordpressBase: jest.fn(() => 'https://selected.pt'),
    normalizeDomain: jest.fn((domain: string) => domain),
  };
  return {
    service: new LocalityLinksService(cities as never, sites as never),
    cities,
    sites,
  };
}

describe('LocalityLinksService', () => {
  it('lists principal cities for cityless pages using the selected site', async () => {
    const { service, sites } = setup();
    const links = await service.links({
      service: 'Janelas',
      site_id: 'site-2',
    });
    expect(sites.findById).toHaveBeenCalledWith('site-2');
    expect(links).toHaveLength(3);
    expect(links[0].url).toBe('https://selected.pt/janelas-em-lisboa/');
  });
  it('selects only regional localities, excluding the current city', async () => {
    const { service, cities } = setup();
    const links = await service.links({
      service: 'Janelas',
      city: ' Lisboa ',
      site_id: 'site-2',
    });
    expect(cities.getLocalities).toHaveBeenCalledWith('Lisboa', 'Lisboa');
    expect(links.map((link) => link.label)).toEqual([
      'Janelas em Belém',
      'Janelas em Benfica',
    ]);
  });
  it('returns no section for unknown cities or explicit skip', async () => {
    const { service, sites } = setup();
    expect(
      await service.html('<h1>Original</h1>', {
        service: 'Janelas',
        city: 'Desconhecida',
      }),
    ).toBe('<h1>Original</h1>');
    expect(
      await service.links({ service: 'Janelas', skip_backlinks: true }),
    ).toEqual([]);
    expect(sites.findById).not.toHaveBeenCalled();
  });
  it.each(['whitelabel_api', 'ftp_html'])(
    'omits links for %s in all generation paths',
    async (integration_type) => {
      const { service, sites, cities } = setup();
      const site = { integration_type, domain: 'other.pt' };
      sites.findById.mockResolvedValue(site);
      const input = { service: 'Janelas', site_id: 'other' };
      expect(await service.links(input)).toEqual([]);
      expect(
        await service.links({ ...input, city: 'Lisboa' }, site as never),
      ).toEqual([]);
      expect(
        await service.html(
          '<h1>Original</h1><section><h2>Também atendemos</h2><ul><li>Antigo</li></ul></section>',
          input,
        ),
      ).toBe('<h1>Original</h1>');
      const original = {
        article: { blocks: [{ type: 'paragraph', text: 'Original' }] },
      };
      expect(await service.json(original, input)).toEqual(original);
      expect(
        await service.json(
          {
            article: {
              blocks: [
                ...original.article.blocks,
                { type: 'heading', level: 2, text: 'Também atendemos' },
                { type: 'list', items: ['Antigo'] },
              ],
            },
          },
          input,
        ),
      ).toEqual(original);
      expect(cities.getCityNames).not.toHaveBeenCalled();
      expect(sites.wordpressBase).not.toHaveBeenCalled();
    },
  );
  it('does not infer WordPress from an environment fallback when no site is selected', async () => {
    const { service, sites } = setup();
    expect(await service.links({ service: 'Janelas' })).toEqual([]);
    expect(sites.wordpressBase).not.toHaveBeenCalled();
  });
  it('propagates invalid site selection rather than using another domain', async () => {
    const { service, sites } = setup();
    sites.findById.mockRejectedValueOnce(new Error('Site inexistente'));
    await expect(
      service.links({ service: 'Janelas', site_id: 'invalid' }),
    ).rejects.toThrow('Site inexistente');
  });
});
