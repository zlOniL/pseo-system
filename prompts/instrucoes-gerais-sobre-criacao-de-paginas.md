# PROMPT PARA CRIAR PÁGINAS SEO DE SERVIÇOS NO MESMO PADRÃO

Estas são intruções para que cries uma página SEO completa, humanizada e altamente otimizada para Google.

A página deve seguir exatamente o padrão abaixo, mantendo sempre a mesma estrutura de módulos para todos os serviços, para que todas as páginas do site fiquem uniformes, profissionais e fáceis de escalar.

A linguagem deve ser em português de Portugal, com tom profissional, claro, comercial, humano e orientado para conversão. O texto deve parecer escrito para o cliente final, não apenas para SEO.

Não deves criar texto genérico curto. A página deve ser completa, profunda, bem explicada e com boa densidade da palavra-chave principal, sem exagero. Usa variações naturais da palavra-chave, como:

reparação, arranjo, manutenção, conserto, assistência técnica, serviço técnico, técnicos especializados, orçamento, diagnóstico, avaria, urgência, 24H/7.

A palavra-chave principal deve aparecer de forma natural ao longo da página, com densidade equilibrada, próxima de 1%, sem parecer repetição artificial.

## REGRAS IMPORTANTES

## REGRAS DE SAIDA, FORMATACAO E CARACTERES

Estas regras devem ter prioridade sobre exemplos de paginas, blueprints e instrucoes de servico.

Para paginas WordPress:

- A saida pode conter HTML apenas quando o fluxo WordPress pedir HTML.
- Nao usar markdown, cercas de codigo, comentarios explicativos ou texto fora do HTML final.

Para paginas Whitelabel/API:

- A saida deve ser apenas JSON valido, seguindo o contrato/blueprint recebido pela API.
- Os campos textuais do JSON devem conter texto puro.
- Nao gerar HTML em nenhum campo textual: nao usar tags como <p>, <h1>, <h2>, <h3>, <ul>, <li>, <strong>, <a>, <br>, <div>, classes CSS, estilos inline, shortcodes ou atributos HTML.
- Mesmo que o exemplo de servico tenha HTML, ele deve servir apenas como referencia semantica; para Whitelabel/API, converter sempre para texto estruturado conforme o blueprint.
- Nao usar markdown dentro dos campos textuais.

Caracteres permitidos e proibidos:

- Nao usar emojis, emoticons, pictogramas ou simbolos decorativos.
- Nao usar caracteres especiais incomuns, separadores ornamentais, bullets unicode, setas, checks, estrelas decorativas, coracoes, simbolos matematicos decorativos ou caracteres de desenho de caixas.
- Usar apenas caracteres comuns da lingua portuguesa, numeros e pontuacao comum, como: . , ; : ? ! @ # * + - / & % € ( ) [ ] aspas e apostrofos.
- Acentos normais do portugues sao permitidos.
- Quando for preciso criar listas em texto puro, usar hifen comum (-) ou arrays JSON, nunca bullets decorativos.
- Se algum blueprint pedir destaque visual, responder com texto natural no campo correto, sem criar simbolos decorativos.

A página deve ter:

Apenas 1 H1.
O H1 deve ser o título principal da página.
O H1 deve conter a palavra-chave principal + complemento de confiança/urgência com 24H/7.
Pode haver vários H2, H3 e H4 se necessário porém sempre na ordem hierarquica desde o inicio da página.
Todos os módulos devem ser numerados.
Manter sempre os mesmos módulos em todas as páginas de serviços.
Não inserir links internos de nenhum domínio próprio, a menos que seja pedido.
Não colocar imagens do site, a menos que seja pedido.
Usar links externos apenas quando fizer sentido: marcas, diretórios, entidades oficiais, Google.pt e ChatGPT.com.
Não usar linguagem robótica.
Não exagerar em promessas absolutas.
Usar “conforme disponibilidade técnica” quando falar de atendimento por localidade.
Sempre mencionar diagnóstico antes do orçamento.
Sempre mencionar orçamento justo e antecipado.
Sempre mencionar materiais de qualidade.
Sempre mencionar profissionais especializados, honestos e qualificados.
Sempre mencionar piquetes móveis por localidade.
Sempre terminar blocos importantes com chamada para ação.


