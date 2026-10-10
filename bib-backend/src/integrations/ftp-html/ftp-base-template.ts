export interface BaseFtpTemplate {
  documentPrefix: string;
  documentSuffix: string;
}

/**
 * Shell usado quando um serviço ainda não possui nenhuma página no FTP.
 * A estrutura continua sendo um documento completo; somente o conteúdo e o
 * banner são preenchidos pelo pipeline.
 */
export const FTP_BASE_TEMPLATE: BaseFtpTemplate = {
  documentPrefix: `<!DOCTYPE html>
<html lang="pt-PT">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Serviço de assistência</title>
  <meta name="description" content="Serviço de assistência profissional.">
  <link rel="canonical" href="">
  <style>
    .pseo-template-banner{width:100%;max-width:1120px;margin:0 auto;padding:24px 16px 0}
    .pseo-template-banner img{display:block;width:100%;max-height:360px;object-fit:cover;border-radius:12px}
  </style>
</head>
<body>
  <main>
    {{BANNER_SECTION}}
  </main>`,
  documentSuffix: `
  <footer></footer>
</body>
</html>`,
};

export const FTP_BASE_TEMPLATE_SOURCE = 'base_template' as const;
