import {
  parseHtmlSections,
  validateExtractedSections,
} from './html-section-parser';
import { SECTION_KEYS, SectionKey } from './service-templates.types';

describe('parseHtmlSections', () => {
  it('recognises the integration heading before the generic services rule', () => {
    const { sections } = parseHtmlSections(`
      <h1>Reparação de Termoacumuladores</h1>
      <h2>Serviços de Reparação de Termoacumuladores</h2><p>Serviços.</p>
      <h2>Integração com Outros Serviços de Reparação de Termoacumuladores em Lisboa</h2><p>Integração.</p>
      <h2>Contexto Local</h2><p>Lisboa.</p>
    `);

    expect(sections.get('servicos')).toContain('Serviços de Reparação');
    expect(sections.get('integracao_servicos')).toContain(
      'Integração com Outros Serviços',
    );
  });

  it('extracts an intro from a full document without retaining its shell', () => {
    const { sections } = parseHtmlSections(`<!doctype html>
      <html><head><title>Page</title><script>bad()</script></head>
      <body><nav>Menu</nav><h1>Serviço local</h1></body></html>`);

    const intro = sections.get('intro') ?? '';
    expect(intro).toContain('<h1>Serviço local</h1>');
    expect(intro).not.toMatch(/doctype|<html|<head|<title|<script|<nav/i);
  });

  it('uses section markers instead of the promotional H2 before pseo-content', () => {
    const sectionsHtml = SECTION_KEYS.map((key) =>
      key === 'intro'
        ? '<h1>Reparação local</h1><p>Este parágrafo contém texto suficiente para validar a introdução desta página e evitar que ela seja salva apenas com o título.</p>'
        : `<h2>${key}</h2><p>Conteúdo da seção ${key}.</p>`,
    ).join('\n');
    const markedHtml = SECTION_KEYS.map(
      (key, index) =>
        `<!-- BIB_SECTION:${key} -->${sectionsHtml.split('\n')[index]}<!-- /BIB_SECTION:${key} -->`,
    ).join('\n');
    const { sections } = parseHtmlSections(`<!doctype html><html><body>
      <main><h1>Título da página</h1><h2>Excelentes serviços a baixo custo</h2></main>
      <div class="pseo-content"><video></video>${markedHtml}</div>
    </body></html>`);

    expect(sections.get('intro')).toContain(
      'Este parágrafo contém texto suficiente',
    );
    expect(sections.size).toBe(SECTION_KEYS.length);
    expect(() => validateExtractedSections(sections)).not.toThrow();
  });

  it('keeps text after an unknown H2 in the intro during legacy extraction', () => {
    const { sections } = parseHtmlSections(`<main><h1>Título</h1></main>
      <div class="pseo-content"><h1>Reparação local</h1>
      <h2>Excelentes serviços a baixo custo</h2>
      <p>Este é o parágrafo introdutório que não deve ser descartado.</p>
      <h2>Assistência Especializada</h2><p>Assistência.</p></div>`);

    expect(sections.get('intro')).toContain('parágrafo introdutório');
    expect(sections.get('assistencia_especializada')).toContain('Assistência.');
  });

  it('rejects a title-only intro and missing sections', () => {
    expect(() =>
      validateExtractedSections(
        new Map<SectionKey, string>([['intro', '<h1>Título</h1>']]),
      ),
    ).toThrow(/Secções não extraídas/);
    const titleOnlyIntro = new Map<SectionKey, string>(
      SECTION_KEYS.map((key) => [
        key,
        key === 'intro' ? '<h1>Título</h1>' : '<p>Conteúdo.</p>',
      ]),
    );
    expect(() => validateExtractedSections(titleOnlyIntro)).toThrow(
      /Introdução incompleta/,
    );
  });
});
