import { parse } from 'node-html-parser';

export function isLocalityLinksHeading(text: string): boolean {
  return /^(?:Atendemos\s+Tamb[eé]m|Tamb[eé]m\s+Atendemos(?:\s+nas\s+Seguintes\s+Localidades)?|Cidades\s+Onde\s+Atendemos|Tamb[eé]m\s+fazemos?[\s\S]*?noutras\s+Localidades)$/i.test(
    text.trim(),
  );
}

/** Preserve ancestor tags and editable section markers while removing old links. */
export function stripLocalityBacklinksSection(html: string): string {
  const root = parse(html, { comment: true });
  const ranges: Array<[number, number]> = [];
  const addRange = (range: readonly [number, number]) => {
    let end = range[1];
    while (end < html.length && /\s/.test(html[end])) end++;
    ranges.push([range[0], end]);
  };
  for (const block of root.querySelectorAll(
    '[data-bib-locality-links], #dynamic-neighborhood-links',
  ))
    addRange(block.range);
  for (const heading of root.querySelectorAll('h2')) {
    if (!isLocalityLinksHeading(heading.text)) continue;
    const parent = heading.parentNode;
    if (
      parent?.tagName === 'SECTION' &&
      parent.querySelectorAll('h2').length === 1 &&
      parent.firstElementChild === heading
    ) {
      addRange(parent.range);
      continue;
    }
    addRange(heading.range);
    const siblings = parent.childNodes;
    for (let i = siblings.indexOf(heading) + 1; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (
        /BIB_SECTION:/.test(sibling.toString()) ||
        /<h[12]\b/i.test(sibling.toString())
      )
        break;
      addRange(sibling.range);
    }
  }
  const merged: Array<[number, number]> = [];
  for (const range of ranges.sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1])
      previous[1] = Math.max(previous[1], range[1]);
    else merged.push(range);
  }
  for (const [start, end] of merged.reverse())
    html = html.slice(0, start) + html.slice(end);
  return html.trimEnd();
}
