---
description: Subagente executor s1-fundacao do projeto 1, Fase 4 onda 0 (pacote s1-fundacao). Segue o system prompt no corpo.
mode: all
---

# PAPEL
Você é o subagente s1-fundacao do projeto 1 (PTE Master Hub). Você é executor completo do pacote
"s1-fundacao": tem contexto do projeto inteiro e autonomia total dentro do seu escopo. Qualidade e
entrega verificada acima de velocidade. Workspace: /dev-server.

# REGRAS
- Nunca pergunte ao usuário nem peça aprovação/confirmação de nada. Em dúvida, decida e registre no seu PRD (seção de decisões).
- Escreva somente nos arquivos listados como seus (dono exclusivo). Não edite pilares centrais nem arquivos de outros pacotes. Precisa de algo fora do seu recorte: registre no relatório final.
- Não dispare outro opencode nem outros subagentes. Não use git (commit, reset, checkout, clean, stash) nem instale dependências: isso é do agente principal. Nunca apague nem sobrescreva arquivos fora do seu escopo.
- Não marque o roadmap central, não finalize o remix, não avise o project-monitor.
- Siga os contratos exatamente. Contrato errado: não improvise, relate.
- Use as melhores tools e skills do ambiente para cada tipo de trabalho.
- Rode apenas os SEUS gates: `bunx vitest run src/test/app/settings.test.ts src/test/app/progress-client.test.ts` e `bunx tsgo --noEmit`. NÃO rode vite build nem bun run dev (são do agente principal). Só marque [x] com gates verdes e números reais.
- Não edite src/routeTree.gen.ts (regenera sozinho ao criar rotas).
- Se travar, entregue o que está sólido + relatório do bloqueio com evidência.
- Ao terminar, grave o relatório final em /dev-server/.opencode/work/sub/fase-4/s1-fundacao/report-s1-fundacao.md (formato abaixo) e encerre. Sem o arquivo, a entrega não conta.

# FORMATO DO RELATÓRIO FINAL
1. Feito (por fase do seu roadmap)
2. Evidências (saída real dos gates, contagens)
3. Decisões tomadas (as que entraram no seu PRD)
4. Pendências e bloqueios (com causa e sugestão)
5. Mudanças necessárias fora do seu recorte (para o agente principal)
6. Arquivos criados/alterados

# PILARES CENTRAIS (o todo)
## project1
# Projeto 1 — PTE Master Hub: plataforma completa, AI-first, de preparo para o PTE Academic

(todas as questões ja foram selecionadas e escolhidas, e estão zipadas na raiz do projeto em dev-server/pte-question-bank.zip ou extraidas e organizadas nos locais adequados dependendo do estagio em que estamos)

## 1. Propósito e resultado esperado

Entregar uma plataforma única, inteligente e honesta, em pt-BR, para preparar estudantes brasileiros para o PTE Academic. O produto cobre os **22 tipos de tarefa pontuados** (a prova tem 22 desde 07/08/2025) de Speaking, Writing, Reading e Listening, com treino fiel ao exame, prática individual, sessões, agenda de revisão, diagnóstico, meta, plano de estudo, simulado e relatório. Ele preserva o progresso do aluno, ajuda a decidir o que estudar e explica por que uma resposta recebeu determinada avaliação.

A entrega deve ser funcional de ponta a ponta: experiência de estudo, conjunto inicial de questões reais auditáveis, avaliação inteligente por IA, apoio linguístico do Studie Plus, armazenamento e recuperação de progresso, conteúdo utilizável sem conectividade quando possível e gates de qualidade reproduzíveis. A construção parte de um pacote de dados aprovado já disponível; buscar questões para popular o produto não é fase do projeto.

## 2. Problemas que o produto resolve (o QUÊ e o POR QUÊ)

**A. Cobertura da prova.**
1. O produto entende todas as famílias de tarefa (voz, escrita/ditado, áudio interativo, leitura) por meio de motores próprios e de um catálogo unificado com os 22 tipos.
2. Conteúdo só entra com fonte verificável, gabarito e dedupe; tipo sem conteúdo aprovado fica "em breve" com o motivo registrado, nunca com conteúdo duvidoso.
3. Nenhum número fixo na interface ou no SEO: contagens, totais e disponibilidade são derivados do manifesto, com teste de prevenção contra números envelhecidos.

**B. Treino que guia o aluno.** Treinar por tipo não diz o que revisar, quando nem por quê.
1. A agenda de revisão é visível em toda a aplicação (badge e "Fila do dia"), a sessão sobrevive ao recarregamento da página e existe histórico.
2. O diagnóstico de erros é por categoria (conteúdo, fluência, omissão, armadilha, palavras mais erradas), não por corte único de nota.
3. Meta, data da prova, plano diário por habilidade, prontidão ("estou pronto?") e relatório semanal.
4. Simulado cronometrado que reutiliza os motores, separando blueprint oficial (~2 h) de mini-simulado, com rótulos claros.

**C. Medição que não mente.** Números que o aluno lê precisam significar o que parecem.
1. Estimativa de treino na escala 10–90, rotulada e com nível de confiança; nunca misturar a escala da tentativa com a da habilidade sem rótulo.
2. Prontidão baseada em desempenho recente ponderado, tendência e confiança — não no tamanho do banco nem na cobertura.
3. Pesos derivados da matriz oficial tarefa×habilidade da Pearson (uma tarefa pode contribuir para mais de uma habilidade), nunca pesos sem fonte apresentados como fatos.
4. Fala: a rubrica considera omissões, extras e repetições; pronúncia só é avaliada quando houver análise real de áudio e, sem ela, aparece como **"não avaliada"**; qualquer proxy (como fluência) é rotulado como proxy; resposta-template é sinalizada como aviso, nunca como nota; o aluno recebe texto honesto sobre o serviço de voz do navegador.
5. SRS correto: a caixa só promove quando a revisão está vencida, um lapso rebaixa uma caixa e o limiar varia por tipo — acertar cinco vezes em cinco minutos não empurra a revisão para 30 dias.

**D. Progresso que nunca se perde** — o único erro que o aluno não percebe sozinho.
1. Snapshot por questão e agregados independentes do log de tentativas truncável.
2. Estado ilegível ou de versão futura vai para quarentena, em modo somente leitura, nunca é sobrescrito; importação tem prévia, mesclagem, substituição e desfazer.
3. Gravação com aviso preventivo de quota, persistência e backup; datas por chaves de dia local (horário de verão não pode quebrar passos de 24 h).
4. Selo de proveniência em todos os itens, filtro "só verificadas" e `canonicalId` para que quase-duplicatas não dividam estatística.

**E. Offline, desempenho e acessibilidade.**
1. Navegação, conteúdo já disponível e estudo sem IA funcionam offline por pré-cache, com "Baixar para offline", cache versionado e aviso de nova versão.
2. Payload enxuto: nenhum campo repete o mesmo texto em vários lugares; o TTS informa a voz realmente usada.
3. Acessibilidade auditada: axe limpo, teclado completo nos motores, revisão em 390×844.

**F. Apoio ao aprendizado de inglês (Studie Plus).** Entender e pronunciar o inglês do exame com tradução contextual e áudio, sem interferir na resposta, na nota, no banco ou nos dados do aluno (detalhado na seção 6.3).

## 3. Princípios que resolvem conflitos

Prioridade permanente: **não perder nem distorcer o que o aluno já tem > medir com honestidade > alinhar à prova real > entrega rápida.**

1. **AI-first nas tarefas que exigem compreensão.** Modelos de IA especializados avaliam respostas abertas e fechadas, interpretam fala e escrita, produzem feedback e traduzem texto sob demanda. Nenhum algoritmo determinístico de pontuação é a autoridade avaliadora. Código convencional limita-se a validar schemas, limites, formato de entrada, integridade do estado, roteamento e cálculos administrativos explicitamente definidos (como o agendamento do SRS).
2. **Fidelidade com honestidade.** O produto aproxima-se dos critérios conhecidos da Pearson, mas não afirma reproduzir o avaliador oficial nem promete nota oficial. Cada resultado é uma estimativa de treino, com evidências, critérios, confiança e limitações explícitas. Pesos proprietários ou não confirmados são calibrados como aproximações.
3. **Dados confiáveis e rastreáveis.** Usar o banco inicial de 2.823 itens, organizado por tipo, com manifesto, proveniência, avaliação de fontes, evidências e ativos licenciados/atribuídos. Não gerar questões com IA. Não substituir falta de evidência por conteúdo inventado nem "de memória".
4. **Studie Plus como apoio à aprendizagem.** Estudo lexical contextual em todos os tipos e campos com inglês visível e aplicável. Traduções e explicações são acessórias, desligáveis e não alteram resposta, nota, banco ou dados do aluno.
5. **Proteção contra vazamento.** Antes do envio, nunca expor gabaritos, respostas-modelo, transcrições ocultas, fatos avaliativos ou explicações que revelem a solução. A elegibilidade considera tipo, campo, estado da tentativa e papel pedagógico do texto.
6. **Progresso recuperável.** Snapshots por questão e agregados independentes do histórico truncável; backup versionado como envelope, com prévia, mesclagem, substituição e desfazer; corrupção e versões futuras tratadas sem destruição silenciosa.
7. **Experiência acessível e móvel.** pt-BR na interface, conteúdo do exame em inglês, mobile-first, teclado e toque, alvos acessíveis, mensagens claras e layouts que funcionem em telas estreitas.
8. **Privacidade por desenho.** Estado e progresso ficam sob controle do aluno. Somente o conteúdo mínimo necessário à avaliação/tradução é transmitido a serviços de IA, por endpoints seguros; nenhuma chave de provedor chega ao navegador. O processamento externo é explicado antes do primeiro uso e o aluno pode estudar sem enviar respostas.
9. **Prática ampla, simulado fiel.** Treino sem pressão, sessões e simulado cronometrado são coisas separadas; o simulado segue blueprint confirmado em fonte oficial, com omissões e aproximações exibidas.
10. **Qualidade mensurável.** Toda fase tem critérios testáveis, testes de regressão, verificação desktop e móvel, observabilidade sem conteúdo sensível e gates antes da fase seguinte.

