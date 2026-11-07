/** Orders generated title elements by their position: page title, main section,
 * first subsection, then H4 for every further title. */
export function normalizeGeneratedHeadings(html: string): string {
  const headingPattern = /<h([1-6])(\b[^>]*)>([\s\S]*?)<\/h\1\s*>/gi;
  const matches = [...html.matchAll(headingPattern)];
  const h1Index = matches.findIndex((match) => Number(match[1]) === 1);
  if (h1Index < 0) return replaceHeadings(html, headingPattern, () => 4);

  const h2Index = matches.findIndex(
    (match, index) => index > h1Index && Number(match[1]) === 2,
  );
  if (h2Index < 0) {
    return replaceHeadings(html, headingPattern, (_match, index) =>
      index === h1Index ? 1 : 4,
    );
  }

  const h3Index = matches.findIndex((_match, index) => index > h2Index);
  return replaceHeadings(html, headingPattern, (_match, index) => {
    if (index === h1Index) return 1;
    if (index === h2Index) return 2;
    if (index === h3Index) return 3;
    return 4;
  });
}

function replaceHeadings(
  html: string,
  pattern: RegExp,
  getLevel: (rawLevel: string, index: number) => number,
): string {
  let index = 0;
  return html.replace(
    pattern,
    (_fullMatch, rawLevel: string, attrs: string, inner: string) => {
      const level = getLevel(rawLevel, index++);
      return `<h${level}${attrs}>${inner}</h${level}>`;
    },
  );
}
