import {
  ExternalLinkValidationResult,
  VerifiedExternalReference,
} from './external-link.types';

export function validateModuleExternalLinks(
  moduleKey: string,
  blocks: Array<Record<string, unknown>>,
  references: VerifiedExternalReference[],
): ExternalLinkValidationResult {
  const expected = references.filter(
    (reference) => reference.target_module === moduleKey,
  );
  const allowedUrls = new Set(
    expected.flatMap((reference) => [
      canonicalExternalUrl(reference.url),
      canonicalExternalUrl(reference.final_url),
    ]),
  );
  const externalUrls = extractExternalUrls(blocks);
  const unexpected = externalUrls.filter(
    (url) => !allowedUrls.has(canonicalExternalUrl(url)),
  );
  if (unexpected.length > 0) {
    return {
      valid: false,
      issue: `URLs externas nao verificadas neste modulo: ${unexpected.join(', ')}. Usa somente as referencias fornecidas.`,
      externalUrls,
    };
  }

  const missing = expected.filter(
    (reference) =>
      !externalUrls.some(
        (url) =>
          canonicalExternalUrl(url) ===
            canonicalExternalUrl(reference.final_url) ||
          canonicalExternalUrl(url) === canonicalExternalUrl(reference.url),
      ),
  );
  if (missing.length > 0) {
    return {
      valid: false,
      issue: `Faltam links externos obrigatorios para: ${missing.map((item) => item.entity).join(', ')}.`,
      externalUrls,
    };
  }

  return { valid: true, externalUrls };
}

export function extractExternalUrls(value: unknown): string[] {
  const urls: string[] = [];
  const visit = (item: unknown): void => {
    if (typeof item === 'string') {
      for (const match of item.matchAll(
        /<a\b[^>]*\bhref\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi,
      )) {
        urls.push(match[1]);
      }
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (item && typeof item === 'object') {
      Object.values(item as Record<string, unknown>).forEach(visit);
    }
  };
  visit(value);
  return [...new Set(urls)];
}

export function canonicalExternalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return value.trim();
  }
}
