# DE-PARA — Radar de Licitações

Matriz de rastreabilidade que amarra **banco (tabelas)** ↔ **backend (Edge Functions + RPCs)** ↔ **frontend (páginas)**. Todos os nomes são os EXATOS definidos na ESTRUTURA: tabelas e RPCs em `snake_case`, Edge Functions em `kebab-case`, rotas em kebab-case. Se qualquer nome divergir, o pacote perde consistência.

---

## 1. Tabela (DB) → Functions/Endpoints → Páginas

| Tabela | Functions/Endpoints que a tocam | Páginas que a usam | Observação |
|---|---|---|---|
| `company_settings` | `compute-score` (lê cortes/capital/margem/região), `get_top_10_opportunities` (RPC, lê priorização), `run-financial-simulation` (lê `default_tax_pct`), `search_opportunities` (RPC, região p/ filtros) | `/configuracoes` (CRUD), `/melhores-do-dia`, `/simulador/:opportunityId` | Uma linha por operador (`unique(owner_id)`). CRUD só pelo dono via RLS. |
| `products` | `match-opportunities` (cruza catálogo), `run-financial-simulation` (custo/margem), `get_top_10_opportunities` (RPC), `search_opportunities` (RPC) | `/produtos` (CRUD), `/oportunidade/:id` (fornecedores compatíveis), `/simulador/:opportunityId` | Editar produto redispara `match-opportunities`. GIN em `keywords`. |
| `suppliers` | `run-financial-simulation` (fornecedor selecionado, prazo pgto) | `/fornecedores` (CRUD), `/oportunidade/:id`, `/simulador/:opportunityId` | Comparação lado a lado; `payment_terms_days` alimenta fluxo de caixa. |
| `product_suppliers` | `run-financial-simulation` (preço/prazo/frete por combinação) | `/fornecedores` (vincula produto↔fornecedor), `/simulador/:opportunityId` | `unique(product_id, supplier_id)`. CASCADE em delete de produto/fornecedor. |
| `sources` | `sync-sources` (lê ativas, atualiza `last_synced_at`), `search_opportunities` (RPC, filtro fonte) | `/configuracoes` (gerencia fontes ativas), `/busca` (filtro fonte), `/oportunidade/:id` (fonte original) | SELECT p/ authenticated; escrita só service_role. Catálogo PNCP/ComprasNet/outros. |
| `opportunities` | `sync-sources` (UPSERT via `source_id+source_external_id`), `match-opportunities`, `analyze-edital`, `compute-score`, `run-financial-simulation`, `generate-alerts`, `get_top_10_opportunities`, `get_dashboard_metrics`, `search_opportunities`, `move_pipeline_stage`, `get_intelligence_report` (join) | `/dashboard`, `/melhores-do-dia`, `/busca`, `/oportunidade/:id`, `/simulador/:opportunityId`, `/pipeline` | Tabela central. Escrita só por service_role (varredura); leitura pelo dono. Índice de texto sobre `object_description`. |
| `opportunity_products` | `match-opportunities` (grava match + `is_compatible`), `compute-score` (fator compatibilidade), `get_top_10_opportunities` (RPC) | `/oportunidade/:id` (produtos que cruzaram), `/melhores-do-dia` | `unique(opportunity_id, product_id)`. SELECT via join a `opportunities.owner_id`. |
| `opportunity_scores` | `compute-score` (grava score/classificação/fatores/motivos), `get_top_10_opportunities` (RPC), `get_dashboard_metrics`, `search_opportunities` (ordenação) | `/dashboard`, `/melhores-do-dia`, `/busca`, `/oportunidade/:id` (score + motivos) | `unique(opportunity_id)`. Cortes 🟢/🟡/🔴 vêm de `company_settings`. |
| `edital_analyses` | `analyze-edital` (baixa PDF, IA, preenche campos), `compute-score` (usa complexidade/habilitação extraídas) | `/oportunidade/:id` (análise de edital por IA) | `unique(opportunity_id)`. `pdf_storage_path` aponta p/ bucket `editais`. Disparada automaticamente em licitação compatível. |
| `financial_simulations` | `run-financial-simulation` (calcula e opcionalmente salva) | `/simulador/:opportunityId`, `/oportunidade/:id` (lucro/capital estimados) | CRUD pelo dono (salvar/editar simulação). `cash_flow_impact` em jsonb. |
| `pipeline_items` | `move_pipeline_stage` (RPC, muda etapa), `get_dashboard_metrics` (favoritas/contagens) | `/pipeline` (board), `/dashboard` (favoritas), `/busca` e `/oportunidade/:id` (favoritar/descartar) | `unique(opportunity_id)`. CRUD pelo dono. Estados favorito/descartado. |
| `participation_history` | `get_intelligence_report` (RPC, todos os indicadores) | `/historico` (registrar resultado + relatórios), `/pipeline` (registro ao concluir) | CRUD pelo dono. Começa vazio (sistema do zero); enriquece com o tempo. |
| `notifications` | `compute-score` (gera alto score), `generate-alerts` (encerrando/alterações), `match-opportunities` (novas compatíveis) | `/dashboard` (central de notificações), marcar lida via UPDATE do dono | INSERT só service_role; UPDATE/DELETE pelo dono. Tipos: new_compatible, closing_soon, high_score, process_changed. |
| `sync_logs` | `sync-sources` (grava início/fim/qtd/erros) | `/configuracoes` (diagnóstico de varredura) | Auditoria LGPD da origem legal de cada captação. Escrita só service_role. |

