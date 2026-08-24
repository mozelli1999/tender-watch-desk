## 1. Requisitos de sistema

Os requisitos funcionais (RF) foram inferidos a partir do PROCESSO e da ESTRUTURA do **Radar de Licitações**, seguindo a numeração que um PRD desta ideia teria:

- **RF-01** — Autenticação privada do Operador (e-mail/senha, sem cadastro público)
- **RF-02** — Captação/sincronização de oportunidades das fontes (ComprasNet, PNCP e outros portais gratuitos)
- **RF-03** — Matching de oportunidades com o catálogo de produtos
- **RF-04** — Análise automática de edital por IA
- **RF-05** — Cálculo do Score de oportunidade (0–100 com classificação 🟢/🟡/🔴)
- **RF-06** — Cadastro de produtos e fornecedores
- **RF-07** — Simulador financeiro
- **RF-08** — Pipeline de controle das oportunidades
- **RF-09** — Alertas/notificações internas
- **RF-10** — Histórico e inteligência
- **RF-11** — Dashboard com métricas e gráficos
- **RF-12** — Busca e filtros combináveis
- **RF-13** — "10 melhores oportunidades hoje" sob demanda
- **RF-14** — Página da oportunidade (visão única)
- **RF-15** — Parâmetros da empresa (capital, margem, região, cortes de score)

---

**RS-01:** O sistema deve permitir login apenas via Supabase Auth com e-mail/senha (e magic link opcional) e ter o cadastro público (`signup`) desabilitado; qualquer tentativa de auto-registro deve ser rejeitada.
Rastreia: RF-01

**RS-02:** Todas as tabelas de dados do usuário devem ter RLS habilitado, restringindo SELECT/INSERT/UPDATE/DELETE às linhas cujo `owner_id = auth.uid()`; uma requisição autenticada não pode ler linhas de outro `owner_id`.
Rastreia: RF-01

**RS-03:** A Edge Function `sync-sources` deve fazer UPSERT em `opportunities` usando a chave de deduplicação `unique(source_id, source_external_id)`, de modo que reexecuções não gerem duplicatas da mesma licitação.
Rastreia: RF-02

**RS-04:** Toda linha em `opportunities` gravada por `sync-sources` deve conter `source_id` e `source_url` não nulos; oportunidades sem origem rastreável devem ser rejeitadas antes da inserção.
Rastreia: RF-02

**RS-05:** A Edge Function `sync-sources` deve integrar somente fontes cadastradas em `sources` com `is_active = true` e `integration_type` em (`api`,`feed`), registrando cada execução em `sync_logs` com `status`, `opportunities_found` e `error_message` quando houver falha.
Rastreia: RF-02

**RS-06:** A Edge Function `match-opportunities` deve marcar `opportunities.is_compatible = true` e criar registro em `opportunity_products` quando houver correspondência por `category`, `catmat_catser_code` ou `keywords` com pelo menos um produto ativo do catálogo; sem correspondência, `is_compatible` permanece `false`.
Rastreia: RF-03

**RS-07:** Ao detectar uma nova oportunidade com `is_compatible = true`, o sistema deve disparar automaticamente a `analyze-edital`, criando um registro em `edital_analyses` com `status = 'pending'` sem intervenção manual do Operador.
Rastreia: RF-04

**RS-08:** A Edge Function `analyze-edital` deve baixar o PDF, salvá-lo no bucket `editais` do Storage, enviar o conteúdo à API de IA e preencher os campos estruturados (`object_extracted`, `items_json`, `dates_json`, `required_documents`, `risk_points` etc.), atualizando `status` para `done` em sucesso ou `error` em falha.
Rastreia: RF-04

**RS-09:** A Edge Function `compute-score` deve produzir um `score` inteiro entre 0 e 100 e definir `classification` aplicando os cortes de `company_settings` (`score_green_min`, `score_yellow_min`): `green` se `score >= score_green_min`, `yellow` se `score >= score_yellow_min`, senão `red`.
Rastreia: RF-05

