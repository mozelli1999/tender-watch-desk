# Documentação de Páginas — Radar de Licitações

> Plataforma web privada single-tenant (perfil único **Operador**), construída via **Lovable + Supabase**. Todas as páginas exigem autenticação, exceto `/login`. As rotas seguem exatamente a ESTRUTURA técnica. Como há um único papel de usuário (Operador), não há variação de tela por perfil — quando "Permissões" for relevante, indicamos apenas Operador autenticado.

---

## Convenções gerais de estado

Para manter consistência entre as telas do Radar de Licitações, todas seguem o mesmo padrão de estados:

- **Carregando:** skeletons (shadcn `Skeleton`) nos cards, tabelas e gráficos enquanto os RPCs/Edge Functions do Supabase respondem.
- **Vazio:** ilustração + texto orientando a próxima ação (ex: "Cadastre um produto para começar").
- **Erro:** banner de erro (shadcn `Alert` destrutivo) com mensagem amigável e botão "Tentar novamente" que refaz a chamada.
- **Sessão expirada:** redireciona para `/login`.

---

### /login

**Rota:** `/login`

**Propósito:** autenticar o Operador da empresa por e-mail/senha (com magic link opcional), sem cadastro público.

**Seções da tela:**
- Logo/marca "Radar de Licitações" e subtítulo.
- Formulário de login: campo e-mail, campo senha, botão "Entrar".
- Link opcional "Entrar com link mágico" (magic link via Supabase Auth).
- Link "Esqueci minha senha".
- Nota discreta: "Acesso restrito à sua empresa — sem cadastro público".

**Estados:**
- **Vazio/inicial:** formulário limpo pronto para preenchimento.
- **Carregando:** botão "Entrar" com spinner e campos desabilitados durante a autenticação.
- **Erro:** mensagem "E-mail ou senha inválidos" abaixo do formulário; em falha de rede, alerta "Não foi possível conectar. Tente novamente".

**Permissões:** pública (única página não autenticada). Usuário já logado que acessa `/login` é redirecionado para `/dashboard`.

---

### /dashboard

**Rota:** `/dashboard`

**Propósito:** painel principal que consolida indicadores, gráficos, notificações e o disparo da pergunta diária das 10 melhores oportunidades.

**Seções da tela:**
- Barra de topo com nome da empresa e sino de notificações (contador de não lidas de `notifications`).
- Botão de destaque **"Quais são as 10 melhores oportunidades hoje?"** (leva a `/melhores-do-dia` via `get_top_10_opportunities`).
- Botão "Sincronizar agora" (dispara `sync-sources` manualmente).
- Cards de KPI: novas oportunidades, licitações encerrando hoje, encerrando nos próximos dias, valor total das oportunidades, favoritas (via `get_dashboard_metrics`).
- Gráficos: quantidade por categoria, por órgão e por modalidade (barras/pizza).
- Lista de oportunidades favoritas com atalho para a página da oportunidade.
- Central de notificações: novas compatíveis, encerrando, alto score, alterações no processo — com marcar como lida.

**Estados:**
- **Vazio:** quando não há oportunidades captadas ainda (ex: primeira varredura não rodou ou catálogo vazio), os KPIs mostram zero e um bloco orienta "Cadastre produtos em /produtos e sincronize as fontes para começar a captar oportunidades".
- **Carregando:** skeletons nos KPIs, gráficos e lista de favoritas enquanto `get_dashboard_metrics` responde.
- **Erro:** alerta no topo "Não foi possível carregar o painel" com "Tentar novamente"; se a sincronização manual falhar, toast de erro consultando `sync_logs`.

**Permissões:** Operador autenticado. Único papel; sem variação de tela.

---

### /melhores-do-dia

**Rota:** `/melhores-do-dia`

**Propósito:** apresentar sob demanda as 10 melhores oportunidades do dia, priorizadas por score, compatibilidade, capital, margem e região.

