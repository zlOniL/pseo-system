import { slugify } from '../../common/slug';

// Mirrors the prep sets in CitiesService — pure utility (no DI)
const PREP_NA = new Set([
  'Amadora', 'Maia', 'Moita', 'Margem Sul', 'Quinta do Conde',
  'Pontinha', 'Odivelas', 'Reboleira', 'Brandoa', 'Damaia', 'Venda Nova',
]);
const PREP_NO = new Set([
  'Porto', 'Barreiro', 'Seixal', 'Montijo', 'Pinhal Novo',
  'Gavà', 'Alentejo', 'Algarve',
]);

function getPrep(name: string): string {
  if (PREP_NA.has(name)) return 'na';
  if (PREP_NO.has(name)) return 'no';
  return 'em';
}

/**
 * Builds the city-list backlinks section for the main (cityless) service page.
 * Links: {wpBaseUrl}/{serviceSlug}-{prep}-{citySlug}/
 *
 * Distinct from buildBacklinksHtml, which handles locality-level links for
 * content pages. This function works with city names only — no neighbourhoods.
 */
export function buildMainPageCityLinksHtml(
  cities: string[],
  serviceSlug: string,
  serviceName: string,
  wpBaseUrl: string,
): string {
  if (cities.length === 0) return '';

  const base = wpBaseUrl.replace(/\/$/, '');

  const items = cities.map((city) => {
    const prep = getPrep(city);
    const citySlug = slugify(city);
    const url = `${base}/${serviceSlug}-${prep}-${citySlug}/`;
    const label = `${serviceName} ${city}`;
    return `<li><a style="color: #111 !important; font-weight: 600; text-decoration: underline;" href="${url}">${label}</a></li>`;
  });

  const half = Math.ceil(items.length / 2);
  const col1 = items.slice(0, half);
  const col2 = items.slice(half);

  return [
    `<h2 style="color: #320000;">Cidades Onde Atendemos</h2>`,
    `<div style="display: flex; flex-wrap: wrap; gap: 20px;">`,
    `<div style="flex: 1; min-width: 260px;"><ul style="list-style: none; padding-left: 0;">`,
    ...col1,
    `</ul></div>`,
    `<div style="flex: 1; min-width: 260px;"><ul style="list-style: none; padding-left: 0;">`,
    ...col2,
    `</ul></div>`,
    `</div>`,
  ].join('\n');
}
