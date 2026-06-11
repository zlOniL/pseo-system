import { slugify } from '../common/slug';

const SERVICE_PROMPT_ALIASES: Record<string, string> = {
  canalizador: 'canalizadores',
  eletricista: 'eletricistas',
};

export function resolveServicePromptSlug(service: string): string {
  const slug = slugify(service);
  return SERVICE_PROMPT_ALIASES[slug] ?? slug;
}