**Seções da tela:**
- Cabeçalho "As 10 melhores oportunidades para sua empresa hoje" com data e botão "Recalcular".
- Lista de até 10 cards, cada um exibindo: produto compatível, órgão, valor, prazo, local (UF/município), score com selo 🟢/🟡/🔴, lucro estimado, capital necessário, principais riscos e botão "Participar" (link à fonte original).
- Atalho em cada card para abrir `/oportunidade/:id`.
- Nota de rodapé: "O sistema auxilia na análise; a decisão de participar é sua".

**Estados:**
- **Vazio:** quando `get_top_10_opportunities` não retorna resultados (nenhuma oportunidade compatível dentro de capital/margem/região), mensagem "Nenhuma oportunidade compatível hoje. Revise seus produtos e parâmetros em /configuracoes ou aguarde a próxima varredura".
- **Carregando:** skeletons dos 10 cards enquanto o RPC calcula.
- **Erro:** alerta "Não foi possível calcular as melhores oportunidades" com "Tentar novamente".

**Permissões:** Operador autenticado.

---

### /busca

**Rota:** `/busca`

**Propósito:** buscar e filtrar todas as oportunidades captadas combinando múltiplos critérios.

**Seções da tela:**
- Barra de busca por produto/palavra-chave.
- Painel lateral de filtros combináveis: categoria, CATMAT/CATSER, valor mín/máx, estado, município, órgão, modalidade, data da sessão, prazo de entrega, prazo de pagamento, quantidade, situação, ME/EPP, exigências (amostra, atestado, garantia, capital social) e fonte/plataforma.
- Botões "Aplicar filtros" e "Limpar".
- Lista/tabela de resultados com valor, órgão, UF, modalidade, situação, score e ação de favoritar.
- Chips com os filtros ativos e contador de resultados (via `search_opportunities`).

**Estados:**
- **Vazio (sem filtro aplicado):** lista das oportunidades mais recentes ou dica "Combine filtros — ex: material de limpeza no ES, R$5k–50k, ME/EPP, entrega até 15 dias".
- **Vazio (sem resultados):** "Nenhuma oportunidade encontrada para esses filtros" com sugestão de afrouxar os critérios.
- **Carregando:** skeleton na tabela de resultados durante a chamada ao RPC.
- **Erro:** alerta "Falha ao buscar oportunidades" com "Tentar novamente".

**Permissões:** Operador autenticado. Só enxerga oportunidades do próprio `owner_id` (RLS).

---

### /oportunidade/:id

**Rota:** `/oportunidade/:id`

**Propósito:** mostrar em uma única tela todos os dados, score, análise de IA e simulação de uma oportunidade específica.

**Seções da tela:**
- Cabeçalho: órgão, número do processo, modalidade, situação e botão "Acessar processo na fonte" (link à fonte original).
- Bloco de dados: produto compatível, quantidade, valor estimado, data da sessão, prazo de entrega, prazo de pagamento, exigências (ME/EPP, amostra, atestado, garantia, capital social).
- Bloco de Score: selo 🟢/🟡/🔴, nota 0–100 e lista dos motivos/fatores (de `opportunity_scores`).
- Bloco financeiro resumido: lucro estimado, capital necessário e atalho para `/simulador/:opportunityId`.
- Fornecedores compatíveis (comparação de preço/prazo/frete).
- Bloco "Análise de edital por IA": objeto, itens e quantidades, valores, datas, prazo e local de entrega, pagamento, documentos exigidos, habilitação, amostras, garantias, atestados, penalidades e pontos de atenção/riscos.
- Edital e anexos (PDF do bucket `editais`).
- Ações do pipeline: favoritar, descartar, mover de etapa.

**Estados:**
- **Vazio (análise pendente):** o bloco de IA mostra "Análise de edital em processamento…" (quando `edital_analyses.status` = pending/processing) com opção de reprocessar; demais blocos já preenchidos com dados da fonte.
- **Carregando:** skeletons por bloco enquanto os dados da oportunidade, score e análise carregam.
- **Erro:** se o `id` não existir ou não pertencer ao Operador → tela "Oportunidade não encontrada"; se a análise de IA falhou (`status` = error) → alerta no bloco de IA com botão "Reprocessar edital"; erro geral com "Tentar novamente".

