import {
  extractExternalUrls,
  validateModuleExternalLinks,
} from './external-link-validation';
import { VerifiedExternalReference } from './external-link.types';

const reference: VerifiedExternalReference = {
  entity: 'Camara Municipal de Lisboa',
  url: 'https://www.lisboa.pt/',
  final_url: 'https://www.lisboa.pt/',
  domain: 'www.lisboa.pt',
  type: 'local_authority',
  target_module: 'modulo_12_zonas_contexto_local',
  page_title: 'Camara Municipal de Lisboa',
  page_description: null,
  http_status: 200,
  relevance_score: 0.98,
  is_official: true,
};

describe('external link validation', () => {
  it('accepts verified links in their assigned module', () => {
    const blocks = [
      {
        type: 'paragraph',
        text: 'Consulte a <a href="https://www.lisboa.pt" target="_blank" rel="noopener">Camara Municipal de Lisboa</a>.',
      },
    ];

    expect(
      validateModuleExternalLinks('modulo_12_zonas_contexto_local', blocks, [
        reference,
      ]),
    ).toEqual({ valid: true, externalUrls: ['https://www.lisboa.pt'] });
  });

  it('rejects invented links and reports missing required references', () => {
    const invented = [
      {
        type: 'paragraph',
        text: 'Veja <a href="https://inventado.example/">esta fonte</a>.',
      },
    ];
    const invalid = validateModuleExternalLinks(
      'modulo_12_zonas_contexto_local',
      invented,
      [reference],
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.issue).toContain('nao verificadas');

    const missing = validateModuleExternalLinks(
      'modulo_12_zonas_contexto_local',
      [{ type: 'paragraph', text: 'Sem links.' }],
      [reference],
    );
    expect(missing.valid).toBe(false);
    expect(missing.issue).toContain('Camara Municipal de Lisboa');
  });

  it('extracts external anchors recursively and ignores internal links', () => {
    expect(
      extractExternalUrls({
        text: '<a href="/interno">interno</a>',
        items: [
          'A <a href="https://one.example/path">primeira</a>',
          { answer: '<a href="https://two.example/">segunda</a>' },
        ],
      }),
    ).toEqual(['https://one.example/path', 'https://two.example/']);
  });
});
