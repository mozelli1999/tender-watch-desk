# Radar de Licitações

## Sobre o projeto

O **Radar de Licitações** é uma plataforma web privada e single-tenant, de uso exclusivo de uma única empresa que participa de licitações públicas no Brasil. O sistema centraliza oportunidades de fontes oficiais e gratuitas — ComprasNet/Compras.gov.br, PNCP e outros portais — cruza cada edital com o catálogo de produtos e fornecedores da empresa, calcula um **Score de 0 a 100** (🟢 Alta / 🟡 Moderada / 🔴 Baixa), analisa editais em PDF automaticamente via IA, roda um simulador financeiro de lucro/margem/capital e organiza tudo em um pipeline operacional. Sua função central é responder, sob demanda no dashboard, à pergunta que guia o negócio: **"Quais são as 10 melhores oportunidades para minha empresa hoje?"**. Toda a arquitetura roda sobre **Supabase** (PostgreSQL + RLS + Auth + Storage + Edge Functions + Realtime + Cron) com frontend gerado via **Lovable**.

## Antes de tudo

> ⚠️ **LEIA O `SKILL.md` ANTES DE ESCREVER QUALQUER LINHA DE CÓDIGO OU CRIAR QUALQUER TABELA.**
>
> O `SKILL.md` é o **guia operacional específico** de como construir o Radar de Licitações — não é documentação genérica. Ele define a ordem de construção, as convenções obrigatórias de nomes (tabelas/RPCs em `snake_case`, Edge Functions em `kebab-case`, rotas em kebab-case), o padrão de segurança (RLS por `owner_id = auth.uid()` e escrita via `service_role` nas tabelas populadas por varredura/IA/score), e as regras inegociáveis do projeto: **usar apenas fontes reais e legalmente permitidas** (sem integrações fictícias) e **jamais decidir automaticamente** se a empresa deve ou não participar de uma licitação — o sistema apenas apoia a análise. Ignorar o `SKILL.md` leva a retrabalho e a um pacote inconsistente.

## Mapa de arquivos

| Arquivo | O que contém | Quando consultar |
|---|---|---|
| **`SKILL.md`** | Guia operacional de como construir ESTE sistema: ordem de trabalho, convenções de nomes, regras de segurança/LGPD e regras de negócio inegociáveis. | **Primeiro de tudo**, antes de qualquer código. Reler sempre que iniciar uma nova feature. |
| **`docs/PROCESSO.md`** | O fluxo de negócio do Radar de Licitações: como uma oportunidade entra, é analisada, pontuada e avança no pipeline (NOVAS → ... → CONCLUÍDA). | Para entender o "porquê" antes de implementar qualquer módulo. |
| **`docs/ESTRUTURA.md`** | A estrutura técnica: caminho de build (Lovable + Supabase), módulos, nomes canônicos de tabelas/functions/rotas. | Sempre que precisar do nome exato de uma tabela, function ou rota. |
| **`docs/PRD.md`** | Documento de requisitos de produto: contexto, escopo, os 12 módulos e as decisões (single-tenant, análise automática de edital, alertas no dashboard). | Para validar escopo e prioridades de cada módulo. |
| **`docs/PRS.md`** | Requisitos de sistema (RF-01…): a lista detalhada e numerada do que cada função deve fazer. | Ao implementar uma feature, para checar o comportamento esperado (RF). |
| **`db/schemas.sql`** | Modelo de dados completo: tabelas, colunas, relacionamentos e políticas RLS. Base single-tenant vinculada a `auth.users(id)` via `owner_id`. | **Rodar antes de tudo no Supabase.** Consultar sempre que tocar em dados. |
| **`docs/PLANO.md`** | Plano de desenvolvimento em 3 fases (fundação → funcionalidades → polimento/lançamento), na ordem de dependência. | No início e a cada transição de fase, para saber o que construir a seguir. |
| **`docs/FUNCTIONS.md`** | Todas as Edge Functions (Deno) e RPCs: assinatura, autenticação (JWT do Operador vs `service_role`), entrada/saída — varredura, análise de edital, score, top 10. | Ao implementar backend, webhooks e integrações externas. |
| **`docs/PAGINAS.md`** | Documentação de cada página do frontend (rotas, estados de carregando/vazio/erro, componentes shadcn). Perfil único: Operador autenticado. | Ao construir cada tela no Lovable. |
| **`docs/DEPARA.md`** | Matriz de rastreabilidade banco ↔ backend ↔ frontend: qual tabela é tocada por quais functions e usada por quais páginas. | Para garantir consistência ponta a ponta e não quebrar nomes. |

