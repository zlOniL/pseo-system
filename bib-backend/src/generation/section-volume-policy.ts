import { SectionKey } from '../service-templates/service-templates.types';

const SECTION_WORD_WEIGHTS: Record<SectionKey, number> = {
  intro: 0.12,
  procura_buscadores: 0.12,
  avarias_comuns: 0.1,
  servicos: 0.08,
  como_funciona: 0.05,
  tipos: 0.05,
  prevencao: 0.1,
  sistemas: 0.1,
  servicos_especializados: 0.08,
  perguntas_frequentes: 0.08,
  pesquisas_relacionadas: 0.02,
  conclusao: 0.07,
  mais_sobre: 0.03,
};

export interface SectionVolumeConfig {
  targetMultiplier: number;
  minAcceptanceRatio: number;
  maxAcceptanceRatio: number;
  repairAttempts: number;
  finalExpansionRounds: number;
  maxSectionsPerExpansionRound: number;
  sectionConcurrency: number;
}

export function getSectionVolumeConfig(): SectionVolumeConfig {
  return {
    targetMultiplier: numberFromEnv('SECTION_TARGET_WORD_MULTIPLIER', 1),
    minAcceptanceRatio: numberFromEnv('SECTION_MIN_ACCEPTANCE_RATIO', 0.9),
    maxAcceptanceRatio: numberFromEnv('SECTION_MAX_ACCEPTANCE_RATIO', 1.1),
    repairAttempts: integerFromEnv('SECTION_REPAIR_ATTEMPTS', 2),
    finalExpansionRounds: integerFromEnv('SECTION_FINAL_EXPANSION_ROUNDS', 3),
    maxSectionsPerExpansionRound: integerFromEnv(
      'SECTION_FINAL_EXPANSION_SECTIONS',
      4,
    ),
    sectionConcurrency: integerFromEnv('SECTION_GENERATION_CONCURRENCY', 5),
  };
}

export function sectionTargetWords(
  sectionKey: SectionKey,
  minWords: number,
  config = getSectionVolumeConfig(),
): number {
  return Math.max(
    120,
    Math.ceil(minWords * config.targetMultiplier * SECTION_WORD_WEIGHTS[sectionKey]),
  );
}

export function sectionMinimumWords(
  sectionKey: SectionKey,
  minWords: number,
  config = getSectionVolumeConfig(),
): number {
  return Math.max(
    100,
    Math.ceil(sectionTargetWords(sectionKey, minWords, config) * config.minAcceptanceRatio),
  );
}

export function sectionMaximumWords(
  sectionKey: SectionKey,
  minWords: number,
  config = getSectionVolumeConfig(),
): number {
  return Math.max(
    sectionTargetWords(sectionKey, minWords, config),
    Math.ceil(
      sectionTargetWords(sectionKey, minWords, config) *
        config.maxAcceptanceRatio,
    ),
  );
}

export function finalMinimumWords(
  minWords: number,
  config = getSectionVolumeConfig(),
): number {
  return Math.ceil(minWords * config.minAcceptanceRatio);
}

export function finalMaximumWords(
  minWords: number,
  config = getSectionVolumeConfig(),
): number {
  return Math.ceil(minWords * config.maxAcceptanceRatio);
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function integerFromEnv(name: string, fallback: number): number {
  const value = Math.floor(Number(process.env[name]));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
