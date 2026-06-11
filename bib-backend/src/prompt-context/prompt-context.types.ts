export interface PromptContext {
  guardrailPrompt: string | null;
  serviceExamplePrompt: string | null;
  servicePromptSlug: string | null;
  warnings: string[];
}

export interface ResolvePromptContextInput {
  service: string;
}

export const SERVICE_EXAMPLE_USAGE_RULE = `REGRA DE USO DO EXEMPLO DE SERVICO:
- O prompt de exemplo abaixo e apenas referencia semantica para vocabulario, problemas, subservicos, entidades tecnicas, marcas, tom e profundidade.
- Nao copies Markdown, numeracao de modulos, placeholders, titulos ou estrutura do exemplo.
- A saida final deve obedecer sempre ao contrato da integracao atual e ao formato pedido nesta chamada.`;
