export type ExternalReferenceType =
  | 'brand'
  | 'local_authority'
  | 'technical_authority';

export type ExternalReferenceModule =
  | 'modulo_4_servicos_realizados'
  | 'modulo_12_zonas_contexto_local'
  | 'modulo_15_mais_sobre_servico';

export interface ExternalReferenceCandidate {
  entity: string;
  url: string;
  type: ExternalReferenceType;
  target_module: ExternalReferenceModule;
  rationale?: string;
}

export interface VerifiedExternalReference extends ExternalReferenceCandidate {
  final_url: string;
  domain: string;
  page_title: string | null;
  page_description: string | null;
  http_status: number;
  relevance_score: number;
  is_official: boolean;
}

export interface ExternalLinkValidationResult {
  valid: boolean;
  issue?: string;
  externalUrls: string[];
}