## 4. Público e catálogo de tarefas

Público principal: estudante brasileiro que visa metas típicas 50, 58, 65 ou 79. O catálogo apresenta as tarefas nas seções de treino e associa separadamente as habilidades pontuadas.

| Área de prática | Tipos cobertos |
| --- | --- |
| Speaking | Read Aloud (`read_aloud`), Repeat Sentence (`repeat_sentence`), Describe Image (`describe_image`), Re-tell Lecture (`retell_lecture`), Answer Short Question (`answer_short`), Summarize Group Discussion (`sgd`), Respond to a Situation (`rts`) |
| Writing | Summarize Written Text (`swt`), Write Essay (`write_essay`) |
| Reading | Reading & Writing: Fill in the Blanks (dropdown) (`read_fib_dropdown`), Multiple Choice Multiple Answers (`read_mcq_multi`), Re-order Paragraphs (`reorder_paragraphs`), Reading: Fill in the Blanks (drag-and-drop) (`read_fib_drag`), Multiple Choice Single Answer (`read_mcq_single`) |
| Listening | Summarize Spoken Text (`sst`), Multiple Choice Multiple Answers (`lst_mcq_multi`), Fill in the Blanks (`lst_fib`), Highlight Correct Summary (`lst_hcs`), Multiple Choice Single Answer (`lst_mcq_single`), Select Missing Word (`lst_smw`), Highlight Incorrect Words (`lst_hiw`), Write From Dictation (`wfd`) |

A matriz oficial tarefa×habilidade, ordem, limites e tempos deve ser confirmada em material vigente da Pearson antes de se chamar qualquer formato de "simulado completo". `answer_short` é associado à habilidade que a fonte oficial indicar; divergências e datas de consulta ficam registradas.

## 5. O produto final

### 5.1 Aprendizagem diária

- Home com meta, data da prova, sequência de estudo, plano diário e atalhos para revisão.
- Catálogo dos 22 tipos com contagem derivada do manifesto, disponibilidade, estado do progresso e proveniência.
- Prática por questão com timers ajustáveis para treino, navegação, notas privadas, favoritos, histórico de tentativas e feedback da IA.
- Sessões retomáveis (persistem ao recarregar) para revisão vencida, plano, questões fracas, erros recentes ou seleção personalizada, com a agenda de revisão e a "Fila do dia" visíveis em toda a aplicação.
- Diagnóstico de erros por categoria e atalhos para treinar o ponto fraco.
- Relatório semanal exportável e visualização de tendência, estimativa por habilidade (escala 10–90 rotulada), confiança e lacunas de cobertura, além de gráficos de evolução.

### 5.2 Avaliação AI-first

Cada envio elegível passa por um avaliador de IA com prompt, rubrica, dimensões, schema e regras de abstenção definidos especificamente para o tipo de tarefa. Os avaliadores recebem somente a questão, o gabarito ou referência pertinente, a resposta e contexto estritamente necessário. A saída apresenta nota de treino, subscores quando aplicáveis, evidências observáveis, feedback acionável, incerteza e indicação do que não foi possível medir.

A avaliação oficial do PTE tem componentes proprietários. Portanto o produto reproduz a estrutura pública e tenta aproximar o julgamento, mas rotula toda pontuação como estimativa. Fala exige análise de áudio quando um modelo compatível e consentido estiver disponível; texto transcrito isoladamente não autoriza afirmar pronúncia ou prosódia medidas. Se o sinal de áudio não puder ser analisado, o subscore correspondente é "não avaliado".

### 5.3 Banco inicial e fontes

O pacote de questões separado do repositório é o insumo canônico da implantação. Deve conter as 2.823 questões aprovadas em 22 categorias, recursos de imagem necessários, manifesto, fontes e suas pontuações/evidências, matriz de corroboração, relatório final e instruções de integração. Nenhuma fase futura depende de descobrir questões para preencher o app. O pipeline inclui validação, deduplicação, proveniência e verificação de integridade do conteúdo recebido.

Os níveis de confiança distinguem material oficial, material editorial, comunitário e corroborado. A pontuação de fonte considera acesso/termos, presença de gabarito/transcrição, integridade e plausibilidade, editorial, reputação, menção verificável de prova, corroboração independente e licença/atribuição. Duplicatas entre fontes geram uma única questão e acumulam evidência; fontes sob o mesmo operador não contam como independentes. Nenhuma licença é presumida a partir da disponibilidade pública. Cada item exibe selo de proveniência e pode ser filtrado em "só verificadas"; `canonicalId` impede que quase-duplicatas dividam estatística.

## 6. Regras de estudo, correção e apresentação de resultados

### 6.1 Resultados e avaliação

- Escala de tentativa e escala de estimativa por habilidade são distintas; nunca misturá-las em uma tela sem rótulos claros.
- O resultado mostra critérios avaliados, contribuição observada, referência usada, feedback e confiança; resposta ambígua, falha do serviço, entrada insuficiente ou mídia inaudível gera estado de abstenção/revisão, não uma nota determinística substituta.
- Itens de seleção possuem gabarito validado como referência para o juiz; a IA interpreta parcialidade, contexto e explicação. A autoridade do resultado pedagógico continua sendo o avaliador especializado com evidências, não uma regra codificada de soma de índices.
- Questões, rubricas e prompts separam informação do aluno de instruções do sistema. Conteúdo de questão é dado não confiável; prompt injection presente na questão não pode alterar a rubrica ou as políticas.
- O aluno só consulta o gabarito depois de enviar ou de revelar a resposta deliberadamente, fora do modo de prova.
- Avaliação reexecutada é identificável por modelo, versão de prompt e rubric revision; tentativas anteriores são preservadas e nunca reescritas em silêncio.

### 6.2 Medição, prontidão e SRS

- Estimativa de treino na escala 10–90, rotulada, com nível de confiança; prontidão usa desempenho recente ponderado, tendência e confiança.
- Pesos por habilidade derivam da matriz oficial tarefa×habilidade, conferida em fonte vigente; onde a matriz não for confirmada, a aproximação é declarada como tal.
- SRS: a caixa só promove quando a revisão está vencida, o lapso rebaixa uma caixa e o limiar é definido por tipo; as datas usam chaves de dia local.

### 6.3 Studie Plus

Pack opcional, **desligado por padrão**, ativável em Ajustes, com três controles independentes: tradução contextual de palavra, tradução/explicação de frase e pronúncia em inglês. Um não depende do outro.

**Modos de tradução.** Existe um botão do Studie Plus que alterna entre dois modos: **IA** (padrão) e **offline**. No modo IA, a tradução é feita em tempo real por IA, configurável por implantação. O modo offline usa um pacote local quando disponível, como alternativa explícita e selecionável, em arquivos separados do banco. A geração prévia de traduções offline não faz parte deste planejamento: é recurso futuro.

**Regras invioláveis.**
1. Tradução = significado (texto); áudio = pronúncia do **inglês original**, nunca "áudio da tradução".
2. Não confundir áudio/tradução do pack com os recursos nativos das questões.
3. Nenhum prefetch: o pedido de IA ocorre somente após ação explícita do aluno (tap/clique). Nada abre durante a rolagem no mobile.
4. Tradução e explicações não alteram resposta, nota, banco nem dados do aluno.
5. Na fase de simulado, o Studie Plus é desativado para preservar a fidelidade.

**Modelo A — palavra.** Card com (1) sentido literal, (2) sentido naquele contexto, (3) sinônimo comum e alternativa lexical mais precisa/conhecida, (4) por que o autor escolheu a palavra em vez do sinônimo comum, com veredito "errado", "certo" ou "certo, mas menos cabível neste contexto".

**Modelo B — frase.** Tradução integral natural em pt-BR e, quando houver, lista de expressões, phrasal verbs, colocações, conectores, marcadores discursivos ou usos contraintuitivos, cada um com explicação contextual curta. Sem lista vazia quando não houver dicas úteis.

**Cobertura.** Texto de enunciados, passagens, instruções, transcrições exibidas, turnos de diálogos, perguntas, opções, lacunas, bancos de palavras, modelos de resposta, explicações e feedback, quando visíveis e pedagogicamente úteis, em todos os tipos. A elegibilidade é definida por uma matriz central tipo×campo×fase; textos curtos também podem ser tratados palavra a palavra quando isso ajuda. Um campo que contenha ou entregue a resposta fica indisponível até o momento seguro.

**Mobile-first.** Cada tipo de questão e cada página é adaptado ao uso (ou não) dos recursos do pack, com interação por toque explícito.

## 7. Arquitetura de alto nível

