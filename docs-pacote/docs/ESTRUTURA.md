# Estrutura Técnica — Radar de Licitações

Plataforma web privada de uso exclusivo de uma empresa (single-tenant, um único perfil "Operador"), rodando sobre **Supabase** (PostgreSQL + Auth + Storage + Edge Functions + Realtime + Cron) e construída via **Lovable + Supabase**.

> **Caminho de build escolhido: Lovable + Supabase.** Nas respostas você indicou que a plataforma é "só minha" empresa, uso interno, sem menção a time de TI ou capacidade de codar. Para um operador único que precisa de dashboard moderno, filtros ricos, pipeline e simulador financeiro sem manter código, o Lovable é o caminho mais rápido do zero ao ar: gera React + Tailwind + shadcn/ui com integração nativa ao Supabase e deploy com preview. Toda a lógica pesada (varredura de fontes, IA de edital, cálculo de score, cron) vive em **Supabase Edge Functions** e **Postgres RPCs**, então o front gerado pelo Lovable fica leve e você não depende de programador para operar. Se no futuro sua empresa contratar um time técnico, a mesma base Supabase migra para o caminho Claude Code sem reescrever o backend.

---

## 1. Modelo de dados

Como o sistema é single-tenant com um único perfil, quase toda tabela de dado do usuário se vincula ao `auth.uid()` via coluna `owner_id` (mantida para consistência de RLS e para permitir que a "equipe da empresa" compartilhe os mesmos dados no futuro). Toda FK e toda coluna usada em filtro/ordenação frequente recebe índice.

### `company_settings`
Propósito: guarda os parâmetros da empresa que orientam a priorização (capital, margem, região) e as faixas de corte do score.
- `id` uuid PK default `gen_random_uuid()`
- `owner_id` uuid NOT NULL FK → `auth.users(id)`
- `available_capital` numeric(14,2) NOT NULL default 0 — capital disponível
- `min_margin_pct` numeric(5,2) NOT NULL default 0 — margem mínima geral (%)
- `service_states` text[] NOT NULL default '{}' — UFs de atendimento
- `service_cities` text[] NOT NULL default '{}' — municípios de atendimento
- `score_green_min` int NOT NULL default 70 — corte 🟢
- `score_yellow_min` int NOT NULL default 40 — corte 🟡
- `default_tax_pct` numeric(5,2) NOT NULL default 0 — impostos padrão do simulador
- `created_at` / `updated_at` timestamptz NOT NULL default `now()`
- Índices: `unique(owner_id)` (uma linha de settings por operador).

### `products`
Propósito: catálogo de produtos da empresa usado para cruzar com licitações.
- `id` uuid PK default `gen_random_uuid()`
- `owner_id` uuid NOT NULL FK → `auth.users(id)`
- `name` text NOT NULL
- `category` text
- `catmat_catser_code` text — código CATMAT/CATSER
- `avg_purchase_price` numeric(14,2)
- `min_margin_pct` numeric(5,2) — margem mínima do produto (sobrepõe a geral)
- `supply_lead_time_days` int — prazo de fornecimento
- `freight_cost` numeric(14,2)
- `keywords` text[] default '{}' — palavras-chave para matching
- `is_active` boolean NOT NULL default true
- `created_at` / `updated_at` timestamptz NOT NULL default `now()`
- Índices: `idx_products_owner (owner_id)`, `idx_products_catmat (catmat_catser_code)`, `idx_products_category (category)`, GIN em `keywords`.

### `suppliers`
Propósito: fornecedores cadastrados para comparação de preço, prazo, frete e condições.
- `id` uuid PK default `gen_random_uuid()`
- `owner_id` uuid NOT NULL FK → `auth.users(id)`
- `name` text NOT NULL
- `contact_info` text
- `payment_terms_days` int — prazo de pagamento ao fornecedor
- `default_freight_cost` numeric(14,2)
- `created_at` / `updated_at` timestamptz NOT NULL default `now()`
- Índices: `idx_suppliers_owner (owner_id)`.

