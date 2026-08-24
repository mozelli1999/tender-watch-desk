# Functions & Endpoints — Radar de Licitações

> Backend **Supabase** (PostgreSQL + Auth + Storage + Edge Functions Deno + Realtime + Cron/pg_cron).
> Frontend gerado via **Lovable** (React + Tailwind + shadcn/ui), consumindo estas functions.
>
> **Convenções de autenticação usadas neste documento:**
> - **Usuário logado (Operador):** requisição autenticada com JWT do Supabase Auth; sujeita a RLS (`owner_id = auth.uid()`).
> - **service_role (interno):** Edge Functions que escrevem em tabelas populadas automaticamente (varredura/IA/score). Usam a `service_role key` guardada em secrets do Supabase e **ignoram RLS**. Não são chamadas diretamente pelo frontend.
> - **Cron (pg_cron):** disparo agendado que invoca a Edge Function via `net.http_post`/`supabase_functions` com header interno secreto.
>
> Como o sistema é **single-tenant** (um único perfil "Operador", conforme resposta "só minha" empresa), não há papel "admin" separado — o Operador é o dono de tudo. Sinalizações **[extensão]** indicam functions/triggers que adicionei além do listado na ESTRUTURA para fechar regras de negócio do PROCESSO.

---

## Edge Functions

### `sync-sources`
**Propósito:** Varre as fontes ativas de licitação (PNCP, ComprasNet/Compras.gov.br e outros feeds gratuitos), normaliza e faz UPSERT das oportunidades captadas.

**Input (body):**
```json
{
  "source_slug": "pncp",          // opcional — se ausente, varre TODAS as sources ativas
  "trigger": "cron" | "manual"    // origem do disparo (para log)
}
```

**Output:**
```json
{
  "status": "success",
  "sources_processed": 3,
  "opportunities_found": 42,
  "opportunities_new": 18,
  "sync_log_ids": ["uuid", "..."]
}
```

**Regras de negócio / validações:**
- Só processa registros de `sources` com `is_active = true`.
- Cada fonte tem seu adaptador de normalização (mapeia o payload bruto → colunas de `opportunities`).
- **Dedupe obrigatório:** UPSERT por `unique(source_id, source_external_id)` — nunca duplica processo já captado; em conflito atualiza campos mutáveis (situação, encerramento, valor) e detecta alterações relevantes.
- **Rastreabilidade (regra de negócio):** toda oportunidade gravada DEVE ter `source_id` e `source_url` preenchidos; registro sem origem é descartado.
- **Legalidade (regra de negócio):** só consome endpoints técnica e legalmente permitidos; nunca cria integração fictícia.
- Guarda o payload original em `opportunities.raw_payload`.
- Grava uma linha em `sync_logs` por fonte (`started_at`, `finished_at`, `status`, `opportunities_found`, `error_message`) — auditoria/LGPD.
- Atualiza `sources.last_synced_at`.
- Ao final, **encadeia** a chamada de `match-opportunities` para as oportunidades novas/alteradas.
- Em UPSERT que altere situação/datas de um processo já existente, enfileira notificação `process_changed` (via `generate-alerts` ou inserção direta).

**Autenticação:** service_role (interna). Disparada por **Cron** (várias vezes ao dia) e pelo botão manual "Sincronizar agora" no `/configuracoes` (o frontend chama através de uma verificação de usuário logado, e a função assume service_role para escrever).

---

### `match-opportunities`
**Propósito:** Cruza oportunidades novas/alteradas contra o catálogo de produtos e marca as compatíveis.

**Input (body):**
```json
{
  "opportunity_ids": ["uuid", "..."],   // opcional — se ausente, processa is_compatible ainda não avaliadas
  "reason": "sync" | "product_changed"  // contexto do reprocessamento
}
```

**Output:**
```json
{
  "status": "success",
  "opportunities_evaluated": 18,
  "matches_created": 25,
  "opportunities_marked_compatible": 11
}
```