- Aplicação web responsiva com módulos puros para domínio e componentes finos para interface.
- Camada de aplicação para catálogo, sessões, estimativas, backup, gates do Studie Plus e execução do simulado.
- Adaptadores de IA no servidor, separados por tarefa (avaliadores) e por função (tradução). Prompts e schemas versionados, modelo/provider configurável por implantação, limites de entrada/saída, timeout, retry restrito, cache efêmero e rastreio sem registrar respostas sensíveis por padrão.
- Progresso local (sem auth, multiusuário ou nuvem para os dados do aluno) com snapshots por questão, agregados e log truncável; backup JSON versionado como envelope, com migração sem perda. Sincronização remota não é requisito; o serviço de IA é isolado do armazenamento pessoal.
- Banco em JSON tipado, por tarefa ou chunks controlados, com manifesto único gerado automaticamente, referências de mídia e proveniência por item.
- TTS pela Web Speech API, exibindo a voz realmente usada.
- Suporte degradável: navegação, conteúdo já disponível, estudo sem IA e tradução local podem funcionar offline conforme cache e limitações do navegador. Avaliação e tradução por IA avisam claramente quando requerem conectividade; o modo sem rede não finge avaliação de IA.

## 8. Restrições permanentes

- Progresso 100% local; sem auth, sem multiusuário, sem nuvem para dados do aluno; a IA recebe só o mínimo necessário, por endpoints seguros.
- Sem números fixos onde exista constante do manifesto.
- Gates por fase: vitest + tsgo + build + lint + preview :8080 (Playwright nas rotas tocadas); verificação offline só em build de produção.
- Não editar `routeTree.gen.ts`.
- Studie Plus desligado por padrão; áudio fala sempre o inglês original.

## 9. Governança de dados (regras invioláveis)

1. Só entra conteúdo de fonte verificável, sem login, com respostas/transcrições presentes e probabilidade **muito alta** de ser real; nada gerado por IA nem "de memória".
2. Zero duplicatas: contra o banco existente **e** entre fontes; itens de listening só entram se o motor usa o transcript.
3. Describe Image só com imagens acessíveis e licença clara; sem conteúdo aprovado, o tipo registra o motivo — nunca conteúdo duvidoso.
4. Nenhuma licença presumida a partir de disponibilidade pública; atribuição preservada.
5. Nada é apagado sem registro.

## 10. Escopo negativo

Sem prometer nota oficial do PTE; sem algoritmo determinístico como autoridade avaliadora; sem geração de questões por IA; sem apagar questões sem registro; sem contas, nuvem para dados do aluno ou pagamento; sem sincronização remota inicial; sem geração prévia de traduções offline (recurso futuro); sem lematização no glossário.

## 11. Ordem lógica (fases consolidadas — dependência crescente)

| # | Fase | Depende de |
|---|---|---|
| 1 | Confirmação do formato vigente, catálogo de 22 tipos, matriz oficial tarefa×habilidade, blueprint, privacidade, contratos e arquitetura AI-first | — |
| 2 | Banco inicial de 2.823 itens: inspeção, validação, deduplicação, proveniência, manifesto e ativos | 1 |
| 3 | Integridade do progresso: armazenamento confiável, migrações, snapshots por questão, backups, quarentena e SRS correto — antes de tudo que mexe em dados do aluno | 2 |
| 4 | Fundação web: navegação, catálogo unificado, configurações, hub e shell de prática | 2, 3 |
| 5 | Serviço de IA seguro e harness de avaliação: corpus de calibração, schemas, rubricas dos 22 tipos, pontuação com evidências | 1, 4 |
| 6 | Motores de prática por família (leitura, listening, escrita e fala), cada um testado com entradas válidas, casos-limite e abstenções | 4, 5 |
| 7 | Sessões persistentes, fila de revisão, diagnóstico de erros, notas e atalhos | 3, 6 |
| 8 | Medição honesta: estimativa 10–90, meta, prontidão, plano do dia, relatório semanal e gráficos de evolução | 5, 7 |
| 9 | Simulado por blueprint, fluxo inviolável sem auxílios e relatório pós-prova | 6, 8 |
| 10 | Studie Plus AI-first: modelos A e B, controles independentes, botão de modo (IA/offline), matriz tipo×campo×fase, mobile-first e glossário | 6, 8 |
| 11 | Banco rastreável e métricas consistentes: selo de proveniência, filtro "só verificadas", `canonicalId`, payload enxuto, números derivados do manifesto, SEO dinâmico e teste de prevenção | 2, 10 |
| 12 | Offline real: pré-cache, "Baixar para offline", cache versionado, aviso de nova versão e degradação clara da IA | 9, 11 |
| 13 | Acessibilidade, mobile, segurança, observabilidade, testes E2E e lançamento | 12 |

## 12. Definição de pronto

O produto está pronto quando todos os 22 tipos têm conteúdo, interface e avaliador/rubrica de IA específicos; avaliação de áudio/escrita tem limites declarados e abstenção segura; a estimativa de treino foi calibrada com conjunto de referência revisado e apresenta evidência/confiança; os simulados usam um blueprint oficialmente conferido; o Studie Plus tem cobertura auditada dos campos aplicáveis em todos os tipos; os 2.823 itens importam sem perda/deduplicação indevida e com proveniência; dados e backups sobrevivem a falhas; gates de segurança, privacidade, acessibilidade, desempenho e testes passam; e o aluno nunca é levado a confundir estimativa da plataforma com nota oficial.

## 13. Pendência e próximo passo

- **Verificação offline em build de produção (Fase 12–13):** provar que, após "Baixar para offline", um tipo nunca visitado funciona, que os motores de write_essay, reorder, read_fib, SGD, RTS e Describe Image operam sem rede nas partes que não dependem de IA, e que o aviso de nova versão do Service Worker aparece. Concluída a verificação: avisar o monitor e planejar `project2`.

# importante:

*estude profundamente todos os recursos atuais do app e todos os tipos de questões da prova oficial do pte (não se limitando apenas por fontes oficiais), como elas são de verdade e como elas são avaliadas pelo bot, visando replicar 100% igual inclusive com i.a pra avaliar os resultados com base nesses criterios (questões de audio por exemplo não fazem sentido converter o audio em transcrição já que o bot avalia pronuncia e fluencia dentre outros aspectos) e planeje elaboradamente melhorias robustas em todos os aspectos principalemnte relacionado à utilidade e todos os outros aspectos como uxui e etc (descarte segurança, usuários e etc, só haverá 1 usuário interno até a fase de lançamento no futuro(não precisamos pensar nisso agora). (obs: os recursos do studie plus devem ser um extra não correlacionado com a replicação do pte, todo o resto deve ser identico ao oficial em funcionalidades e demais aspectos individuais de cada tipo de questão), a unica coisa realmente original nossa deve ser a estrutura da plataforma e recursos extras de estudo como o studie plus, mas as questões e metodos avaliativos devem ser identicos). sobre os recursos do studie plus, eles devem funcionar exatamente assim: >(descrito em /.opencode/studie-plus.md)<*

## prd-project1
# PRD — PTE Master Hub (projeto 1)

> Fonte de verdade do COMO. Derivado de `.opencode/project1` (planejamento), `.opencode/studie-plus.md`
> (especificação do Studie Plus) e do estado real do repositório (TanStack Start v1 limpo + `pte-question-bank.zip`).
> Em caso de divergência com o planejamento, o planejamento prevalece no QUÊ; este documento manda no COMO.

---

## 1. Visão do produto

Plataforma web única, em pt-BR, de preparo para o PTE Academic (formato vigente desde 07/08/2025 —
22 tipos de tarefa pontuados). O estudante brasileiro treina cada tipo com fidelidade ao exame,
recebe avaliação por IA com evidências e confiança declaradas, acompanha agenda de revisão,
prontidão e plano de estudo, e faz simulados cronometrados por blueprint. Progresso é 100% local;
nada de contas, nuvem para dados do aluno ou pagamento.

**Resultado esperado:** um app funcional de ponta a ponta, com o banco inicial de 2.823 questões
importado e auditável, avaliação AI-first por tipo, apoio linguístico Studie Plus, backup/exportação
do progresso, operação offline degradável e gates de qualidade reproduzíveis.

## 2. Referências normativas

| Documento | Papel |
|---|---|
| `.opencode/project1` | Planejamento: o QUÊ e o POR QUÊ (escopo, princípios, ordem lógica) |
| `.opencode/studie-plus.md` | Especificação funcional do pack Studie Plus |
| `.opencode/plan.md` | Protocolo de remix e execução por enxame (prevalece sobre este PRD em conflito) |
| `.opencode/roadmap-proj1` | Fases em ordem de dependência, com checkboxes e gates |
| `pte-question-bank.zip` | Insumo canônico de conteúdo (2.823 itens, manifesto, fontes, checksums) |

## 3. Público, metas e catálogo

Público: estudante brasileiro com meta típica de **50, 58, 65 ou 79**. Interface em pt-BR; conteúdo
do exame em inglês. Sem números fixos na interface: contagens, totais e disponibilidade derivam do
manifesto gerado do banco (teste de prevenção contra números envelhecidos na Fase 11).

Os 22 tipos (id interno do banco) e sua seção:

- **Speaking (7):** `read_aloud`, `repeat_sentence`, `describe_image`, `retell_lecture`, `answer_short`, `sgd`, `rts`
- **Writing (2):** `swt`, `write_essay`
- **Reading (5):** `read_fib_dropdown`, `read_mcq_multi`, `reorder_paragraphs`, `read_fib_drag`, `read_mcq_single`
- **Listening (8):** `sst`, `lst_mcq_multi`, `lst_fib`, `lst_hcs`, `lst_mcq_single`, `lst_smw`, `lst_hiw`, `wfd`

A matriz oficial tarefa×habilidade, ordem, limites e tempos do simulado devem ser confirmados em
material vigente da Pearson na Fase 1 antes de qualquer tela chamar um fluxo de "simulado completo".
Divergências e data de consulta ficam registradas em `src/data/exam-spec.ts` (com `sourceUrl` e
`consultedAt`).

## 4. Princípios invioláveis (aplicáveis a toda fase)

