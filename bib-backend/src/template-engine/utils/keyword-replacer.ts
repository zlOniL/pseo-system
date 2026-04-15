/**
 * Portuguese prepositions and conjunctions that stay lowercase in place names.
 * e.g. "Monte do Outreiro", "Albufeira de Cima", "Vila Nova de Gaia"
 */
const PT_LOWERCASE_WORDS = new Set([
  'de', 'do', 'da', 'dos', 'das',
  'no', 'na', 'nos', 'nas',
  'em', 'e', 'a', 'o',
  'por', 'para', 'com', 'sob', 'sobre', 'entre',
]);

/**
 * Title-cases a place name following Portuguese conventions:
 * prepositions and articles stay lowercase; all other words are capitalised.
 * The first word is always capitalised regardless.
 *
 * Examples:
 *   "monte do outreiro"  → "Monte do Outreiro"
 *   "albufeira centro"   → "Albufeira Centro"
 *   "vila nova de gaia"  → "Vila Nova de Gaia"
 */
function titleCasePt(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (index > 0 && PT_LOWERCASE_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Replaces all occurrences of baseCity with targetCity in the HTML string.
 * Case-insensitive. Preserves the capitalisation pattern of each match:
 *   - ALL CAPS  → ALL CAPS target
 *   - Title Case (first letter upper) → titleCasePt(target)
 *   - lowercase → lowercase target
 */
export function replaceKeyword(html: string, baseCity: string, targetCity: string): string {
  const escaped = baseCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');

  const titleCased = titleCasePt(targetCity);
  const upperCased = targetCity.toUpperCase();
  const lowerCased = targetCity.toLowerCase();

  return html.replace(regex, (match) => {
    if (match === match.toUpperCase() && match.length > 1) {
      return upperCased;
    }
    if (match[0] === match[0].toUpperCase()) {
      return titleCased;
    }
    return lowerCased;
  });
}