**RS-10:** A `compute-score` deve gravar em `opportunity_scores.reasons` a lista legível de motivos e em `factors` o breakdown por critério (compatibilidade, valor, margem, concorrência, prazos, complexidade, habilitação, capital, logística, ME/EPP); nenhuma pontuação pode ser salva sem `reasons` preenchido.
Rastreia: RF-05

**RS-11:** A `compute-score` deve gerar uma `notification` do tipo `high_score` sempre que uma oportunidade atingir a classificação `green`.
Rastreia: RF-05, RF-09

**RS-12:** O cadastro de produtos deve exigir `name` não nulo e aceitar `category`, `catmat_catser_code`, `avg_purchase_price`, `min_margin_pct`, `supply_lead_time_days`, `freight_cost` e `keywords`; após criação/edição, o sistema deve reprocessar o matching (`match-opportunities`).
Rastreia: RF-06, RF-03

**RS-13:** O vínculo `product_suppliers` deve respeitar a restrição `unique(product_id, supplier_id)` e exigir `unit_price` não nulo, permitindo comparação lado a lado de preço/prazo/frete/condições por produto.
Rastreia: RF-06

**RS-14:** A Edge Function `run-financial-simulation` deve calcular `revenue`, `product_cost`, `freight_cost`, `tax_cost`, `other_costs`, `profit`, `margin_pct`, `required_capital` e `max_recommended_bid` a partir da oportunidade e do fornecedor selecionado, retornando valores consistentes onde `profit = revenue − (product_cost + freight_cost + tax_cost + other_costs)`.
Rastreia: RF-07

**RS-15:** A `run-financial-simulation` deve calcular `cash_flow_impact` considerando o `payment_terms_days` do fornecedor versus o prazo de recebimento do órgão (`payment_deadline_days` da oportunidade).
Rastreia: RF-07

**RS-16:** O RPC `move_pipeline_stage(opportunity_id, stage)` deve aceitar apenas valores válidos do conjunto (`novas`,`analisando`,`interessante`,`cotacao`,`participar`,`vencida`,`compra`,`entrega`,`pagamento`,`concluida`) e rejeitar qualquer outro valor de `stage`.
Rastreia: RF-08

**RS-17:** O sistema deve permitir marcar `pipeline_items.is_favorite` e `is_discarded`; oportunidades com `is_discarded = true` devem ser excluídas da lista de análise ativa e das "10 melhores do dia".
Rastreia: RF-08, RF-13

**RS-18:** A Edge Function `generate-alerts` (Cron diário) deve criar `notifications` do tipo `closing_soon` para oportunidades cujo `closing_date` esteja dentro da janela configurada (hoje/próximos dias) e `process_changed` quando detectar alteração no processo.
Rastreia: RF-09

**RS-19:** O sistema deve permitir ao Operador marcar `notifications.is_read = true`, e essas notificações não devem mais aparecer como não lidas no indicador do dashboard.
Rastreia: RF-09

**RS-20:** O RPC `get_intelligence_report()` deve calcular taxa de vitória, lucro médio, produtos mais rentáveis, órgãos que mais compram, valores vencedores e histórico de preços exclusivamente a partir de `participation_history`; com histórico vazio, deve retornar zeros/estrutura vazia sem erro.
Rastreia: RF-10

**RS-21:** O RPC `get_dashboard_metrics()` deve retornar contagem de novas oportunidades, encerrando hoje/próximos dias, valor total (`SUM(estimated_value)`), favoritas e agregações por categoria, órgão e modalidade em uma única chamada.
Rastreia: RF-11

**RS-22:** O RPC `search_opportunities(filters jsonb)` deve suportar a combinação de todos os filtros (palavra-chave, categoria, CATMAT/CATSER, valor mín/máx, estado, município, órgão, modalidade, data da sessão, prazos, quantidade, situação, ME/EPP, exigências e fonte), retornando o subconjunto que satisfaz simultaneamente todos os filtros informados.
Rastreia: RF-12

