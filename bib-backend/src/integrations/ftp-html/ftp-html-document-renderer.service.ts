import { BadRequestException, Injectable } from '@nestjs/common';
import { renderVideoSection } from '../../common/html-assembler';

export interface FtpHtmlTemplateVersion {
  document_prefix: string;
  document_suffix: string;
}

export interface FtpHtmlSeoFields {
  title?: string | null;
  description?: string | null;
  canonicalUrl?: string | null;
}

export interface FtpHtmlRenderInput {
  template: FtpHtmlTemplateVersion;
  fragmentHtml: string;
  videoUrl?: string | null;
  seo?: FtpHtmlSeoFields;
  textReplacements?: Array<{ from: string; to: string }>;
}

const FORBIDDEN_FRAGMENT_TAGS =
  /<\s*\/?\s*(html|head|body|nav|footer|script|meta|title)\b/i;

const CONTENT_LAYOUT_STYLE = `<style data-pseo-content-layout>
.pseo-content{box-sizing:border-box;width:calc(100% - 32px);max-width:1120px;margin:0 auto;padding:32px 0;font-size:16px;line-height:1.65!important;-webkit-text-size-adjust:100%;text-size-adjust:100%}
.pseo-content *{box-sizing:border-box}
.pseo-content p,.pseo-content li,.pseo-content dd{text-align:justify!important;hyphens:auto;overflow-wrap:break-word;line-height:1.65!important}
.pseo-content h1,.pseo-content h2,.pseo-content h3,.pseo-content h4,.pseo-content h5,.pseo-content h6{line-height:1.25!important;overflow-wrap:break-word}
.pseo-content img,.pseo-content video,.pseo-content iframe{display:block!important;float:none!important;max-width:100%!important;height:auto;margin-left:auto!important;margin-right:auto!important}
.pseo-content figure,.pseo-content .wp-caption{max-width:100%!important;margin-left:auto!important;margin-right:auto!important;text-align:center}
@media (max-width:600px){.pseo-content{width:calc(100% - 24px);padding:24px 0}}
</style>`;

@Injectable()
export class FtpHtmlDocumentRenderer {
  render(input: FtpHtmlRenderInput): string {
    this.assertValidFragment(input.fragmentHtml);

    const prefix = this.applyTextReplacements(
      this.applySeo(input.template.document_prefix, input.seo ?? {}),
      input.textReplacements ?? [],
    );
    const content = `${renderVideoSection(input.videoUrl)}${input.fragmentHtml}`;
    const document = this.applyContentLayout(
      `${prefix}${content}${input.template.document_suffix}`,
    );

    this.assertValidDocument(document);
    return document;
  }

  applyContentLayout(document: string): string {
    if (document.includes('data-pseo-content-layout')) {
      return document.replace(
        /<style\b[^>]*data-pseo-content-layout[^>]*>[\s\S]*?<\/style>/i,
        CONTENT_LAYOUT_STYLE,
      );
    }

    const headEnd = document.toLowerCase().indexOf('</head>');
    const contentStart = document.toLowerCase().indexOf('</main>');
    const footerStart = document.toLowerCase().indexOf('<footer', contentStart);
    if (headEnd === -1 || contentStart === -1 || footerStart === -1) {
      throw new BadRequestException(
        'Documento FTP invalido: nao foi possivel aplicar o layout do conteudo.',
      );
    }

    const afterMain = contentStart + '</main>'.length;
    const withWrapper = `${document.slice(0, afterMain)}<div class="pseo-content">${document.slice(afterMain, footerStart)}</div>${document.slice(footerStart)}`;
    return `${withWrapper.slice(0, headEnd)}${CONTENT_LAYOUT_STYLE}${withWrapper.slice(headEnd)}`;
  }

  private assertValidFragment(fragment: string): void {
    if (
      /<\s*!doctype\b/i.test(fragment) ||
      FORBIDDEN_FRAGMENT_TAGS.test(fragment)
    ) {
      throw new BadRequestException(
        'Fragmento FTP invalido: contem tags de documento, navegacao, rodape, script ou metadados.',
      );
    }
  }

