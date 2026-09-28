# Reintegração de “Também atendemos”

Implementação sobre o código atual, recuperando a funcionalidade removida em
`32f205c9354d91368e88e22d90b02664c4ca7fe1` sem reverter a navegação por site.

## Comportamento

- A seção é exclusiva de sites com `integration_type: wordpress`. Whitelabel, FTP HTML e conteúdos sem site identificado não geram esses links.
- Página principal (sem cidade): agrupamentos principais de `CITIES.md`, incluindo regiões como Margem Sul e Algarve; sem expandir os bairros.
- Página local: localidades da mesma região, excluindo a própria cidade. Localidade desconhecida ou lista vazia: sem bloco vazio.
- Os destinos são os cadastrados, independentemente de já estarem publicados. Confirmar as páginas de destino no teste local/publicação; não há consulta HTTP automática para testar os links.
- URLs usam o domínio WordPress do site selecionado, barra final e as preposições atuais (`em-lisboa`, `no-porto`, `na-amadora`).
- O backend gera o bloco, fora das seções editáveis por IA. A biblioteca guarda somente os módulos de texto; a montagem final recalcula os links.
- `skip_backlinks: true` na geração individual omite o bloco.
- HTML WordPress usa uma seção em duas colunas. A geração e reconstrução de conteúdo Whitelabel retiram esse bloco do resultado, caso esteja presente.

## Fases implementadas

1. Regra de seleção e URLs centralizada em `LocalityLinksService`.
2. Geração principal e local, por IA completa ou por seções, incluindo templates salvos.
3. Montagem por template e biblioteca; proteção dos marcadores de edição; preview JSON com o bloco dinâmico.
4. Atualização de conteúdos existentes com prévia e gravação como rascunho.
5. Whitelabel desativado para esta seção por decisão de escopo. Os auxiliares JSON permanecem disponíveis para uma futura reativação.

## Atualizar conteúdo existente

Na tela do conteúdo de um site WordPress, clicar em **Atualizar “Também atendemos”**, revisar a prévia e
clicar em **Guardar rascunho**. O texto, imagens, metadados e identificadores de
publicação são preservados. Alterações efetivas voltam a rascunho; conteúdo já
atualizado mantém o seu estado. Aprovar/publicar continua sendo uma ação separada.

API para ferramentas de manutenção (por ID, também pode ser chamada para cada ID de um lote selecionado):

- `GET /contents/:id/locality-links/preview`: retorna `{ content, changed, link_count }`, sem gravar.
- `POST /contents/:id/locality-links`: recalcula sobre a versão atual e salva se houver alteração; não publica.

Em outras integrações, os endpoints retornam zero links e podem retirar o bloco
antigo ao aplicar a atualização; nunca o inserem. O botão é exibido apenas no WordPress.
Conteúdos já salvos não são alterados automaticamente. Para retirar a seção de um
Whitelabel gerado anteriormente, regenerar o conteúdo ou usar o endpoint de atualização.

A atualização altera o conteúdo escolhido. Templates antigos são tratados quando
usados na próxima geração: links antigos são retirados e os destinos da cidade
de saída são inseridos. Para atualizar o registro de um template em si, usar a
regeneração de template existente.

Não requer migração de banco ou nova variável de ambiente. Nenhum conteúdo remoto
é atualizado automaticamente ao instalar esta mudança.

## Teste local

1. Gerar uma página principal: conferir cidades principais e domínio escolhido.
2. Gerar Lisboa e Porto: conferir localidades regionais, ausência de link para a própria cidade e preposições.
3. Repetir nos modos IA, template e biblioteca. No template, trocar a cidade e confirmar que os links não pertencem à cidade de origem.
4. Editar/regenerar contexto local e FAQ; confirmar que a seção continua única e que as outras seções permanecem intactas.
5. Em conteúdo antigo, abrir a prévia, fechar sem guardar e confirmar que não mudou. Reabrir e guardar; revisar o rascunho. Repetir a operação e confirmar ausência de duplicações.
6. Repetir os casos principal, local, biblioteca e edição em um site Whitelabel e confirmar a ausência da seção e do botão de atualização.
7. Publicar uma página de teste WordPress e conferir o bloco e seus destinos no site. Publicação real e validação HTTP dos destinos ficam para este teste local.

Verificações automatizadas: `npm test -- --runInBand` e `npm run build` no backend;
`npx tsc --noEmit` no frontend. Os testes usam mocks de IA, banco e publicação,
sem chamadas pagas ou escrita nos sites.
