import { Content } from '../contents/contents.service';
import { Service } from '../services/services.service';
import { ValidationResult } from '../validation/validation.types';
import { TemplateEngineService } from './template-engine.service';
import {
  buildLocalityLinks,
  withLocalityLinksHtml,
} from '../common/locality-links';

const service: Service = {
  id: 'service-1',
  created_at: '2026-01-01T00:00:00.000Z',
  site_id: 'site-1',
  name: 'Reparacao de Estores',
  slug: 'reparacao-de-estores',
  video_url: 'https://cdn.example/video.mp4',
  images: ['https://cdn.example/image.jpg'],
  related_services: [{ name: 'Janelas', url: '/janelas' }],
  service_notes: 'Atendimento urgente',
  tone: 'profissional',
  min_words: 700,
  status: 'active',
  wordpress_category: 'Estores',
  featured_image_asset_id: null,
  featured_image_alt: null,
  template_html: '<main>DB Lisboa</main>',
  template_base_city: 'Lisboa',
  seo_title: null,
  seo_description: null,
};

const validationResult: ValidationResult = {
  score: 87,
  issues: [],
  breakdown: { structure: 28, seo: 34, content: 25 },
};

const savedContent = {
  id: 'content-1',
  status: 'draft',
  generation_mode: 'template',
} as Content;

describe('TemplateEngineService characterization', () => {
  const createSubject = () => {
    const contents = { save: jest.fn().mockResolvedValue(savedContent) };
    const validation = {
      validate: jest.fn().mockReturnValue(validationResult),
    };
    const subject = new TemplateEngineService(
      contents as never,
      validation as never,
      {
        html: jest.fn(async (html: string, input: { city: string }) =>
          withLocalityLinksHtml(
            html,
            buildLocalityLinks(
              [input.city === 'Porto' ? 'Maia' : 'Lisboa'],
              service.name,
              'https://site.example',
            ),
          ),
        ),
      } as never,
    );
    return { subject, contents, validation };
  };

  it('rebuilds links for the target city before validation and saving a draft', async () => {
    const deps = createSubject();
    const explicitTemplate = [
      '<main><h1>Estores em Lisboa</h1></main>',
      '<div id="dynamic-neighborhood-links"></div>',
      '<section><h2>Também Atendemos</h2><p>Sintra e Cascais</p></section>',
    ].join('\n');

    await expect(
      deps.subject.generate({
        service,
        city: 'Porto',
        templateHtml: explicitTemplate,
      }),
    ).resolves.toBe(savedContent);

    const expectedHtml = withLocalityLinksHtml(
      '<main><h1>Estores no Porto</h1></main>',
      buildLocalityLinks(['Maia'], service.name, 'https://site.example'),
    );
    expect(deps.validation.validate).toHaveBeenCalledWith(
      expectedHtml,
      'Reparacao de Estores no Porto',
      700,
    );
    expect(deps.contents.save).toHaveBeenCalledWith(
      expect.objectContaining({
        main_keyword: 'Reparacao de Estores no Porto',
        service: service.name,
        city: 'Porto',
        service_id: service.id,
        site_id: service.site_id,
        video_url: service.video_url,
        images: service.images,
        related_services: service.related_services,
      }),
      expectedHtml,
      validationResult,
      '',
      'template',
    );
  });

  it('uses the template stored on the service when no explicit template is provided', async () => {
    const deps = createSubject();

    await deps.subject.generate({ service, city: 'Amadora' });

    expect(deps.validation.validate).toHaveBeenCalledWith(
      withLocalityLinksHtml(
        '<main>DB Amadora</main>',
        buildLocalityLinks(['Lisboa'], service.name, 'https://site.example'),
      ),
      'Reparacao de Estores na Amadora',
      700,
    );
    expect(deps.contents.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      '',
      'template',
    );
  });
});
