import { BadRequestException } from '@nestjs/common';
import { FtpHtmlDocumentRenderer } from './ftp-html-document-renderer.service';

const template = {
  document_prefix: [
    '<!DOCTYPE html><html lang="pt"><head>',
    '<title>Antigo</title>',
    '<meta name="description" content="Descricao antiga">',
    '<link rel="canonical" href="https://urgentreparacoes.pt/antigo.html">',
    '<meta property="og:title" content="Antigo">',
    '<meta property="og:description" content="Descricao antiga">',
    '<meta property="og:url" content="https://urgentreparacoes.pt/antigo.html">',
    '<meta name="twitter:title" content="Antigo">',
    '<meta name="twitter:description" content="Descricao antiga">',
    '</head><body><nav>Menu</nav><main><h1>Reparação de Estores</h1></main>',
  ].join(''),
  document_suffix:
    '<footer>Rodape</footer><script src="site.js"></script></body></html>',
};

describe('FtpHtmlDocumentRenderer', () => {
  const renderer = new FtpHtmlDocumentRenderer();

  it('resolves service placeholders throughout the saved shell, including head and footer', () => {
    const html = renderer.render({
      template: {
        document_prefix: template.document_prefix.replace('</head>', '<meta name="custom" content="{{SERVICE_NAME}}"></head>'),
        document_suffix: template.document_suffix.replace('Rodape', '{{SERVICE_NAME}}'),
      },
      fragmentHtml: '<p>Conteudo</p>',
      textReplacements: [{ from: '{{SERVICE_NAME}}', to: 'Loica & Co' }],
    });
    expect(html).toContain('content="Loica &amp; Co"');
    expect(html).toContain('<footer>Loica &amp; Co</footer>');
    expect(html).not.toContain('{{SERVICE_NAME}}');
  });

  it('identifies unknown pending placeholders', () => {
    expect(() => renderer.render({
      template: { ...template, document_suffix: template.document_suffix.replace('Rodape', '{{UNKNOWN}}') },
      fragmentHtml: '<p>Conteudo</p>',
    })).toThrow('placeholder pendente: {{UNKNOWN}}');
  });

  it('renders a full document preserving shell and inserting fragment once', () => {
    const fragment = '<section><h2>Conteudo novo</h2></section>';

    const html = renderer.render({ template, fragmentHtml: fragment });

    expect(html).toContain(
      '<body><nav>Menu</nav><main><h1>Reparação de Estores</h1></main>',
    );
    expect(html).toContain(fragment);
    expect(html).toContain(template.document_suffix);
    expect(html).toContain('<style data-pseo-content-layout>');
    expect(html).toContain('line-height:1.65!important');
    expect(html).toContain('width:100%!important;max-width:1120px!important;margin:0 auto!important;padding:32px 16px!important');
    expect(html).toContain(`<div class="pseo-content">${fragment}</div>`);
    expect(html.match(/Conteudo novo/g)).toHaveLength(1);
  });

  it('does not duplicate the content layout', () => {
    const html = renderer.render({
      template,
      fragmentHtml: '<section>Conteudo</section>',
    });

    expect(renderer.applyContentLayout(html)).toBe(html);
    expect(html.match(/data-pseo-content-layout/g)).toHaveLength(1);
  });

  it('prepends the configured video to FTP content', () => {
    const html = renderer.render({
      template,
      fragmentHtml: '<section>Conteudo</section>',
      videoUrl: 'https://cdn.example/video.mp4',
    });

    expect(html).toContain('<video src="https://cdn.example/video.mp4"');
    expect(html.indexOf('<video')).toBeLessThan(
      html.indexOf('<section>Conteudo</section>'),
    );
  });

  it('renders the configured banner when the base template has a banner slot', () => {
    const html = renderer.render({
      template: {
        document_prefix: template.document_prefix.replace(
          '</main>',
          '{{BANNER_SECTION}}</main>',
        ),
        document_suffix: template.document_suffix,
      },
      fragmentHtml: '<section>Conteudo</section>',
      bannerImageUrl: 'https://cdn.example/termoacumuladores.webp',
      bannerImageAlt: 'Reparação de termoacumuladores',
    });

    expect(html).toContain(
      '<img src="https://cdn.example/termoacumuladores.webp" alt="Reparação de termoacumuladores"',
    );
    expect(html).not.toContain('{{BANNER_SECTION}}');
  });

  it('uses the service image as the background of a reference banner', () => {
    const html = renderer.render({
      template: {
        document_prefix:
          '<!DOCTYPE html><html><head><title>Old</title></head><body><main style="{{BANNER_BACKGROUND_STYLE}}"><h1>{{SERVICE_NAME}} 24h</h1><div class="numbers">915 463 419</div></main>',
        document_suffix: '<footer>Footer</footer></body></html>',
      },
      fragmentHtml: '<section>Conteudo</section>',
      videoUrl: 'https://cdn.example/video.mp4',
      bannerImageUrl: 'https://cdn.example/service.webp',
      textReplacements: [
        { from: '{{SERVICE_NAME}}', to: 'Reparação de Termoacumuladores' },
      ],
    });

    expect(html).toContain('<h1>Reparação de Termoacumuladores 24h</h1>');
    expect(html).toContain('915 463 419');
    expect(html).toContain('background-image:linear-gradient');
    expect(html).toContain('url(&quot;https://cdn.example/service.webp&quot;)');
    expect(html).not.toContain('class="pseo-template-banner"');
    expect(html.indexOf('915 463 419')).toBeLessThan(html.indexOf('<video'));
  });

  it('refreshes existing content layout styles', () => {
    const oldHtml = [
      '<!DOCTYPE html><html><head>',
      '<style data-pseo-content-layout>.pseo-content{padding:32px 0}</style>',
      '</head><body><main>Banner</main><div class="pseo-content">Conteudo</div>',
      '<footer>Rodape</footer></body></html>',
    ].join('');

    const html = renderer.applyContentLayout(oldHtml);

    expect(html.match(/data-pseo-content-layout/g)).toHaveLength(1);
    expect(html).toContain('line-height:1.65!important');
    expect(html).not.toContain('.pseo-content{padding:32px 0}</style>');
  });

  it('wraps content when an imported template has the layout style but no container', () => {
    const oldHtml = [
      '<!DOCTYPE html><html><head>',
      '<style data-pseo-content-layout>.pseo-content{padding:32px 0}</style>',
      '</head><body><main>Banner</main><video src="hero.mp4"></video><h1>Conteudo</h1>',
      '<footer>Rodape</footer></body></html>',
    ].join('');

    const html = renderer.applyContentLayout(oldHtml);

    expect(html).toContain(
      '<main>Banner</main><div class="pseo-content"><video src="hero.mp4"></video><h1>Conteudo</h1></div><footer>',
    );
    expect(html).toContain('padding:32px 16px!important');
  });

  it('updates SEO fields and allowed banner text in the prefix', () => {
    const html = renderer.render({
      template,
      fragmentHtml: '<section>Conteudo</section>',
      seo: {
        title: 'Reparação de Estores em Lisboa',
        description: 'Assistência de estores em Lisboa.',
        canonicalUrl:
          'https://urgentreparacoes.pt/reparacao-de-estores-em-lisboa.html',
      },
      textReplacements: [
        {
          from: 'Reparação de Estores',
          to: 'Reparação de Estores em Lisboa',
        },
      ],
    });

    expect(html).toContain('<title>Reparação de Estores em Lisboa</title>');
    expect(html).toContain('content="Assistência de estores em Lisboa."');
    expect(html).toContain(
      'href="https://urgentreparacoes.pt/reparacao-de-estores-em-lisboa.html"',
    );
    expect(html).toContain('<h1>Reparação de Estores em Lisboa</h1>');
  });

  it.each([
    '<html><body>bad</body></html>',
    '<script>alert(1)</script>',
    '<footer>bad</footer>',
    '<title>bad</title>',
    '<meta name="description" content="bad">',
  ])('rejects forbidden fragment tag %#', (fragmentHtml) => {
    expect(() => renderer.render({ template, fragmentHtml })).toThrow(
      BadRequestException,
    );
  });

  it('rejects invalid final documents', () => {
    expect(() =>
      renderer.render({
        template: { ...template, document_suffix: '{{footer}}</body></html>' },
        fragmentHtml: '<section>Conteudo</section>',
      }),
    ).toThrow(BadRequestException);
  });
});
