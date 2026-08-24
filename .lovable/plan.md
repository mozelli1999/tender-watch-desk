# Radar de Licitações — Fundação (Etapa 0)

Objetivo desta etapa: deixar a base do projeto pronta e provar que o backend está conectado. **Nenhuma página de produto e nenhuma tabela** serão criadas agora.

## O que será feito

1. **Ativar o Lovable Cloud** (banco PostgreSQL, Auth, Storage e funções de servidor já provisionados, sem contas externas). Isso gera o cliente de acesso ao banco e as variáveis de ambiente do projeto.
2. **Verificação de conexão**: a página inicial (`/`) passa a ser uma tela mínima de status "Radar de Licitações — Fundação" que executa uma checagem real contra o backend e mostra:
   - conectado / não conectado
   - se a sessão de autenticação responde (esperado: sem usuário logado ainda)
   - mensagem de erro legível se algo falhar
3. **Metadados de página** (título/descrição/OG) próprios do Radar de Licitações, substituindo o placeholder do template.
4. **Documentação do pacote no repositório**: copiar `SKILL.md`, `README.md`, `docs/` e `db/schemas.sql` do ZIP enviado para dentro do projeto, para que as próximas fases sigam os nomes canônicos. O `schemas.sql` fica apenas como referência — não é executado nesta etapa.

## O que fica para as próximas etapas (não agora)

- Executar `db/schemas.sql` (14 tabelas + RLS por `owner_id = auth.uid()`).
- Auth privada do Operador e `/login`, sem cadastro público.
- Layout com navegação e as rotas `/dashboard`, `/melhores-do-dia`, `/busca`, `/oportunidade/:id`, `/simulador/:opportunityId`, `/pipeline`, `/produtos`, `/fornecedores`, `/historico`, `/configuracoes`.
- Funções de servidor (`sync-sources`, `match-opportunities`, `analyze-edital`, `compute-score`, ...), RPCs e cron.

## Detalhes técnicos

- Stack do projeto: React 19 + TanStack Start (Vite), Tailwind v4 e shadcn/ui — compatível com o caminho "Lovable + Supabase" da ESTRUTURA. As rotas ficam em `src/routes/` (kebab-case), como exige o roteamento por arquivos.
- A checagem de conexão roda em uma server function (`src/lib/health.functions.ts`) usando o cliente publishable no servidor, mais `supabase.auth.getSession()` no cliente. Nada de service role no frontend.
- Convenções registradas para as fases seguintes: tabelas/colunas/RPCs em `snake_case` (inglês), funções de backend em `kebab-case`, rotas em kebab-case, RLS habilitada em todas as tabelas.
- Observação de arquitetura: neste stack a lógica interna do app usa server functions do TanStack; integrações externas e webhooks usam rotas `api/public/*`. Onde a ESTRUTURA pede Edge Functions com `service_role`, o equivalente será implementado nessas camadas de servidor, mantendo as chaves fora do cliente.

## Critério de conclusão

Abrir a aplicação e ver a tela de status indicando conexão com o backend OK, sem erros no console.
