import { parseHtmlSections } from './html-section-parser';

describe('parseHtmlSections', () => {
  it('recognises the integration heading before the generic services rule', () => {
    const { sections } = parseHtmlSections(`
      <h1>Reparação de Termoacumuladores</h1>
      <h2>Serviços de Reparação de Termoacumuladores</h2><p>Serviços.</p>
      <h2>Integração com Outros Serviços de Reparação de Termoacumuladores em Lisboa</h2><p>Integração.</p>
      <h2>Contexto Local</h2><p>Lisboa.</p>
    `);

    expect(sections.get('servicos')).toContain('Serviços de Reparação');
    expect(sections.get('integracao_servicos')).toContain('Integração com Outros Serviços');
  });

  it('extracts an intro from a full document without retaining its shell', () => {
    const { sections } = parseHtmlSections(`<!doctype html>
      <html><head><title>Page</title><script>bad()</script></head>
      <body><nav>Menu</nav><h1>Serviço local</h1></body></html>`);

    const intro = sections.get('intro') ?? '';
    expect(intro).toContain('<h1>Serviço local</h1>');
    expect(intro).not.toMatch(/doctype|<html|<head|<title|<script|<nav/i);
  });
});
