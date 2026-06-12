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
- O prompt de exemplo abaixo e referencia para vocabulario, problemas, subservicos, entidades tecnicas, marcas, tom, profundidade e distribuicao dos 15 modulos.
- Mantem a estrutura de 15 modulos definida no prompt geral e refletida pelo exemplo do servico.
- Nao copies Markdown bruto, placeholders ou texto literal do exemplo.
- A saida final deve obedecer sempre ao contrato da integracao atual e ao formato pedido nesta chamada.`;