### `product_suppliers`
Propósito: liga produto↔fornecedor com preço/prazo/frete/condições específicos daquela combinação.
- `id` uuid PK default `gen_random_uuid()`
- `owner_id` uuid NOT NULL FK → `auth.users(id)`
- `product_id` uuid NOT NULL FK → `products(id)` ON DELETE CASCADE
- `supplier_id` uuid NOT NULL FK → `suppliers(id)` ON DELETE CASCADE
- `unit_price` numeric(14,2) NOT NULL
- `lead_time_days` int
- `freight_cost` numeric(14,2)
- `payment_terms_days` int
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_prodsup_product (product_id)`, `idx_prodsup_supplier (supplier_id)`, `unique(product_id, supplier_id)`.

### `sources`
Propósito: catálogo das fontes/plataformas de licitação integradas (ComprasNet, PNCP e outros sites gratuitos).
- `id` uuid PK default `gen_random_uuid()`
- `slug` text NOT NULL UNIQUE — ex: `pncp`, `comprasnet`
- `name` text NOT NULL
- `base_url` text
- `integration_type` text NOT NULL — `api` | `feed`
- `is_active` boolean NOT NULL default true
- `last_synced_at` timestamptz
- Índices: `unique(slug)`.

### `opportunities`
Propósito: cada licitação captada das fontes, com todos os campos exibidos na página da oportunidade e usados nos filtros.
- `id` uuid PK default `gen_random_uuid()`
- `owner_id` uuid NOT NULL FK → `auth.users(id)`
- `source_id` uuid NOT NULL FK → `sources(id)`
- `source_external_id` text NOT NULL — id do processo na fonte (para dedupe)
- `source_url` text NOT NULL — link para o processo original
- `agency_name` text — órgão
- `process_number` text — número do processo
- `modality` text — modalidade (pregão, dispensa etc.)
- `object_description` text — objeto
- `category` text
- `catmat_catser_code` text
- `estimated_value` numeric(14,2) — valor
- `quantity` numeric(14,2)
- `state` text — UF
- `city` text
- `session_date` timestamptz — data da sessão
- `delivery_deadline_days` int — prazo de entrega
- `payment_deadline_days` int — prazo de pagamento
- `status_situation` text — situação (aberta, encerrada etc.)
- `is_me_epp` boolean — destinada a ME/EPP
- `requires_sample` boolean
- `requires_certificate` boolean — atestado
- `requires_warranty` boolean — garantia
- `requires_min_capital` boolean — capital social
- `closing_date` timestamptz — encerramento
- `is_compatible` boolean NOT NULL default false — cruzou com o catálogo
- `raw_payload` jsonb — dado bruto da fonte
- `created_at` / `updated_at` timestamptz NOT NULL default `now()`
- Índices: `unique(source_id, source_external_id)`, `idx_opp_owner (owner_id)`, `idx_opp_state (state)`, `idx_opp_category (category)`, `idx_opp_catmat (catmat_catser_code)`, `idx_opp_modality (modality)`, `idx_opp_value (estimated_value)`, `idx_opp_session (session_date)`, `idx_opp_closing (closing_date)`, `idx_opp_compatible (is_compatible)`, GIN em `raw_payload`, índice de texto (`to_tsvector`) sobre `object_description` para busca por palavra-chave.

### `opportunity_products`
Propósito: registra quais produtos do catálogo cruzaram com cada oportunidade (o "match").
- `id` uuid PK default `gen_random_uuid()`
- `opportunity_id` uuid NOT NULL FK → `opportunities(id)` ON DELETE CASCADE
- `product_id` uuid NOT NULL FK → `products(id)` ON DELETE CASCADE
- `match_reason` text — categoria | catmat | keyword
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_oppprod_opp (opportunity_id)`, `idx_oppprod_prod (product_id)`, `unique(opportunity_id, product_id)`.

