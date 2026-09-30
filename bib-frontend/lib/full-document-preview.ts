export type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

export interface FullDocumentPreview {
  html: string;
  warnings: string[];
  removedScriptCount: number;
}

export function buildFullDocumentPreviewHtml(
  sourceHtml: string,
  publicBaseUrl?: string,
): FullDocumentPreview {
  const warnings: string[] = [];
  const baseUrl = normalizePreviewBaseUrl(publicBaseUrl);
  const withoutScripts = stripScripts(sourceHtml);
  let html = withoutScripts.html;

  if (!baseUrl) {
    warnings.push(
      'Configure a URL pública do FTP para carregar CSS, imagens e fontes relativos.',
    );
  }

  if (withoutScripts.count > 0) {
    warnings.push(
      `${withoutScripts.count} script(s) do HTML importado foram desativados no preview.`,
    );
  }

  html = absolutizePreviewResourceUrls(html, baseUrl);
  html = injectPreviewHead(html, {
    baseUrl,
    css: previewLockCss(),
  });

  return { html, warnings, removedScriptCount: withoutScripts.count };
}

export function previewDeviceWidth(device: PreviewDevice): number | string {
  if (device === 'mobile') return 390;
  if (device === 'tablet') return 768;
  return '100%';
}

function stripScripts(html: string): { html: string; count: number } {
  let count = 0;
  const withoutBlocks = html.replace(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
    () => {
      count += 1;
      return '<!-- script disabled in PSEO preview -->';
    },
  );
  const withoutOpenTags = withoutBlocks.replace(/<script\b[^>]*\/?>/gi, () => {
    count += 1;
    return '<!-- script disabled in PSEO preview -->';
  });
  return { html: withoutOpenTags, count };
}

function injectPreviewHead(
  html: string,
  input: { baseUrl: string; css: string },
): string {
  const baseTag = input.baseUrl
    ? `<base href="${escapeAttribute(input.baseUrl)}">`
    : '';
  const styleTag = `<style data-pseo-preview-lock>${input.css}</style>`;

  const withoutExistingBase = html.replace(/<base\b[^>]*>/i, '');

  if (/<head\b[^>]*>/i.test(withoutExistingBase)) {
    return withoutExistingBase
      .replace(/<head\b[^>]*>/i, (match) => `${match}${baseTag}`)
      .replace(/<\/head>/i, `${styleTag}</head>`);
  }

  if (/<html\b[^>]*>/i.test(withoutExistingBase)) {
    return withoutExistingBase.replace(/<html\b[^>]*>/i, (match) => {
      return `${match}<head>${baseTag}${styleTag}</head>`;
    });
  }

  return `${baseTag}${styleTag}${withoutExistingBase}`;
}

function normalizePreviewBaseUrl(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return `${url.toString().replace(/\/+$/, '')}/`;
  } catch {
    return '';
  }
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function absolutizePreviewResourceUrls(html: string, baseUrl: string): string {
  if (!baseUrl) return html;

  return html
    .replace(
      /\b(href|src|poster)=("([^"]*)"|'([^']*)')/gi,
      (match, attr, quoted, doubleValue, singleValue) => {
        const quote = quoted[0];
        const value = doubleValue ?? singleValue ?? '';
        const resolved = resolvePreviewUrl(value, baseUrl);
        return resolved
          ? `${attr}=${quote}${escapeAttribute(resolved)}${quote}`
          : match;
      },
    )
    .replace(
      /\bsrcset=("([^"]*)"|'([^']*)')/gi,
      (match, quoted, doubleValue, singleValue) => {
        const quote = quoted[0];
        const value = doubleValue ?? singleValue ?? '';
        const resolved = resolvePreviewSrcset(value, baseUrl);
        return resolved
          ? `srcset=${quote}${escapeAttribute(resolved)}${quote}`
          : match;
      },
    );
}

function resolvePreviewSrcset(value: string, baseUrl: string): string {
  const candidates = value
    .split(',')
    .map((candidate) => {
      const [url = '', ...descriptor] = candidate.trim().split(/\s+/);
      const resolved = resolvePreviewUrl(url, baseUrl);
      return resolved ? [resolved, ...descriptor].join(' ') : candidate.trim();
    })
    .filter(Boolean);

  return candidates.length > 0 ? candidates.join(', ') : '';
}

function resolvePreviewUrl(value: string, baseUrl: string): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)
  ) {
    return '';
  }

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return '';
  }
}

function previewLockCss(): string {
  return [
    'a,area{pointer-events:none!important;cursor:default!important}',
    'form,button,input,select,textarea{pointer-events:none!important}',
    'img,video{max-width:100%;height:auto}',
    '.pseo-content{line-height:1.65!important;-webkit-text-size-adjust:100%;text-size-adjust:100%}',
    '.pseo-content *{box-sizing:border-box}',
    '.pseo-content p,.pseo-content li,.pseo-content dd{line-height:1.65!important;overflow-wrap:break-word}',
    '.pseo-content h1,.pseo-content h2,.pseo-content h3,.pseo-content h4,.pseo-content h5,.pseo-content h6{line-height:1.25!important;overflow-wrap:break-word}',
  ].join('');
}