## ESTRUTURA FIXA DOS MÓDULOS

### Módulo 1 — H1 / Topo da Página

Criar o H1 com a palavra-chave principal e complemento com 24H/7.

Exemplo:

[Nome do Serviço] | Técnicos Especializados 24H/7

Neste módulo, logo no início, dar ao cliente as informações principais:

A empresa é especializada no serviço.
Atendimento 24 horas por dia, 7 dias por semana, 365 dias por ano.
Inclui sábados, domingos e feriados.
Atendimento para casas, apartamentos, lojas, escritórios, condomínios, alojamentos locais e espaços comerciais.
Profissionais especializados, honestos e qualificados.
Diagnóstico antes do orçamento.
Orçamento justo e antecipado.
Materiais de alta qualidade.
Piquetes móveis por localidade.
Chamada final: “Ligue já e peça assistência com uma equipa de confiança.”

O primeiro bloco deve ser muito forte, porque é onde o cliente decide se continua a ler ou entra em contacto.

### Módulo 2 — Assistência Especializada

Explicar por que o serviço deve ser feito por técnicos especializados.

Neste módulo, mostrar que a avaria pode ter várias causas e que não se deve trocar peças ou fazer reparações sem diagnóstico.

Exemplo para portas:
Uma porta pode não fechar por causa da fechadura, mas também por desalinhamento, dobradiças, aro, mola ou trinco.

Exemplo para esquentadores:
Um esquentador pode não aquecer por causa do queimador, mas também por pressão, sensores, gás, exaustão ou ventilação.

Exemplo para canalizadores:
Uma fuga pode parecer simples, mas pode vir de vedantes, flexíveis, válvulas, pressão ou tubagem antiga.

Neste módulo, reforçar:

Diagnóstico técnico.
Evitar trocas desnecessárias.
Segurança.
Durabilidade da reparação.
Prevenção de avarias maiores.

### Módulo 3 — Tipos do Serviço

Neste módulo, listar e explicar os principais tipos relacionados ao serviço.

Cada tipo deve ter subtítulo próprio e explicação com 2 a 4 parágrafos curtos.

Exemplos:

Para Reparação de Portas:

Portas de vidro
Portas de correr
Portas basculantes
Portas oscilobatentes
Portas de alumínio
Portas de madeira
Portas em PVC
Portas interiores e exteriores

Para Reparação de Janelas:

Janelas de alumínio
Janelas em PVC
Janelas de madeira
Janelas de correr
Janelas oscilobatentes
Janelas basculantes
Janelas com vidro duplo

Para Reparação de Estores:

Estores elétricos
Estores manuais
Estores blackout
Persianas
Estores em PVC
Estores de alumínio
Estores de rolo
Estores térmicos

Para Canalizadores:

Canalizadores para habitações
Canalizadores para lojas
Canalizadores para escritórios
Canalizadores para condomínios
Canalizadores para alojamentos locais
Canalizadores para cozinhas
Canalizadores para casas de banho

Para Desentupimentos:

Desentupimento de sanitas
Desentupimento de lava-loiças
Desentupimento de lavatórios
Desentupimento de banheiras
Desentupimento de duches
Desentupimento de ralos
Desentupimento de sifões
Desentupimento de caixas de esgoto
Desentupimento de prumadas

Adaptar sempre ao serviço pedido.

### Módulo 4 — Serviços Realizados

Explicar de forma completa os serviços realizados dentro daquela área.

Neste módulo, criar um texto forte com os serviços mais procurados.

Exemplo para portas:

Afinação de portas
Reparação de fechaduras
Substituição de dobradiças
Reparação de puxadores
Ajuste de trincos
Reparação de portas de correr
Reparação de molas
Reparação de portas de vidro

Exemplo para esquentadores:

Falta de água quente
Chama que apaga
Erro no visor
Baixa pressão
Fuga de água
Cheiro a gás
Manutenção
Exaustão e ventilação

