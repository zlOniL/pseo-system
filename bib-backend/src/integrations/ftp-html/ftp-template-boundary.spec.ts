import { extractFtpTemplateParts } from './ftp-template-boundary';

describe('extractFtpTemplateParts', () => {
  it('extracts prefix, managed content and suffix without changing bytes', () => {
    const prefix = '<!DOCTYPE html><html><body><main><h1>Banner</h1></main>';
    const managed = '\n<section>Conteudo antigo</section>\n';
    const suffix = '<footer>Rodape</footer><script src="x.js"></script></body></html>';

    const result = extractFtpTemplateParts(prefix + managed + suffix);

    expect(result).toMatchObject({
      documentPrefix: prefix,
      managedContent: managed,
      documentSuffix: suffix,
    });
  });

  it('requires unique main and footer boundaries', () => {
    expect(extractFtpTemplateParts('<main></main><main></main><footer />')).toEqual({
      reason: 'multiple_main_close',
    });
    expect(extractFtpTemplateParts('<main></main><footer /><footer />')).toEqual({
      reason: 'multiple_footer',
    });
  });

  it('does not accept missing or inverted boundaries', () => {
    expect(extractFtpTemplateParts('<main>sem fechamento<footer />')).toEqual({
      reason: 'missing_main_close',
    });
    expect(extractFtpTemplateParts('<main></main>')).toEqual({
      reason: 'missing_footer',
    });
    expect(extractFtpTemplateParts('<footer></footer><main></main>')).toEqual({
      reason: 'footer_before_main',
    });
  });
});
