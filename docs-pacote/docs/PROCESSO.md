## 1. Visão geral

O **Radar de Licitações** é uma plataforma web privada, de uso exclusivo da sua empresa, criada para resolver um problema real que você descreveu: as oportunidades de licitações públicas estão espalhadas em dezenas de fontes diferentes (ComprasNet, PNCP e outros portais gratuitos), o que torna quase impossível descobrir manualmente, todos os dias, quais editais valem a pena disputar. O Radar centraliza essas oportunidades, cruza cada uma com o catálogo de produtos e fornecedores da sua empresa, calcula automaticamente um **Score de 0 a 100** e um **simulador financeiro** de lucro, e ainda analisa o edital em PDF por IA para extrair prazos, exigências e riscos. O objetivo central, como você deixou claro, é responder todos os dias à pergunta: **"Quais são as 10 melhores oportunidades para minha empresa hoje?"** — sempre auxiliando na decisão, nunca decidindo automaticamente se você deve participar.

## 2. Papéis de usuário

- **Operador (você / equipe da sua empresa):** único perfil de uso da plataforma. Cadastra produtos e fornecedores, define margem mínima, capital disponível e região de atendimento, consulta o dashboard, analisa oportunidades, roda o simulador financeiro, gerencia o pipeline e registra o histórico de participações.

> Como você respondeu que a plataforma será usada **"só minha"** empresa (uso interno/privado, sem multi-tenant), o sistema tem um único papel de usuário. Todo o restante deste documento gira em torno da jornada do Operador.

## 3. Processo passo a passo por papel

### Operador — Configuração inicial (feita uma vez, no começo)

1. O Operador acessa a plataforma e faz login com e-mail e senha.
2. Cadastra os **produtos** da empresa, informando para cada um: nome, categoria, código CATMAT/CATSER, preço médio de compra, margem mínima aceitável, prazo de fornecimento e frete.
3. Cadastra os **fornecedores**, registrando preço, prazo, frete e condições de pagamento de cada um — permitindo comparação lado a lado depois.
4. Define os **parâmetros da empresa** que orientam a priorização: capital disponível, margem mínima geral e região(ões) de atendimento (estados e municípios em que a empresa entrega).
5. Como você indicou que o **sistema começa do zero**, o histórico de participações fica vazio no início, mas o Operador poderá alimentá-lo ao longo do tempo (ver jornada de histórico).

### Operador — Rotina diária (o coração do sistema)

1. O Operador abre o **Dashboard**, que mostra: novas oportunidades captadas, licitações encerrando hoje e nos próximos dias, valor total das oportunidades, favoritas, e a quantidade por categoria, órgão e modalidade, com gráficos e indicadores.
2. Como você respondeu que prefere **acessar o dashboard e solicitar** (em vez de receber automaticamente), o Operador clica em **"Quais são as 10 melhores oportunidades hoje?"** e o sistema apresenta a lista das 10 oportunidades mais bem pontuadas.
3. Para cada uma das 10, o Operador vê: produto, órgão, valor, prazo, local, score (🟢/🟡/🔴), lucro estimado, capital necessário, principais riscos e o link para participar na fonte original.
4. O Operador clica em uma oportunidade e abre a **Página da Oportunidade**, com tudo em uma tela: órgão, processo, modalidade, produto, quantidade, valor, datas, prazo de entrega, pagamento, exigências, score com seus motivos, lucro estimado, capital necessário, fornecedores compatíveis, edital e anexos, e link para a fonte original.
5. O Operador revisa a **análise de edital por IA** já pronta (extraída automaticamente do PDF): objeto, itens e quantidades, valores, datas, prazo e local de entrega, pagamento, documentos exigidos, habilitação, amostras, garantias, atestados, penalidades e pontos de atenção/riscos.
6. O Operador ajusta o **Simulador Financeiro** se quiser (ex: trocar o fornecedor, mudar o custo de frete) e vê receita, custo dos produtos, frete, impostos e outros custos, lucro, margem, capital necessário, preço máximo recomendado para o lance e o impacto no fluxo de caixa (considerando prazo de pagamento do fornecedor e recebimento do órgão).
7. Com base na análise, o Operador **decide manualmente** se favorita, descarta ou avança a oportunidade no pipeline.

### Operador — Busca e filtros (quando quer investigar algo específico)

1. O Operador acessa a **Busca** e combina filtros: produto/palavra-chave, categoria, CATMAT/CATSER, valor mín/máx, estado e município, órgão, modalidade, data da sessão, prazo de entrega, prazo de pagamento, quantidade, situação, ME/EPP, exigências (amostra, atestado, garantia, capital social) e fonte/plataforma.
2. Exemplo prático (o seu): filtra "material de limpeza no Espírito Santo, entre R$ 5.000 e R$ 50.000, destinadas a ME/EPP, com entrega em até 15 dias".
3. O sistema retorna a lista filtrada, e o Operador pode abrir qualquer oportunidade ou favoritá-la.

### Operador — Gestão do pipeline