**Regras de negócio / validações:**
- Uma oportunidade é **compatível** quando cruza com ≥1 produto por: `category`, `catmat_catser_code`, ou `keywords` (busca full-text em `object_description` via `to_tsvector`).
- Grava em `opportunity_products` (`match_reason` = `category` | `catmat` | `keyword`), com `unique(opportunity_id, product_id)` para evitar duplicidade.
- Seta `opportunities.is_compatible = true` quando houver ao menos um match; caso contrário mantém `false`.
- Ao rodar por `product_changed` (após criar/editar produto), reavalia as oportunidades relevantes.
- Para toda oportunidade recém-marcada compatível: enfileira notificação `new_compatible` e **dispara `analyze-edital`** (análise automática de edital — resposta do usuário).

**Autenticação:** service_role (interna). Encadeada por `sync-sources` e por triggers/RPCs de produto; não exposta ao frontend.

---

### `analyze-edital`
**Propósito:** Baixa o PDF do edital, armazena no Storage e extrai por IA (Gemini 2.5 Pro) todos os dados estruturados do edital.

**Input (body):**
```json
{
  "opportunity_id": "uuid",
  "pdf_url": "https://...",   // opcional — se ausente, obtém de opportunities.source_url/raw_payload
  "force": false              // reprocessa mesmo se já houver análise done
}
```

**Output:**
```json
{
  "status": "done",
  "analysis_id": "uuid",
  "ai_model_used": "gemini-2.5-pro",
  "risk_points_count": 4
}
```

**Regras de negócio / validações:**
- Cria/atualiza `edital_analyses` com `status = processing` antes de chamar a IA; ao final `done` ou `error` (com mensagem).
- Baixa o PDF e salva em Storage bucket **`editais`** (`pdf_storage_path`).
- Envia para **Gemini 2.5 Pro** (contexto 1M tokens, custo baixo — escolhido para editais longos com volume moderado) e preenche: `object_extracted`, `items_json`, `values_json`, `dates_json`, `delivery_info`, `payment_info`, `required_documents`, `habilitation_info`, `samples_info`, `warranties_info`, `certificates_info`, `penalties_info`, `risk_points`.
- **Análise automática (regra de negócio):** disparada quando `match-opportunities` marca uma licitação como compatível; também acionável manualmente na página da oportunidade.
- Idempotência: se `status = done` e `force = false`, não reprocessa.
- Ao concluir, **encadeia `compute-score`** (o score usa complexidade e exigências de habilitação vindas desta análise).
- Não persiste dados pessoais de terceiros — apenas conteúdo público do edital (LGPD).

**Autenticação:** service_role (interna). Disparo automático via `match-opportunities`; disparo manual via chamada do frontend (usuário logado), que valida ownership da oportunidade antes de delegar.

---

### `compute-score`
**Propósito:** Calcula o Score 0–100 de uma oportunidade, classifica em 🟢/🟡/🔴 e registra os motivos.

**Input (body):**
```json
{
  "opportunity_id": "uuid",       // opcional
  "recompute_all": false          // true = recalcula todas as compatíveis (após mudar company_settings)
}
```

**Output:**
```json
{
  "status": "success",
  "scored": 1,
  "results": [
    { "opportunity_id": "uuid", "score": 82, "classification": "green" }
  ]
}
```