Este módulo deve incluir também uma secção chamada:

Marcas e componentes compatíveis

Aqui devem ser colocados backlinks externos clicáveis para marcas relacionadas ao serviço, não links internos do site.

Exemplos:

Para portas:

Yale
Tesa
Cisa
Dierre
Mottura
dormakaba
GEZE
ASSA ABLOY

Para janelas:

Technal
Cortizo
Schüco
Reynaers
Roto
GU
Sapa
Winkhaus

Para esquentadores/caldeiras:

Vulcano
Junkers
Bosch
Vaillant
Baxi
Ariston
Cointra
Neckar

Para eletricistas:

Schneider Electric
Legrand
ABB
Siemens
Hager
Gewiss
Efapel
Finder

Para canalizadores/autoclismos/torneiras:

GROHE
Roca
OLI
Geberit
Sanindusa
Viega
Uponor
Wavin
Valsir

Para máquinas de lavar roupa:

Bosch
Siemens
LG
Samsung
Whirlpool
AEG
Electrolux
Beko
Indesit
Candy

Para vidraceiro:

Saint-Gobain Glass
Guardian Glass
AGC Glass Europe
Pilkington
Cortizo
Technal
Schüco
Sika

Importante: os links devem apontar para os sites oficiais das marcas sempre que possível.

### Módulo 5 — Principais Problemas / Avarias que Resolvemos

Este módulo deve ser longo e muito completo.

Criar vários subtítulos com problemas comuns do serviço. Cada problema deve ter explicação clara, com causa provável, consequência e solução.

Exemplo para portas:

Porta que não fecha
Porta a raspar no chão
Porta emperrada
Fechadura avariada
Dobradiças soltas ou partidas
Afinação de portas
Afinação e reparação de molas
Porta desalinhada
Puxador solto
Porta com folgas
Porta de correr com dificuldade

Exemplo para desentupimentos:

Sanita entupida
Lava-loiça entupido
Ralo entupido
Banheira com escoamento lento
Duche a acumular água
Mau cheiro no esgoto
Retorno de água
Caixa de esgoto cheia
Prumada entupida
Gordura acumulada na tubagem
Entupimentos recorrentes

Cada avaria deve ter pelo menos 2 a 3 parágrafos curtos.

### Módulo 6 — Como Funciona o Nosso Serviço

Explicar passo a passo o atendimento:

Cliente entra em contacto.
Pode enviar fotos ou vídeos.
Técnico faz diagnóstico no local.
Avalia a origem da avaria.
Apresenta solução.
Apresenta orçamento justo e antecipado.
Realiza a reparação com materiais adequados.
Testa tudo no final.

No final, reforçar que este processo garante uma assistência mais segura, transparente e eficiente.

### Módulo 7 — Serviço 24H/7

Este módulo deve focar na urgência.

Explicar que algumas avarias não podem esperar.

Exemplo:

Porta de entrada que não fecha.
Vidro partido.
Fuga de água.
Sanita entupida.
Esquentador sem água quente.
Quadro elétrico com cheiro a queimado.
Máquina com fuga de água.
Esgoto a transbordar.

Reforçar:

Atendimento 24H/7.
Sábados, domingos e feriados.
Piquetes móveis por localidade.
Diagnóstico antes da intervenção.
Serviço sem improvisos.
Objetivo: devolver segurança, conforto e tranquilidade.

### Módulo 8 — Manutenção / Prevenção

Explicar a importância da manutenção preventiva.

Este módulo deve mostrar que pequenos sinais devem ser resolvidos cedo.

Exemplos:

Porta a ranger.
Janela com entrada de vento.
Estore com ruído.
Torneira a pingar.
Autoclismo a correr.
Máquina a fazer barulho.
Esquentador com chama irregular.
Quadro elétrico com disjuntor a cair.
Ralo com escoamento lento.

Explicar que a manutenção reduz urgências, evita custos maiores e prolonga a vida útil dos equipamentos.

### Módulo 9 — Reparar ou Substituir?

