import { ValidationService } from './validation.service';

describe('ValidationService heading contract', () => {
  const service = new ValidationService();
  const html = (headings: string) =>
    `<h1>reparacao de janelas</h1>${headings}<p>${'conteudo util '.repeat(900)}</p>`;

  it('accepts one H1, H2 and H3 and allows additional H4 headings', () => {
    const result = service.validate(
      html(
        '<h2>reparacao de janelas em Lisboa</h2><h3>Diagnostico</h3><h4>Vidros</h4>',
      ),
      'reparacao de janelas',
    );
    expect(result.issues.some((issue) => issue.startsWith('[BLOQUEIO]'))).toBe(
      false,
    );
  });

  it('blocks duplicate or missing H1-H3 headings', () => {
    const result = service.validate(
      html(
        '<h2>reparacao de janelas em Lisboa</h2><h3>Diagnostico</h3><h3>Reparacao</h3>',
      ),
      'reparacao de janelas',
    );
    expect(result.issues).toContain(
      '[BLOQUEIO] H3: esperado exatamente 1, encontrados 2',
    );
  });

  it('blocks a jump from H2 directly to H4', () => {
    const result = service.validate(
      html(
        '<h2>reparacao de janelas em Lisboa</h2><h4>Detalhes</h4><h3>Subsecao</h3>',
      ),
      'reparacao de janelas',
    );
    expect(result.issues).toContain(
      '[BLOQUEIO] Hierarquia de headings com salto de nivel',
    );
  });

  it('counts headings across the entire final document, including the template shell', () => {
    const result = service.validate(
      `<!doctype html><html><head><title>SEO</title></head><body><main><h1>Template title</h1></main><div class="pseo-content">${html('<h2>reparacao de janelas em Lisboa</h2><h3>Subsecao</h3>')}</div></body></html>`,
      'reparacao de janelas',
    );
    expect(result.issues).toContain(
      '[BLOQUEIO] H1: esperado exatamente 1, encontrados 2',
    );
  });

  it('does not count automatic locality link blocks toward editorial link warnings', () => {
    const localityLinks = Array.from(
      { length: 50 },
      (_value, index) => `<a href="/local-${index}">Local ${index}</a>`,
    ).join('');
    const result = service.validate(
      html(
        `<h2>reparacao de janelas em Lisboa</h2><h3>Subsecao</h3><section data-bib-locality-links>${localityLinks}</section>`,
      ),
      'reparacao de janelas',
    );
    expect(
      result.issues.some((issue) => issue.includes('Quantidade alta de links')),
    ).toBe(false);
  });

  it('blocks unresolved placeholders and warns on unsafe new-window links', () => {
    const result = service.validate(
      html(
        '<h2>reparacao de janelas em Lisboa</h2><h3>Diagnostico</h3><a href="https://example.com" target="_blank">Fonte</a>{{PENDENTE}}',
      ),
      'reparacao de janelas',
    );
    expect(result.issues.some((issue) => issue.includes('placeholders'))).toBe(
      true,
    );
    expect(
      result.issues.some((issue) => issue.includes('target="_blank"')),
    ).toBe(true);
  });
});
