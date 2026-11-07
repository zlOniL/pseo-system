import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'node-html-parser';
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
  bannerImageUrl?: string | null;
  bannerImageAlt?: string | null;
  seo?: FtpHtmlSeoFields;
  textReplacements?: Array<{ from: string; to: string }>;
}

const FORBIDDEN_FRAGMENT_TAGS =
  /<\s*\/?\s*(html|head|body|nav|footer|script|meta|title)\b/i;

const CONTENT_LAYOUT_STYLE = `<style data-pseo-content-layout>
.pseo-content{box-sizing:border-box;width:100%!important;max-width:1120px!important;margin:0 auto!important;padding:32px 16px!important;font-size:16px;line-height:1.65!important;-webkit-text-size-adjust:100%;text-size-adjust:100%}
.pseo-content *{box-sizing:border-box}
.pseo-content p,.pseo-content li,.pseo-content dd{text-align:justify!important;hyphens:auto;overflow-wrap:break-word;line-height:1.65!important}
.pseo-content h1,.pseo-content h2,.pseo-content h3,.pseo-content h4,.pseo-content h5,.pseo-content h6{line-height:1.25!important;overflow-wrap:break-word}
.pseo-content img,.pseo-content video,.pseo-content iframe{display:block!important;float:none!important;max-width:100%!important;height:auto;margin-left:auto!important;margin-right:auto!important}
.pseo-content figure,.pseo-content .wp-caption{max-width:100%!important;margin-left:auto!important;margin-right:auto!important;text-align:center}
@media (max-width:600px){.pseo-content{width:100%!important;padding:24px 12px!important}}
</style>`;

@Injectable()
export class FtpHtmlDocumentRenderer {
  render(input: FtpHtmlRenderInput): string {
    this.assertValidFragment(input.fragmentHtml);

    const serviceName = input.textReplacements?.find(item => item.from === '{{SERVICE_NAME}}')?.to
      ?? input.seo?.title?.trim();
    const replaceServiceName = (html: string) => html.replace(
      /\{\{SERVICE_NAME\}\}/g,
      () => serviceName ? escapeHtml(serviceName) : '{{SERVICE_NAME}}',
    );
    const prefixWithReplacements = this.applyTextReplacements(
      this.applyBanner(
        this.applySeo(input.template.document_prefix, input.seo ?? {}),
        input.bannerImageUrl,
        input.bannerImageAlt,
      ),
      (input.textReplacements ?? []).filter(
        (replacement) => replacement.from !== '{{SERVICE_NAME}}',
      ),
    );
    const prefix = this.demoteTemplateMainHeadings(
      replaceServiceName(prefixWithReplacements),
    );
    const fragmentHtml = this.reconcileH1(prefix, input.fragmentHtml);
    const content = `${renderVideoSection(input.videoUrl)}${fragmentHtml}`;
    const document = this.applyContentLayout(
      `${prefix}${content}${replaceServiceName(input.template.document_suffix)}`,
    );

    this.assertValidDocument(document);
    return document;
  }

  private applyBanner(
    html: string,
    imageUrl?: string | null,
    imageAlt?: string | null,
  ): string {
    const image = imageUrl?.trim();
    if (html.includes('{{BANNER_BACKGROUND_STYLE}}')) {
      const background = image
        ? `background-image:linear-gradient(rgba(0,0,0,.52),rgba(0,0,0,.52)),url(&quot;${escapeHtml(image)}&quot;);background-size:cover;background-position:center;background-repeat:no-repeat`
        : '';
      return html.replace(/\{\{BANNER_BACKGROUND_STYLE\}\}/g, background);
    }
    if (!html.includes('{{BANNER_SECTION}}')) return html;
    if (!image) return html.replace(/\{\{BANNER_SECTION\}\}/g, '');

    const alt = escapeHtml(imageAlt?.trim() || 'Imagem do serviço');
    const url = escapeHtml(image);
    const section = `<section class="pseo-template-banner" style="width:100%;max-width:1120px;margin:0 auto;padding:24px 16px 0"><img src="${url}" alt="${alt}" loading="eager" style="display:block;width:100%;max-height:360px;object-fit:cover;border-radius:12px"></section>`;
    return html.replace(/\{\{BANNER_SECTION\}\}/g, section);
  }

