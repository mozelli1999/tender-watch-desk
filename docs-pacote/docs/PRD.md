# PRD — Radar de Licitações

## 1. Contexto

O **Radar de Licitações** é uma plataforma web privada, de uso exclusivo de uma única empresa que participa de licitações públicas no Brasil. Hoje as oportunidades estão espalhadas em dezenas de fontes distintas — ComprasNet/Compras.gov.br, PNCP e outros portais gratuitos — o que torna inviável descobrir manualmente, todos os dias, quais editais realmente valem a pena disputar. O sistema centraliza essas oportunidades, cruza cada uma com o catálogo de produtos e fornecedores da empresa, calcula um Score de 0 a 100, roda um simulador financeiro de lucro e analisa o edital em PDF por IA. Roda sobre **Supabase** (PostgreSQL + Auth + Storage + Edge Functions + Realtime + Cron) e é construído via **Lovable + Supabase**, por ser um operador único que precisa de dashboard, filtros ricos, pipeline e simulador sem manter código.

## 2. Problema

O usuário descreveu que "as oportunidades de licitações públicas estão espalhadas em dezenas de fontes diferentes", tornando "quase impossível descobrir manualmente, todos os dias, quais editais valem a pena disputar". A dor concreta é a perda de tempo e de oportunidades por falta de uma visão unificada e priorizada: sem uma ferramenta, é preciso abrir vários sites gratuitos, ler editais longos em PDF um a um, estimar lucro na mão e decidir no escuro se a licitação é compatível com o catálogo, o capital disponível e a região de atendimento da empresa. O usuário deixou claro o pedido central: responder diariamente **"Quais são as 10 melhores oportunidades para minha empresa hoje?"** — sempre auxiliando na decisão, nunca decidindo automaticamente se deve participar. A dor não é decisória e sim de triagem inteligente em massa a partir de fontes reais e legalmente permitidas.

## 3. Objetivos

1. **Centralizar oportunidades reais** de ComprasNet/Compras.gov.br, PNCP e outros portais gratuitos com acesso técnica e legalmente permitido, cada uma exibindo fonte original e link para o processo — meta: 100% das oportunidades exibidas com origem rastreável.
2. **Entregar a lista diária das "10 melhores oportunidades"** sob demanda, priorizando compatibilidade com o catálogo, capital disponível, margem mínima e região de atendimento — meta: gerar a lista em menos de 5 segundos após o clique.
3. **Automatizar a triagem** via matching catálogo↔licitação, Score 0–100 com motivos e análise de edital por IA disparada automaticamente ao detectar licitação compatível — meta: 100% das oportunidades compatíveis com score e análise de edital prontos antes da consulta do Operador.
4. **Estimar o resultado financeiro** de cada oportunidade (receita, custos, lucro, margem, capital necessário, preço máximo de lance e impacto no fluxo de caixa) antes da decisão de participar.
5. **Construir inteligência histórica** que cresce com o tempo (taxa de vitória, lucro médio, produtos mais rentáveis, órgãos que mais compram, valores vencedores), partindo do zero e alimentada pelas participações registradas.

## 4. Personas

### Ricardo — Operador (dono/gestor de licitações da empresa)
- **Papel:** único perfil da plataforma. Cadastra produtos e fornecedores, define capital, margem mínima e região de atendimento, consulta o dashboard, analisa oportunidades, roda o simulador, gerencia o pipeline e registra o histórico de participações.
- **Dor:** perde horas por dia abrindo vários portais gratuitos e lendo editais longos, sem saber rapidamente quais licitações são compatíveis com seus produtos, seu capital e sua região.
- **Objetivo:** abrir a plataforma pela manhã, clicar em "10 melhores oportunidades hoje" e decidir com segurança onde vale a pena disputar, com lucro estimado e riscos já mapeados.
- **Citação:** "Quero que o sistema me responda todo dia quais são as 10 melhores oportunidades para minha empresa — mas a decisão de participar é sempre minha."

## 5. Requisitos funcionais