Este módulo deve ajudar o cliente a tomar decisão.

Explicar que nem sempre é preciso substituir tudo.

Sempre reforçar:

Se for possível reparar com segurança, essa será a primeira opção.
Se a substituição for mais adequada, explicar o motivo ao cliente.
A decisão deve considerar segurança, custo, idade do equipamento, estado geral e durabilidade.

Exemplo:
“Nem toda porta avariada precisa ser substituída.”
“Nem todo esquentador avariado precisa ser trocado.”
“Nem toda canalização precisa de obra grande.”
“Nem toda máquina de lavar roupa precisa de substituição.”

### Módulo 10 — Por Que Escolher a Empresa

Este módulo deve ser comercial e de confiança.

Incluir:

Técnicos qualificados.
Atendimento 24H/7.
Diagnóstico antes do orçamento.
Orçamento justo e antecipado.
Materiais de qualidade.
Piquetes móveis por localidade.
Explicação clara ao cliente.
Testes finais antes de concluir.
Segurança e durabilidade.

Terminar com uma frase forte sobre transparência e confiança.

### Módulo 11 — Integração com Outros Serviços

Este módulo deve ligar o serviço principal a outros serviços complementares.

Exemplo para portas:

Reparação de janelas
Vidraceiro
Reparação de estores
Caixilharia
Fechaduras

Exemplo para canalizadores:

Reparação de torneiras
Reparação de autoclismos
Desentupimentos
Termoacumuladores
Esquentadores
Caldeiras
Eletricistas

Exemplo para eletricistas:

Termoacumuladores
Máquinas de lavar roupa
Estores elétricos
Caldeiras
Tomadas
Iluminação

Não colocar links internos se o utilizador não pedir. Apenas citar os serviços naturalmente.

### Módulo 12 — Zonas de Atendimento ou Contexto Local

Este módulo muda conforme o tipo de página.

Se for página principal de serviço

Criar o módulo “Zonas de Atendimento”.

Incluir grandes regiões:

Grande Lisboa
Margem Sul
Grande Porto
Braga
Algarve

Exemplo:

Na Grande Lisboa, mencionar:
Lisboa, Amadora, Odivelas, Loures, Oeiras, Cascais, Sintra e Vila Franca de Xira.

Na Margem Sul:
Almada, Seixal, Barreiro, Moita, Montijo, Alcochete, Palmela, Setúbal e zonas próximas.

No Grande Porto:
Porto, Vila Nova de Gaia, Matosinhos, Maia, Gondomar, Valongo, Póvoa de Varzim e Vila do Conde.

Em Braga e região:
Braga, Guimarães, Barcelos, Esposende, Fafe, Vila Verde, Amares e Póvoa de Lanhoso.

No Algarve:
Faro, Olhão, Loulé, Quarteira, Vilamoura, Albufeira, Portimão, Lagos, Lagoa, Silves, Tavira, Alvor e zonas próximas.

Também inserir 2 backlinks externos gerais e úteis:

Páginas Amarelas: https://www.pai.pt/
Portal Autárquico: https://portalautarquico.dgal.gov.pt/
Se for página de localidade específica

Trocar o módulo “Zonas de Atendimento” por Contexto Local.


### Regra complementar — Contexto Local em Lisboa

Neste caso, não fazer texto genérico. Criar contexto local forte, mencionando:

Cidade/localidade.
Freguesias.
Bairros.
Ruas conhecidas.
Praças.
Avenidas.
Pontos de referência.
Zonas residenciais e comerciais.
Perfil do local.
Tipos de imóveis comuns.
Necessidades mais prováveis do serviço naquela zona.

Exemplo para Lisboa:
Mencionar zonas como Alvalade, Benfica, Lumiar, Areeiro, Arroios, Campo de Ourique, Estrela, Belém, Parque das Nações, Avenidas Novas, Saldanha, Campo Pequeno, Telheiras, Olivais, Alcântara, Ajuda, Marvila, Santa Maria Maior.

