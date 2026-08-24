## Convenções

Este é o guia operacional para construir o **Radar de Licitações** — plataforma web **privada single-tenant** (uso exclusivo de uma empresa) que centraliza oportunidades de licitações públicas do Brasil (ComprasNet/Compras.gov.br, PNCP e outros portais gratuitos), calcula Score de 0–100, roda simulador financeiro e analisa editais por IA.

**Stack obrigatória (não negociável):**
- **Backend: sempre Supabase.** PostgreSQL gerenciado + Auth + Storage + Edge Functions (Deno) + Realtime + Cron (pg_cron). Nunca introduza Firebase, MongoDB, PlanetScale ou qualquer outro banco.
- **Frontend: caminho Lovable + Supabase**, conforme docs/PLANO.md e docs/PAGINAS.md. Foi escolhido porque a plataforma é para **uso interno de uma única empresa sem time de TI dedicado** (resposta 1: "só minha"). Lovable gera React + Tailwind + shadcn/ui com integração nativa ao Supabase — o caminho mais rápido do zero ao ar. NÃO troque para Next.js/Vue/Angular.
- **IA e integrações externas:** sempre via **Supabase Edge Functions** (nunca chamadas de API externa direto do frontend, para não vazar chaves). Chaves ficam em **secrets do Supabase**.
- **Automação recorrente:** **pg_cron + Edge Functions** (varredura diária de fontes, análise automática de editais). Nunca N8N nem Zapier.

**Nomenclatura (obrigatória, siga docs/DEPARA.md):**
- Tabelas e colunas do banco: **inglês, snake_case** (ex: `company_settings`, `owner_id`, `opportunities`).
- RPCs (funções Postgres): **snake_case** (ex: `get_top_10_opportunities`).
- Edge Functions: **kebab-case** (ex: `compute-score`, `analyze-edital`).
- Rotas do frontend: **kebab-case**.
- Qualquer divergência de nome quebra a rastreabilidade do pacote — o DE-PARA é a fonte da verdade.

**Modelo de acesso (single-tenant):**
- **Um único papel: Operador.** Não crie múltiplos perfis/roles. Toda tela (exceto `/login`) exige autenticação.
- Tabelas de dados do usuário vinculam a `auth.users(id)` via `owner_id`; tabelas derivadas de `opportunities` herdam a posse por join.
- Tabelas populadas automaticamente (varredura de fontes, IA, score) são escritas via **service_role** (ignora RLS) e lidas pelo Operador via RLS (`owner_id = auth.uid()`).

---

## Ordem de implementação recomendada

Siga as 3 fases de **docs/PLANO.md**, sempre na ordem de dependência. **Regra de ouro: nunca começar uma feature sem banco e auth prontos.**

**Fase 1 — Fundação:**
1. Rodar `db/schemas.sql` completo no Supabase (todas as tabelas, incluindo `company_settings`, `products`, `suppliers`, `opportunities`, pipeline, histórico).
2. Habilitar **RLS em toda tabela** com política `owner_id = auth.uid()` (e acesso `service_role` para tabelas de ingestão).
3. Configurar Auth (e-mail/senha, **sem cadastro público** — RF-01). Criar o usuário Operador manualmente.
4. Montar layout base e navegação no Lovable (shadcn/ui), com as rotas de docs/PAGINAS.md.
5. Criar Storage bucket para editais em PDF (com política de acesso restrita ao Operador).

**Fase 2 — Funcionalidades reais:**
6. Cadastro de produtos e fornecedores (módulos 5) — é a base do matching e do score.
7. `company_settings` (capital disponível, margem mínima, região, faixas de corte do score).
8. Edge Functions de **ingestão de fontes** (ComprasNet/Compras.gov.br, PNCP e outros gratuitos) + **pg_cron** para varredura diária. **Somente fontes com API/feed real e legalmente permitido — nunca dados fictícios.**
9. RPC `compute-score` e **matching** de oportunidades com o catálogo.
10. Edge Function `analyze-edital` (IA, **automática** ao detectar licitação compatível — resposta 2).
11. Simulador financeiro (módulo 6), página da oportunidade, pipeline (NOVAS → … → CONCLUÍDA), favoritos/descarte.
12. RPC `get_top_10_opportunities` (a função-âncora, módulo 12) — Operador **acessa o dashboard e solicita** (resposta 4), não é push automático.

**Fase 3 — Polimento e lançamento:**
13. Dashboard com gráficos e indicadores (módulo 2), busca e filtros combináveis (módulo 3).
14. Histórico e inteligência (módulo 10) — preparar para **incluir dados históricos com o tempo** (resposta 5: começa do zero).
15. Alertas in-app (resposta 4: sem canais externos no lançamento).
16. Estados vazio/erro/loading, testes de RLS, conformidade LGPD.

---

## Como usar cada documento durante o desenvolvimento