- **RF-01:** O sistema deve permitir que o Operador faça login com e-mail e senha (magic link opcional), sem cadastro público, por ser uso privado de uma única empresa.
- **RF-02:** O sistema deve permitir que o Operador cadastre e edite produtos com nome, categoria, código CATMAT/CATSER, preço médio de compra, margem mínima, prazo de fornecimento, frete e palavras-chave.
- **RF-03:** O sistema deve permitir que o Operador cadastre e edite fornecedores registrando preço, prazo, frete e condições de pagamento, e vincule produtos a fornecedores para comparação lado a lado.
- **RF-04:** O sistema deve permitir que o Operador defina os parâmetros da empresa: capital disponível, margem mínima geral, região(ões) de atendimento (estados e municípios), faixas de corte do score e impostos padrão.
- **RF-05:** O sistema deve captar automaticamente novas oportunidades das fontes ativas (ComprasNet/Compras.gov.br, PNCP e outros sites gratuitos com acesso permitido) em intervalos programados via Cron e por botão "Sincronizar agora".
- **RF-06:** O sistema deve exibir para cada oportunidade a fonte original e o link para o processo, sem exibir oportunidade sem origem rastreável.
- **RF-07:** O sistema deve cruzar automaticamente cada oportunidade nova com o catálogo (por categoria, CATMAT/CATSER ou palavra-chave) e marcá-la como compatível quando houver ao menos um produto correspondente.
- **RF-08:** O sistema deve disparar automaticamente a análise de edital por IA ao detectar uma nova licitação compatível, extraindo objeto, itens e quantidades, valores, datas, prazo e local de entrega, pagamento, documentos exigidos, habilitação, amostras, garantias, atestados, penalidades e pontos de atenção/riscos.
- **RF-09:** O sistema deve calcular um Score de 0 a 100 para cada oportunidade considerando compatibilidade, valor, margem, concorrência, prazos, complexidade do edital, habilitação, capital, logística e ME/EPP, classificando em 🟢 Alta, 🟡 Moderada ou 🔴 Baixa e exibindo os motivos da pontuação.
- **RF-10:** O sistema deve permitir que o Operador acesse o dashboard com novas oportunidades, licitações encerrando hoje e nos próximos dias, valor total, favoritas, quantidade por categoria/órgão/modalidade, gráficos e indicadores.
- **RF-11:** O sistema deve permitir que o Operador solicite sob demanda a lista das "10 melhores oportunidades hoje", exibindo para cada uma produto, órgão, valor, prazo, local, score, lucro estimado, capital necessário, principais riscos e link para participar.
- **RF-12:** O sistema deve permitir que o Operador busque e combine múltiplos filtros (produto/palavra-chave, categoria, CATMAT/CATSER, valor mín/máx, estado, município, órgão, modalidade, data da sessão, prazo de entrega, prazo de pagamento, quantidade, situação, ME/EPP, exigências de amostra/atestado/garantia/capital social e fonte).
- **RF-13:** O sistema deve permitir que o Operador abra a página da oportunidade com órgão, processo, modalidade, produto, quantidade, valor, datas, prazos, exigências, score com motivos, lucro estimado, capital necessário, fornecedores compatíveis, análise de edital por IA, edital/anexos e link à fonte, tudo em uma tela.
- **RF-14:** O sistema deve permitir que o Operador rode o simulador financeiro de cada oportunidade, ajustando fornecedor, frete e impostos, retornando receita, custo dos produtos, frete, impostos, outros custos, lucro, margem, capital necessário, preço máximo recomendado de lance e impacto no fluxo de caixa (prazo de pagamento do fornecedor x recebimento do órgão).
- **RF-15:** O sistema deve permitir que o Operador favorite, descarte e mova cada oportunidade pelas etapas do pipeline (NOVAS → ANALISANDO → INTERESSANTE → COTAÇÃO → PARTICIPAR → VENCIDA → COMPRA → ENTREGA → PAGAMENTO → CONCLUÍDA).
- **RF-16:** O sistema deve permitir que o Operador registre o resultado real das licitações participadas (vencida/perdida, valor vencedor, lance, lucro real, margem, concorrência) para alimentar a inteligência histórica.
- **RF-17:** O sistema deve gerar relatórios de inteligência (taxa de vitória, lucro médio, produtos mais rentáveis, órgãos que mais compram, valores vencedores anteriores, concorrência e histórico de preços) a partir das participações registradas.
- **RF-18:** O sistema deve gerar alertas internos exibidos no dashboard para novas licitações compatíveis, licitações próximas do encerramento, oportunidades de alto score e alterações importantes no processo.
- **RF-19:** O sistema deve armazenar os PDFs de editais baixados das fontes no Storage para exibição na página da oportunidade e reprocessamento da IA quando necessário.
- **RF-20:** O sistema deve registrar logs de cada varredura de fonte (data, quantidade de oportunidades, erros) para diagnóstico e conformidade LGPD sobre a origem das captações.

