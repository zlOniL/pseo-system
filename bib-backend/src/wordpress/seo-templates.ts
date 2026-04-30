/**
 * Replaces the "Lisboa" city placeholder (case-preserving) with the actual city.
 */
export function applyCity(text: string, city: string): string {
  if (!city) return text;
  return text.replace(/Lisboa/gi, (match) => {
    if (match === match.toUpperCase()) return city.toUpperCase();
    if (match[0] === match[0].toUpperCase()) return city.charAt(0).toUpperCase() + city.slice(1);
    return city.toLowerCase();
  });
}