  private demoteTemplateMainHeadings(prefix: string): string {
    return prefix.replace(/<main\b[^>]*>[\s\S]*?<\/main>/i, (main) =>
      main
        .replace(/<h[1-6](\b[^>]*)>/gi, '<div$1>')
        .replace(/<\/h[1-6]\s*>/gi, '</div>'),
    );
  }

  applyContentLayout(document: string): string {
    const withoutOldLayout = document.includes('data-pseo-content-layout')
      ? document.replace(
        /<style\b[^>]*data-pseo-content-layout[^>]*>[\s\S]*?<\/style>/i,
        CONTENT_LAYOUT_STYLE,
      )
      : document;

    if (/class=["'][^"']*\bpseo-content\b[^"']*["']/i.test(withoutOldLayout)) {
      return withoutOldLayout;
    }

    const headEnd = withoutOldLayout.toLowerCase().indexOf('</head>');
    const contentStart = withoutOldLayout.toLowerCase().indexOf('</main>');
    const footerStart = withoutOldLayout.toLowerCase().indexOf('<footer', contentStart);
    if (headEnd === -1 || contentStart === -1 || footerStart === -1) {
      throw new BadRequestException(
        'Documento FTP invalido: nao foi possivel aplicar o layout do conteudo.',
      );
    }

    const afterMain = contentStart + '</main>'.length;
    const withWrapper = `${withoutOldLayout.slice(0, afterMain)}<div class="pseo-content">${withoutOldLayout.slice(afterMain, footerStart)}</div>${withoutOldLayout.slice(footerStart)}`;
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

  /**
   * Imported FTP shells can already provide the page H1 (usually in the
   * banner). In that case the generated fragment's H1 becomes an H2. If the
   * shell has no H1, the fragment must provide exactly one.
   */
  private reconcileH1(prefix: string, fragment: string): string {
    const shellH1Count = parse(prefix).querySelectorAll('h1').length;
    const fragmentH1Count = parse(fragment).querySelectorAll('h1').length;

    if (shellH1Count > 1) {
      throw new BadRequestException(
        `Template FTP invalido: encontrado(s) ${shellH1Count} H1 antes do conteudo gerado.`,
      );
    }
    if (fragmentH1Count > 1) {
      throw new BadRequestException(
        `Fragmento FTP invalido: encontrado(s) ${fragmentH1Count} H1 no conteudo gerado.`,
      );
    }

    const normalizedFragment = shellH1Count === 1
      ? fragment.replace(/<\s*(\/?)\s*h1\b/gi, '<$1h2')
      : fragment;
    const finalH1Count = shellH1Count + (shellH1Count === 1 ? 0 : fragmentH1Count);

    if (finalH1Count !== 1) {
      throw new BadRequestException(
        `Documento FTP invalido: esperado exatamente 1 H1, encontrado ${finalH1Count}.`,
      );
    }

    return normalizedFragment;
  }

  applySeo(prefix: string, seo: FtpHtmlSeoFields): string {
    let next = prefix;
    if (seo.title?.trim()) {
      next = setUniqueHeadElement(
        next,
        (tag) => /^<title\b/i.test(tag),
        `<title>${escapeHtml(seo.title.trim())}</title>`,
      );
      next = replaceMetaContent(next, 'property', 'og:title', seo.title.trim());
      next = replaceMetaContent(
        next,
        'name',
        'twitter:title',
        seo.title.trim(),
      );
    } else {
      next = keepUniqueHeadElement(next, (tag) => /^<title\b/i.test(tag));
    }
    if (seo.description?.trim()) {
      next = setUniqueHeadElement(
        next,
        (tag) => tagAttribute(tag, 'name')?.toLowerCase() === 'description',
        `<meta name="description" content="${escapeHtml(seo.description.trim())}">`,
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
    } else {
      next = keepUniqueHeadElement(
        next,
        (tag) => tagAttribute(tag, 'name')?.toLowerCase() === 'description',
      );
    }
    if (seo.canonicalUrl?.trim()) {
      next = setUniqueHeadElement(
        next,
        (tag) => /^<link\b/i.test(tag) && tagAttribute(tag, 'rel')?.toLowerCase() === 'canonical',
        `<link rel="canonical" href="${escapeHtml(seo.canonicalUrl.trim())}">`,
      );
      next = replaceMetaContent(
        next,
        'property',
        'og:url',
        seo.canonicalUrl.trim(),
      );
    } else {
      next = keepUniqueHeadElement(
        next,
        (tag) => /^<link\b/i.test(tag) && tagAttribute(tag, 'rel')?.toLowerCase() === 'canonical',
      );
    }
    return stripHeadOnlySeoElementsOutsideHead(next);
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

    const h1Count = parse(document).querySelectorAll('h1').length;
    if (h1Count !== 1) {
      throw new BadRequestException(
        `Documento FTP invalido: esperado exatamente 1 H1, encontrado ${h1Count}.`,
      );
    }

    const root = parse(document);
    const head = root.querySelector('head');
    const titles = root.querySelectorAll('title');
    if (titles.length !== 1 || titles[0].parentNode !== head) {
      throw new BadRequestException(
        'Documento FTP invalido: deve existir exatamente um <title> dentro de <head>.',
      );
    }
    const descriptions = root.querySelectorAll('meta').filter(
      (tag) => tag.getAttribute('name')?.toLowerCase() === 'description',
    );
    if (descriptions.length !== 1 || descriptions.some((tag) => tag.parentNode !== head)) {
      throw new BadRequestException(
        'Documento FTP invalido: deve existir exatamente uma meta description dentro de <head>.',
      );
    }
    const canonicals = root.querySelectorAll('link').filter(
      (tag) => tag.getAttribute('rel')?.toLowerCase() === 'canonical',
    );
    if (canonicals.length !== 1 || canonicals.some((tag) => tag.parentNode !== head)) {
      throw new BadRequestException(
        'Documento FTP invalido: deve existir exatamente um canonical dentro de <head>.',
      );
    }

    const pending = document.match(/{{[^}]+}}|\[\[[^\]]+\]\]/g);
    if (pending) {
      throw new BadRequestException(
        `Documento FTP invalido: placeholder pendente: ${[...new Set(pending)].join(', ')}.`,
      );
    }
  }
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

function setUniqueHeadElement(
  html: string,
  matches: (tag: string) => boolean,
  replacement: string,
): string {
  return rewriteHeadElements(html, matches, replacement);
}

function keepUniqueHeadElement(
  html: string,
  matches: (tag: string) => boolean,
): string {
  return rewriteHeadElements(html, matches);
}

function rewriteHeadElements(
  html: string,
  matches: (tag: string) => boolean,
  replacement?: string,
): string {
  const headStart = html.toLowerCase().indexOf('<head');
  const headEnd = html.toLowerCase().indexOf('</head>');
  if (headStart === -1 || headEnd === -1 || headEnd < headStart) return html;

  const head = html.slice(headStart, headEnd);
  const tagPattern = /<title\b[^>]*>[\s\S]*?<\/title\s*>|<(?:meta|link)\b[^>]*>/gi;
  let found = false;
  let updatedHead = head.replace(tagPattern, (tag) => {
    if (!matches(tag)) return tag;
    if (!found) {
      found = true;
      return replacement ?? tag;
    }
    return '';
  });

  if (!found && replacement) updatedHead = `${updatedHead}\n  ${replacement}`;
  return `${html.slice(0, headStart)}${updatedHead}${html.slice(headEnd)}`;
}

function tagAttribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag);
  return match?.[2];
}

function stripHeadOnlySeoElementsOutsideHead(html: string): string {
  const lower = html.toLowerCase();
  const headStart = lower.indexOf('<head');
  const headCloseStart = lower.indexOf('</head>');
  if (headStart === -1 || headCloseStart === -1 || headCloseStart < headStart) {
    return html;
  }

  const headEnd = headCloseStart + '</head>'.length;
  const strip = (part: string) => part.replace(
    /<title\b[^>]*>[\s\S]*?<\/title\s*>|<(?:meta|link)\b[^>]*>/gi,
    (tag) => {
      if (/^<title\b/i.test(tag)) return '';
      if (/^<meta\b/i.test(tag) && tagAttribute(tag, 'name')?.toLowerCase() === 'description') return '';
      if (/^<link\b/i.test(tag) && tagAttribute(tag, 'rel')?.toLowerCase() === 'canonical') return '';
      return tag;
    },
  );

  return `${strip(html.slice(0, headStart))}${html.slice(headStart, headEnd)}${strip(html.slice(headEnd))}`;
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