**Regras de negócio / validações:**
- Calcula o score ponderando os **fatores**: compatibilidade com produtos, valor, potencial de margem, concorrência, prazo de entrega/pagamento, complexidade do edital (de `edital_analyses`), exigências de habilitação, capital necessário, logística/região e possibilidade de ME/EPP.
- Grava `opportunity_scores` (`score`, `classification`, `factors` jsonb com breakdown, `reasons` text[] legíveis) — `unique(opportunity_id)` (UPSERT).
- **Classificação (regra de negócio):** aplica os cortes de `company_settings`: `>= score_green_min` → `green`; `>= score_yellow_min` → `yellow`; abaixo → `red`.
- **Despriorização (regra de negócio):** oportunidades fora da `service_states`/`service_cities` ou acima do `available_capital` recebem penalidade nos fatores (logística/capital).
- Sempre preenche `reasons` (motivos exibidos ao Operador) — o sistema auxilia, nunca decide participar.
- Gera notificação `high_score` quando `classification = green` (alto score).
- `recompute_all = true` reprocessa todas as compatíveis quando o Operador altera parâmetros da empresa.

**Autenticação:** service_role (interna). Encadeada por `analyze-edital`; e disparada ao salvar `/configuracoes` (usuário logado → função assume service_role).

---

### `run-financial-simulation`
**Propósito:** Calcula a simulação financeira (receita, custos, lucro, margem, capital, preço máximo de lance, impacto no fluxo de caixa) de uma oportunidade.

**Input (body):**
```json
{
  "opportunity_id": "uuid",
  "selected_supplier_id": "uuid",   // opcional — usa fornecedor mais vantajoso se ausente
  "overrides": {                    // opcional — ajustes do Operador no simulador
    "freight_cost": 1000,
    "tax_pct": 12.5,
    "other_costs": 1500,
    "bid_value": 30000
  },
  "save": true                      // true = persiste em financial_simulations
}
```

**Output:**
```json
{
  "revenue": 30000,
  "product_cost": 23000,
  "freight_cost": 1000,
  "tax_cost": 3600,
  "other_costs": 1500,
  "profit": 4500,
  "margin_pct": 15.0,
  "required_capital": 24000,
  "max_recommended_bid": 31200,
  "cash_flow_impact": {
    "supplier_payment_day": 30,
    "agency_receipt_day": 45,
    "gap_days": 15,
    "capital_locked": 24000
  },
  "simulation_id": "uuid|null"
}
```

**Regras de negócio / validações:**
- Receita = valor do lance/valor estimado; custo do produto vem de `product_suppliers` (do fornecedor escolhido) ou do mais vantajoso.
- Impostos calculados sobre a receita usando `overrides.tax_pct` ou `company_settings.default_tax_pct`.
- `max_recommended_bid` respeita a margem mínima (produto → geral em `company_settings`); nunca recomenda lance que viole a margem mínima.
- **Fluxo de caixa (regra de negócio):** `cash_flow_impact` considera prazo de pagamento ao fornecedor (`payment_terms_days`) vs. prazo de recebimento do órgão (`payment_deadline_days`).
- **O simulador nunca decide participar** — apenas recomenda o preço máximo (regra de negócio).
- Se `save = true`, grava em `financial_simulations` (com `owner_id = auth.uid()`).
- Valida ownership da oportunidade e do fornecedor.

**Autenticação:** Usuário logado (Operador). Retorna cálculo; ao salvar respeita RLS de `financial_simulations`.

---

### `generate-alerts`
**Propósito:** Gera notificações internas de "encerrando hoje/próximos dias" e "alterações no processo".

**Input (body):**
```json
{
  "window_days": 3,                        // horizonte de encerramento
  "types": ["closing_soon", "process_changed"]  // opcional
}
```

**Output:**
```json
{
  "status": "success",
  "notifications_created": 7,
  "by_type": { "closing_soon": 5, "process_changed": 2 }
}
```

**Regras de negócio / validações:**
- Para oportunidades compatíveis com `closing_date` entre hoje e `hoje + window_days`, cria notificação `closing_soon` (evita duplicar por oportunidade/tipo/dia).
- Cria `process_changed` para oportunidades cujo UPSERT recente alterou situação/datas/valor.
- Notificações ficam na central interna do dashboard (SUPOSIÇÃO do PROCESSO: alertas exibidos na própria plataforma; sem canal externo no lançamento).
- Grava em `notifications` (`owner_id`, `opportunity_id`, `type`, `title`, `message`).
- Alertas de `new_compatible` e `high_score` são gerados por `match-opportunities`/`compute-score`; esta função cobre os temporais.