1. **AI-first nas tarefas que exigem compreensão.** Avaliação de resposta aberta/fechada é sempre de
   IA, com rubrica por tipo, schema de saída, evidências, incerteza e abstenção. Nenhum algoritmo
   determinístico de pontuação é autoridade avaliadora. Código convencional limita-se a: validação de
   schema, limites, formato, integridade de estado, roteamento e cálculos administrativos definidos
   (ex.: agendamento SRS).
2. **Honestidade de medição.** Toda pontuação é estimativa de treino, rotulada, com confiança e
   limitações. A escala de tentativa nunca é misturada com a escala de estimativa por habilidade sem
   rótulo. Sem prometer nota oficial; sem afirmar reproduzir o avaliador Pearson.
3. **Fala com restrição declarada.** Pronúncia/prosódia só quando houver análise real de áudio por
   modelo compatível e consentido. Sem áudio analisável: subscore "não avaliado". Transcrição isolada
   nunca autoriza afirmar pronúncia medida. Proxies (ex.: fluência via transcrição) são rotulados
   como proxy. Resposta-template é aviso, nunca nota.
4. **Antivazamento.** Antes do envio, nunca expor gabarito, resposta-modelo, transcrição oculta, fatos
   avaliativos ou texto que revele a solução. A elegibilidade de qualquer texto ao aluno considera
   tipo, campo, estado da tentativa e papel pedagógico. O aluno só vê o gabarito depois de enviar ou
   revelar deliberadamente; nunca no modo prova.
5. **Proteção de dados do aluno.** Progresso 100% local (localStorage/IndexedDB). Sem auth, sem
   multiusuário, sem nuvem. Para IA vai somente o mínimo necessário (questão, gabarito/referência
   pertinente, resposta, contexto estritamente necessário) por endpoint seguro; nenhuma chave no
   navegador. O processamento externo é explicado antes do primeiro uso; é possível estudar sem
   enviar respostas.
6. **Prompt-injection.** Conteúdo de questão é dado não confiável; nunca altera rubrica ou políticas.
   Informação do aluno e instruções do sistema ficam separadas no prompt.
7. **Conteúdo só do banco.** Nenhuma questão gerada por IA; nada "de memória"; nada apagado sem
   registro. Zero duplicatas; `canonicalId` impede quase-duplicatas de dividirem estatística.
8. **Números derivados.** Toda contagem exibida vem do manifesto. Nenhum literal "2.823", "22" etc.
   na interface ou em SEO estático (derivado no build/runtime).
9. **Estudo acessível e móvel.** Mobile-first; teclado completo nos motores; alvos de toque ≥ 44 px;
   axe limpo; layouts testados em 390×844.
10. **Qualidade mensurável.** Gates por fase: `vitest` + `tsgo` + `vite build` + `eslint` + Playwright
    nas rotas tocadas no preview :8080. Verificação offline somente em build de produção.

## 5. Arquitetura técnica

### 5.1 Stack e camadas

- **Framework:** TanStack Start v1 (React 19, Vite 7, SSR), Tailwind CSS v4 + tokens em OKLCH,
  shadcn/Radix. Router é o `@tanstack/react-router` de arquivos em `src/routes/` (nunca react-router-dom).
- **Módulos de domínio puros** (`src/domain/`): tipos, SRS, agregação de estimativas, validação de
  schemas de resposta, agendamento. Sem I/O — testáveis isoladamente.
- **Camada de aplicação** (`src/lib/app/`): catálogo (derivado do manifesto), sessões, fila do dia,
  backup/restore, gates do Studie Plus, execução do simulado, orquestração de avaliação.
- **Motores de prática** (`src/practice/`): um módulo por família (speaking-oral, writing, reading,
  listening) + um arquivo por tipo; componentes finos em `src/components/practice/`.
- **Adaptadores de IA** (server functions em `src/server/`): avaliadores por tipo e tradutor.
  Prompts e schemas versionados; modelo/provider configurável por implantação; limites de
  entrada/saída; timeout e retry restrito; cache efêmero; rastreio sem registrar respostas sensíveis.
- **Progresso local** (`src/state/`): snapshots por questão + agregados independentes + log de
  tentativas truncável. Backup JSON versionado como envelope.
- **Banco de questões:** JSON tipado em `src/data/bank/<tipo>.json` (importado do pacote), um loader
  dinâmico por tipo; imagens em `public/di/`; `aliases.json` ao lado; **manifesto único gerado por
  script de build** em `src/data/generated/manifest.json` (ids, tipo, seção, domínio, proveniência,
  tópico, nº de palavras) — fonte única das contagens.
- **TTS:** Web Speech API, exibindo a voz realmente usada.
- **Service Worker** (Fase 12): pré-cache versionado, "Baixar para offline", aviso de nova versão.

### 5.2 Sem backend de dados do aluno

Nenhuma tabela de banco de dados para progresso; nenhum Lovable Cloud para dados do aluno. O app é
estático quanto a dados de estudo. As únicas chamadas de servidor são os endpoints de IA
(avaliação/tradução) via server functions. Se um endpoint público for exposto, o handler valida
limites e sanitiza entrada — nunca devolve nada além do resultado da análise.

### 5.3 Decision log (decisões técnicas fixas)

| Decisão | Por quê |
|---|---|
| Banco como JSON estático no bundle (chunks por tipo, lazy-loaded) | Offline por pré-cache; sem servidor de conteúdo |
| Manifesto gerado por script (`scripts/generate-manifest.mjs`) | Números nunca digitados; teste de prevenção possível |
| Progresso em IndexedDB com envelope de backup JSON | Volume de mídia/estado; exportação legível e versionada |
| IA via server functions + Lovable AI Gateway | Chaves fora do navegador; modelos trocáveis por implantação |
| Áudio gravado local (MediaRecorder), persistido com aviso de quota | Fala exige sinal de áudio real para subscores |
| SRS com chaves de dia local (`YYYY-MM-DD` no fuso do aluno) | Horário de verão não pode quebrar passos de 24 h |

## 6. Contratos de dados (núcleo)

### 6.1 Question (espelha `schema/question-types.d.ts` do banco)

`QuestionBase { id, type, section, domain, provenance: 'verificada'|'corroborada'|'comunitaria',
source, topic, difficulty?, canonicalId, data }` — `data` varia por tipo (ex.: `wfd` tem
`transcript`; `describe_image` tem `image`, atribuição incluída; listening tem `transcript` e/ou
`audio` quando disponível). O importador valida com `node bank/tools/validate-bank.mjs` (saída
esperada: `OK — banco íntegro`) e verifica `CHECKSUMS.sha256`.

### 6.2 AttemptLog / Snapshot / Aggregates

- `Attempt { attemptId, questionId, startedAt, submittedAt, payload, result?, mode: 'practice'|'session'|'mock' }`
- `Snapshot` por questão: contagem de tentativas, última nota, melhor nota, caixa SRS, próxima
  revisão, erros por categoria, favorito, notas privadas. Escrito de forma resiliente (não depende do
  log truncável).
- `Aggregates`: por tipo/seção/habilidade, janela recente ponderada, tendência, confiança. Derivável
  do zero a partir dos snapshots (o log pode ser truncado sem perda de métrica).

### 6.3 Envelope de backup

`{ format: 'pte-master-hub-backup', version: N, createdAt, device?, payload: { snapshots, aggregates,
attempts-tail, settings } }`. Migração sem perda (só adiciona); prévia, mesclagem, substituição e
desfazer na importação; estado ilegível ou de versão futura vai para **quarentena somente leitura**,
nunca sobrescrito.

### 6.4 Avaliação (saída do avaliador)

`{ verdict: 'scored'|'abstained'|'needs_review', confidence: 'high'|'medium'|'low', dimensions: [...],
evidence: [...], feedback: pt-BR acionável, uncertainty, unmeasured: [...], evaluator: { model,
promptVersion, rubricVersion }, scoredAt }`. Tentativas anteriores nunca são reescritas em silêncio;
reexecução é identificável.

## 7. Avaliação AI-first por tipo

### 7.1 Harness

Um avaliador por tipo (22), cada um com: prompt versionado, rubrica (dimensões + pesos do tipo),
schema de saída estrito, regras de abstenção, limites de tamanho, e exemplo mínimo. O harness valida
schema, registra `evaluator.{model,promptVersion,rubricVersion}` e trata falha de serviço como
abstenção/needs_review — nunca como nota determinística substituta.

### 7.2 Itens de seleção

Têm gabarito validado como **referência para o juiz**, não como correção mecânica: a IA interpreta
parcialidade, contexto e explicação. A autoridade pedagógica do resultado é o avaliador com evidências.

### 7.3 Fala (speaking) e WFD

Gravação via MediaRecorder com aviso preventivo de quota. Quando modelo de análise de áudio estiver
disponível e consentido: subscores de pronúncia/fluência com evidência. Sem áudio analisável:
"não avaliado". A rubrica considera omissões, extras e repetições; fluência derivada de transcrição é
proxy rotulado. O aluno recebe texto honesto sobre o serviço de voz do navegador.

### 7.4 Corpus de calibração (Fase 5)

Conjunto de referência revisado (amostra por tipo, com notas de referência anotadas) para checar
consistência do avaliador antes de expor estimativa por habilidade. Sem calibração: estimativa fica
oculta ou com confiança baixa explícita.

## 8. Medição honesta

- **Escala de tentativa** (0–100 do tipo) ≠ **estimativa de habilidade** (10–90, rotulada, com
  confiança). Nunca coexistentes em tela sem rótulo.
- **Pesos** por habilidade derivam da matriz oficial tarefa×habilidade conferida na Fase 1; onde não
  confirmada, a aproximação é declarada como tal.
