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
  const tags = [
    input.baseUrl ? `<base href="${escapeAttribute(input.baseUrl)}">` : '',
    `<style data-pseo-preview-lock>${input.css}</style>`,
  ]
    .filter(Boolean)
    .join('');

  const withoutExistingBase = html.replace(/<base\b[^>]*>/i, '');

  if (/<head\b[^>]*>/i.test(withoutExistingBase)) {
    return withoutExistingBase.replace(/<head\b[^>]*>/i, (match) => {
      return `${match}${tags}`;
    });
  }

  if (/<html\b[^>]*>/i.test(withoutExistingBase)) {
    return withoutExistingBase.replace(/<html\b[^>]*>/i, (match) => {
      return `${match}<head>${tags}</head>`;
    });
  }

  return `${tags}${withoutExistingBase}`;
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

function previewLockCss(): string {
  return [
    'a,area{pointer-events:none!important;cursor:default!important}',
    'form,button,input,select,textarea{pointer-events:none!important}',
    'img,video{max-width:100%;height:auto}',
  ].join('');
}
