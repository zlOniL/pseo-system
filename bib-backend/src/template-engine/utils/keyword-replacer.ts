/**
 * Replaces all occurrences of baseCity with targetCity in the HTML string.
 * Case-insensitive. Preserves the capitalisation pattern of each match:
 *   - ALL CAPS  → ALL CAPS target
 *   - Title Case → Title Case target
 *   - lowercase → lowercase target
 */
export function replaceKeyword(html: string, baseCity: string, targetCity: string): string {
  const escaped = baseCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');

  return html.replace(regex, (match) => {
    if (match === match.toUpperCase() && match.length > 1) {
      return targetCity.toUpperCase();
    }
    if (match[0] === match[0].toUpperCase()) {
      return targetCity.charAt(0).toUpperCase() + targetCity.slice(1).toLowerCase();
    }
    return targetCity.toLowerCase();
  });
}
