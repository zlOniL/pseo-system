import { normalizeGeneratedHeadings } from './heading-normalizer';
import { parse } from 'node-html-parser';

describe('normalizeGeneratedHeadings', () => {
  it('preserves the first H1-H3 and converts repeated H1-H3 titles to H4', () => {
    const html = normalizeGeneratedHeadings(
      '<h1>Principal</h1><h2>Secao</h2><h3>Subsecao</h3><h2>Outra secao</h2><h3>Outra subseccao</h3><h1>Repetido</h1>',
    );
    const root = parse(html);
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelectorAll('h2')).toHaveLength(1);
    expect(root.querySelectorAll('h3')).toHaveLength(1);
    expect(root.querySelectorAll('h4')).toHaveLength(3);
  });
});