**Permissões:** Operador autenticado. Acesso apenas às oportunidades do próprio `owner_id` (RLS via join em `opportunities`).

---

### /simulador/:opportunityId

**Rota:** `/simulador/:opportunityId`

**Propósito:** calcular e ajustar a simulação financeira de uma oportunidade, incluindo preço máximo de lance e impacto no fluxo de caixa.

**Seções da tela:**
- Resumo da oportunidade (órgão, valor, produto) no topo.
- Painel de parâmetros ajustáveis: fornecedor selecionado, custo de frete, impostos (%), outros custos.
- Painel de resultados: receita, custo dos produtos, frete, impostos, outros custos, lucro estimado, margem (%), capital necessário e preço máximo recomendado para o lance.
- Bloco de impacto no fluxo de caixa: linha do tempo pagamento ao fornecedor × recebimento do órgão.
- Botões "Recalcular" (chama `run-financial-simulation`) e "Salvar simulação" (grava em `financial_simulations`).

**Estados:**
- **Vazio:** ao abrir pela primeira vez, cálculo com valores padrão de `company_settings` (impostos padrão) e do produto/fornecedor compatível; se não houver fornecedor cadastrado, aviso "Cadastre fornecedores em /fornecedores para simular custos reais".
- **Carregando:** spinner nos campos de resultado durante o recálculo pela Edge Function.
- **Erro:** alerta "Não foi possível calcular a simulação" com "Tentar novamente"; se o `opportunityId` for inválido → "Oportunidade não encontrada".

**Permissões:** Operador autenticado. Simula/salva apenas sobre oportunidades do próprio `owner_id`.

---

### /pipeline

**Rota:** `/pipeline`

**Propósito:** controlar visualmente cada oportunidade nas etapas do funil, favoritar, descartar e registrar resultado.

**Seções da tela:**
- Board Kanban com colunas: NOVAS → ANALISANDO → INTERESSANTE → COTAÇÃO → PARTICIPAR → VENCIDA → COMPRA → ENTREGA → PAGAMENTO → CONCLUÍDA.
- Cards arrastáveis com produto, órgão, valor e selo de score; ações rápidas de favoritar/descartar.
- Contador de itens por coluna.
- Ao mover para etapas finais (VENCIDA/CONCLUÍDA), abre modal para registrar resultado real (valor vencedor, nosso lance, lucro real, concorrentes) → alimenta `participation_history`.
- Filtro para ocultar descartados.

**Estados:**
- **Vazio:** board com colunas vazias e mensagem "Nenhuma oportunidade no pipeline ainda — favorite ou avance oportunidades a partir da busca ou do dashboard".
- **Carregando:** skeletons nos cards de cada coluna.
- **Erro:** toast "Não foi possível mover a oportunidade" ao falhar `move_pipeline_stage` (card volta à posição anterior); alerta geral com "Tentar novamente".

**Permissões:** Operador autenticado. Move/registra apenas itens do próprio `owner_id`.

---

### /produtos

**Rota:** `/produtos`

**Propósito:** cadastrar e manter o catálogo de produtos usado para cruzar com as licitações.

**Seções da tela:**
- Lista/tabela de produtos com nome, categoria, CATMAT/CATSER, preço médio, margem mínima, prazo de fornecimento e status ativo/inativo.
- Botão "Novo produto".
- Formulário (modal ou lateral) de criar/editar: nome, categoria, código CATMAT/CATSER, preço médio de compra, margem mínima (%), prazo de fornecimento (dias), frete, palavras-chave para matching, ativo/inativo.
- Ação de excluir produto.
- Aviso de que ao salvar, o sistema re-executa o matching (`match-opportunities`).

**Estados:**
- **Vazio:** "Você ainda não cadastrou produtos. Cadastre o primeiro para que o Radar comece a encontrar licitações compatíveis" com CTA "Novo produto".
- **Carregando:** skeleton na tabela.
- **Erro:** alerta ao falhar o carregamento; validação inline no formulário (campos obrigatórios); toast de falha ao salvar.

