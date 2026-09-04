# Diagnóstico e evolução da captação de licitações

## 1. O que já existe (verificado no projeto e no banco)

Funções de backend (6):
- `sync-sources` — coleta. Hoje tem dois adaptadores escritos dentro do mesmo arquivo: PNCP e ComprasNet.
- `match-opportunities` — cruza cada licitação com o catálogo de produtos e marca as compatíveis.
- `compute-score` — calcula a nota 0–100 e classifica (verde/amarelo/vermelho).
- `analyze-edital` — baixa o edital, guarda no arquivo privado `editais` e envia ao Gemini.
- `generate-alerts` e `run-financial-simulation` — alertas e simulação financeira.

Banco: tabelas de licitações, produtos, fornecedores, notas, análises de edital, pipeline, histórico, registros de sincronização e cadastro de fontes — todas com regras de acesso aplicadas. Há travas que impedem a mesma licitação da mesma fonte de entrar duas vezes, e apenas uma análise de edital por licitação.

Busca e filtros: já existem as consultas de painel e de busca com filtros combináveis (palavra-chave, categoria, código do item, faixa de valor, estado, município, órgão, modalidade, datas, prazos, quantidade, situação, ME/EPP, exigências e fonte). Essa filtragem é 100% feita no banco, sem IA — exatamente o modelo desejado.

Gemini: a chave já está guardada com segurança e é lida apenas pelo servidor. A tela de detalhe da licitação já tem o botão "Analisar edital".

## 2. O que está funcionando

- Telas de painel, busca, pipeline, produtos, fornecedores, histórico, configurações e detalhe da licitação.
- Filtros e ranqueamento no banco, sem custo de IA.
- Análise do edital sob demanda pelo botão na tela de detalhe.
- Guarda dos arquivos de edital em área privada, acessível somente ao dono.

## 3. O que está incompleto ou quebrado

1. **Cadastro de fontes vazio.** O banco está com zero fontes e zero licitações. A coleta hoje não roda porque não encontra nenhuma fonte ativa — o arquivo de carga inicial das fontes existe no projeto mas nunca foi aplicado.
2. **Endereço do PNCP desatualizado.** O endereço usado pela coleta responde "não encontrado". Precisa migrar para a API pública de consulta atual do PNCP.
3. **Endereço do Compras.gov.br desatualizado.** O endereço antigo apenas redireciona; a porta oficial hoje é o portal de dados abertos de compras do Governo Federal.
4. **Gemini disparando sozinho.** Hoje, ao detectar uma licitação compatível, o sistema chama a análise de edital automaticamente para cada uma. Isso contraria a regra que você definiu (IA só ao clicar) e gera custo desnecessário.
5. **Nota dependente da IA.** O cálculo da nota é acionado depois da análise; sem análise automática, precisa ser acionado direto após o cruzamento.
6. **Coleta não modular.** Os dois adaptadores estão dentro de um único arquivo; adicionar sete fontes assim vira um arquivo gigante e frágil.
7. **Sem deduplicação entre fontes.** A mesma licitação vinda do PNCP e de um portal privado entraria duas vezes.

## 4. O que está duplicado

Nada de estrutura duplicada no banco. A duplicação real é de conteúdo futura: portais privados republicam licitações que também estão no PNCP.

## 5. Impacto das mudanças propostas

- Nenhuma tabela existente será apagada ou substituída; apenas colunas novas e opcionais.
- Nenhuma tela será refeita; a busca, o painel e o pipeline continuam consultando as mesmas funções.
- A única mudança de comportamento intencional: a IA deixa de rodar sozinha e passa a rodar somente no clique.
- Correção dos endereços das fontes muda apenas de onde os dados vêm, não como são guardados.

## 6. Sobre as fontes pedidas

- **PNCP** — API pública oficial. Fonte primária, cobre também muitas licitações publicadas via portais privados.
- **Compras.gov.br / Comprasnet** — dados abertos oficiais do Governo Federal.
- **Portal de Compras Públicas, BLL Compras, Licitanet, Licitações-e, Compras BR** — não publicam API aberta de consulta. Para essas, o caminho legítimo é: (a) consumir suas licitações através do PNCP, marcando o portal de origem; e (b) deixar o encaixe pronto para credenciais de API oficial caso você contrate acesso. Nada de scraping que contorne login, CAPTCHA ou proteção — cada conector fica cadastrado como "aguardando acesso oficial" até haver via legítima.

## 7. Arquitetura proposta (modular)

```text
COLETAR      cada fonte = um conector independente (arquivo próprio)
NORMALIZAR   cada conector devolve o mesmo formato padrão
DEDUPLICAR   chave única de negócio + prioridade da fonte oficial
FILTRAR      banco de dados, sem IA (já existe)
RANQUEAR     nota 0-100 no banco/função (já existe)
SELECIONAR   você escolhe a licitação na tela
ANALISAR     Gemini somente ao clicar em "Analisar edital"
```

## 8. Arquivos, tabelas e funções que serão alterados

Novos arquivos (conectores independentes, um por fonte):
- `supabase/functions/_shared/connector.ts` — formato padrão e utilitários comuns.
- `supabase/functions/_shared/connectors/pncp.ts`, `compras-gov.ts`, `portal-compras-publicas.ts`, `bll.ts`, `licitanet.ts`, `licitacoes-e.ts`, `compras-br.ts` — cada um isolado, os sem API oficial ficam inativos e declarados.
- `supabase/functions/_shared/registry.ts` — mapa fonte → conector, para novas fontes entrarem sem tocar no resto.

Alterados:
- `supabase/functions/sync-sources/index.ts` — passa a ler o registro de conectores em vez de conter os adaptadores; registra erro por fonte sem derrubar as demais; ganha deduplicação entre fontes.
- `supabase/functions/match-opportunities/index.ts` — deixa de chamar a análise de edital automaticamente e passa a acionar apenas o cálculo da nota.
- `src/routes/configuracoes.tsx` — lista de fontes com estado (ativa / sem acesso oficial) e sincronização por fonte.
- `src/routes/oportunidade/$id.tsx` — deixa claro que a análise por IA acontece só neste clique, com estado de progresso.

Banco (migração aditiva, sem apagar nada):
- Carga inicial do cadastro de fontes com as sete fontes, marcando quais têm API oficial.
- Em `sources`: campos de estado de acesso e observação legal.
- Em `opportunities`: campo de chave de negócio para deduplicação entre fontes e campo do portal de origem.
- Índice único parcial sobre a chave de negócio para impedir repetição entre fontes.
- Função de busca ajustada apenas para expor o portal de origem — mesmos filtros, mesmo retorno anterior mais um campo.

## 9. Ordem de execução

1. Migração aditiva + carga das fontes.
2. Base comum e registro de conectores.
3. Conector PNCP corrigido e validado com dados reais.
4. Conector Compras.gov.br no endereço oficial atual.
5. Conectores das quatro/cinco plataformas privadas registrados como "aguardando acesso oficial", já plugáveis.
6. Deduplicação entre fontes.
7. Desligar a IA automática e ligar a nota direto após o cruzamento.
8. Ajustes de tela em configurações e detalhe da licitação.
9. Teste ponta a ponta: coletar → filtrar no banco → ranquear → analisar um edital no clique.