- **docs/PRD.md** — Leia primeiro para entender o "porquê" e o escopo do Radar de Licitações. Consulte quando tiver dúvida se uma feature está dentro do escopo (ex: é single-tenant, não SaaS).
- **docs/PRS.md** — Fonte dos requisitos funcionais (RF-01 a RF-nn). Antes de implementar qualquer módulo, localize o RF correspondente para saber o comportamento esperado. Ex: RF-04 define análise automática de edital.
- **db/schemas.sql** — A **única fonte de tabelas**. Antes de criar QUALQUER tabela ou coluna, confira se já existe aqui. Nunca invente tabela fora deste arquivo; se algo faltar, o schema precisa ser atualizado conscientemente, não improvisado no frontend.
- **docs/PLANO.md** — Consulte no início de cada sessão de trabalho para saber em que fase você está e qual a próxima dependência. Não pule fases.
- **docs/FUNCTIONS.md** — Antes de criar qualquer Edge Function ou RPC, releia a seção dela aqui: assinatura, auth (JWT do Operador vs service_role), payload e regras. Ex: antes de codar `compute-score`, confirme quais campos de `company_settings` ela lê.
- **docs/PAGINAS.md** — Antes de construir uma página no Lovable, releia a seção dela: rota, estados (loading/vazio/erro), componentes e dados consumidos. Todas as páginas seguem o padrão de estados definido aqui.
- **docs/DEPARA.md** — Consulte **antes de criar tabela, function ou página novas** para não duplicar e para acertar os nomes exatos. É a matriz que amarra banco ↔ backend ↔ frontend. Se um nome não bate com o DE-PARA, corrija antes de prosseguir.

---

## Gates de qualidade

Antes de considerar qualquer etapa "pronta", verifique:

**Banco / Segurança:**
- [ ] RLS **habilitado** em toda tabela nova, com política `owner_id = auth.uid()`.
- [ ] Tabelas de ingestão (varredura/IA/score) só escritas via **service_role**; nunca expostas para escrita direta pelo cliente.
- [ ] Nenhuma tabela criada fora de `db/schemas.sql`.
- [ ] Chaves de API (OpenAI/Anthropic/Gemini, fontes) apenas em **secrets do Supabase**, nunca no frontend.

**Nomenclatura / Consistência:**
- [ ] Nomes de tabela/RPC/function/rota batem **exatamente** com docs/DEPARA.md.
- [ ] Edge Functions em kebab-case, tabelas/RPCs em snake_case.

**Frontend / UX:**
- [ ] Estados **loading (skeletons), vazio e erro** implementados em cada página (padrão docs/PAGINAS.md).
- [ ] Toda oportunidade exibe **fonte original + link** para o processo (requisito do módulo 1).
- [ ] Score mostra os **motivos** da pontuação (módulo 4) e classificação 🟢/🟡/🔴.

**Regra de negócio (docs/PRS.md / PRD):**
- [ ] A função-âncora `get_top_10_opportunities` prioriza por catálogo, capital, margem mínima e região — e é **sob demanda** (Operador solicita no dashboard), não push.
- [ ] Análise de edital por IA dispara **automaticamente** ao detectar licitação compatível.
- [ ] Sistema **auxilia, não decide** se deve participar (nenhuma automação de decisão final).
- [ ] Filtros combináveis funcionando juntos (ex: categoria + estado + faixa de valor + ME/EPP + prazo).

---

## O que NÃO fazer

- **Não** usar outro banco além do Supabase. Nada de Firebase, MongoDB, Supabase + banco externo. Todo estado vive no Postgres do Supabase.
- **Não** trocar o frontend Lovable/React por Next.js, Vue ou Angular. O caminho é Lovable + Supabase.
- **Não** inventar tabelas, colunas ou RPCs fora de `db/schemas.sql` / docs/FUNCTIONS.md. Se faltar algo, atualize o schema conscientemente e reflita no DE-PARA.
- **Não** pular RLS "por enquanto". Toda tabela nasce com RLS habilitado.
- **Não** chamar APIs de IA ou fontes de licitação direto do frontend. Sempre via Edge Function com a chave em secret.
- **Não** transformar em SaaS multi-tenant nem criar múltiplos papéis de usuário. É **single-tenant, um único Operador** (resposta 1: "só minha").
- **Não** enviar os "top 10 do dia" automaticamente por e-mail/WhatsApp/push. O Operador **acessa o dashboard e solicita** (resposta 4). Alertas são in-app no lançamento.
- **Não** criar integrações fictícias ou dados sintéticos de licitação. **Somente fontes reais, com acesso técnico e legalmente permitido** (ComprasNet/Compras.gov.br, PNCP e outros gratuitos com API/feed documentado).
- **Não** fazer o sistema decidir automaticamente se a empresa deve participar de um edital — ele analisa e recomenda, a decisão é humana.
- **Não** assumir dados históricos existentes. O sistema **começa do zero** e deve permitir incluir histórico com o tempo (resposta 5) — não bloqueie telas por falta de histórico; trate estado vazio.
- **Não** usar N8N nem Zapier para automação. Use pg_cron + Edge Functions (ou Make para integrações simples no-code, se necessário).
