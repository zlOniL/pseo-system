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