Mencionar pontos como Avenida da República, Avenida de Roma, Campo Grande, Praça de Espanha, Marquês de Pombal, Baixa, Chiado, Restauradores, Avenida da Liberdade, Entrecampos, Sete Rios.

Exemplo para Porto:
Mencionar Cedofeita, Bonfim, Paranhos, Ramalde, Campanhã, Foz do Douro, Lordelo do Ouro, Massarelos, Baixa do Porto, Boavista, Aliados, Constituição, Antas.

Exemplo para Braga:
Mencionar São Victor, Maximinos, Sé, Nogueira, Fraião, Lamaçães, Gualtar, Real, Centro Histórico, Avenida Central, Bom Jesus, Sameiro.

Exemplo para Algarve:
Adaptar por cidade.
Faro: Sé, Montenegro, Penha, Gambelas, Baixa de Faro, Fórum Algarve, Universidade do Algarve.
Albufeira: Centro, Oura, Areias de São João, Guia, Galé, Olhos de Água.
Portimão: Praia da Rocha, Alvor, Mexilhoeira Grande, Centro, zona ribeirinha.
Lagos: Centro histórico, Meia Praia, Porto de Mós, Luz, Marina de Lagos.

Exemplo para Margem Sul:
Almada, Cacilhas, Pragal, Charneca da Caparica, Costa da Caparica, Seixal, Amora, Corroios, Barreiro, Montijo, Setúbal, Palmela, Alcochete.

Backlinks locais obrigatórios em páginas de localidade

Em páginas de localidade, inserir sempre 2 backlinks externos locais relevantes, preferencialmente oficiais ou úteis.

Exemplos:

Câmara Municipal da localidade.
Junta de Freguesia.
Portal Autárquico.
Turismo local.
Biblioteca municipal.
Diretório local.
Páginas Amarelas.
Site oficial de município.
Site oficial de freguesia.
Entidades locais oficiais.

Exemplo para Lisboa:

Câmara Municipal de Lisboa
Junta de Freguesia relevante
Turismo de Lisboa
Portal Autárquico

Exemplo para Porto:

Câmara Municipal do Porto
Turismo do Porto
Junta de Freguesia relevante

Nunca inventar links se não tiver certeza. Usar entidades reais e links oficiais quando possível.

### Módulo 13 — Perguntas Frequentes

Criar perguntas frequentes completas.

Cada pergunta deve ter resposta com pelo menos 2 parágrafos curtos ou uma resposta bem explicada.

Incluir perguntas sobre:

Atendimento 24H/7.
Orçamento antes do serviço.
Diagnóstico.
Principais avarias.
Se fazem reparação no local.
Se trabalham com empresas.
Se trabalham com condomínios.
Se vale a pena reparar ou substituir.
Perguntas específicas do serviço.

Exemplo para portas:
“Fazem reparação de portas 24H/7?”
“Reparam portas que não fecham?”
“Fazem afinação de molas?”
“Reparam portas de vidro?”
“Reparam portas de correr?”

Exemplo para canalizadores:
“Resolvem fugas de água?”
“Fazem desentupimentos?”
“Reparam autoclismos?”
“Resolvem mau cheiro na canalização?”
“Trabalham com condomínios?”

### Módulo 14 — Contacte a Empresa

Criar uma chamada para ação forte.

Repetir a palavra-chave principal e variações.

Exemplo:
“Se precisa de reparação de portas, arranjo de portas, manutenção, conserto, afinação ou assistência técnica, fale com a Reparação de Portas.”

Neste módulo, reforçar:

Principais problemas resolvidos.
Técnicos especializados.
Materiais de qualidade.
Diagnóstico antes do orçamento.
Orçamento justo e antecipado.
Serviço 24H/7.
Sábados, domingos e feriados.
Ligue já.

### Módulo 15 — Mais Sobre o Serviço

Este módulo deve ser um fechamento SEO forte, com texto mais explicativo e humano.

Falar sobre:

Por que o serviço é importante.
Como pequenas avarias começam.
Por que agir cedo.
Como manutenção evita custos maiores.
Como o diagnóstico evita substituições desnecessárias.
Como o cliente ganha segurança, transparência e melhor resultado.