**Autenticação:** service_role (interna). Disparada por **Cron diário** (pg_cron).

---

## Postgres Functions (RPC / Triggers / Cron)

### `get_top_10_opportunities()`
**Tipo:** RPC chamável pelo client (SECURITY INVOKER, respeita RLS).
**Propósito:** Retorna as 10 melhores oportunidades do dia — responde à pergunta central "Quais são as 10 melhores oportunidades hoje?".

**Input:** nenhum (usa `auth.uid()` e `company_settings` do Operador).

**Output (setof):**
```
produto, orgao (agency_name), valor (estimated_value), prazo (delivery_deadline_days),
local (state/city), score, classification, lucro_estimado, capital_necessario,
riscos (risk_points), source_url
```

**Regras que aplica:**
- **Priorização (regra de negócio):** ordena por `score` desc, mas prioriza compatibilidade com o catálogo, `available_capital`, `min_margin_pct` e região de atendimento (`service_states`/`service_cities`) de `company_settings`.
- Exclui oportunidades `is_discarded = true` (via `pipeline_items`) e encerradas.
- Considera só compatíveis (`is_compatible = true`).
- Junta score (`opportunity_scores`), lucro/capital (última `financial_simulations` ou cálculo estimado) e riscos (`edital_analyses.risk_points`).

**Quando dispara:** RPC via HTTP, sob demanda, no botão do `/dashboard` e na página `/melhores-do-dia` (resposta do usuário: acessa e solicita).

---

### `get_dashboard_metrics()`
**Tipo:** RPC chamável pelo client (respeita RLS).
**Propósito:** Agrega os indicadores do painel principal.

**Input:** nenhum (ou `{ "period_days": 7 }` opcional).

**Output (json):**
```json
{
  "new_opportunities": 18,
  "closing_today": 4,
  "closing_next_days": 11,
  "total_value": 1250000.00,
  "favorites_count": 6,
  "by_category": [{ "category": "Material de Limpeza", "count": 12 }],
  "by_agency": [{ "agency_name": "Prefeitura X", "count": 5 }],
  "by_modality": [{ "modality": "Pregão", "count": 9 }]
}
```

**Regras que aplica:**
- Só considera oportunidades do Operador (RLS), não descartadas.
- "novas" = criadas no período; "encerrando" usa `closing_date`; "favoritas" via `pipeline_items.is_favorite`.
- Agrupamentos por categoria/órgão/modalidade para os gráficos.

**Quando dispara:** RPC via HTTP, na carga do `/dashboard`.

---

### `search_opportunities(filters jsonb)`
**Tipo:** RPC chamável pelo client (respeita RLS).
**Propósito:** Busca com todos os filtros combináveis da página de busca.

**Input:**
```json
{
  "keyword": "material de limpeza",
  "category": null,
  "catmat_catser_code": null,
  "value_min": 5000,
  "value_max": 50000,
  "state": "ES",
  "city": null,
  "agency_name": null,
  "modality": null,
  "session_date_from": null,
  "session_date_to": null,
  "delivery_deadline_max_days": 15,
  "payment_deadline_max_days": null,
  "quantity_min": null,
  "status_situation": null,
  "is_me_epp": true,
  "requires_sample": null,
  "requires_certificate": null,
  "requires_warranty": null,
  "requires_min_capital": null,
  "source_slug": null,
  "sort": "score_desc",
  "limit": 50,
  "offset": 0
}
```

**Output (setof):** oportunidades com score/classification e flags de favorito/descarte, paginadas.