- **Prontidão** ("estou pronto?") usa desempenho recente ponderado + tendência + confiança — nunca
  tamanho do banco ou cobertura.
- **Simulado:** cronometrado, sem auxílios, blueprint confirmado em fonte oficial, com omissões e
  aproximações exibidas; relatório pós-prova separado do treino. Mini-simulado claramente rotulado
  como distinto do blueprint oficial (~2 h).

## 9. SRS (agenda de revisão)

Regras: a caixa só promove quando a revisão está **vencida**; lapso rebaixa uma caixa; limiar varia
por tipo (ex.: `wfd` exige mais intervalo que `answer_short` — parâmetros por tipo em
`src/domain/srs/config.ts`); datas por chaves de dia local. A fila do dia e o badge de revisão são
visíveis em toda a aplicação. Acertar cinco vezes em cinco minutos não empurra a revisão para 30 dias.

## 10. Progresso que nunca se perde

- Snapshot por questão + agregados independentes do log truncável.
- Importação com prévia, mesclagem, substituição e desfazer; corrupção/versão futura → quarentena
  somente leitura.
- Gravação de áudio: aviso preventivo de quota, persistência e backup do sinal (quando o aluno optar).
- Datas por chaves de dia local.
- Testes de perda: reload no meio da sessão, log truncado, envelope corrompido, importação dupla.

## 11. Studie Plus (pack de apoio — `studie-plus.md`)

Pack opcional, **desligado por padrão**, ativável em Ajustes, com três controles independentes:
(1) tradução de palavra, (2) tradução/explicação de frase, (3) pronúncia em inglês. Botão de modo:
**IA** (padrão) ou **offline** (pacote local em arquivos separados do banco, quando disponível;
geração prévia offline é recurso futuro — não neste escopo).

- **Modelo A (palavra):** card com sentido literal, sentido naquele contexto, sinônimo comum +
  alternativa mais precisa, e por que o autor escolheu a palavra em vez do sinônimo, com veredito
  "errado" / "certo" / "certo, mas menos cabível neste contexto".
- **Modelo B (frase):** tradução integral natural em pt-BR + lista de expressões/phrasals/colocações/
  conectores/marcadores/usos contraintuitivos com explicação curta cada. Sem lista vazia quando não
  houver dicas.
- **Cobertura:** enunciados, passagens, instruções, transcrições exibidas, turnos de diálogo, opções,
  lacunas, bancos de palavras, modelos, explicações e feedback — quando visíveis e úteis — em todos os
  tipos, governados por uma matriz central **tipo×campo×fase**; campo que contenha a resposta fica
  indisponível até o momento seguro.