1. O Operador acompanha cada oportunidade movendo-a pelas etapas: **NOVAS → ANALISANDO → INTERESSANTE → COTAÇÃO → PARTICIPAR → VENCIDA → COMPRA → ENTREGA → PAGAMENTO → CONCLUÍDA**.
2. Pode favoritar (para revisar depois) ou descartar (sai da lista de análise) qualquer item a qualquer momento.
3. Ao mover para etapas finais (VENCIDA, CONCLUÍDA etc.), o Operador registra o resultado real — alimentando o histórico e a inteligência da plataforma.

### Operador — Histórico e inteligência (cresce com o tempo)

1. Conforme participa de licitações, o Operador registra o resultado (vencida, perdida) e os dados financeiros reais.
2. A plataforma consolida os relatórios: taxa de vitória, lucro médio, produtos mais rentáveis, órgãos que mais compram, valores vencedores anteriores, concorrência e histórico de preços.
3. Como você respondeu que o **sistema começa do zero mas quer poder incluir dados históricos com o tempo**, esses relatórios ficam mais ricos à medida que o histórico é preenchido.

### Sistema — O que roda automaticamente nos bastidores (para o Operador)

1. Em intervalos programados, o sistema busca novas oportunidades nas fontes que você citou (**ComprasNet, PNCP e outros sites gratuitos** com acesso técnica e legalmente permitido), sempre registrando a fonte original e o link do processo.
2. Ao detectar uma nova licitação **compatível** com o catálogo, o sistema dispara **automaticamente a análise de edital por IA** (conforme você respondeu que quer análise automática).
3. O sistema calcula o Score e o simulador financeiro de cada oportunidade compatível.
4. O sistema gera os **alertas** internos: novas licitações compatíveis, licitações próximas do encerramento, oportunidades de alto score e alterações importantes no processo — que ficam visíveis no dashboard quando o Operador acessa.

## 4. Regras de negócio

- Regra: A plataforma é de uso exclusivo da sua empresa (um único perfil de acesso) — não há venda de acesso a terceiros nem separação por cliente.
- Regra: Só são captadas oportunidades de fontes com acesso técnica e legalmente permitido (ComprasNet, PNCP e outros sites gratuitos) — nunca integrações fictícias ou dados não autorizados.
- Regra: Toda oportunidade exibida deve conter a fonte original e o link para o processo — nenhuma oportunidade sem origem rastreável.
- Regra: A análise de edital por IA é disparada automaticamente quando uma nova licitação compatível é detectada.
- Regra: Uma oportunidade é considerada "compatível" quando cruza com pelo menos um produto do catálogo (por categoria, CATMAT/CATSER ou palavra-chave).
- Regra: O Score varia de 0 a 100 e é classificado como 🟢 Alta (faixa alta), 🟡 Moderada (faixa média) e 🔴 Baixa (faixa baixa), sempre exibindo os motivos que compõem a pontuação.
- Regra: A priorização das "10 melhores do dia" considera compatibilidade com o catálogo, capital disponível, margem mínima e região de atendimento — oportunidades fora da região ou acima do capital são despriorizadas.
- Regra: O simulador financeiro nunca substitui a decisão humana — o sistema recomenda o preço máximo de lance, mas a decisão de participar é sempre do Operador.
- Regra: A pergunta diária "quais são as 10 melhores oportunidades hoje?" é respondida sob demanda, quando o Operador solicita no dashboard (não enviada automaticamente).
- Regra: Oportunidades descartadas saem da lista de análise ativa; oportunidades favoritas permanecem em destaque no dashboard.
- Regra: O impacto no fluxo de caixa considera o prazo de pagamento do fornecedor versus o prazo de recebimento do órgão.
- Regra: O histórico e os indicadores de inteligência (taxa de vitória, lucro médio etc.) só são calculados a partir das participações registradas pelo Operador.
- Regra: O sistema deve tratar os dados em conformidade com a LGPD.

## 5. Suposições assumidas

- SUPOSIÇÃO: Os alertas serão exibidos dentro da própria plataforma (central de notificações no dashboard), já que você não indicou um canal externo específico (WhatsApp, e-mail) e respondeu que prefere acessar o dashboard e solicitar. Canais externos podem ser adicionados depois, se desejar.
- SUPOSIÇÃO: A faixa exata de corte entre Score 🟢/🟡/🔴 (ex: verde acima de 70, amarelo entre 40 e 70, vermelho abaixo de 40) será definida junto com você na configuração, pois não foi especificada.
- SUPOSIÇÃO: A frequência de varredura das fontes (ex: várias vezes ao dia) será ajustada conforme o volume real das fontes gratuitas, já que você não definiu periodicidade exata.
- SUPOSIÇÃO: Como você respondeu que a análise de editais é automática mas não indicou volume nem tamanho médio dos PDFs, assumimos um volume moderado no lançamento (dezenas de editais por semana), com possibilidade de ajuste conforme o uso.
- SUPOSIÇÃO: A "complexidade do edital" e as "exigências de habilitação" usadas no Score são extraídas da própria análise de IA do edital, já que não foi definida outra origem para esses critérios.