**Regras que aplica:**
- Todos os filtros são **combináveis** (AND); filtros nulos são ignorados.
- Busca por palavra-chave usa índice full-text (`to_tsvector` sobre `object_description`).
- Cobre o exemplo do usuário: "material de limpeza no ES, R$5k–50k, ME/EPP, entrega até 15 dias".
- Usa os índices dedicados (state, category, catmat, modality, value, session, closing).
- Respeita RLS (só dados do Operador).

**Quando dispara:** RPC via HTTP, na página `/busca` a cada aplicação de filtro.

---

### `get_intelligence_report()`
**Tipo:** RPC chamável pelo client (respeita RLS).
**Propósito:** Consolida os relatórios de inteligência a partir do histórico de participações.

**Input:** opcional `{ "date_from": "...", "date_to": "..." }`.

**Output (json):**
```json
{
  "win_rate_pct": 33.3,
  "avg_profit": 4200.00,
  "avg_margin_pct": 14.2,
  "most_profitable_products": [{ "product_id": "uuid", "name": "...", "total_profit": 18000 }],
  "top_buying_agencies": [{ "agency_name": "...", "count": 7 }],
  "past_winning_values": [{ "opportunity_id": "uuid", "winning_value": 28500 }],
  "price_history": [{ "product_id": "uuid", "avg_winning_value": 27000 }]
}
```

**Regras que aplica:**
- **Só calcula a partir de `participation_history`** registrado pelo Operador (regra de negócio) — vazio no início (sistema começa do zero), enriquece com o tempo.
- Taxa de vitória = `won` / total; lucro/margem médios de `actual_profit`/`actual_margin_pct`.
- Produtos mais rentáveis agrupados por `main_product_id`; órgãos por `agency_name`; concorrência de `competitors_count`.

**Quando dispara:** RPC via HTTP, na página `/historico`.

---

### `move_pipeline_stage(opportunity_id uuid, stage text)`
**Tipo:** RPC chamável pelo client (respeita RLS).
**Propósito:** Move uma oportunidade para outra etapa do pipeline.

**Input:** `opportunity_id`, `stage` (`novas`|`analisando`|`interessante`|`cotacao`|`participar`|`vencida`|`compra`|`entrega`|`pagamento`|`concluida`).

**Output:** `{ "id": "uuid", "stage": "cotacao", "updated_at": "..." }`

**Regras que aplica:**
- Valida que `stage` está no conjunto permitido; caso contrário lança erro.
- Faz UPSERT em `pipeline_items` (`unique(opportunity_id)`), atualizando `stage` e `updated_at`.
- Só o dono da oportunidade pode mover (RLS `owner_id = auth.uid()`).

**Quando dispara:** RPC via HTTP, ao arrastar/mover um card no board `/pipeline`.

---

### `upsert_pipeline_flag(opportunity_id uuid, favorite boolean, discard boolean)` **[extensão]**
**Tipo:** RPC chamável pelo client (respeita RLS).
**Propósito:** Favoritar/desfavoritar e descartar/reativar uma oportunidade — regra do PROCESSO ("permitir favoritar, descartar") não coberta por RPC explícita na ESTRUTURA.

**Input:** `opportunity_id`, `favorite` (nullable), `discard` (nullable).

**Output:** `{ "id": "uuid", "is_favorite": true, "is_discarded": false }`

**Regras que aplica:**
- UPSERT em `pipeline_items`; só atualiza os flags informados (não-nulos).
- **Descartadas saem da análise ativa; favoritas ficam em destaque** (regra de negócio) — usado por `get_top_10_opportunities` e `get_dashboard_metrics`.
- RLS: só o dono.

**Quando dispara:** RPC via HTTP, nos botões de favoritar/descartar em `/busca`, `/pipeline`, `/oportunidade/:id`.

---

### `record_participation_result(...)` **[extensão]**
**Tipo:** RPC chamável pelo client (respeita RLS).
**Propósito:** Registra o resultado real de uma participação — regra do PROCESSO ("ao mover para etapas finais, registra o resultado real") sem RPC explícita na ESTRUTURA.