  private applySeo(prefix: string, seo: FtpHtmlSeoFields): string {
    let next = prefix;
    if (seo.title?.trim()) {
      next = replaceTagText(next, 'title', seo.title.trim());
      next = replaceMetaContent(next, 'property', 'og:title', seo.title.trim());
      next = replaceMetaContent(
        next,
        'name',
        'twitter:title',
        seo.title.trim(),
      );
    }
    if (seo.description?.trim()) {
      next = replaceMetaContent(
        next,
        'name',
        'description',
        seo.description.trim(),
      );
      next = replaceMetaContent(
        next,
        'property',
        'og:description',
        seo.description.trim(),
      );
      next = replaceMetaContent(
        next,
        'name',
        'twitter:description',
        seo.description.trim(),
      );
    }
    if (seo.canonicalUrl?.trim()) {
      next = replaceLinkHref(next, 'canonical', seo.canonicalUrl.trim());
      next = replaceMetaContent(
        next,
        'property',
        'og:url',
        seo.canonicalUrl.trim(),
      );
    }
    return next;
  }

  private applyTextReplacements(
    prefix: string,
    replacements: Array<{ from: string; to: string }>,
  ): string {
    const headEnd = prefix.toLowerCase().indexOf('</head>');
    if (headEnd === -1) return prefix;

    const splitAt = headEnd + '</head>'.length;
    const head = prefix.slice(0, splitAt);
    const shell = replacements.reduce((html, item) => {
      const from = item.from.trim();
      if (!from) return html;
      return html.split(from).join(item.to);
    }, prefix.slice(splitAt));

    return `${head}${shell}`;
  }

  private assertValidDocument(document: string): void {
    const checks: Array<[string, RegExp, number]> = [
      ['DOCTYPE', /<!doctype\b/gi, 1],
      ['html', /<html\b/gi, 1],
      ['/html', /<\/html>/gi, 1],
      ['head', /<head\b/gi, 1],
      ['/head', /<\/head>/gi, 1],
      ['body', /<body\b/gi, 1],
      ['/body', /<\/body>/gi, 1],
      ['footer', /<footer\b/gi, 1],
    ];

    for (const [label, pattern, expected] of checks) {
      const count = document.match(pattern)?.length ?? 0;
      if (count !== expected) {
        throw new BadRequestException(
          `Documento FTP invalido: esperado ${expected} ocorrencia(s) de ${label}, encontrado ${count}.`,
        );
      }
    }

    if (/{{[^}]+}}|\[\[[^\]]+\]\]/.test(document)) {
      throw new BadRequestException(
        'Documento FTP invalido: placeholder pendente.',
      );
    }
  }
}

function replaceTagText(html: string, tag: string, value: string): string {
  return html.replace(
    new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(<\\/${tag}>)`, 'i'),
    `$1${escapeHtml(value)}$3`,
  );
}

function replaceMetaContent(
  html: string,
  attr: 'name' | 'property',
  attrValue: string,
  value: string,
): string {
  const pattern = new RegExp(
    `(<meta\\b(?=[^>]*\\b${attr}=["']${escapeRegExp(attrValue)}["'])(?=[^>]*\\bcontent=["']))([^>]*\\bcontent=["'])([^"']*)(["'][^>]*>)`,
    'i',
  );
  return html.replace(pattern, `$1$2${escapeHtml(value)}$4`);
}

function replaceLinkHref(html: string, rel: string, value: string): string {
  const pattern = new RegExp(
    `(<link\\b(?=[^>]*\\brel=["']${escapeRegExp(rel)}["'])(?=[^>]*\\bhref=["']))([^>]*\\bhref=["'])([^"']*)(["'][^>]*>)`,
    'i',
  );
  return html.replace(pattern, `$1$2${escapeHtml(value)}$4`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