---

## 2. Function/Endpoint → Tabelas → Páginas (caminho inverso)

| Function/Endpoint | Tabelas que toca | Página(s) que chama | Observação |
|---|---|---|---|
| `sync-sources` (Edge) | `sources` (lê/atualiza), `opportunities` (UPSERT), `sync_logs` (grava) | `/configuracoes` (botão "Sincronizar agora") | Cron várias vezes ao dia + manual. Encadeia `match-opportunities`. Dedupe por `source_id+source_external_id`. |
| `match-opportunities` (Edge) | `products` (lê), `opportunities` (marca `is_compatible`), `opportunity_products` (grava match), `notifications` (new_compatible) | (interna) disparada por `sync-sources` e por `/produtos` (criar/editar) | Cruza por categoria/CATMAT/keyword. Encadeia `analyze-edital` para compatíveis. |
| `analyze-edital` (Edge) | `opportunities` (lê source_url), `edital_analyses` (grava), Storage bucket `editais` | `/oportunidade/:id` (exibe resultado); também acionável manualmente ali | Automática ao detectar compatível. IA = Google Gemini 2.5 Pro. Encadeia `compute-score`. |
| `compute-score` (Edge) | `company_settings` (cortes/capital/margem), `opportunities`, `opportunity_products`, `edital_analyses`, `opportunity_scores` (grava), `notifications` (high_score) | (interna) após `analyze-edital` e ao mudar params em `/configuracoes` | Score 0–100 + fatores + motivos. Recalcula em massa quando params mudam. |
| `run-financial-simulation` (Edge) | `opportunities`, `products`, `suppliers`, `product_suppliers`, `company_settings` (tax), `financial_simulations` (salva opcional) | `/simulador/:opportunityId`, `/oportunidade/:id` | Retorna receita/custos/lucro/margem/capital/lance máx/fluxo de caixa. Não decide participação. |
| `generate-alerts` (Edge) | `opportunities` (varre closing/alterações), `notifications` (grava) | `/dashboard` (consome notificações geradas) | Cron diário. Gera closing_soon e process_changed. |
| `get_top_10_opportunities()` (RPC) | `opportunities`, `opportunity_scores`, `opportunity_products`, `products`, `company_settings`, `financial_simulations` | `/melhores-do-dia` (botão "10 melhores hoje") | Sob demanda. Prioriza score + compatibilidade + capital + margem + região. |
| `get_dashboard_metrics()` (RPC) | `opportunities`, `opportunity_scores`, `pipeline_items`, `notifications` | `/dashboard` | Agrega novas/encerrando/valor total/favoritas/contagens p/ gráficos. |
| `search_opportunities(filters jsonb)` (RPC) | `opportunities`, `opportunity_scores`, `sources`, `company_settings` | `/busca` | Todos os filtros combináveis. Usa índice de texto e índices por state/category/catmat/modality/value/session. |
| `get_intelligence_report()` (RPC) | `participation_history`, `products`, `opportunities` (join) | `/historico` | Taxa de vitória, lucro médio, produtos rentáveis, órgãos, valores vencedores, histórico de preços. |
| `move_pipeline_stage(opportunity_id, stage)` (RPC) | `pipeline_items` (UPDATE), `opportunities` (validação FK) | `/pipeline` (mover card) | Atualiza etapa NOVAS→…→CONCLUÍDA. Registro de resultado feito em `/historico`. |

---

### Notas de consistência

- Nenhuma tabela ficou órfã: todas as 14 tabelas da ESTRUTURA aparecem na Tabela 1 e são tocadas por ao menos uma function/RPC.
- Nenhuma function/RPC ficou sem página de acionamento: `match-opportunities` e `compute-score` são internas (encadeadas), mas seus efeitos aparecem em `/oportunidade/:id`, `/melhores-do-dia`, `/dashboard` e `/busca`.
- Escritas automáticas (`sync-sources`, `match-opportunities`, `analyze-edital`, `compute-score`, `generate-alerts`) usam **service_role** (ignora RLS); leitura sempre pelo dono via `owner_id = auth.uid()`.
- Página `/login` não toca tabelas de dados (apenas Supabase Auth), por isso não figura na matriz de tabelas.
