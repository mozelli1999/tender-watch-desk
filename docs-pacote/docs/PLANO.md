## Plano de Desenvolvimento — Radar de Licitações

Este plano constrói o **Radar de Licitações** em 3 fases, sempre na ordem de dependência: primeiro a fundação (banco, autenticação, layout), depois as funcionalidades reais descritas no PROCESSO/ESTRUTURA, e por fim o polimento e lançamento. O caminho de build é **Lovable + Supabase**, conforme definido na ESTRUTURA — toda a lógica pesada (varredura de fontes, IA de edital, score, cron) vive em Edge Functions e RPCs do Supabase.

> Regra de ouro: nunca começar uma feature sem o banco e o auth prontos. A Fase 1 cria toda a base; só depois entram as telas e automações.

---

## Fase 1 — Fundação

**Entregável:** Projeto no ar (vazio, mas navegável) com o banco de dados completo, autenticação por e-mail/senha funcionando e o layout base com menu lateral para todas as páginas.

**Tabelas envolvidas:** todas de `db/schemas.sql` (`company_settings`, `products`, `suppliers`, `product_suppliers`, `sources`, `opportunities`, `opportunity_products`, `opportunity_scores`, `edital_analyses`, `financial_simulations`, `pipeline_items`, `participation_history`, `notifications`, `sync_logs`) + RLS.
**Páginas envolvidas:** `/login`, shell/layout base com navegação para `/dashboard`, `/melhores-do-dia`, `/busca`, `/oportunidade/:id`, `/simulador/:opportunityId`, `/pipeline`, `/produtos`, `/fornecedores`, `/historico`, `/configuracoes`.
**Functions envolvidas:** nenhuma ainda (só a base).

**Checklist:**
- [ ] Criar o projeto no Lovable conectado ao Supabase
- [ ] Rodar `db/schemas.sql` no Supabase (todas as tabelas + índices)
- [ ] Ativar RLS e criar as políticas por `owner_id` conforme a matriz da ESTRUTURA
- [ ] Configurar Auth por e-mail/senha (magic link opcional), sem cadastro público
- [ ] Criar o layout base (menu lateral + rotas de todas as páginas, ainda vazias)
- [ ] Criar a tela `/configuracoes` para o Operador salvar capital, margem, região e cortes de score

---

## Fase 2 — Construção

**Entregável:** Todas as funcionalidades reais funcionando — cadastro de produtos/fornecedores, varredura de fontes, matching, análise de edital por IA, score, simulador financeiro, dashboard, busca, top 10 do dia, pipeline e histórico.

**Tabelas envolvidas:** `products`, `suppliers`, `product_suppliers`, `sources`, `opportunities`, `opportunity_products`, `opportunity_scores`, `edital_analyses`, `financial_simulations`, `pipeline_items`, `participation_history`, `notifications`, `sync_logs`.
**Páginas envolvidas:** `/produtos`, `/fornecedores`, `/dashboard`, `/melhores-do-dia`, `/busca`, `/oportunidade/:id`, `/simulador/:opportunityId`, `/pipeline`, `/historico`.
**Functions envolvidas:** `sync-sources`, `match-opportunities`, `analyze-edital`, `compute-score`, `run-financial-simulation`, `generate-alerts`; RPCs `get_top_10_opportunities`, `get_dashboard_metrics`, `search_opportunities`, `get_intelligence_report`, `move_pipeline_stage`.

**Checklist:**
- [ ] Construir `/produtos` e `/fornecedores` com vínculo produto↔fornecedor (preço/prazo/frete)
- [ ] Criar `sync-sources` (PNCP + ComprasNet) + `match-opportunities` e o botão "Sincronizar agora"
- [ ] Criar `analyze-edital` (PDF → Gemini) e `compute-score`, encadeadas após o matching
- [ ] Construir `/oportunidade/:id` + `/simulador/:opportunityId` com `run-financial-simulation`
- [ ] Construir `/dashboard` (`get_dashboard_metrics`) e `/busca` (`search_opportunities`)
- [ ] Construir `/melhores-do-dia` (`get_top_10_opportunities`), `/pipeline` e `/historico`

---

## Fase 3 — Polimento e lançamento

**Entregável:** Plataforma robusta e pronta para uso diário — estados vazio/erro/carregando em todas as telas, responsividade, automações agendadas (cron) e deploy final.

**Tabelas envolvidas:** `notifications`, `sync_logs`, `opportunities` (leitura para alertas).
**Páginas envolvidas:** todas (revisão de UX, responsividade, estados) + central de notificações no `/dashboard`.
**Functions envolvidas:** `generate-alerts`, agendamento por Cron de `sync-sources` e `generate-alerts`.

**Checklist:**
- [ ] Adicionar estados vazio/erro/carregando em todas as páginas e deixar tudo responsivo
- [ ] Ligar a central de notificações no dashboard (novas compatíveis, encerrando, alto score)
- [ ] Agendar Cron para `sync-sources` (várias vezes ao dia) e `generate-alerts` (diário)
- [ ] Testar a jornada diária completa e fazer o deploy final