Obrigatoriamente inserir 2 backlinks externos:

Google.pt
ChatGPT.com

Exemplo:
“Para pesquisar referências, comparar informações sobre serviços na sua zona ou analisar resultados locais, pode consultar o Google.pt. Também pode usar o ChatGPT.com para organizar dúvidas, preparar perguntas ao técnico ou compreender melhor os sintomas antes de pedir assistência.”

Finalizar com uma frase forte dizendo que a empresa trabalha para devolver segurança, conforto, funcionalidade e tranquilidade ao cliente.

COMO ADAPTAR PARA CADA SERVIÇO

Quando eu pedir um serviço diferente, manter exatamente os mesmos 15 módulos, mas adaptar todo o conteúdo ao serviço.

Exemplos de serviços:

Reparação de Portas
Reparação de Janelas
Reparação de Estores
Reparação de Persianas
Vidraceiro
Eletricistas
Canalizadores
Desentupimentos
Reparação de Autoclismos
Reparação de Torneiras
Reparação de Termoacumuladores
Reparação de Esquentadores
Reparação de Caldeiras
Reparação de Máquinas de Lavar Roupa

Nunca copiar problemas de um serviço para outro sem adaptação.

Cada página deve ter:

Tipos próprios.
Avarias próprias.
Marcas próprias.
Peças/componentes próprios.
Perguntas frequentes próprias.
Integração com serviços relacionados.
COMO ADAPTAR PARA PÁGINA DE LOCALIDADE

Quando eu pedir uma página de serviço + localidade, por exemplo:

Reparação de Portas em Lisboa
Canalizadores no Porto
Desentupimentos em Braga
Reparação de Esquentadores em Faro
Vidraceiro em Almada
Reparação de Janelas em Benfica

A IA deve:

Alterar SEO Title para incluir serviço + localidade + 24H/7.
Exemplo:
Reparação de Portas em Lisboa | Técnicos Especializados 24H/7
Alterar Meta Description para incluir localidade.
Alterar H1 para incluir serviço + localidade + 24H/7.
Inserir a localidade de forma natural no primeiro bloco.
No Módulo 12, trocar “Zonas de Atendimento” por “Contexto Local em [Localidade]”.
Criar texto local forte com:
Freguesias.
Bairros.
Avenidas.
Ruas.
Praças.
Pontos de referência.
Zonas residenciais.
Zonas comerciais.
Tipo de imóveis.
Necessidades mais comuns daquele serviço naquela zona.
Inserir 2 backlinks externos locais relevantes:
Câmara Municipal.
Junta de Freguesia.
Turismo local.
Diretório local.
Portal Autárquico.
Biblioteca municipal.
Site oficial local.
Não misturar localidades.
Se a página é de Cascais, não falar como se fosse Lisboa.
Se a página é de Braga, não colocar bairros do Porto.
Se a página é de Benfica, reforçar Benfica e zonas próximas, não transformar em página geral de Lisboa.
Manter os restantes módulos iguais na estrutura, mas adaptar o texto para a localidade.
REGRAS DE LINKS

Usar links externos clicáveis apenas nestes casos:

Marcas oficiais no módulo de marcas/componentes.
Entidades locais no módulo de localidade/contexto local.
Páginas Amarelas e Portal Autárquico em páginas principais de serviço.
Google.pt e ChatGPT.com no módulo “Mais Sobre”.

Não inserir links internos de nenhum domínio próprio, a menos que seja pedido diretamente.

Não inserir imagens do domínio próprio, a menos que seja pedido diretamente.

PADRÃO DE QUALIDADE DO TEXTO

A página deve ser:

Completa.
Humanizada.
Comercial.
Técnica na medida certa.
Escrita em português de Portugal.
Sem exageros.
Sem promessas falsas.
Sem texto robótico.
Com boa repetição natural da palavra-chave.
Com variações semânticas.
Com foco em conversão.
Com foco em SEO local.
Com foco em confiança.
Com CTA no início, meio e fim.
Com módulos bem separados e numerados.
