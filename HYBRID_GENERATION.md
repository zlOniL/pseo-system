# Modo Híbrido

## Utilização no cockpit

1. Em **Produção → Nova geração**, escolher um serviço cuja página principal esteja publicada.
2. Selecionar **Localidade → Híbrido**.
3. Clicar **Preparar versões pendentes**. A preparação decorre em segundo plano e o painel atualiza o progresso. Se houver uma falha, repetir: versões concluídas são reaproveitadas.
4. Rever as estratégias por secção. É possível promover uma versão reutilizável a **Local por IA**. A classificação automática é conservadora: referências geográficas implicam geração local.
5. Quando existir pelo menos uma versão preparada de cada secção, selecionar destinos e adicionar à fila.
6. Na página gerada, expandir **Página Híbrida — origem das secções** para ver versões e estratégias. **Criar rascunho com novo contexto local** preserva as versões genéricas e cria outro rascunho, sem alterar nem publicar a página anterior.

## Comportamento

- Os modos anteriores continuam disponíveis e mantêm os seus fluxos.
- A preparação grava `section_library.hybrid_config`, sem modificar o HTML/JSON original. Um hash da origem invalida a preparação depois de alterações ou reextração.
- Secções genéricas são neutralizadas e auditadas por IA uma vez por versão. Apenas `{{CITY}}` e `{{LOCATION}}` são preenchidos durante a geração.
- Contexto local é sempre gerado por IA. Outras secções com factos geográficos também são locais. O sorteio usa somente versões preparadas do serviço e do formato de saída correspondente.
- A IA recebe campos de texto e links, nunca controlo sobre tags, classes, hierarquia, tipos de blocos ou imagens. URLs de contacto WhatsApp são preservados.
- Os links locais são escolhidos entre referências pesquisadas e verificadas pelo serviço existente de referências externas. Sem referências locais, o trabalho falha com mensagem explícita; não há fallback para a cidade original.
- A revisão geográfica é uma segunda chamada à IA. Reduz contaminação, mas não substitui revisão editorial: as evidências disponíveis são títulos/descrições das referências, não um cadastro geográfico completo.
- Cache HTTP persistente existente: `external_link_cache`. Cache adicional de pesquisa por serviço/localidade: 24 horas em memória, limitado a 200 entradas. Reiniciar o processo limpa este último.
- `contents.hybrid_manifest` guarda origem e conteúdo das secções. `queue.hybrid_state` guarda versões sorteadas e secções concluídas. Retry mantém esse estado; iniciar uma geração nova faz novo sorteio. Alterar/remover uma versão utilizada exige uma geração nova.
- Cada secção local tem até três tentativas. Falhas não provocam substituição silenciosa por outra cidade. O resultado fica sempre como rascunho.

## Operação

- Migração: `supabase/migrations/20261017123404_hybrid_generation.sql`, aplicada ao projeto configurado nesta implementação. Acrescenta três campos JSONB e permite `hybrid` nas constraints dos modos; não altera páginas existentes.
- Publicar/reiniciar backend e frontend com este código para disponibilizar a funcionalidade no ambiente servido.
- `QUEUE_CONCURRENCY_HYBRID=1` por padrão. Aumentar apenas conforme a capacidade do fornecedor de IA.
- A preparação ocorre no processo backend, não num serviço de tarefas durável. Depois de reiniciar, clicar novamente para continuar as versões pendentes. Não executar preparações concorrentes do mesmo serviço em múltiplas réplicas.
- `EXTERNAL_LINK_RESEARCH_ENABLED=false` impede a geração Híbrida, porque referências locais são obrigatórias.
- Preparar a biblioteca e gerar páginas consome chamadas de IA. Não foram preparados todos os templates nem geradas/publicadas páginas reais automaticamente durante a implementação.

## Verificação

Testes automatizados cobrem preservação de HTML/JSON, neutralização, URLs não autorizados, fonte alterada, falta de referências, retoma e integração WordPress/FTP/Whitelabel. O backend e o frontend compilam. A migração foi confirmada por consulta ao Supabase.

A verificação integral com IA e base através do Node local ficou limitada por timeouts de ligação ao Supabase nesta máquina. Recomenda-se começar por um pequeno lote de rascunhos após disponibilizar o código no ambiente de execução habitual.