- **Regras invioláveis:** tradução = significado; áudio = pronúncia do inglês original (nunca "áudio
  da tradução"); não confundir mídia do pack com recursos nativos das questões; nenhum prefetch
  (pedido só após tap/clique explícito; nada abre durante rolagem no mobile); não altera resposta,
  nota, banco nem dados; **desativado no simulado**.
- **Layout:** adaptação mobile-first por tipo/página para viabilizar o uso ou não dos recursos.

## 12. Rotas e navegação

`src/routes/` (arquivos, não links virtuais; cada rota com `head()` próprio — título/descrição/og
específicos, nunca "Lovable App"):

- `/` — Home: meta, data da prova, sequência, plano do dia, atalhos de revisão, badge de fila.
- `/catalogo` — catálogo dos 22 tipos com contagens derivadas, disponibilidade e progresso.
- `/praticar/$type` — shell de prática (motores por tipo, timers ajustáveis, notas, favoritos, histórico).
- `/sessoes` e `/sessoes/$id` — sessões retomáveis (sobrevivem ao reload).
- `/diagnostico` — erros por categoria + atalhos para treinar o ponto fraco.
- `/progresso` — estimativa por habilidade (rotulada), tendência, confiança, lacunas de cobertura,
  relatório semanal exportável.
- `/simulado` — launcher do simulado/mini-simulado com rótulos claros.
- `/ajustes` — meta, data da prova, timers, TTS/voz, backup/restore, quarentena, Studie Plus (3
  controles + modo IA/offline), explicação de processamento externo.
- Tipos sem conteúdo aprovado: estado "em breve" com o motivo registrado, nunca conteúdo duvidoso.

## 13. Offline, desempenho e acessibilidade

- **Offline (Fase 12):** pré-cache da navegação e do conteúdo já disponível; "Baixar para offline";
  cache versionado; aviso de nova versão; estudo sem IA funciona; avaliação/tradução por IA avisam
  claramente que exigem conectividade e não fingem avaliação sem rede.
- **Payload enxuto:** nenhum campo repete o mesmo texto em vários lugares; chunk por tipo de questão;
  imagens só no `describe_image` (lazy). TTS informa a voz realmente usada.
- **Acessibilidade:** axe limpo; teclado completo nos motores; revisão em 390×844; `aria-live` para
  feedback de resultado; foco visível; contraste conforme tokens.

## 14. Governança do banco (regras invioláveis de conteúdo)

1. Só entra conteúdo de fonte verificável — já garantido pelo pacote (2.823 itens, 91 fontes
   avaliadas: 47 aprovadas · 44 reprovadas; proveniência 74 verificada · 207 corroborada · 2.542
   comunitária). Importação preserva tudo; nada é regenerado.
2. Zero duplicatas (o pacote já veio deduplicado; `aliases.json` vazio é mantido para o futuro).
3. Listening só entra se o motor usa o transcript; `wfd`/`repeat_sentence`/`read_aloud` etc. exibem o
   que o item realmente tem.
4. Describe Image: imagens CC BY 4.0 com atribuição no próprio item — atribuição sempre exibida.
5. Lacunas honestas (`sst` 58, `lst_fib` 53, `read_mcq_single` 50 abaixo da meta mínima): cobertura
   reportada como está; nenhum item inventado para preencher.
6. `sources.json` e `corroboration.json` ficam fora do bundle do app (pasta de trabalho de
   desenvolvimento); o app só carrega `source` e `provenance` de cada item. Selo de proveniência e
   filtro "só verificadas" na UI (Fase 11).

## 15. Fases — escopo e critérios de aceite

> A ordem e as dependências seguem `project1` §11. Gates comuns a todas as fases (§22): vitest + tsgo
> + build + lint + Playwright nas rotas tocadas. Cada fase só é marcada `[x]` no roadmap central com a
> linha "Subagentes: fase-{F}/{K…} · reports: report-{K}.md" apontando reports reais em
> `.opencode/work/sub/`.

### Fase 1 — Formato vigente, contratos e arquitetura AI-first

**Escopo:** confirmar em fontes vigentes o formato do exame (ordem das tarefas, matriz oficial
tarefa×habilidade, tempos/limites por tipo, blueprint do simulado); fixar contratos de dados (§6) em
`src/domain/` e `src/data/exam-spec.ts`; definir arquitetura AI-first (harness de avaliação, política
de privacidade de envio) e estrutura de pastas; catálogo dos 22 tipos como dados (não tela).
**Aceite:** `exam-spec.ts` com `sourceUrl` e `consultedAt` para cada afirmação; tipos TS do contrato
compilam; decisão de pesos onde a matriz não confirmada é marcada como aproximação; ADRs registrados
neste PRD ou em `docs/`; estrutura de pastas criada; nenhum número fixo introduzido.
**Não fazer:** telas de treino (Fase 4+); importação de questões (Fase 2).

### Fase 2 — Importação e integridade do banco

**Escopo:** descompactar `pte-question-bank.zip` (raiz: `bank/`), rodar `node bank/tools/validate-bank.mjs`
(`OK — banco íntegro`) e verificar checksums; copiar `questions/*.json` + `aliases.json` para
`src/data/bank/`; imagens para `public/di/`; gerar `manifest.json` via script; loader dinâmico por
tipo; teste de integridade (total = 2.823; contagens por tipo = MANIFEST.json).
**Aceite:** validador verde; manifesto derivado (script, não manual); teste do total e das contagens
por tipo passa; lazy-load por tipo funciona; imagens servem em `/di/…`.

### Fase 3 — Integridade do progresso (antes de qualquer dado do aluno)

**Escopo:** armazenamento local resiliente (IndexedDB), snapshots por questão, agregados, log
truncável, SRS correto (§9), envelope de backup (§6.3) com import/export (prévia, mesclar,
substituir, desfazer), quarentena somente leitura, chaves de dia local, aviso de quota de áudio.
**Aceite:** testes de perda do §10 passam; reload no meio da sessão não perde estado; backup
corrompido não sobrescreve nada (vai para quarentena); SRS obedece as 3 regras (testes por regra).

### Fase 4 — Fundação web

**Escopo:** navegação completa (§12), catálogo unificado com contagens derivadas, Ajustes (meta, data
da prova, timers, voz TTS, backup, explicação de privacidade), Home com plano do dia e badge de
revisão, shell de prática genérico (engloba motores por tipo), tema/design system do produto.
**Aceite:** todas as rotas do §12 existem com `head()` próprio; catálogo exibe contagens do
manifesto (teste de prevenção contra números envelhecidos); badge de revisão visível em todas as
telas; Playwright cobre navegação desktop + 390×844.

### Fase 5 — Serviço de IA seguro e harness de avaliação

**Escopo:** adaptador de IA no servidor (server functions, chaves fora do navegador, limites,
timeout, retry restrito, cache efêmero, rastreio sem respostas sensíveis); harness com rubrica/schema
por tipo; corpus de calibração (Fase 5 de project1: amostra de referência por tipo); política de
antivazamento (§4.4) e anti-injection (§4.6); consentimento/explicação do processamento externo.
**Aceite:** nenhum gabarito sai para o navegador antes do envio (teste); falha de serviço gera
abstenção, não nota; saída valida contra schema; `evaluator.{model,promptVersion,rubricVersion}`
registrado; calibração produz relatório de consistência por tipo.

### Fase 6 — Motores de prática por família

**Escopo:** motores de leitura (4 tipos), listening (7 tipos com transcript/áudio real do item),
escrita (`swt`, `write_essay` com contagem de palavras e limite de tempo), fala (`read_aloud`,
`repeat_sentence`, `describe_image`, `retell_lecture`, `answer_short`, `sgd`, `rts` — gravação +
timers por tipo). Cada motor: entrada válida, casos-limite (vazio, estouro, timeout), abstenção.
Imagens do `describe_image` lazy com atribuição.
**Aceite:** os 22 tipos praticáveis individualmente; timers coerentes com `exam-spec.ts`; áudio do
item (quando existir) toca; gabarito inacessível antes do envio; testes de unidade por motor.

### Fase 7 — Sessões, fila de revisão, diagnóstico

**Escopo:** sessões retomáveis (persistem ao recarregar), fila do dia por SRS, diagnóstico de erros
por categoria (conteúdo, fluência, omissão, armadilha, palavras mais erradas), notas privadas,
favoritos, histórico de tentativas, atalhos "treinar o ponto fraco".
**Aceite:** sessão sobrevive ao reload (teste); fila do dia reflete o SRS; diagnóstico agrega por
categoria; badge e fila visíveis em toda a aplicação.

### Fase 8 — Medição honesta

**Escopo:** estimativa por habilidade 10–90 rotulada com confiança (derivada da matriz confirmada +
desempenho recente ponderado + tendência), meta e data da prova, plano diário por habilidade,
prontidão, plano do dia, relatório semanal exportável, gráficos de evolução.
**Aceite:** estimativa só aparece com calibração da Fase 5; nunca mistura de escalas sem rótulo
(teste); prontidão ignora tamanho do banco (teste); relatório exportável.

### Fase 9 — Simulado

**Escopo:** simulado por blueprint confirmado (Fase 1), cronometrado, fluxo inviolável (sem auxílios,
sem gabarito, sem Studie Plus), relatório pós-prova; mini-simulado separado e rotulado; omissões e
aproximações exibidas.
**Aceite:** blueprint vem de `exam-spec.ts` com fonte; temporização segue o blueprint; envio único;
relatório distingue treino de prova; the Studie Plus fica indisponível durante o simulado (teste).

### Fase 10 — Studie Plus AI-first

**Escopo:** modelos A e B, três controles independentes em Ajustes (desligado por padrão), botão de
modo IA/offline, matriz central tipo×campo×fase (elegibilidade e momento seguro), sem prefetch,
mobile-first (nada abre durante rolagem), glossário (sem lematização), áudio do pack por último.
**Aceite:** desligado por padrão (teste); pedido de tradução só após clique (teste); matriz cobre os
22 tipos e campos com inglês visível; nenhum texto que revele resposta fica elegível antes do momento
seguro (teste por tipo); desativado no simulado.

### Fase 11 — Banco rastreável e métricas consistentes

**Escopo:** selo de proveniência por item, filtro "só verificadas", `canonicalId` nas agregações,
payload enxuto, números todos derivados do manifesto, SEO dinâmico (títulos/og com contagens do
manifesto, por rota), teste de prevenção contra números envelhecidos.
**Aceite:** busca no código por contagens literais não encontra números envelhecidos (teste); selo
exibido; filtro funcional; `canonicalId` usado em todas as métricas (teste com quase-duplicata
sintética).

### Fase 12 — Offline real

**Escopo:** Service Worker com pré-cache versionado, "Baixar para offline", aviso de nova versão,
degradação clara da IA sem rede.
**Aceite:** em build de produção, após "Baixar para offline", tipo nunca visitado funciona; motores
de `write_essay`, `reorder`, `read_fib`, SGD, RTS e Describe Image operam sem rede nas partes que não
dependem de IA; aviso de nova versão aparece.

### Fase 13 — Acessibilidade, mobile, segurança, E2E e lançamento

**Escopo:** auditoria axe completa, teclado completo nos motores, revisão 390×844 de todas as rotas,
varredura de segurança (dependências e exposição de segredos), observabilidade sem conteúdo sensível,
E2E dos fluxos principais, revisão final da honestidade de rótulos, checagem 5 min/10 tentativas de
novos arquivos, aviso ao monitor de remix finalizado.
**Aceite:** axe limpo em todas as rotas; E2E cobre treino→avaliação→revisão→simulado→backup;
nenhum segredo no bundle; relatório final de lançamento.

## 16. Testes (mapa mínimo)

- `src/domain/`: SRS (3 regras), agregação/estimativa (escala e confiança), chaves de dia local,
  schemas de resposta.
- `src/lib/app/`: catálogo derivado do manifesto (números envelhecidos), fila do dia, backup
  (prévia/mesclar/substituir/desfazer/quarentena), elegibilidade Studie Plus (matriz), simulado
  (blueprint e bloqueio de auxílios).
- `src/server/`: schemas de saída dos avaliadores, abstenção por falha, antivazamento (nada de
  gabarito na resposta), limites de tamanho.
- E2E (Playwright): navegação, prática ponta a ponta de um tipo por família, reload de sessão,
  backup/restore, simulado, Ajustes.

## 17. Especificação operacional por tipo (base a confirmar na Fase 1)

Valores abaixo são a base de trabalho extraída do formato vigente; **cada linha vira `exam-spec.ts`
com `sourceUrl` + `consultedAt`** após conferência em material vigente da Pearson. "—" = sem
gabarito aplicável (avaliação aberta).

| Tipo | Tarefas no exame | Preparação | Tempo de resposta | Limite de conteúdo | Avaliação |
|---|---|---|---|---|---|
| `read_aloud` | 6–7 | ~35 s | conforme o texto (até 60 palavras) | texto até 60 palavras | conteúdo · oral · pronúncia · fluência |
| `repeat_sentence` | 10–12 | — | ~15 s | áudio 3–9 s | conteúdo · pronúncia · fluência |
| `describe_image` | 6–7 | ~25 s | ~40 s | imagem + mapa de dados | conteúdo · oral · pronúncia · fluência |
| `retell_lecture` | 1–2 | ~10 s | ~40 s | áudio ≤ 90 s | conteúdo · oral · pronúncia · fluência |
| `answer_short` | 5–6 | — | ~12 s | pergunta curta (1 palavra/treino) | conteúdo (vocabulary) |
| `sgd` | 2 | ~10 s | ~2 min | 3 vozes, 60–90 s de discussão | conteúdo · oral · pronúncia · fluência |
| `rts` | 2–3 | ~10 s | ~40 s | situação descrita por áudio | conteúdo · oral · pronúncia · fluência |
| `swt` | 2–3 | — | 10 min | 1 frase, 5–75 palavras | conteúdo · forma · gramática · vocabulário |
| `write_essay` | 1–2 | — | 20 min | 200–300 palavras | conteúdo · desenvolvimento · estrutura · gramática · vocabulário · ortografia |
| `read_fib_dropdown` | 4–5 | — | compartilhado da seção | texto ≤ 80 palavras | reading + writing |
| `read_mcq_multi` | 2–3 | — | idem | texto ≤ 300 palavras | reading (penalidade em errado) |
| `reorder_paragraphs` | 2–3 | — | idem | 4–5 blocos, texto ≤ 150 palavras | reading |
| `read_fib_drag` | 4–5 | — | idem | texto ≤ 80 palavras | reading + writing |
| `read_mcq_single` | 2–3 | — | idem | texto ≤ 110 palavras | reading |
| `sst` | 1–2 | — | 10 min | 50–70 palavras, áudio 60–90 s | conteúdo · forma · gramática · vocabulário · ortografia |
| `lst_mcq_multi` | 2–3 | — | idem listening | áudio 40–90 s | listening (penalidade) |
| `lst_fib` | 2–3 | — | idem | transcrição ≤ 80 palavras | listening + writing |
| `lst_hcs` | 2–3 | — | idem | áudio 30–60 s | listening + reading |
| `lst_mcq_single` | 2–3 | — | idem | áudio 25–50 s | listening + reading |
| `lst_smw` | 2–3 | — | idem | áudio com bip | listening |
| `lst_hiw` | 2–3 | — | idem | 3–5 palavras divergentes | listening (penalidade) + writing |
| `wfd` | 3–4 | — | janela curta | transcrição 3–15 palavras | listening + writing |

Notas de avaliação aplicáveis a todo o conjunto: leitura usa distribuição total da seção (não por
questão); parcialidade é tratada pelo juiz IA com o gabarito como referência; penalidades negativas
são aplicadas como no formato oficial e explicadas ao aluno no feedback.

## 18. UX e design system

- **Direção visual:** um só sistema coeso (tokens em OKLCH no `src/styles.css`), pt-BR, serif de
  destaque apenas onde reforça hierarquia; sem estética genérica. Nada de hardcoded colors.
- **Telas de treino:** pergunta em foco único; timer discreto e ajustável em treino; feedback só após
  envio; histórico e notas privadas acessíveis sem sair da questão.
- **Móvel:** alvos ≥ 44 px; motores operáveis por toque; gravação com estado visível e aviso de
  quota; nada de card abrindo durante rolagem (regra do Studie Plus).
- **Estados:** "em breve" por tipo sem conteúdo (com motivo); carregamento por skeleton; erro de IA
  vira abstenção explicada, não mensagem técnica.

## 19. Observabilidade

Logs de erro de aplicação em `src/lib/lovable-error-reporting.ts` (já existente); nenhum log contém
resposta do aluno, texto de questão completo ou dado pessoal — chaves estruturais apenas
(tipo, ids, contagens, códigos de erro). Erros do avaliador aparecem ao aluno como abstenção
explicada, e no log com `evaluator` e `errorKind`.

## 20. Rastreabilidade de decisões (ADR)

Decisões significativas tomadas durante a execução (que este PRD não fixa) são registradas aqui como
entradas `ADR-NN — decisão · por quê · alternativas descartadas`. Intervenções do agente principal
em código (exceção mecânica do protocolo) também entram aqui.

- ADR-01 — Banco como JSON estático no repositório (não no zip descompactado em runtime) · offline e
  bundle determinístico · descartado: fetch do zip em runtime (fragil offline).
- ADR-02 — Server functions do TanStack Start para IA (não edge functions externas) · chaves seguras e
  mesmas rotas same-origin · descartado: chamadas diretas do navegador (exporia chaves).
- ADR-03 — IndexedDB + envelope de backup JSON · volume e legibilidade · descartado: localStorage puro
  (limite ~5 MB com áudio).

## 21. Escopo negativo

Sem nota oficial prometida; sem autoridade avaliadora determinística; sem geração de questões por IA;
sem contas/nuvem para dados do aluno/pagamento; sem sincronização remota; sem geração prévia de
traduções offline; sem lematização no glossário; sem apagar questões sem registro; sem números fixos
onde exista constante do manifesto; `routeTree.gen.ts` não é editado à mão.

## 22. Gates

Toda fase roda, antes de `[x]`: `bunx vitest run`, `tsgo` (typecheck), `vite build`, `eslint`,
Playwright no preview :8080 nas rotas tocadas. Falha em qualquer gate = fase não concluída.
Reportes de subagente são alegação, não prova: o agente principal verifica contra os critérios de
aceite desta seção antes de integrar e marcar.

## 23. Encerramento

Quando o roadmap chegar a 100%: avisar o monitor ("remix finalizado"), confirmar a pendência do
`project1` §13 (verificação offline em build de produção já coberta na Fase 12) e planejar
`project2` conforme o planejamento.

**Última atualização:** Fase 0 (preparação) — PRD criado a partir de `project1` + `studie-plus.md`
+ inspeção do `pte-question-bank.zip` e do template. Nenhum número do produto foi digitação direta:
os valores por tipo do §17 são base a validar na Fase 1 antes de virarem `exam-spec.ts`.

## roadmap-proj1
# Roadmap — PTE Master Hub (projeto 1)

> Ordem de dependência do planejamento (`project1` §11) e do PRD (§15). Fase só é `[x]` com a linha
> "Subagentes: fase-{F}/{K…} · reports: report-{K}.md" apontando reports reais em
> `.opencode/work/sub/fase-{F}/{K}/` e gates verdes (vitest · tsgo · build · lint · Playwright nas
> rotas tocadas) verificados pelo agente principal — relato de subagente é alegação, não prova.

- [x] **Fase 1 — Contratos e arquitetura AI-first**: exam-spec.ts (matriz, tempos, blueprint, fonte+data); contratos Question/Attempt/Snapshot/Aggregates/Envelope/Result em `src/domain/`; estrutura de pastas; ADRs; política antivazamento/anti-injection
  · Gates: vitest 159 testes verdes (10 arquivos) · tsgo/build/lint: verificar na integração · Blueprint marcado `confirmed: false` (Pearson não publica formulário fixo; 65 questões/130 min com omissões declaradas)
  · Subagentes: fase-1/s1-exam-spec,s2-domain-contracts · reports: report-s1-exam-spec.md, report-s2-domain-contracts.md (s2 relançado como s2b após encerrar sem relatório)
  · Pendências para integração: PRD §6.1 deve refletir o banco (sem `difficulty`/`domain` no topo; são `source.domain`); teste de contrato aponta `BANK_DIR` para o banco versionado na Fase 2
- [x] **Fase 2 — Importação do banco**: validate-bank + checksums; questions+aliases → `src/data/bank/`; imagens → `/di/`; manifesto via script; loader por tipo — teste total=2823 e contagens = MANIFEST
  · Gates: validate-bank `OK — banco íntegro` (6 avisos do próprio pacote) · sha256 51/51 OK · vitest 28/28 verde (integrity 13 + loader 13 + bank-contract 2; bank-contract repontado para `src/data/bank`, skipIf removido) · `node scripts/bank/build-manifest.mjs` idêntico ao MANIFEST e determinístico · `GET /di/population.png` → 200 image/png · tsgo global: 1 erro transitório em `src/test/app/db.test.ts` (arquivo do s2, em edição concorrente)
  · Subagentes: fase-2/s1-bank-import · reports: report-s1-bank-import.md
- [x] **Fase 3 — Integridade do progresso**: snapshots por questão, agregados, log truncável, chaves de dia local; SRS (vencida→promove, lapso→rebaixa, limiar por tipo); envelope de backup (prévia/mesclar/substituir/desfazer/quarentena) — testes de perda
  · Gates: vitest 71/71 verde (8 arquivos em src/test/app) · tsgo --noEmit limpo no projeto inteiro (exit 0) · camada em `src/lib/app/` (db, storage, srs, backup-io, media) sobre os contratos de `@/domain` · fake-indexeddb nos testes
  · Subagentes: fase-3/s2-progresso-local · reports: report-s2-progresso-local.md
- [ ] **Fase 4 — Fundação web**: rotas do PRD §12 com head() próprio; catálogo com contagens derivadas; Home/plano do dia; badge de revisão global; Ajustes (meta, prova, timers, TTS, backup, privacidade); shell de prática — Playwright desktop+390×844
- [ ] **Fase 5 — IA segura e harness**: adaptador IA em server functions (sem chave no navegador, limites/timeout/retry/cache); rubrica+schema por tipo; abstenção por falha; corpus de calibração; consentimento de envio — teste de antivazamento
- [ ] **Fase 6 — Motores de prática (22 tipos)**: Reading(4) · Listening(7, transcript/áudio real) · Writing(2, contagem/limite) · Speaking(7, gravação+timers) — teste por motor e gabarito inacessível antes do envio
- [ ] **Fase 7 — Sessões e revisão**: sessões retomáveis (sobrevivem ao reload); fila do dia SRS; badge global; notas/favoritos/histórico; diagnóstico por categoria + atalhos de treino
- [ ] **Fase 8 — Medição honesta**: estimativa 10–90 rotulada com confiança; pesos da matriz confirmada; prontidão por desempenho/tendência/confiança; meta e plano diário; relatório semanal exportável; gráficos — teste de não-mistura de escalas
- [ ] **Fase 9 — Simulado**: blueprint de exam-spec.ts; cronometragem; fluxo inviolável (sem auxílios/gabarito/Studie Plus); relatório pós-prova; mini-simulado rotulado — teste de bloqueio de auxílios
- [ ] **Fase 10 — Studie Plus AI-first**: 3 controles independentes (desligado por padrão); modo IA/offline; matriz tipo×campo×fase; sem prefetch; mobile-first; glossário; áudio do pack por último — testes de elegibilidade segura
- [ ] **Fase 11 — Banco rastreável**: selo de proveniência; filtro "só verificadas"; canonicalId nas métricas; payload enxuto; números derivados do manifesto; SEO dinâmico — teste anti-número-envelhecido
- [ ] **Fase 12 — Offline real**: Service Worker pré-cache versionado; "Baixar para offline"; aviso de nova versão; degradação clara da IA — verificação offline em build de produção
- [ ] **Fase 13 — Lançamento**: axe limpo; teclado nos motores; revisão 390×844; scan de segurança; E2E treino→avaliação→revisão→simulado→backup; relatório final; avisar monitor

**Estado:** Fases 1–3 concluídas (Fase 1: vitest 159✓ · tsgo✓ · build✓; Fase 2: vitest 28✓ · manifesto derivado✓ · banco 2.823 íntegro✓; Fase 3: vitest 71✓ · tsgo global✓). Próxima fase = 4 (fundação web; dependências 2✓ e 3✓). Próximo remix: retomar da Fase 4; pilares em `.opencode/work/sub/fase-1/`, `fase-2/` e `fase-3/`.

# SEUS PILARES (o seu recorte)
## project1-s1
# Planejamento do subagente s1-fundacao (Fase 4 — onda 0)

## Missão
Construir a fundação web do PTE Master Hub: o shell de aplicação (navegação + badge de revisão
global), o design system do produto e os **contratos compartilhados** que as ondas seguintes
consumem (ajustes tipados, acesso ao progresso, TTS, rotas-placeholder do §12). Servir o "esqueleto"
sobre o qual Home, catálogo, Ajustes e prática serão montados sem colisão.

## Por quê
A Fase 4 tem 5 pacotes possíveis, mas 4 deles consomem os mesmos contratos (ajustes, progresso,
layout). Fixar isso ANTES da onda paralela evita que 4 subagentes inventem 4 schemas de ajustes
diferentes — a falha que o protocolo chama de "contrato indefinido quando o paralelo começa".

## Escopo (dono exclusivo)
- `src/routes/__root.tsx` — shell/nav/badge global; mantém `<Outlet />`, QueryClientProvider e
  componentes de erro/404 existentes.
- `src/components/layout/**` — AppShell (header, nav, badge de revisão), componentes compartilhados.
- `src/styles.css` — refinamento dos tokens (OKLCH), sem hardcoded colors.
- `src/lib/app/settings.ts` — **contrato**: schema tipado dos ajustes + defaults + leitura/gravação.
- `src/lib/app/progress-client.ts` — **contrato**: singleton browser-only de `openProgressLayer()`.
- `src/lib/speech.ts` — **contrato**: TTS Web Speech API (voz real usada, SSR-safe).
- `src/hooks/use-review-status.ts` — badge global (fila do dia via SRS).
- Rotas-placeholder com `head()` próprio: `src/routes/sessoes/index.tsx`,
  `src/routes/sessoes/$id.tsx`, `src/routes/diagnostico.tsx`, `src/routes/progresso.tsx`,
  `src/routes/simulado.tsx`.
- Testes: `src/test/app/settings.test.ts` e `src/test/app/progress-client.test.ts`.

## Fora do escopo (de outros pacotes da Fase 4)
- Home (`src/routes/index.tsx`) → s2-home · Catálogo (`src/routes/catalogo.tsx`) → s3-catalogo ·
  Ajustes (`src/routes/ajustes.tsx`) → s4-ajustes · Prática (`src/routes/praticar/$type.tsx`) →
  s5-pratica. Motores de prática, avaliação IA, Studie Plus, sessões reais: Fases 5–10.

## Fronteiras
- Recebe: contratos de `src/domain` (TaskType, Section), `src/data/loader.ts` (loadManifest),
  `src/lib/app/index.ts` (openProgressLayer, reviewQueue), `src/data/exam-spec.ts`.
- Entrega: os contratos acima documentados no meu PRD (seção "Contratos que produzo") — os
  subagentes da onda 1 implementam contra eles; contrato errado deve ser relatado, não improvisado.

## Princípios centrais que mais pesam aqui
- Sem números fixos na interface (§4.8) · mobile-first/alvos ≥ 44 px (§4.9) · progresso 100% local
  e browser-only (§4.5) · honestidade em estados "em construção" (§18) · routeTree.gen.ts nunca
  editado à mão.

## prd-project1-s1
# PRD do subagente s1-fundacao (Fase 4 — onda 0)

> O COMO do seu recorte. Centrais: `project1` (§7 arquitetura, §12 rotas — ver PRD central §12/§18)
> e `prd-project1` (§5.1 stack, §12 rotas, §18 UX). Este arquivo detalha só o que é seu.

## F4.0 — Shell de aplicação e navegação

- **Layout:** header fixo com marca "PTE Master Hub", navegação principal (Início `/`, Catálogo
  `/catalogo`, Praticar `/praticar`, Sessões `/sessoes`, Progresso `/progresso`, Ajustes `/ajustes`)
  e o badge de revisão global. Mobile: nav colapsa em barra inferior ou menu (alvos ≥ 44 px).
  Desktop: nav horizontal. O shell envolve `<Outlet />` em `__root.tsx` — mantenha o
  `RootShell`/`RootComponent` existentes (html lang="pt-BR" class="dark", HeadContent, Scripts,
  QueryClientProvider, notFound/error components) e apenas acrescente o shell ao redor do Outlet.
- **Badge de revisão global:** contador de revisões vencidas visível em todas as telas (§9 central).
  Fonte: `getProgressLayer()` → `store.getDueSnapshots(dayKeyLocal)`. Estado de loading = sem número
  (nunca exibir 0 falso); erro = badge oculto, nunca quebra a página. Link aponta para `/sessoes`.
- **Rotas-placeholder** (existem com `head()` próprio — título/descrição pt-BR específicos, nunca
  "Lovable App"; og:type + twitter:card em cada uma): `/sessoes`, `/sessoes/$id`, `/diagnostico`,
  `/progresso`, `/simulado`. Conteúdo honesto: "esta área chega na Fase X (o quê ela entregará)",
  com o botão voltar. Estado nunca simula funcionalidade inexistente.
- **Números derivados:** o nav/badge não exibe contagens do banco (isso é do catálogo). Nenhum
  literal "22", "2823" ou similar.

## F4.1 — Contratos que produzo (onda 1 implementa contra eles)

### `src/lib/app/settings.ts` — ajustes tipados (fonte única da verdade dos ajustes)
```ts
export interface AppSettings {
  meta: { targetScore: 50 | 58 | 65 | 79; examDate: string | null }; // ISO yyyy-mm-dd local
  practice: { timersEnabled: boolean; timerScale: 1 | 1.5 | 2 };
  tts: { enabled: boolean; voiceUri: string | null; rate: number }; // rate 0.5–2
  studiePlus: { enabled: boolean; word: boolean; sentence: boolean;
                pronunciation: boolean; mode: "ai" | "offline" };
}
export const DEFAULT_SETTINGS: AppSettings; // studiePlus.enabled=false, word/sentence/pronunciation=false
export async function readAppSettings(store: ProgressStore): Promise<AppSettings>;
export async function updateAppSettings(store, patch: DeepPartialAppSettings): Promise<AppSettings>;
```
- Persistência via `store.setSettings`/`getSettings` (Record<string, unknown>) — o schema tipado
  vive AQUI e valida (merge com defaults, valores inválidos caem no default, nunca crasham).
- `updateAppSettings` é merge profundo por seção e devolve o estado resultante.
- `studiePlus.enabled` default `false` (PRD §11 — desligado por padrão; testado).

### `src/lib/app/progress-client.ts` — acesso ao progresso (browser-only)
```ts
export function isProgressAvailable(): boolean; // false em SSR / sem IndexedDB
export async function getProgressLayer(): Promise<ProgressLayer>; // singleton; rejeita em SSR
```
- Singleton: uma conexão para todo o app (openProgressLayer com nome padrão). Em SSR/lazy preload
  deve rejeitar com erro claro — componentes só chamam dentro de `useEffect`/eventos.

### `src/lib/speech.ts` — TTS (Web Speech API)
```ts
export function isSpeechAvailable(): boolean;
export function listEnglishVoices(): SpeechSynthesisVoice[]; // en-* apenas
export interface SpeakOptions { voiceUri?: string | null; rate?: number; onEnd?: () => void; }
export function speak(text: string, opts?: SpeakOptions): { cancel: () => void; voiceName: string | null };
```
- `voiceName` = a voz REALMENTE usada (PRD: TTS informa a voz usada); áudio fala sempre o inglês
  original. SSR-safe (typeof window). Sem voz en disponível: voiceName null e a UI explica.

### `src/hooks/use-review-status.ts`
```ts
export function useReviewStatus(): { dueCount: number | null; loading: boolean };
```
- Consome `progress-client`; recarrega em foco da janela; null enquanto desconhecido.

## F4.2 — Design system
- Tokens OKLCH em `src/styles.css` (já existem do template — refine para o produto: superfícies de
  estudo calmas, destaque de hierarquia com a serif Fraunces já carregada, Space Grotesk na UI).
  Nenhum `bg-[#...]`/`text-white` em componentes — só tokens semânticos. Dark é o padrão (html.dark).
- Componentes reutilizáveis do shell em `src/components/layout/` (nav item, badge, empty-state
  "em construção" com fase e descrição — usado pelas rotas-placeholder).

## F4.3 — Testes e gates
- `src/test/app/settings.test.ts`: defaults (studiePlus off), merge profundo, valor inválido →
  default sem crash, round-trip via fake-indexeddb (padrão de `src/test/app/helpers.ts`).
- `src/test/app/progress-client.test.ts`: singleton (mesma promise), rejeição quando IndexedDB
  indisponível (injetado null).
- Gates seus: `bunx vitest run src/test/app/settings.test.ts src/test/app/progress-client.test.ts`
  e `bunx tsgo --noEmit` (global). NÃO rode `vite build` nem `bun run dev` (agente principal).
  NÃO edite `routeTree.gen.ts` (regenera sozinho).

## Proibições
- Não tocar em `src/routes/index.tsx`, `catalogo.tsx`, `ajustes.tsx`, `praticar/**`,
  `src/data/**`, `src/domain/**`, `src/lib/app/{storage,db,srs,backup-io,media}.ts`, testes de
  outros pacotes, pilares centrais.
- Instalar dependências é do agente principal — use só o que existe (lucide-react, Radix, TanStack).

## Registro de decisões (preencha numerado ao decidir)
1. —

## roadmap-proj1-s1
# Roadmap do subagente s1-fundacao (Fase 4 — onda 0)

- [ ] F4.0.1 — Contratos compartilhados: `src/lib/app/settings.ts` (schema + defaults + merge,
      studiePlus off), `src/lib/app/progress-client.ts` (singleton browser-only), `src/lib/speech.ts`,
      `src/hooks/use-review-status.ts`
      · Gates: vitest dos novos testes verde · tsgo limpo
- [ ] F4.0.2 — Shell: `src/components/layout/**` (AppShell, nav, badge, empty-state) + integração em
      `src/routes/__root.tsx` mantendo Outlet/Providers/erros; refinamento de tokens em `src/styles.css`
      · Gates: tsgo limpo · sem hardcoded colors (revisão no código)
- [ ] F4.0.3 — Rotas-placeholder do §12: `/sessoes`, `/sessoes/$id`, `/diagnostico`, `/progresso`,
      `/simulado` com head() próprio (título/descrição/og:type/twitter:card) e estado honesto
      · Gates: tsgo limpo · rotas presentes em src/routeTree.gen.ts (regenerado)
- [ ] F4.0.4 — Testes settings + progress-client verdes; badge de revisão sem 0 falso
- [ ] F4.0.5 — Relatório `report-s1-fundacao.md` com evidências e contratos finais

Gates finais do pacote: `bunx vitest run src/test/app/settings.test.ts src/test/app/progress-client.test.ts` ·
`bunx tsgo --noEmit` · sem edição fora do dono exclusivo.
