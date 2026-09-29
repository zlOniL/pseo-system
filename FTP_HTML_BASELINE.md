# FTP HTML Integration Baseline

Data: 2026-09-25

## Estado inicial deste checkout

- A integracao `ftp_html` ainda nao existe neste repositório.
- `PublishingService`, `ContentPublisher` e `FTP_HTML_INTEGRATION_ENABLED` ainda nao existem.
- Consulta read-only no Supabase:
  - `contents` total: 5490
  - `contents.site_id IS NULL`: 0

## Baseline antes da Fase 1

Executado em `bib-backend`:

```bash
npm test -- --runInBand
npm run build
```

Resultado:

- Jest: 9 suites e 20 testes passando.
- Build NestJS passando.

Executado em `bib-frontend`:

```bash
npm run build
```

Resultado:

- Build Next.js passando.
- No sandbox, o primeiro build falhou ao baixar a fonte Google Geist; repetido com acesso externo e passou.

## Caracterizacao adicionada

- HTML assembler atual para WordPress.
- Despacho atual de publicacao individual e em lote.
- Payload de publicacao WordPress e atualizacao de `contents` somente apos sucesso.
- Geracao por template com substituicao de cidade, remocao de backlinks locais e persistencia como `template`.

## Fase 1

Resultado:

- Contrato `ContentPublisher` adicionado.
- `PublishingService` adicionado para despacho explicito de `wordpress`, `whitelabel_api` e `ftp_html`.
- Publicador `ftp_html` criado sem operacoes remotas e bloqueado por `FTP_HTML_INTEGRATION_ENABLED`.
- Tipos backend/frontend passam a reconhecer `ftp_html`.
- Migration aditiva criada para permitir `ftp_html` em `sites.integration_type`.
- Rotas publicas de publicacao continuam em `/contents/:id/publish` e `/contents/bulk-publish`.

Validacao:

- Jest: 11 suites e 25 testes passando.
- Build NestJS passando.
- Build Next.js passando com acesso externo para baixar a fonte Google Geist.

## Fase 2

Resultado:

- Migration `supabase-migration-ftp-html-phase-2.sql` criada com:
  - `ftp_site_configs`
  - `ftp_remote_pages`
  - `ftp_template_versions`
  - `ftp_publish_runs`
  - colunas aditivas em `contents`: `ftp_remote_page_id`, `render_mode`, `deployment_status`, `last_publish_run_id`
- Tabelas FTP com RLS habilitado, grants de `anon`/`authenticated` revogados e acesso previsto via `service_role`.
- Backend expõe `GET /sites/:id/ftp-config` e `PATCH /sites/:id/ftp-config`.
- Senha FTP é cifrada com AES-256-GCM usando `FTP_CREDENTIALS_KEY` fora do banco.
- Respostas públicas retornam `has_ftp_password`, nunca a senha ou `password_encrypted`.
- Frontend recebeu tipos e cliente API para configuração FTP, ainda sem UI dedicada.

Validacao:

- Jest: 12 suites e 28 testes passando.
- Build NestJS passando.
- Build Next.js passando com acesso externo para baixar a fonte Google Geist.
- Supabase CLI/advisors: nao executado neste host porque `supabase` nao esta instalado/disponivel no PATH.

Procedimento de recuperacao da migration, antes de haver dados FTP reais:

```sql
ALTER TABLE public.contents DROP COLUMN IF EXISTS last_publish_run_id;
ALTER TABLE public.contents DROP COLUMN IF EXISTS deployment_status;
ALTER TABLE public.contents DROP COLUMN IF EXISTS render_mode;
ALTER TABLE public.contents DROP COLUMN IF EXISTS ftp_remote_page_id;
DROP TABLE IF EXISTS public.ftp_publish_runs;
DROP TABLE IF EXISTS public.ftp_template_versions;
DROP TABLE IF EXISTS public.ftp_remote_pages;
DROP TABLE IF EXISTS public.ftp_site_configs;
```

Depois de haver dados reais, exportar/backup das quatro tabelas FTP antes de executar qualquer rollback.

## Fase 3

Resultado:

- Dependencia `basic-ftp@6.2.1` adicionada ao backend.
- Contrato `RemoteFileClient` criado para isolar operacoes remotas de FTP.
- `BasicFtpRemoteFileClient` implementado com:
  - `testConnection`
  - `stat`
  - `download`
  - `ensureDirectory`
  - `upload`
  - `rename`
  - `remove`
- `BasicFtpRemoteFileClientFactory` registrado/exportado no `FtpHtmlModule`.
- Suporte limitado aos modos combinados:
  - `plain` -> FTP sem TLS
  - `explicit_tls` -> FTP com TLS explicito
