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
- ADR-04 — Gates de compilação/tipos são executados pelo harness Lovable, nunca manualmente nesta sandbox; testes e lint continuam gates explícitos. Evidência Fase 4: harness build OK 2026-10-20 21:11:06 UTC; 388 testes verdes com dois workers, lint zero erros e seis warnings preexistentes. O rerun com dois workers evita um timeout de 5 s observado na carga irrestrita sem alterar testes nem limites do produto.
- ADR-05 — Fase 5 requer ativação de Lovable Cloud somente para execução segura de IA; progresso continua IndexedDB, sem tabelas de aluno nem contas. Aprovação/ativação ainda não solicitada nesta rodada, que encerrou a fundação web. Wrappers client-importable de server functions devem ficar fora de src/server/; auxiliares server-only em módulos .server.ts, conforme regras vigentes do runtime.
- ADR-06 — Intervenções do principal na Fase 5 (consertos mecânicos de integração, registrados por reports de subagente): (1) `src/lib/ai/evaluate.server.ts` — injeção de `rubricFor: evaluationRubricFor` na composição do handler (pendência do report s2-rubricas); (2) `src/components/settings/settings-patch.ts` — `aiConsent` incluído em `defaultsPatch()` (pendência do report s3-consentimento). Ambas verificadas com vitest verde após a edição.
- ADR-07 — Integração Fase 5 delegada a s6/s7/s8: SDK 7 usa instructions, não system em messages; guardas verificam saída antes do cache, consentimento explícito antes do carregamento e custo por instância. Limites não representam autenticação ou teto financeiro distribuído. Corpus de 44 itens permite executar relatório, mas smoke de conectividade não autoriza declarar calibração por tipo nem expor estimativa de habilidade.
- ADR-08 — Integração comprovada em 2026-10-21: 642 testes verdes/1 smoke opcional skipped, lint 0 erros/6 warnings, harness build OK 00:48:13 UTC. Browser fez 1 RPC real autorizado (WFD scored 0; HTTP 200, 0,20582 créditos); ausência de consentimento retorna abstenção sem chamada. O envio de prática via UI ainda é Fase 6; o aceite Fase 5 fica parcial até revisão de referências e consistência real por tipo.
- ADR-09 — Reabertura pós-monitor s7 adotou retenção integral de texto estrutural em leak e medição audio-only inválida, além de fail-closed para saída acima do teto individual/total e sondas literais sem filtro de distintividade. A revisão conservadora sem nota é preferível à reconstrução de referência/nota inventada. Verificação independente: 652 testes/1 skipped, lint 0 erros/6 warnings, harness build OK 2026-10-21 01:14:39 UTC. Proteção semântica geral e calibração por tipo continuam explicitamente não verificadas.

### Registro operacional medido do enxame (2026-10-21)
- `opencode run --session <id>` retomou a sessão sem refazer arquivos; a versão medida é 1.19.3.
- Concorrência 2 terminou s6/s8; deepseek s7 falhou com 429 Endpoint is unavailable. O fallback gratuito `opencode/glm-5.3-flash-free` terminou s7 sequencialmente, com report e gates reais.
- Wrapper com timeout de 550 s pode interromper produção antes do report; conferir disco e continuar a sessão evitou refazer o pacote. Gates de tipos do harness detectaram dois acessos não estreitados ao union, corrigidos pelo dono s7.

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