## 6. Requisitos não-funcionais

- **Performance:** o dashboard e a busca com filtros combinados devem responder em até ~3 segundos para o volume single-tenant; a lista das "10 melhores" em até 5 segundos; toda coluna usada em filtro/ordenação (estado, categoria, CATMAT, modalidade, valor, datas, compatibilidade) recebe índice, com índice de texto (`to_tsvector`) para busca por palavra-chave.
- **Processamento assíncrono:** varredura de fontes, matching, análise de edital por IA e cálculo de score rodam em Supabase Edge Functions (nunca no frontend), acionados por Cron e encadeamento, mantendo o front leve gerado pelo Lovable.
- **Disponibilidade:** apoiada na infraestrutura gerenciada do Supabase (Pro, recomendado pela varredura recorrente via Cron e Storage de PDFs); o Cron garante captação contínua mesmo sem o Operador logado.
- **Segurança:** RLS habilitado em todas as tabelas, com padrão "o usuário autenticado dono da linha faz tudo" via `owner_id = auth.uid()`; escrita automática (varredura, IA, score) feita pelas Edge Functions com service_role; cadastro público desabilitado; todas as chaves de API guardadas em secrets do Supabase e nunca expostas ao frontend.
- **LGPD/dados pessoais:** o sistema não armazena dados pessoais de terceiros além dos contatos de fornecedores inseridos pelo próprio Operador; só capta oportunidades de fontes com acesso técnica e legalmente permitido, nunca integrações fictícias; a tabela `sync_logs` documenta a origem legal de cada captação; todo dado de licitação é público e proveniente das fontes oficiais.
- **Integridade de dados:** dedupe de oportunidades por `source_id + source_external_id` (UNIQUE) evita duplicação entre varreduras; toda oportunidade mantém `raw_payload` bruto da fonte para auditoria.

## 7. Métricas de sucesso

1. **Cobertura de fontes:** 100% das oportunidades exibidas com fonte original e link rastreável no lançamento (ComprasNet/PNCP + outros gratuitos permitidos).
2. **Tempo até a decisão:** o Operador obtém as 10 melhores oportunidades do dia em menos de 5 segundos após o clique, com score, lucro estimado e riscos já calculados.
3. **Automação da triagem:** 100% das oportunidades marcadas como compatíveis têm análise de edital por IA e Score prontos antes da consulta do Operador (sem ação manual).
4. **Redução de esforço manual:** eliminar a necessidade de abrir portais individualmente — 0 fontes consultadas manualmente pelo Operador na rotina diária.
5. **Crescimento da inteligência:** aumento mensal do número de participações registradas alimentando os relatórios (taxa de vitória, lucro médio, órgãos que mais compram) a partir do início do zero.

## 8. Fora de escopo

- **SaaS multi-tenant:** não há venda de acesso a terceiros nem separação por cliente — o usuário respondeu "só minha" empresa; o `owner_id` é mantido para consistência de RLS, mas sem onboarding de outras empresas.
- **Envio automático de alertas por canais externos:** no lançamento os alertas ficam na central interna do dashboard; o Operador respondeu que prefere "acessar o dashboard e solicitar". Integração com e-mail (Resend, Free tier) fica como evolução futura.
- **Envio automático da lista "10 melhores do dia":** é respondida sob demanda no dashboard, não enviada automaticamente (conforme resposta do usuário).
- **Decisão automática de participação:** o sistema auxilia e recomenda o preço máximo de lance, mas nunca decide sozinho se a empresa deve participar.
- **Integração com fontes sem API/feed permitido:** portais que não ofereçam acesso técnica e legalmente permitido não serão integrados — proibido criar integrações fictícias ou scraping não autorizado.
- **Submissão de propostas dentro das plataformas de licitação:** o sistema direciona para o link da fonte original; o envio do lance é feito pelo Operador no portal oficial.
- **Dados históricos pré-carregados:** o sistema começa do zero; a importação de histórico existente pode ser adicionada com o tempo, mas não faz parte desta versão.
