import { slugify } from './slug';

export type LocationPreposition = 'em' | 'na' | 'no';

const PREP_NA = new Set(
  [
    'Amadora',
    'Maia',
    'Moita',
    'Margem Sul',
    'Quinta do Conde',
    'Pontinha',
    'Odivelas',
    'Reboleira',
    'Brandoa',
    'Damaia',
    'Venda Nova',
  ].map(normalizeLocation),
);

const PREP_NO = new Set(
  [
    'Porto',
    'Barreiro',
    'Seixal',
    'Montijo',
    'Pinhal Novo',
    'Gavá',
    'Alentejo',
    'Algarve',
  ].map(normalizeLocation),
);

export function getLocationPreposition(name: string): LocationPreposition {
  const normalized = normalizeLocation(name);
  if (PREP_NA.has(normalized)) return 'na';
  if (PREP_NO.has(normalized)) return 'no';
  return 'em';
}

export function formatLocationPhrase(city: string): string {
  return `${getLocationPreposition(city)} ${city}`;
}

export function buildLocalKeyword(service: string, city?: string | null): string {
  return city ? `${service} ${formatLocationPhrase(city)}` : service;
}

export function buildLocalSlug(service: string, city?: string | null): string {
  return slugify(buildLocalKeyword(service, city));
}

function normalizeLocation(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