**RS-23:** A busca por palavra-chave em `search_opportunities` deve usar índice de texto (`to_tsvector` sobre `object_description`), retornando resultados relevantes para o exemplo "material de limpeza no ES entre R$5.000 e R$50.000, ME/EPP, entrega até 15 dias".
Rastreia: RF-12

**RS-24:** O RPC `get_top_10_opportunities()` deve retornar no máximo 10 oportunidades ordenadas por score, priorizando compatibilidade, respeitando `available_capital`, `min_margin_pct` e `service_states`/`service_cities` de `company_settings`, excluindo descartadas.
Rastreia: RF-13, RF-15

**RS-25:** O `get_top_10_opportunities()` deve retornar, para cada item, produto, órgão, valor, prazo, local, score, lucro estimado, capital necessário, riscos e link para a fonte, sendo executado apenas sob demanda (ação do Operador), nunca enviado automaticamente.
Rastreia: RF-13

**RS-26:** A página `/oportunidade/:id` deve exibir em uma única tela órgão, processo, modalidade, produto, quantidade, valor, datas, prazos, exigências, score com motivos, lucro estimado, capital necessário, fornecedores compatíveis, análise de edital por IA, edital/anexos e link à fonte original.
Rastreia: RF-14

**RS-27:** A página `/configuracoes` deve persistir em `company_settings` (exatamente uma linha por `owner_id`, garantida por `unique(owner_id)`) os parâmetros `available_capital`, `min_margin_pct`, `service_states`, `service_cities`, `score_green_min`, `score_yellow_min` e `default_tax_pct`.
Rastreia: RF-15

**RS-28:** Ao alterar parâmetros em `company_settings`, o sistema deve reprocessar `compute-score` para refletir os novos cortes e critérios de priorização nas classificações e nas "10 melhores".
Rastreia: RF-15, RF-05

**RS-29:** As tabelas gravadas automaticamente pelo backend (`opportunities`, `opportunity_products`, `opportunity_scores`, `edital_analyses`, `sources`, `sync_logs`, `notifications` para INSERT) devem ser escritas somente via `service_role` nas Edge Functions; o cliente do frontend nunca deve possuir permissão de INSERT nessas tabelas.
Rastreia: RF-02, RF-04, RF-05

**RS-30:** Todas as chamadas a APIs externas (PNCP, ComprasNet, IA/Gemini) devem ocorrer exclusivamente em Edge Functions com as chaves carregadas de secrets do Supabase; nenhuma chave pode trafegar pelo frontend nem ser hardcoded no código.
Rastreia: RF-02, RF-04

---

## 2. Arquitetura

O **Radar de Licitações** é uma aplicação web single-tenant em três camadas, com toda a lógica pesada no backend Supabase e um frontend leve gerado pelo Lovable.

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (Lovable → React + Tailwind + shadcn/ui)           │
│  /login /dashboard /melhores-do-dia /busca                   │
│  /oportunidade/:id /simulador/:id /pipeline                  │
│  /produtos /fornecedores /historico /configuracoes           │
└───────────────┬─────────────────────────────────────────────┘
                │ Supabase JS Client (Auth JWT + RLS)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  BACKEND — SUPABASE                                           │
│                                                              │
│  ┌───────────────┐   ┌───────────────────────────────────┐  │
│  │ Auth          │   │ PostgreSQL + RLS                   │  │
│  │ email/senha   │   │ company_settings, products,       │  │
│  │ magic link    │   │ suppliers, product_suppliers,     │  │
│  └───────────────┘   │ sources, opportunities,           │  │
│                      │ opportunity_products,             │  │
│  ┌───────────────┐   │ opportunity_scores,               │  │
│  │ Storage       │   │ edital_analyses,                  │  │
│  │ bucket editais│   │ financial_simulations,            │  │
│  └───────────────┘   │ pipeline_items,                   │  │
│                      │ participation_history,            │  │
│  ┌───────────────┐   │ notifications, sync_logs          │  │
│  │ RPCs (SQL)    │   └───────────────────────────────────┘  │
│  │ get_top_10 /  │                                          │
│  │ dashboard /   │   ┌───────────────────────────────────┐  │
│  │ search /      │   │ Edge Functions (Deno)             │  │
│  │ intel_report /│   │ sync-sources → match →            │  │
│  │ move_pipeline │   │ analyze-edital → compute-score    │  │
│  └───────────────┘   │ run-financial-simulation          │  │
│                      │ generate-alerts                   │  │
│  ┌───────────────┐   └──────────────┬────────────────────┘  │
│  │ Cron (pg_cron)│──────────────────┘                        │
│  │ sync + alerts │                                           │
│  └───────────────┘                                           │
└──────────────────────────────┬──────────────────────────────┘
                               │ (somente via Edge Functions, secrets)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  INTEGRAÇÕES EXTERNAS                                         │