- Normalizacao de caminhos remotos adicionada para manter operacoes dentro de `remote_root` e rejeitar entradas vazias, `.` e `..`.
- Mensagens de erro do cliente mascaram usuario e senha antes de retornarem para camadas acima.

Validacao:

- Jest: 14 suites e 40 testes passando.
- Build NestJS passando.
- Testes cobrem conexao, stat, arquivo ausente, download, upload com criacao de diretorio pai, rename, remove, normalizacao de paths e mascaramento de credenciais.

Observacao:

- Ainda nao houve teste contra um servidor FTP real/descartavel nesta fase. Antes de tocar qualquer arquivo do FTP de producao, fazer um teste controlado com backup/rollback.

## Fase 4

Resultado:

- Formulario de sites agora permite selecionar `HTML via FTP`.
- Campos FTP adicionados ao cadastro/edicao:
  - host
  - porta
  - FTP puro ou FTPS explicito
  - usuario
  - senha
  - raiz remota
  - pasta de backup
  - URL publica base
  - modo passivo
- Configuracao FTP e salva via `PATCH /sites/:id/ftp-config` junto com o site quando `integration_type = ftp_html`.
- Edicao de site FTP carrega a configuracao salva sem retornar senha ao navegador.
- Botao `Testar conexao` adicionado para sites existentes com FTP configurado.
- Backend expoe `POST /sites/:id/ftp-config/test`.
- Teste de conexao usa apenas autenticacao e listagem da raiz remota; nenhuma escrita e executada.
- Resultado do teste atualiza `ftp_site_configs.connection_status` para `ok` ou `failed`.
- Erros de conexao passam a ser classificados como `auth`, `dns`, `timeout`, `not_found` ou `unknown`.

Validacao:

- Jest: 15 suites e 44 testes passando.
- Build NestJS passando.
- Build Next.js passando com acesso externo para baixar a fonte Google Geist.

Observacao:

- Teste manual contra o FTP real ainda nao foi executado nesta fase porque depende das credenciais/configuracao no ambiente local. A implementacao nao executa upload, rename, delete ou qualquer escrita no FTP.

## Fase 5

Resultado:

- Endpoints adicionados ao detalhe do servico:
  - `POST /services/:id/ftp-html/check-remote-page`
  - `POST /services/:id/ftp-html/import-remote-page`
- Caminho esperado padrao: `<service.slug>.html`, relativo a `remote_root`.
- Caminho customizado permitido, normalizado e bloqueando entradas vazias, absolutas implicitas e `..`.
- Verificacao remota usa apenas `stat`, sem escrita no FTP.
- Importacao remota usa `stat` + `download`, sem escrita no FTP.
- HTML importado tem hash SHA-256 calculado a partir dos bytes baixados.
- Fronteira automatica exige exatamente um `</main>` e exatamente um `<footer`.
- Quando a fronteira e valida:
  - salva/atualiza `ftp_remote_pages`;
  - cria nova linha em `ftp_template_versions`;
  - define `active_template_version_id`;
  - preserva `document_prefix` e `document_suffix` por `slice`, sem remontar HTML.
- Quando a fronteira nao e inequívoca:
  - marca `ftp_remote_pages.import_status = manual_boundary_required`;
  - nao cria versao de template.
- Painel frontend adicionado no detalhe de servicos de sites `ftp_html` para verificar/importar a pagina remota.

Validacao:

- Jest: 17 suites e 49 testes passando.
- Build NestJS passando.
- Build Next.js passando com acesso externo para baixar a fonte Google Geist.

Observacao:

- Teste manual de leitura contra `public_html/reparacao-de-estores.html` ainda nao foi executado neste host por depender das credenciais FTP configuradas localmente. A fase continua sem qualquer escrita remota.

## Fase 6

Resultado:

- `FtpHtmlDocumentRenderer` criado e registrado no `FtpHtmlModule`.
- Renderizacao FTP monta documento completo por:
  - `document_prefix`
  - fragmento PSEO
  - `document_suffix`
- Fragmentos FTP com `html`, `head`, `body`, `nav`, `footer`, `script`, `meta`, `title` ou `DOCTYPE` sao rejeitados.
- Campos SEO suportados quando ja existem no prefixo:
  - `title`
  - `meta name="description"`
  - canonical
  - OG title/description/url
  - Twitter title/description
- Substituicoes textuais permitidas para banner sao aplicadas somente depois de `</head>`, evitando alterar title/meta.
- Documento final e validado para conter uma unica estrutura principal:
  - DOCTYPE
  - html
  - head
  - body
  - footer
- Placeholders `{{...}}` e `[[...]]` pendentes bloqueiam a renderizacao.
- Assembler WordPress permanece intacto.