## Primeiros passos no Lovable

> Caminho recomendado para este projeto (operação por equipe sem perfil técnico dedicado): **Lovable + Supabase**.

1. **Crie o projeto no Lovable** — inicie um novo projeto em branco. O Lovable gera React + Tailwind + shadcn/ui com integração nativa ao Supabase.
2. **Conecte/ative o Supabase** — no painel do Lovable, ative a integração com Supabase e vincule (ou crie) o projeto Supabase. Confirme que Auth, Storage e Edge Functions estão habilitados.
3. **Rode o `db/schemas.sql`** — no **SQL Editor** do Supabase, cole e execute todo o conteúdo de `db/schemas.sql`. Isso cria todas as tabelas e políticas RLS (`owner_id = auth.uid()`) antes de qualquer tela.
4. **Configure os secrets** — em *Edge Functions → Secrets* do Supabase, adicione as chaves necessárias (API de IA para análise de edital, credenciais/tokens das fontes de licitação como PNCP/ComprasNet). **Nunca** exponha secrets no frontend.
5. **Cole o prompt inicial referenciando os documentos** — no Lovable, oriente a IA assim:
   > "Leia `SKILL.md` primeiro. Construa o Radar de Licitações seguindo `docs/PLANO.md` na ordem das fases. Use os nomes exatos de tabelas/functions/rotas de `docs/ESTRUTURA.md` e `docs/DEPARA.md`. Comece pela Fase 1 (auth privada do Operador + layout + telas base) usando `docs/PAGINAS.md`. Não crie integrações fictícias e não decida automaticamente participação em licitações."
6. **Siga o `docs/PLANO.md` fase a fase** — só avance para funcionalidades (varredura, score, IA, simulador) depois que auth e banco estiverem prontos.

## Primeiros passos no Claude Code

> Caminho alternativo caso a manutenção fique com um time técnico: **Claude Code + Supabase** (mais flexível, mantido por quem sabe codar).

1. **Inicie o projeto** — crie o repositório e a estrutura base da stack escolhida pelo time sobre o Supabase (React + Vite + Tailwind é a escolha coerente com o restante do pacote).
2. **Configure a Supabase CLI e credenciais** — instale a Supabase CLI, faça `supabase login`, `supabase link --project-ref <ref>` e defina as variáveis de ambiente (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) em `.env` local — **nunca** commitadas.
3. **Rode o `db/schemas.sql`** — aplique o schema via `supabase db push` ou execute `db/schemas.sql` no SQL Editor. Confirme que as políticas RLS foram criadas.
4. **Configure os secrets das Edge Functions** — use `supabase secrets set` para as chaves de IA e das fontes de licitação; nunca no cliente.
5. **Aponte o Claude Code para ler o `SKILL.md` primeiro** — abra o repositório no Claude Code e instrua:
   > "Antes de qualquer código, leia `SKILL.md` por completo. Depois siga `docs/PLANO.md` na ordem das fases, respeitando os nomes canônicos de `docs/ESTRUTURA.md` e `docs/DEPARA.md`. Implemente as Edge Functions conforme `docs/FUNCTIONS.md` (respeitando JWT do Operador vs `service_role`) e as telas conforme `docs/PAGINAS.md`. Regras inegociáveis: só fontes reais/legais, sem decisão automática de participação, LGPD."
6. **Trabalhe por fase e valide com o `docs/DEPARA.md`** — a cada função/tela, cheque a matriz de rastreabilidade para manter banco, backend e frontend consistentes.