│  • PNCP (API pública oficial)                                │
│  • ComprasNet / Compras.gov.br (API/feed autorizado)         │
│  • Outros portais gratuitos (adaptadores por fonte)          │
│  • Google Gemini 2.5 Pro (análise de editais em PDF)         │
│  • (Futuro) Resend (alertas por e-mail)                      │
└─────────────────────────────────────────────────────────────┘
```

**Fluxo central (automático):** `Cron` → `sync-sources` (capta e deduplica) → `match-opportunities` (cruza com catálogo, marca compatíveis) → `analyze-edital` (IA extrai dados do PDF) → `compute-score` (pontua e gera alertas). **Fluxo sob demanda (Operador):** o frontend consulta os RPCs (`get_dashboard_metrics`, `search_opportunities`, `get_top_10_opportunities`, `get_intelligence_report`) e aciona `run-financial-simulation` na página da oportunidade.

---

## 3. Stack tecnológica

**Backend — Supabase (não negociável):**
- **PostgreSQL** com RLS em todas as tabelas — modelo de dados detalhado na ESTRUTURA (14 tabelas).
- **Auth** — e-mail/senha e magic link; cadastro público desabilitado (uso privado da empresa).
- **Storage** — bucket `editais` para os PDFs baixados das fontes.
- **Edge Functions (Deno)** — `sync-sources`, `match-opportunities`, `analyze-edital`, `compute-score`, `run-financial-simulation`, `generate-alerts`; toda integração externa e lógica pesada vive aqui.
- **Realtime** — atualização do dashboard e da central de notificações sem recarregar.
- **Cron (pg_cron)** — varredura recorrente das fontes e geração diária de alertas.
- **RPCs SQL** — `get_top_10_opportunities`, `get_dashboard_metrics`, `search_opportunities`, `get_intelligence_report`, `move_pipeline_stage`.

**Frontend — Lovable + Supabase (React + Tailwind + shadcn/ui):**
O caminho de build é o **Lovable** porque você respondeu que a plataforma é **"só minha"** empresa, uso interno/privado, sem menção a time de TI ou capacidade de codar. Para um Operador único que precisa de um dashboard moderno, filtros ricos, board de pipeline e simulador financeiro **sem manter código**, o Lovable é o caminho mais rápido do zero ao ar: gera React com integração nativa ao Supabase e deploy com preview. Como toda a lógica pesada (varredura, IA de edital, score, cron) fica em Edge Functions e RPCs, o front gerado permanece leve e não depende de programador para operar. Se sua empresa contratar um time técnico no futuro, a mesma base Supabase migra para o caminho **Claude Code + Supabase** sem reescrever o backend.

**Integrações externas:** PNCP e ComprasNet como fontes oficiais de captação; **Google Gemini 2.5 Pro** para análise de editais (contexto de 1M tokens e custo baixo ~US$1.25/Mtok in, ideal para editais longos com análise automática ligada); Resend no free tier como opção futura de alerta por e-mail. **Automação:** Cron do próprio Supabase (não N8N, não Zapier).

**Custo estimado inicial:** Lovable Pro R$95/mês + Supabase Pro R$125/mês (recomendado pela varredura recorrente e Storage de PDFs) + Gemini pago por uso (dezenas de editais/semana → poucos dólares/mês).

---

## 4. Segurança

**Autenticação:** Supabase Auth com e-mail/senha (magic link opcional). Cadastro público desabilitado — os usuários Operador são criados manualmente pelo dono da empresa. Não há OAuth no lançamento por ser uso privado.

**RLS por tabela** (habilitado em todas):
- `company_settings`, `products`, `suppliers`, `product_suppliers`, `financial_simulations`, `pipeline_items`, `participation_history` → política "dono": todas as operações restritas a `owner_id = auth.uid()`.
- `opportunities`, `opportunity_products`, `opportunity_scores`, `edital_analyses` → SELECT pelo dono (para as tabelas derivadas, via `EXISTS` no join com `opportunities.owner_id = auth.uid()`); INSERT/UPDATE/DELETE somente via `service_role` (Edge Functions).
- `sources` → SELECT para autenticados; escrita só via `service_role`.
- `notifications` → SELECT e UPDATE (marcar lida) pelo dono; INSERT só via `service_role`.
- `sync_logs` → SELECT pelo dono/autenticado; escrita só via `service_role`.

**Dados sensíveis e LGPD:** a plataforma não armazena dados pessoais de terceiros além dos contatos de fornecedores inseridos pelo próprio Operador. Todos os dados de licitação são públicos e captados apenas de fontes com acesso técnica e legalmente permitido — nunca integrações fictícias. A tabela `sync_logs` documenta a origem e a base legal de cada captação, servindo de trilha de auditoria para conformidade LGPD. O Operador tem controle total (leitura, edição e exclusão) sobre seus próprios dados via RLS.

**Segredos e API keys:** as chaves de PNCP, ComprasNet e Gemini ficam em **secrets do Supabase**, acessadas apenas dentro das Edge Functions. Nenhuma chave é hardcoded no código nem trafega pelo frontend. A `service_role key` é usada exclusivamente no servidor (Edge Functions) e nunca exposta ao cliente; o frontend usa apenas a `anon key`, sujeita a RLS.

---

## 5. Performance

**Carga e volume esperados (single-tenant, ancorado nas respostas):** um único Operador (ou pequena equipe da empresa), varredura das fontes várias vezes ao dia e **análise automática de dezenas de editais por semana** (volume moderado assumido, já que você não indicou volume/tamanho exatos). Isso mantém o consumo bem abaixo dos limites do Supabase Pro.

**Índices críticos:**
- Deduplicação de oportunidades: `unique(source_id, source_external_id)`.
- Filtros da busca: índices em `state`, `category`, `catmat_catser_code`, `modality`, `estimated_value`, `session_date`, `closing_date`, `is_compatible`, além de **GIN em `raw_payload`** e **índice de texto `to_tsvector` sobre `object_description`** para busca por palavra-chave.
- Matching por palavra-chave: GIN em `products.keywords`.
- Priorização e dashboard: índices em `opportunity_scores.score`/`classification`, `pipeline_items.stage`/`is_favorite`/`is_discarded` e `notifications(owner_id, is_read)`.
- Relatórios: índices em `participation_history` por `result` e `main_product_id`.

**Limites conhecidos e mitigações:**
- **Timeout de Edge Function (~60s):** `analyze-edital` deve processar **um edital por invocação** (nunca em lote síncrono) e ser encadeada de forma assíncrona a partir de `sync-sources`/`match-opportunities`, evitando estouro de tempo em PDFs grandes.
- **Tamanho de payload:** PDFs de editais vão para o Storage (bucket `editais`), não trafegam inline; a IA recebe o conteúdo extraído/streamed. O Gemini 2.5 Pro (contexto 1M tokens) suporta editais longos sem truncamento.
- **Cron sob fontes gratuitas:** a frequência de `sync-sources` será ajustada conforme a estabilidade e os limites de rate das fontes gratuitas, com backoff registrado em `sync_logs` em caso de erro.
- **RPCs de agregação:** `get_dashboard_metrics` e `get_intelligence_report` rodam sobre índices e conjuntos pequenos (dados de uma empresa), mantendo tempo de resposta baixo mesmo com o histórico crescendo ao longo do tempo.