Validacao:

- Jest: 18 suites e 57 testes passando.
- Build NestJS passando.
- Build Next.js passando com acesso externo para baixar a fonte Google Geist.

## Fase 7

Resultado:

- Preview `full_document` adicionado ao `PreviewPane`.
- Conteudos com `render_mode = full_document` sao renderizados como documento completo, sem wrapper HTML adicional.
- O preview injeta `<base href="...">` somente no `srcDoc`, usando `ftp_site_configs.public_base_url` quando disponivel.
- Scripts do HTML importado sao removidos apenas no preview.
- Iframe de documento completo usa sandbox sem `allow-scripts`; o preview legado continua com o comportamento interativo anterior.
- Links e formularios do documento importado sao bloqueados por CSS no preview.
- Controles de largura desktop, tablet e mobile adicionados para documento completo.
- Avisos exibidos para scripts removidos, URL publica ausente e recursos quebrados detectaveis no iframe.
- Tipos frontend/backend agora incluem `render_mode`, `ftp_remote_page_id`, `deployment_status` e `last_publish_run_id`.

Validacao:

- Jest: 18 suites e 57 testes passando.
- Build NestJS passando.
- Build Next.js passando com acesso externo para baixar a fonte Google Geist.

## Fase 8

Resultado:

- Publicador `ftp_html` deixou de ser stub e agora publica somente com `FTP_HTML_INTEGRATION_ENABLED=true`.
- Publicacao FTP exige conteudo aprovado e associado a `ftp_remote_page_id`.
- Lock em memoria por `site_id + remote_path` impede duas publicacoes simultaneas no mesmo arquivo dentro do processo.
- Arquivo remoto e baixado imediatamente antes da publicacao e comparado com `last_seen_hash`.
- Divergencia de hash marca `deployment_status = conflict`, registra run `conflict` e interrompe sem upload.
- Backup e gravado em `backup_root` relativo a raiz da conta FTP, nao dentro de `remote_root`.
- Upload usa arquivo temporario no mesmo diretorio do destino e valida SHA-256 antes do swap.
- Swap remoto usa `rename`; se falhar apos mover o original, tenta rollback pelo arquivo de recuperacao.
- `ftp_publish_runs` registra estados, caminhos, hashes, erro e finalizacao.
- `contents` so e marcado como `published` apos baixar o destino final e conferir o hash.
- `ftp_remote_pages.last_seen_hash` e atualizado apos publicacao confirmada.
- Cliente FTP passou a suportar caminhos de backup relativos a raiz da conta via `uploadAccountPath` e `statAccountPath`.

Validacao:

- Jest: 18 suites e 60 testes passando.
- Build NestJS passando.
- Build Next.js passando com acesso externo para baixar a fonte Google Geist.

## Fase 9

Resultado:

- `FtpHtmlContentService` criado para compor conteudo FTP a partir do template importado.
- Geracao PSEO para sites `ftp_html` gera somente o fragmento central e salva o documento completo renderizado.
- Conteudos FTP sao salvos com:
  - `render_mode = full_document`
  - `ftp_remote_page_id`
  - `deployment_status = not_deployed`
  - `external_page_url`
- Criacao de pagina principal pelo cockpit de escala usa o template FTP importado e exibe preview completo.
- Localidades criam/associam uma linha propria em `ftp_remote_pages`, reutilizando o template ativo da pagina principal.
- Texto do banner no prefixo e ajustado de `Servico` para `Servico em Localidade` sem alterar head/meta.
- Publicador FTP agora tambem cria arquivo novo quando a pagina remota ainda nao existe, sem exigir backup de original.
- UI deixa de rotular publicacao FTP como WordPress e oculta categoria WordPress para servicos FTP.

Validacao:

- Jest: 19 suites e 63 testes passando.
- Build NestJS passando.
- Build Next.js passando com acesso externo para baixar a fonte Google Geist.

## Fase 10

Resultado:

- Publicacao FTP em lote reaproveita o `PublishingService.bulkPublish` existente.
- Itens FTP continuam sendo publicados sequencialmente, evitando concorrencia simultanea por site no processo atual.
- Lote bloqueia duas paginas apontando para o mesmo `ftp_remote_page_id`.
- Publicador FTP marca `deployment_status = pending` ao iniciar uma tentativa.
- Falhas individuais continuam retornando resultado por item, sem cancelar os demais itens do lote.
- Regressao WordPress preservada: itens WordPress continuam usando `WordPressService.bulkPublish`.

Validacao:

- Jest: 19 suites e 64 testes passando.
- Build NestJS passando.
- Build Next.js passando com acesso externo para baixar a fonte Google Geist.
