import { ContentLocalityLinksService } from './content-locality-links.service';
import {
  buildLocalityLinks,
  withLocalityLinksHtml,
} from '../common/locality-links';

describe('refresh existing locality links', () => {
  const links = buildLocalityLinks(
    ['Lisboa', 'Porto'],
    'Janelas',
    'https://site.pt',
  );
  const setup = (overrides = {}) => {
    const original = {
      id: 'id',
      site_id: 'site',
      service: 'Janelas',
      city: '',
      main_keyword: 'Janelas',
      output_format: 'html',
      html: '<main><h1>Janelas</h1><p>Texto original</p></main>',
      content_json: null,
      status: 'published',
      wp_post_id: 42,
      wp_post_url: 'https://site.pt/janelas',
      meta_description: 'Original',
      ...overrides,
    };
    const contents = {
      findById: jest.fn(async () => original),
      update: jest.fn(async () => original),
      updateWhitelabel: jest.fn(async () => original),
    };
    const locality = { links: jest.fn(async () => links) };
    const validation = {
      validate: jest.fn(() => ({
        score: 85,
        issues: [],
        breakdown: { structure: 30, seo: 30, content: 25 },
      })),
    };
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({
        data: { min_words: 800 },
        error: null,
      })),
    };
    const supabase = { getClient: () => ({ from: jest.fn(() => query) }) };
    return {
      original,
      contents,
      query,
      validation,
      service: new ContentLocalityLinksService(
        contents as never,
        locality as never,
        validation as never,
        supabase as never,
      ),
    };
  };
  it('previews without writing and keeps publication IDs and original text', async () => {
    const { service, contents, original } = setup();
    const result = await service.preview('id');
    expect(result.changed).toBe(true);
    expect(result.link_count).toBe(2);
    expect(result.content).toMatchObject({
      status: 'draft',
      wp_post_id: 42,
      meta_description: 'Original',
    });
    expect(result.content.html).toContain('<p>Texto original</p>');
    expect(original.status).toBe('published');
    expect(contents.update).not.toHaveBeenCalled();
  });
  it('applies through the existing draft update path without publishing', async () => {
    const { service, contents } = setup();
    await service.apply('id');
    expect(contents.update).toHaveBeenCalledWith(
      'id',
      expect.stringContaining('Também atendemos'),
      expect.objectContaining({ score: 85 }),
    );
    expect(contents.updateWhitelabel).not.toHaveBeenCalled();
  });
  it('uses the service word minimum when recalculating the score', async () => {
    const { service, query, validation } = setup({ service_id: 'service-1' });
    await service.preview('id');
    expect(query.eq).toHaveBeenCalledWith('id', 'service-1');
    expect(validation.validate).toHaveBeenCalledWith(
      expect.any(String),
      'Janelas',
      800,
    );
  });
  it('leaves an unchanged published page published', async () => {
    const { service, contents } = setup({
      html: withLocalityLinksHtml(
        '<main><h1>Janelas</h1><p>Texto original</p></main>',
        links,
      ),
    });
    expect((await service.preview('id')).changed).toBe(false);
    expect((await service.apply('id')).status).toBe('published');
    expect(contents.update).not.toHaveBeenCalled();
  });
  it('supports whitelabel without regenerating its modules or changing SEO', async () => {
    const { service, contents } = setup({
      output_format: 'whitelabel_json',
      html: null,
      content_json: {
        hero: { h1: 'Original' },
        article: { blocks: [{ type: 'paragraph', text: 'Original' }] },
      },
      score: 100,
      score_issues: [],
    });
    await service.apply('id');
    expect(contents.updateWhitelabel).toHaveBeenCalledWith(
      'id',
      expect.objectContaining({ hero: { h1: 'Original' } }),
      expect.objectContaining({ score: 100 }),
    );
    expect(contents.update).not.toHaveBeenCalled();
  });
});