### `opportunity_scores`
Propósito: guarda o score 0–100 de cada oportunidade e os motivos detalhados da pontuação.
- `id` uuid PK default `gen_random_uuid()`
- `opportunity_id` uuid NOT NULL FK → `opportunities(id)` ON DELETE CASCADE
- `score` int NOT NULL — 0 a 100
- `classification` text NOT NULL — `green` | `yellow` | `red`
- `factors` jsonb NOT NULL — breakdown (compatibilidade, valor, margem, concorrência, prazo, complexidade, habilitação, capital, logística, me_epp)
- `reasons` text[] NOT NULL default '{}' — motivos legíveis exibidos ao operador
- `computed_at` timestamptz NOT NULL default `now()`
- Índices: `unique(opportunity_id)`, `idx_score_value (score)`, `idx_score_class (classification)`.

### `edital_analyses`
Propósito: resultado da análise de edital por IA (disparada automaticamente ao detectar licitação compatível).
- `id` uuid PK default `gen_random_uuid()`
- `opportunity_id` uuid NOT NULL FK → `opportunities(id)` ON DELETE CASCADE
- `status` text NOT NULL default 'pending' — `pending` | `processing` | `done` | `error`
- `pdf_storage_path` text — caminho no Storage (bucket `editais`)
- `object_extracted` text
- `items_json` jsonb — itens e quantidades
- `values_json` jsonb
- `dates_json` jsonb
- `delivery_info` text — prazo e local de entrega
- `payment_info` text
- `required_documents` text[] — documentos exigidos
- `habilitation_info` text — habilitação
- `samples_info` text
- `warranties_info` text
- `certificates_info` text — atestados
- `penalties_info` text
- `risk_points` text[] — pontos de atenção e riscos
- `ai_model_used` text
- `created_at` / `updated_at` timestamptz NOT NULL default `now()`
- Índices: `unique(opportunity_id)`, `idx_analysis_status (status)`.

### `financial_simulations`
Propósito: simulação financeira salva de uma oportunidade (o operador pode ajustar fornecedor/frete e recalcular).
- `id` uuid PK default `gen_random_uuid()`
- `owner_id` uuid NOT NULL FK → `auth.users(id)`
- `opportunity_id` uuid NOT NULL FK → `opportunities(id)` ON DELETE CASCADE
- `selected_supplier_id` uuid FK → `suppliers(id)`
- `revenue` numeric(14,2) — receita
- `product_cost` numeric(14,2)
- `freight_cost` numeric(14,2)
- `tax_cost` numeric(14,2) — impostos
- `other_costs` numeric(14,2)
- `profit` numeric(14,2) — lucro
- `margin_pct` numeric(5,2)
- `required_capital` numeric(14,2)
- `max_recommended_bid` numeric(14,2) — preço máximo de lance
- `cash_flow_impact` jsonb — impacto no fluxo (pagamento fornecedor x recebimento órgão)
- `created_at` / `updated_at` timestamptz NOT NULL default `now()`
- Índices: `idx_sim_opp (opportunity_id)`, `idx_sim_owner (owner_id)`.

### `pipeline_items`
Propósito: controla a etapa de cada oportunidade no pipeline e o estado de favorito/descartado.
- `id` uuid PK default `gen_random_uuid()`
- `owner_id` uuid NOT NULL FK → `auth.users(id)`
- `opportunity_id` uuid NOT NULL FK → `opportunities(id)` ON DELETE CASCADE
- `stage` text NOT NULL default 'novas' — `novas`|`analisando`|`interessante`|`cotacao`|`participar`|`vencida`|`compra`|`entrega`|`pagamento`|`concluida`
- `is_favorite` boolean NOT NULL default false
- `is_discarded` boolean NOT NULL default false
- `notes` text
- `updated_at` timestamptz NOT NULL default `now()`
- Índices: `unique(opportunity_id)`, `idx_pipeline_stage (stage)`, `idx_pipeline_favorite (is_favorite)`, `idx_pipeline_discarded (is_discarded)`, `idx_pipeline_owner (owner_id)`.