**Permissões:** Operador autenticado. Só vê e edita produtos do próprio `owner_id`.

---

### /fornecedores

**Rota:** `/fornecedores`

**Propósito:** cadastrar fornecedores, vinculá-los a produtos e comparar preço, prazo, frete e condições de pagamento.

**Seções da tela:**
- Lista/tabela de fornecedores com nome, contato, prazo de pagamento e frete padrão.
- Botão "Novo fornecedor".
- Formulário de criar/editar fornecedor: nome, contato, prazo de pagamento (dias), frete padrão.
- Bloco de vínculo produto↔fornecedor (`product_suppliers`): selecionar produto, preço unitário, prazo, frete e condições daquele fornecedor.
- Tabela de comparação lado a lado dos fornecedores para um mesmo produto (preço, prazo, frete, condições).

**Estados:**
- **Vazio:** "Nenhum fornecedor cadastrado. Adicione fornecedores para comparar preços e simular custos" com CTA "Novo fornecedor".
- **Carregando:** skeleton na tabela e no bloco de comparação.
- **Erro:** alerta ao falhar carregamento; validação inline no formulário; toast de falha ao salvar vínculo.

**Permissões:** Operador autenticado. Fornecedores e vínculos restritos ao próprio `owner_id`.

---

### /historico

**Rota:** `/historico`

**Propósito:** registrar participações passadas e exibir os relatórios de inteligência que crescem com o tempo.

**Seções da tela:**
- Botão "Registrar participação" (formulário: oportunidade relacionada, resultado vencida/perdida, valor vencedor, nosso lance, lucro real, margem real, concorrentes, órgão, produto principal).
- Cards de indicadores: taxa de vitória, lucro médio.
- Gráficos/listas: produtos mais rentáveis, órgãos que mais compram, valores vencedores anteriores, concorrência e histórico de preços (via `get_intelligence_report`).
- Tabela de participações registradas.

**Estados:**
- **Vazio:** como o sistema começa do zero, mostra "Nenhum histórico ainda. Registre suas participações para desbloquear taxa de vitória, lucro médio e mais insights ao longo do tempo" com CTA "Registrar participação".
- **Carregando:** skeletons nos indicadores e gráficos.
- **Erro:** alerta "Não foi possível carregar os relatórios de inteligência" com "Tentar novamente"; validação inline no formulário de registro.

**Permissões:** Operador autenticado. Histórico e relatórios calculados apenas sobre o próprio `owner_id`.

---

### /configuracoes

**Rota:** `/configuracoes`

**Propósito:** definir os parâmetros da empresa que orientam a priorização e o score, e gerenciar as fontes ativas.

**Seções da tela:**
- Formulário de parâmetros da empresa (`company_settings`): capital disponível, margem mínima geral (%), estados de atendimento, municípios de atendimento, impostos padrão (%).
- Configuração das faixas de corte do score: nota mínima 🟢 (verde) e nota mínima 🟡 (amarelo) — abaixo é 🔴.
- Gestão de fontes (`sources`): lista de ComprasNet, PNCP e outros portais, com toggle ativo/inativo e data da última sincronização (`last_synced_at`); botão "Sincronizar agora".
- Bloco de conta: gerenciar acesso, alterar senha.
- Nota LGPD sobre origem legal das captações (referência a `sync_logs`).

**Estados:**
- **Vazio/inicial:** valores padrão do sistema (capital 0, margem 0, cortes 70/40) prontos para o Operador ajustar na configuração inicial.
- **Carregando:** skeleton nos formulários e na lista de fontes.
- **Erro:** alerta ao falhar carregamento/salvamento; validação inline (ex: corte 🟢 deve ser maior que 🟡); toast de sucesso ao salvar.

**Permissões:** Operador autenticado. Único papel do sistema; edita apenas os próprios parâmetros (`owner_id`).
