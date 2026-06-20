import { WhitelabelContentService } from './whitelabel-content.service';
import { WHITELABEL_MODULES } from '../../service-templates/service-templates.types';

const shellResponse = JSON.stringify({
  page: {
    title: 'Teste',
    slug: 'teste',
    seo_title: 'Teste',
    seo_description: 'Teste',
  },
  intro: {
    hero: { title: 'Teste' },
  },
});

const longBlocks = (title: string) =>
  JSON.stringify([
    { type: 'heading', level: 2, text: title },
    ...(title === 'Perguntas Frequentes'
      ? [
          {
            type: 'faq_list',
            hide_title: true,
            items: [
              {
                question: 'Como funciona?',
                answer: Array(280).fill('conteudo').join(' '),
              },
            ],
          },
        ]
      : [
          {
            type: 'paragraph',
            text: Array(280).fill('conteudo').join(' '),
          },
        ]),
  ]);

function createSubject(
  generateText: (system: string, user: string) => Promise<string>,
) {
  const ai = { generateText };
  const sites = {
    getBlueprints: jest.fn().mockResolvedValue({
      'service-page': { id: 'service-page' },
      'pseo-rules': { id: 'pseo-rules' },
    }),
  };
  const externalLinks = { research: jest.fn().mockResolvedValue([]) };
  return new WhitelabelContentService(
    ai as never,
    sites as never,
    {} as never,
    externalLinks as never,
  );
}

const input = {
  service: {
    id: 'service-1',
    name: 'Reparacao de Janelas',
    min_words: 100,
    tone: 'profissional',
    service_notes: null,
    related_services: [],
  },
  site: { id: 'site-1' },
  dto: {},
  baseCity: 'Lisboa',
  isMainPage: false,
} as never;

describe('WhitelabelContentService module orchestration', () => {
  it('limits module generation to five concurrent calls and preserves order', async () => {
    let active = 0;
    let maxActive = 0;
    const subject = createSubject(async (_system, user) => {
      if (user.includes('base textual')) return shellResponse;
      const index = WHITELABEL_MODULES.findIndex((module) =>
        user.includes(module.title),
      );
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) =>
        setTimeout(resolve, (WHITELABEL_MODULES.length - index) * 2),
      );
      active -= 1;
      return longBlocks(WHITELABEL_MODULES[index].display_title);
    });

    const result = await subject.generateTemplate(input);
    const headings = result.contentJson.article.blocks
      .filter((block) => block.type === 'heading')
      .map((block) => block.text);

    expect(maxActive).toBe(5);
    expect(headings).toEqual(
      WHITELABEL_MODULES.map((module) => module.display_title),
    );
    expect(result.issues).toEqual([]);
  });

  it('reports invalid JSON after three attempts without failing the page', async () => {
    let invalidAttempts = 0;
    const failedModule = WHITELABEL_MODULES[3];
    const subject = createSubject(async (_system, user) => {
      if (user.includes('base textual')) return shellResponse;
      const module = WHITELABEL_MODULES.find((item) =>
        user.includes(item.title),
      )!;
      if (module.key === failedModule.key) {
        invalidAttempts += 1;
        return 'resposta sem JSON';
      }
      return longBlocks(module.display_title);
    });

    const result = await subject.generateTemplate(input);

    expect(invalidAttempts).toBe(3);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section_key: failedModule.key,
          severity: 'error',
          code: 'invalid_json',
          attempts: 3,
        }),
      ]),
    );
    expect(result.sections.has(failedModule.key)).toBe(false);
    expect(result.contentJson.article.blocks.length).toBeGreaterThan(0);
  });

  it.each([
    ['rate_limit', 'OpenRouter 429: limite atingido'],
    ['invalid_blocks', JSON.stringify({ conteudo: 'sem array de blocos' })],
  ] as const)(
    'isolates a persistent %s failure to its section',
    async (expectedCode, failedResponse) => {
      let attempts = 0;
      const failedModule = WHITELABEL_MODULES[1];
      const subject = createSubject(async (_system, user) => {
        if (user.includes('base textual')) return shellResponse;
        const module = WHITELABEL_MODULES.find((item) =>
          user.includes(item.title),
        )!;
        if (module.key === failedModule.key) {
          attempts += 1;
          if (expectedCode === 'rate_limit') throw new Error(failedResponse);
          return failedResponse;
        }
        return longBlocks(module.display_title);
      });

      const result = await subject.generateTemplate(input);

      expect(attempts).toBe(3);
      expect(result.sections.has(failedModule.key)).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            section_key: failedModule.key,
            severity: 'error',
            code: expectedCode,
          }),
        ]),
      );
    },
  );

  it('keeps the last valid section when a semantic warning persists', async () => {
    const faqModule = WHITELABEL_MODULES.find((module) =>
      module.key.includes('perguntas_frequentes'),
    )!;
    const subject = createSubject(async (_system, user) => {
      if (user.includes('base textual')) return shellResponse;
      const module = WHITELABEL_MODULES.find((item) =>
        user.includes(item.title),
      )!;
      if (module.key === faqModule.key) {
        return JSON.stringify([
          { type: 'heading', level: 2, text: module.display_title },
          {
            type: 'paragraph',
            text: Array(280).fill('conteudo').join(' '),
          },
        ]);
      }
      return longBlocks(module.display_title);
    });

    const result = await subject.generateTemplate(input);

    expect(result.sections.has(faqModule.key)).toBe(true);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section_key: faqModule.key,
          severity: 'warning',
          code: 'structure',
        }),
      ]),
    );
  });
});
