import type { ReactNode } from 'react';

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return '';
}

function stripUnsupportedTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

function getAttribute(attrs: string, name: string): string | null {
  const pattern = new RegExp(
    `${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  );
  const match = attrs.match(pattern);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function isAllowedHref(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('/');
}

function renderInlineHtml(value: string, keyPrefix = 'inline'): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /<(a|strong)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(value))) {
    const before = value.slice(lastIndex, match.index);
    if (before) nodes.push(stripUnsupportedTags(before));

    const [, tag, attrs, inner] = match;
    const key = `${keyPrefix}-${index}`;
    if (tag.toLowerCase() === 'strong') {
      nodes.push(<strong key={key}>{renderInlineHtml(inner, key)}</strong>);
    } else {
      const href = getAttribute(attrs, 'href');
      if (href && isAllowedHref(href)) {
        const external = /^https?:\/\//i.test(href);
        nodes.push(
          <a
            key={key}
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener' : undefined}
            className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
          >
            {renderInlineHtml(inner, key)}
          </a>,
        );
      } else {
        nodes.push(stripUnsupportedTags(inner));
      }
    }

    lastIndex = pattern.lastIndex;
    index += 1;
  }

  const rest = value.slice(lastIndex);
  if (rest) nodes.push(stripUnsupportedTags(rest));
  return nodes;
}

export function WhitelabelInlineText({
  value,
}: {
  value: unknown;
}): ReactNode {
  return <>{renderInlineHtml(text(value))}</>;
}

export function whitelabelPlainText(value: unknown): string {
  return stripUnsupportedTags(text(value));
}