### `participation_history`
Propósito: registra o resultado real das licitações participadas para alimentar os relatórios de inteligência.
- `id` uuid PK default `gen_random_uuid()`
- `owner_id` uuid NOT NULL FK → `auth.users(id)`
- `opportunity_id` uuid FK → `opportunities(id)`
- `result` text NOT NULL — `won` | `lost`
- `winning_value` numeric(14,2) — valor vencedor
- `our_bid_value` numeric(14,2)
- `actual_profit` numeric(14,2) — lucro real
- `actual_margin_pct` numeric(5,2)
- `competitors_count` int — concorrência
- `agency_name` text
- `main_product_id` uuid FK → `products(id)`
- `recorded_at` timestamptz NOT NULL default `now()`
- Índices: `idx_hist_owner (owner_id)`, `idx_hist_result (result)`, `idx_hist_product (main_product_id)`, `idx_hist_opp (opportunity_id)`.

### `notifications`
Propósito: central de alertas internos exibidos no dashboard (novas compatíveis, encerrando, alto score, alterações).
- `id` uuid PK default `gen_random_uuid()`
- `owner_id` uuid NOT NULL FK → `auth.users(id)`
- `opportunity_id` uuid FK → `opportunities(id)` ON DELETE CASCADE
- `type` text NOT NULL — `new_compatible` | `closing_soon` | `high_score` | `process_changed`
- `title` text NOT NULL
- `message` text
- `is_read` boolean NOT NULL default false
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_notif_owner (owner_id)`, `idx_notif_unread (owner_id, is_read)`, `idx_notif_created (created_at)`.

### `sync_logs`
Propósito: auditoria de cada varredura de fonte (quando rodou, quantas oportunidades trouxe, erros) — útil para conformidade LGPD e diagnóstico.
- `id` uuid PK default `gen_random_uuid()`
- `source_id` uuid NOT NULL FK → `sources(id)`
- `started_at` / `finished_at` timestamptz
- `status` text NOT NULL — `success` | `error`
- `opportunities_found` int default 0
- `error_message` text
- Índices: `idx_synclog_source (source_id)`, `idx_synclog_started (started_at)`.

---

## 2. RLS e autenticação

**Autenticação:** Supabase Auth com **e-mail + senha** (login descrito no processo: "faz login com e-mail e senha"). Como é uso privado de uma única empresa, o cadastro público fica desabilitado — o(s) usuário(s) Operador é(são) criado(s) manualmente pelo dono. Magic link fica disponível como opção de conveniência; OAuth não é necessário no lançamento. **RLS habilitado em todas as tabelas.**

Regra geral: como todo dado pertence à empresa e o `owner_id` amarra ao `auth.uid()`, as políticas seguem o padrão "o usuário autenticado dono da linha faz tudo". As tabelas escritas automaticamente pelo backend (varredura, IA, score) são gravadas pelas Edge Functions usando a **service_role key** (que ignora RLS), enquanto o Operador as lê via RLS.

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `company_settings` | dono (`owner_id = auth.uid()`) | dono | dono | dono |
| `products` | dono | dono | dono | dono |
| `suppliers` | dono | dono | dono | dono |
| `product_suppliers` | dono | dono | dono | dono |
| `sources` | authenticated (leitura) | service_role | service_role | service_role |
| `opportunities` | dono | service_role (varredura) | service_role | service_role |
| `opportunity_products` | dono (via join `opportunities.owner_id`) | service_role | service_role | service_role |
| `opportunity_scores` | dono (via join) | service_role | service_role | service_role |
| `edital_analyses` | dono (via join) | service_role | service_role | service_role |
| `financial_simulations` | dono | dono (salvar simulação) | dono | dono |
| `pipeline_items` | dono | dono | dono | dono |
| `participation_history` | dono | dono | dono | dono |
| `notifications` | dono | service_role | dono (marcar lida) | dono |
| `sync_logs` | dono/authenticated | service_role | service_role | — |

Para tabelas derivadas de `opportunities` (scores, analyses, opportunity_products), a política de SELECT usa `EXISTS (SELECT 1 FROM opportunities o WHERE o.id = <fk> AND o.owner_id = auth.uid())`. Conformidade LGPD: nenhum dado pessoal de terceiros é armazenado além de contatos de fornecedores inseridos pelo próprio Operador; `sync_logs` documenta a origem legal de cada captação.

---

## 3. Functions/endpoints

### Edge Functions (Deno)

- **`sync-sources`** — varre as fontes ativas (ComprasNet/PNCP e outros feeds gratuitos), normaliza e faz UPSERT em `opportunities` (dedupe por `source_id + source_external_id`), grava `sync_logs`. Após inserir, chama internamente o matching e o score. **Quando:** Cron (várias vezes ao dia) e botão manual "Sincronizar agora".
- **`match-opportunities`** — para oportunidades novas, cruza `object_description`/`category`/`catmat_catser_code`/`keywords` contra `products`, grava `opportunity_products` e marca `is_compatible`. **Quando:** logo após `sync-sources` (encadeada) e após criação/edição de produtos.
- **`analyze-edital`** — baixa o PDF do edital da fonte, salva no Storage (bucket `editais`), envia para a IA e preenche `edital_analyses`. **Quando:** automática ao detectar nova licitação compatível (conforme sua resposta "análise automática"); também acionável manualmente.
- **`compute-score`** — calcula o Score 0–100 (fatores: compatibilidade, valor, margem, concorrência, prazos, complexidade do edital vinda da IA, habilitação, capital, logística, ME/EPP), aplica os cortes de `company_settings` e grava `opportunity_scores` + gera `notifications` de alto score. **Quando:** após `analyze-edital` e quando o Operador altera parâmetros da empresa.
- **`run-financial-simulation`** — recebe oportunidade + fornecedor selecionado e retorna receita, custos, lucro, margem, capital necessário, preço máximo de lance e impacto no fluxo de caixa; opcionalmente salva em `financial_simulations`. **Quando:** ao abrir a página da oportunidade e quando o Operador ajusta o simulador.
- **`generate-alerts`** — varre oportunidades para gerar `notifications` de "encerrando hoje/próximos dias" e "alterações no processo". **Quando:** Cron diário.

### Postgres RPCs

- **`get_top_10_opportunities()`** — retorna as 10 melhores oportunidades do dia priorizando score, compatibilidade, capital disponível, margem mínima e região de atendimento (de `company_settings`), com produto, órgão, valor, prazo, local, score, lucro estimado, capital necessário e riscos. **Quando:** botão "Quais são as 10 melhores oportunidades hoje?" (sob demanda, conforme sua resposta).
- **`get_dashboard_metrics()`** — agrega novas oportunidades, encerrando hoje/próximos dias, valor total, favoritas, contagens por categoria/órgão/modalidade para os gráficos. **Quando:** carga do dashboard.
- **`search_opportunities(filters jsonb)`** — busca com todos os filtros combináveis (palavra-chave, categoria, CATMAT, valor mín/máx, estado, município, órgão, modalidade, data da sessão, prazos, quantidade, situação, ME/EPP, exigências, fonte). **Quando:** página de busca.
- **`get_intelligence_report()`** — calcula taxa de vitória, lucro médio, produtos mais rentáveis, órgãos que mais compram, valores vencedores e histórico de preços a partir de `participation_history`. **Quando:** página de histórico/inteligência.
- **`move_pipeline_stage(opportunity_id, stage)`** — atualiza a etapa do pipeline. **Quando:** arrastar/mover card no pipeline.

---

## 4. Páginas do frontend

- **`/login`** — Autenticação. Login por e-mail/senha (e magic link opcional) do Operador; sem cadastro público.
- **`/dashboard`** — Painel principal. Mostra novas oportunidades, encerrando hoje/próximos dias, valor total, favoritas, contagens e gráficos por categoria/órgão/modalidade, a central de notificações e o botão "Quais são as 10 melhores oportunidades hoje?".
- **`/melhores-do-dia`** — Lista das 10 melhores. Exibe cada oportunidade com produto, órgão, valor, prazo, local, score 🟢/🟡/🔴, lucro estimado, capital necessário, riscos e link para participar (via `get_top_10_opportunities`).
- **`/busca`** — Busca e filtros. Permite combinar todos os filtros (o exemplo "material de limpeza no ES, R$5k–50k, ME/EPP, entrega até 15 dias") e abrir/favoritar resultados.
- **`/oportunidade/:id`** — Página da oportunidade. Mostra numa única tela órgão, processo, modalidade, produto, quantidade, valor, datas, prazos, exigências, score com motivos, lucro estimado, capital necessário, fornecedores compatíveis, análise de edital por IA, edital/anexos e link à fonte.
- **`/simulador/:opportunityId`** — Simulador financeiro. Ajusta fornecedor/frete/impostos e recalcula receita, custos, lucro, margem, capital, preço máximo de lance e impacto no fluxo de caixa.
- **`/pipeline`** — Controle das oportunidades. Board com as etapas NOVAS→...→CONCLUÍDA, permitindo favoritar, descartar, mover e registrar resultado.
- **`/produtos`** — Cadastro de produtos. Lista, cria e edita produtos (nome, categoria, CATMAT/CATSER, preço, margem mínima, prazo, frete, palavras-chave).
- **`/fornecedores`** — Cadastro de fornecedores. Cria/edita fornecedores e vincula produtos com preço, prazo, frete e condições, permitindo comparação lado a lado.
- **`/historico`** — Histórico e inteligência. Registra participações e mostra taxa de vitória, lucro médio, produtos mais rentáveis, órgãos que mais compram, valores vencedores e histórico de preços.
- **`/configuracoes`** — Parâmetros da empresa. Define capital disponível, margem mínima, região(ões) de atendimento, faixas de corte do score e impostos padrão; gerencia fontes ativas.

---

## 5. Integrações externas

Todas as integrações rodam via **Supabase Edge Functions** (nunca do frontend), com as chaves guardadas em secrets do Supabase.

- **PNCP (Portal Nacional de Contratações Públicas)** — API pública oficial documentada; principal fonte de captação de oportunidades reais. Usada em `sync-sources`.
- **ComprasNet / Compras.gov.br** — fonte oficial citada por você; captação via API/feed autorizado. Usada em `sync-sources`. (Somente endpoints técnica e legalmente permitidos — regra de não usar integrações fictícias.)
- **Outros portais gratuitos de compras públicas** — cadastrados em `sources` e integrados apenas quando oferecem API/feed com acesso permitido, cada um com seu adaptador em `sync-sources`.
- **API de IA — Google Gemini 2.5 Pro** — leitura e extração estruturada dos editais em PDF (objeto, itens, prazos, exigências, riscos). Escolhido pelo **contexto de 1M tokens e custo baixo** (~US$1.25/Mtok in), ideal para editais longos com volume moderado de dezenas por semana; o menor custo permite manter a análise automática ligada sem estourar orçamento. Usada em `analyze-edital`. Alternativa custo-eficiente para PDFs curtos: **Gemini 3.5 Flash**.
- **Supabase Storage (bucket `editais`)** — armazena os PDFs baixados das fontes para exibir edital/anexos na página da oportunidade e reprocessar a IA se preciso.
- **(Futuro, opcional) Resend** — envio de alertas por e-mail. No lançamento os alertas ficam na central interna do dashboard (você respondeu que prefere acessar e solicitar), mas o Free tier do Resend (100 e-mails/dia) atende caso queira ativar depois.

> **Custo estimado inicial (single-tenant, volume moderado):** Lovable Pro R$95/mês + Supabase Pro R$125/mês (recomendado pela varredura recorrente via Cron e Storage de PDFs) + Gemini pago por uso (dezenas de editais/semana → poucos dólares/mês). Resend fica no Free tier se ativado.