**Input:**
```json
{
  "opportunity_id": "uuid",
  "result": "won" | "lost",
  "winning_value": 28500,
  "our_bid_value": 28000,
  "actual_profit": 4200,
  "actual_margin_pct": 15.0,
  "competitors_count": 6,
  "main_product_id": "uuid"
}
```

**Output:** `{ "history_id": "uuid" }`

**Regras que aplica:**
- Insere em `participation_history` com `owner_id = auth.uid()` e `agency_name` copiado da oportunidade.
- Alimenta `get_intelligence_report` (histórico cresce com o tempo — resposta do usuário).
- RLS: só o dono.

**Quando dispara:** RPC via HTTP, ao registrar resultado em etapas finais do `/pipeline` ou em `/historico`.

---

### `trg_products_after_change()` **[extensão]**
**Tipo:** Trigger de tabela (AFTER INSERT/UPDATE/DELETE em `products`).
**Propósito:** Reprocessar o matching quando o catálogo muda (a ESTRUTURA diz que `match-opportunities` roda "após criação/edição de produtos"; este trigger materializa esse gatilho).

**Input/Output:** contexto do trigger (NEW/OLD); sem retorno ao client.

**Regras que aplica:**
- Ao mudar `products` (categoria, CATMAT, keywords, ativação), invoca `match-opportunities` (via `net.http_post`/pg_net com header interno) com `reason = "product_changed"`.
- Evita reprocessamento em mudanças irrelevantes (só campos usados no matching).

**Quando dispara:** INSERT/UPDATE/DELETE em `products`.

---

### `trg_set_updated_at()` **[extensão]**
**Tipo:** Trigger de tabela (BEFORE UPDATE genérico).
**Propósito:** Manter `updated_at = now()` automaticamente nas tabelas com essa coluna (`company_settings`, `products`, `suppliers`, `opportunities`, `edital_analyses`, `financial_simulations`, `pipeline_items`).

**Regras que aplica:** seta `NEW.updated_at = now()` em cada UPDATE.

**Quando dispara:** BEFORE UPDATE nas tabelas que possuem `updated_at`.

---

### `cron_sync_sources` (agendamento pg_cron)
**Tipo:** Função de cron (pg_cron) que invoca a Edge Function `sync-sources`.
**Propósito:** Varredura recorrente das fontes de licitação.

**Regras que aplica:**
- Invoca `sync-sources` (`trigger = "cron"`, todas as sources ativas) via `net.http_post` com secret interno.
- Frequência **várias vezes ao dia** (SUPOSIÇÃO do PROCESSO: ajustável conforme volume real das fontes gratuitas) — ex.: `0 */4 * * *` (a cada 4h).

**Quando dispara:** agendamento pg_cron.

---

### `cron_generate_alerts` (agendamento pg_cron)
**Tipo:** Função de cron (pg_cron) que invoca a Edge Function `generate-alerts`.
**Propósito:** Gerar diariamente os alertas temporais (encerrando hoje/próximos dias, alterações).

**Regras que aplica:**
- Invoca `generate-alerts` (`window_days = 3`) via `net.http_post` com secret interno.
- Frequência **diária** — ex.: `0 7 * * *` (07:00, antes do Operador abrir o dashboard).

**Quando dispara:** agendamento pg_cron.

---

> **Encadeamento automático (bastidores):** `cron_sync_sources` → `sync-sources` → `match-opportunities` → (para compatíveis) `analyze-edital` → `compute-score` → notificações (`new_compatible`, `high_score`). Em paralelo, `cron_generate_alerts` → `generate-alerts` cobre os alertas temporais. Tudo isso alimenta os RPCs de leitura (`get_top_10_opportunities`, `get_dashboard_metrics`, `search_opportunities`) que o Operador consome sob demanda no frontend Lovable.
