import { InternalServerErrorException } from '@nestjs/common';
import { WordPressService } from './wordpress.service';
import { Content } from '../contents/contents.service';
import { Site } from '../sites/sites.service';

const site: Site = {
  id: 'site-1',
  created_at: '2026-09-25T00:00:00.000Z',
  updated_at: '2026-09-25T00:00:00.000Z',
  name: 'Urgente Reparacoes',
  domain: 'urgentreparacoes.pt',
  integration_type: 'wordpress',
  api_token: null,
  wordpress_base_url: 'https://urgentreparacoes.pt',
  wordpress_secret: 'wp-secret',
  status: 'active',
};

const content: Content = {
  id: 'content-1',
  created_at: '2026-09-25T00:00:00.000Z',
  site_id: site.id,
  main_keyword: 'Reparacao de Estores',
  service: 'Reparacao de Estores',
  city: 'Lisboa',
  neighborhood: null,
  html: '<h1>Reparacao de Estores</h1>',
  score: 90,
  score_issues: [],
  status: 'approved',
  wp_post_id: null,
  wp_post_url: null,
  video_url: null,
  images: null,
  related_services: null,
  meta_description: 'Meta reparacao de estores',
  service_id: null,
  generation_mode: 'ai',
  wordpress_category: 'Estores',
  output_format: 'html',
  content_json: null,
  external_page_type: null,
  external_slug: null,
  external_page_id: null,
  external_page_url: null,
};

describe('WordPressService', () => {
  const originalFetch = global.fetch;
  let contents: {
    findById: jest.Mock;
    setPublished: jest.Mock;
  };
  let service: WordPressService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    contents = {
      findById: jest.fn().mockResolvedValue(content),
      setPublished: jest.fn().mockResolvedValue({
        ...content,
        status: 'published',
        wp_post_id: 123,
        wp_post_url: 'https://urgentreparacoes.pt/reparacao-de-estores',
      }),
    };
    const services = { findById: jest.fn() };
    const sites = {
      findById: jest.fn().mockResolvedValue(site),
      wordpressBase: jest
        .fn()
        .mockReturnValue('https://urgentreparacoes.pt'),
      wordpressSecret: jest.fn().mockReturnValue('wp-secret'),
    };
    service = new WordPressService(
      contents as never,
      services as never,
      sites as never,
    );
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function okJson(body: unknown): Response {
    return {
      ok: true,
      json: jest.fn().mockResolvedValue(body),
      text: jest.fn().mockResolvedValue(JSON.stringify(body)),
    } as unknown as Response;
  }

  function errorText(status: number, body: string): Response {
    return {
      ok: false,
      status,
      text: jest.fn().mockResolvedValue(body),
    } as unknown as Response;
  }

  it('posts the assembled payload and marks content as published after success', async () => {
    fetchMock
      .mockResolvedValueOnce(
        okJson([
          { id: 10, name: 'Blog', slug: 'blog', parent: 0 },
          { id: 11, name: 'Estores', slug: 'estores', parent: 10 },
        ]),
      )
      .mockResolvedValueOnce(
        okJson([
          { id: 10, name: 'Blog', slug: 'blog', parent: 0 },
          { id: 11, name: 'Estores', slug: 'estores', parent: 10 },
        ]),
      )
      .mockResolvedValueOnce(
        okJson({
          id: 123,
          link: 'https://urgentreparacoes.pt/reparacao-de-estores',
        }),
      );

    await service.publish(content.id);

    const publishCall = fetchMock.mock.calls[2];
    expect(publishCall[0]).toBe(
      'https://urgentreparacoes.pt/wp-json/custom/v1/post',
    );
    const payload = JSON.parse(publishCall[1].body as string);
    expect(payload).toMatchObject({
      title: 'Reparacao de Estores',
      seo_title: 'Reparacao de Estores — Atendimento 24h',
      excerpt: 'Meta reparacao de estores',
      meta_description: 'Meta reparacao de estores',
      status: 'publish',
      slug: 'reparacao-de-estores',
      categories: [10, 11],
      primary_category_id: 10,
    });
    expect(payload.content).toContain('<h1>Reparacao de Estores</h1>');
    expect(contents.setPublished).toHaveBeenCalledWith(
      content.id,
      123,
      'https://urgentreparacoes.pt/reparacao-de-estores',
    );
  });

  it('does not update content when WordPress returns an HTTP error', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson([{ id: 10, name: 'Blog', parent: 0 }]))
      .mockResolvedValueOnce(
        okJson([
          { id: 10, name: 'Blog', parent: 0 },
          { id: 11, name: 'Estores', parent: 10 },
        ]),
      )
      .mockResolvedValueOnce(errorText(500, 'wp failed'));

    await expect(service.publish(content.id)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(contents.setPublished).not.toHaveBeenCalled();
  });
});
