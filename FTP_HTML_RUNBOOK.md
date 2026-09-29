# FTP HTML Runbook

## Objetivo

Operar a integracao `ftp_html` sem publicar acidentalmente no site real.

## Antes do primeiro teste real

1. Aplicar no Supabase, nesta ordem:
   - `bib-backend/supabase-migration-ftp-html-integration-type.sql`
   - `bib-backend/supabase-migration-ftp-html-phase-2.sql`
2. Definir variaveis no backend local:
   - `FTP_HTML_INTEGRATION_ENABLED=true`
   - `FTP_CREDENTIALS_KEY=<segredo longo>`
   - `FTP_TIMEOUT_MS=30000`
3. Cadastrar o site com `integration_type = ftp_html`.
4. Salvar a configuracao FTP do site.
5. Usar `Testar conexao`; isso apenas lista a raiz, sem escrita.

## Piloto: `reparacao-de-estores.html`

1. Congelar edicoes manuais da pagina durante a janela de teste.
2. No servico "Reparacao de Estores", verificar o caminho:
   - `reparacao-de-estores.html`
3. Importar a pagina remota como template.
4. Confirmar no preview de importacao:
   - menu aparece;
   - banner aparece;
   - imagem do servico aparece;
   - conteudo substituivel comeca depois do banner;
   - rodape aparece.
5. Criar a pagina principal pelo cockpit.
6. Abrir o conteudo gerado e revisar o preview em:
   - desktop;
   - tablet;
   - mobile.
7. Aprovar editorialmente.
8. Publicar via FTP somente se o preview estiver correto.
9. Verificar a URL publica:
   - HTTP 200;
   - title e description;
   - menu;
   - banner;
   - numeros/CTAs;
   - conteudo PSEO;
   - rodape;
   - cookies e botoes;
   - links principais;
   - CSS, imagens e fontes.

## O que acontece na publicacao

1. O sistema baixa o arquivo remoto imediatamente antes de publicar.
2. Se o hash remoto mudou desde a importacao, a publicacao para em `conflict`.
3. Se existe arquivo remoto, o sistema grava backup em `backup_root`.
4. O novo HTML e enviado primeiro para arquivo temporario.
5. O temporario e baixado e validado por SHA-256.
6. O destino final e trocado por `rename`.
7. O arquivo final e baixado e validado por SHA-256.
8. So depois disso o conteudo vira `published`.

## Recuperacao

Em falha apos mover o original, o sistema tenta rollback automaticamente usando o arquivo de recuperacao no mesmo diretorio.

Se for preciso recuperar manualmente:

1. Localizar o `ftp_publish_runs.backup_path`.
2. Baixar o backup.
3. Enviar o backup para o caminho original em `ftp_remote_pages.remote_path`.
4. Confirmar HTTP 200 na URL publica.
5. Marcar o conteudo afetado como `deployment_status = rolled_back`, se necessario.

## Expansao para outro servico

1. Criar ou selecionar o servico no site FTP.
2. Confirmar o caminho esperado `<slug-do-servico>.html`.
3. Importar a pagina principal real desse servico.
4. Gerar pagina principal e validar preview.
5. Gerar localidades somente depois da pagina principal estar publicada.
6. Publicar uma localidade piloto antes de qualquer lote.

## Retencao de backups

Enquanto a integracao estiver em piloto:

- manter todos os backups;
- nao limpar temporarios manualmente durante a janela de teste;
- registrar qualquer rollback no historico do conteudo.

Depois da estabilizacao:

- definir retencao minima de 30 dias para backups;
- limpar temporarios `.pseo-upload-*` antigos somente se nao houver publicacao em andamento;
- manter backups de paginas piloto por mais tempo.

## Alertas manuais recomendados

Investigar antes de continuar se aparecer:

- `deployment_status = conflict`;
- `deployment_status = failed`;
- `ftp_publish_runs.status = rolled_back`;
- falhas repetidas de conexao FTP;
- preview sem CSS, imagem de banner ou rodape;
- URL publica servindo hash/conteudo diferente do arquivo validado.
