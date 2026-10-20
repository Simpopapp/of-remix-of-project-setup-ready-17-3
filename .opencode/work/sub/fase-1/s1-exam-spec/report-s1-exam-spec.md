# Relatório — s1-exam-spec (Fase 1 · projeto 1)

**Data:** 2026-10-20
**Pacote:** `s1-exam-spec`
**Status:** entregue; gates do pacote verdes (vitest + eslint; `tsgo` sem erros nos meus ficheiros).
**Ressalva de gate:** `tsgo` do projeto inteiro ainda falha por ficheiros do pacote concorrente
`s2-domain-contracts` (evidência na secção 2.2). Nenhum erro aponta para os meus ficheiros.

---

## 1. Feito (por fase do roadmap)

### F1.1 — Pesquisa do formato vigente

- Confirmado que as mudanças valem para provas realizadas **a partir de 07/08/2025**: as três seções
  e os 20 tipos originais permanecem, com **2 novos tipos** em Speaking & Writing
  (`sgd` — Summarize Group Discussion e `rts` — Respond to a Situation), totalizando **22 tipos
  pontuados**.
- Confirmadas a ordem e as durações oficiais: **Speaking & Writing** (9 tipos, 76–84 min),
  **Reading** (5 tipos, 23–30 min) e **Listening** (8 tipos, 31–39 min). A Pearson declara
  ~2 h de prova e máximo de 2h18; as faixas das seções não somam o total porque versões diferentes
  são balanceadas para a duração total.
- Confirmadas as contagens por tipo, a matriz tarefa×habilidade e os critérios de pontuação no
  **Test Taker Score Guide** e no **Score Guide Institution (jul/2025)**.
- Confirmados os limites de conteúdo e os tempos de preparação/resposta nas páginas oficiais de
  cada seção.
- Divergência registada: **Read Aloud** é descrito na página de formato como contribuindo para
  reading + speaking, mas a tabela do Score Guide (jul/2025) lista apenas **Speaking**. A spec adota
  a união `reading+speaking` e marca `weightsApproximation: true` com nota em pt-BR.
- Correções face à base de trabalho do PRD §17 (tabela “base a confirmar”):
  Describe Image **5–6** (não 6–7); Retell Lecture **2–3** (não 1–2); SGD **2–3** (não 2);
  Select Missing Word **1–2** (não 2–3); FIB Dropdown até **200** palavras (não 80);
  MCQ Multiple até **350** (não 300); Re-order até **110** (não 150); Listening MCQ Multiple com
  áudio de **80–120 s** (não 40–90).

### F1.2 — `src/data/exam-spec.ts`

Ficheiro de dados puro, **sem importações**, com:

- `ExamTaskSpec` e `ExamBlueprint`/`ExamSource` tipados.
- `EXAM_TASKS` com os **22 tipos**, ids exatamente iguais aos do banco, nomes oficiais + pt-BR,
  contagens, preparação/resposta, limite de conteúdo, matriz de habilidades e notas de divergência.
- `EXAM_TASK_ORDER` com a ordem oficial das tarefas.
- `EXAM_META` com vigência, total de tipos, faixa de 65–75 questões, escala 10–90, duração típica
  (~120 min), duração máxima (138 min = 2h18), três partes e os 7 tipos com revisão humana de
  Content.
- `PERSONAL_INTRODUCTION` como item **não pontuado** e fora dos 22 tipos.
- `FULL_MOCK_BLUEPRINT` (`id: "full-mock"`) com as três partes, contagens por tipo e 130 min,
  marcado `confirmed: false` por ser aproximação declarada (a Pearson não publica blueprint fixo),
  com omissões explícitas.
- `MINI_MOCK_ID = "mini-mock"` e `MINI_MOCK_NOTE` (produto distinto do exame completo).
- `EXAM_SOURCES` com **17 entradas** por afirmação, cada uma com `sourceUrl`, `consultedAt`,
  `status` (`confirmed`/`approximation`) e, quando aplicável, `publishedAt` e nota.

### F1.3 — `src/test/exam-spec.test.ts`

**29 testes** cobrindo:

- 22 ids exatos e na ordem oficial; unicidade; distribuição 7/2/5/8.
- Matriz tarefa×habilidade (incluindo a exceção oficial de `answer_short` = só Listening).
- Tempos de preparação/resposta; ausência de preparação onde não há; `shared_section` em
  Reading/Listening (exceto SST = 600 s); `until_audio` em Read Aloud.
- Limites de conteúdo que corrigem a base anterior.
- Metadados (vigência, 65–75, 10–90, partes, 7 tipos com revisão humana).
- Personal Introduction fora dos 22 e não pontuado.
- Blueprint: cobre os 22 tipos uma vez, contagens dentro das faixas, 65 questões, 130 min,
  `confirmed: false`, fonte https, data ISO e omissões.
- Fontes: ≥8 entradas, URLs https válidas, datas ISO, status válido, cobertura das páginas de
  formato e dos dois Score Guides; divergência do Read Aloud marcada como aproximação.
- Ausência de contagem do banco (`2823`/`2.823`/`MANIFEST.json`) e de qualquer `import` no ficheiro
  de dados (lido em runtime via `import.meta.glob(..., { query: "?raw" })`).

### F1.4 — Gates do pacote

- `bunx vitest run src/test/exam-spec.test.ts`: **29/29 passed**.
- `tsgo --noEmit -p tsconfig.json`: **nenhum erro em `src/data/exam-spec.ts` ou
  `src/test/exam-spec.test.ts`**. O comando sai com código 2 por erros de ficheiros do pacote
  concorrente (ver 2.2).
- `bunx eslint src/data/exam-spec.ts src/test/exam-spec.test.ts`: **exit 0**.
- `prettier --write` aplicado apenas aos dois ficheiros do pacote.

### F1.5 — Este relatório

Gravado em `.opencode/work/sub/fase-1/s1-exam-spec/report-s1-exam-spec.md`.

---

## 2. Evidências (saída real)

### 2.1 Vitest

```
RUN  v5.0.3 /dev-server

Test Files  1 passed (1)
     Tests  29 passed (29)
  Duration  800ms
```

### 2.2 `tsgo` — projeto inteiro vs. ficheiros do pacote

Execução real: `tsgo --noEmit -p tsconfig.json` → **exit 2**. O erro muda entre execuções porque o
outro pacote está a ser escrito em paralelo. Na verificação final:

```
src/test/domain/question.test.ts(80,13): error TS2352: Conversion of type 'RawQuestion' to type
'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the
other. If this was intentional, convert the expression to 'unknown' first.
  Index signature for type 'string' is missing in type 'RawQuestion'.
src/test/domain/question.test.ts(81,13): error TS2352: Conversion of type 'RawQuestion' to type
'Record<string, unknown>' may be a mistake ...
```

`rg -n "exam-spec" /tmp/tsgo-out4.txt` → **NO_EXAM_SPEC_ERRORS**. Ou seja: o typecheck do projeto
não aponta nenhum erro aos meus dois ficheiros; a falha é do pacote `s2-domain-contracts`, que estava
a ser escrito em paralelo. Ver pendência 4.1.

### 2.3 ESLint

```
$ bunx eslint src/data/exam-spec.ts src/test/exam-spec.test.ts
ESLINT_EXIT:0
```

### 2.4 Medições do ficheiro

| Medição | Valor |
|---|---|
| Tipos em `EXAM_TASKS` | 22 |
| Distribuição por seção | 7 speaking · 2 writing · 5 reading · 8 listening |
| Entradas em `EXAM_SOURCES` | 17 |
| Fontes únicas | 9 |
| Testes | 29 |
| Blueprint — questões | 65 (mínimo oficial; faixa 65–75) |
| Blueprint — duração | 130 min (76 + 23 + 31) |
| Ocorrências de contagem do banco | 0 |
| Importações no ficheiro de dados | 0 |

### 2.5 Contagens e tempos materializados

| Tipo | Qtd. | Prep. | Resposta | Habilidades |
|---|---|---|---|---|
| `read_aloud` | 6–7 | 30 s | até o texto | speaking, reading (aprox.) |
| `repeat_sentence` | 10–12 | — | 15 s | listening, speaking |
| `describe_image` | 5–6 | 25 s | 40 s | speaking |
| `retell_lecture` | 2–3 | 10 s | 40 s | listening, speaking |
| `answer_short` | 5–6 | — | 10 s | listening |
| `sgd` | 2–3 | 10 s | 120 s | listening, speaking |
| `rts` | 2–3 | 10 s | 40 s | speaking |
| `swt` | 2 | — | 600 s | reading, writing |
| `write_essay` | 1 | — | 1200 s | writing |
| `read_fib_dropdown` | 5–6 | — | seção | reading |
| `read_mcq_multi` | 2–3 | — | seção | reading |
| `reorder_paragraphs` | 2–3 | — | seção | reading |
| `read_fib_drag` | 4–5 | — | seção | reading |
| `read_mcq_single` | 2–3 | — | seção | reading |
| `sst` | 1 | — | 600 s | listening, writing |
| `lst_mcq_multi` | 2–3 | — | seção | listening |
| `lst_fib` | 2–3 | — | seção | listening, writing |
| `lst_hcs` | 2–3 | — | seção | listening, reading |
| `lst_mcq_single` | 2–3 | — | seção | listening |
| `lst_smw` | 1–2 | — | seção | listening |
| `lst_hiw` | 2–3 | — | seção | listening, reading |
| `wfd` | 3–4 | — | seção | listening, writing |

### 2.6 Fontes consultadas (todas em 2026-10-20)

| URL | Data de consulta | Versão/nota |
|---|---|---|
| https://www.pearsonpte.com/pte-updates-2025/ | 2026-10-20 | página oficial de atualizações de 2025 |
| https://www.pearsonpte.com/articles/pte-changes-2025-everything-you-need-to-know/ | 2026-10-20 | artigo oficial sobre as mudanças |
| https://www.pearsonpte.com/pte-academic/test-format/ | 2026-10-20 | visão geral do formato |
| https://www.pearsonpte.com/pte-academic/test-format/speaking-writing/ | 2026-10-20 | Parte 1, 9 tipos, 76–84 min |
| https://www.pearsonpte.com/pte-academic/test-format/reading/ | 2026-10-20 | Parte 2, 5 tipos, 23–30 min |
| https://www.pearsonpte.com/pte-academic/test-format/listening/ | 2026-10-20 | Parte 3, 8 tipos, 31–39 min |
| https://www.pearsonpte.com/pte-academic/scoring/ | 2026-10-20 | escala 10–90 e quatro habilidades |
| https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/pdfs/pte-academic-pdfs/PTE-Academic-Test-Taker-Score-Guide.pdf | 2026-10-20 | Score Guide do candidato (jul/2025) |
| https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/pdfs/Score-Guide-Institution-PTE-Academic-July-2025-web.pdf | 2026-10-20 | Score Guide Institution (jul/2025) |

As 17 entradas claim-level (com `publishedAt` quando conhecido) estão embutidas em `EXAM_SOURCES`.

---

## 3. Decisões tomadas

- **D1 — Fonte primária.** Contagens, matriz tarefa×habilidade e critérios vêm do Score Guide
  (jul/2025); tempos e limites de conteúdo vêm das páginas oficiais de formato. Onde as duas fontes
  oficiais divergem, a divergência é registada em `notes` e o tipo é marcado como aproximação.
- **D2 — Read Aloud.** Adotada a união `reading+speaking` (leitura conservadora e coerente com o
  histórico da prova), com `weightsApproximation: true`, porque o Score Guide lista só Speaking.
  Revisar quando a Pearson publicar matriz inequívoca.
- **D3 — Blueprint.** Como a Pearson não publica um formulário fixo, o simulado completo usa o
  **limite inferior** de cada faixa oficial: 65 questões e 130 min (76+23+31). `confirmed: false`
  e `notes`/`omissions` explicam a aproximação. O total oficial não é 130: a Pearson declara ~2 h,
  máximo 2h18, e as faixas das seções não somam o total.
- **D4 — Contagens corrigidas.** A spec corrige a base do PRD §17 com os valores oficiais de 2025
  (Describe Image, Retell, Select Missing Word, limites de Reading e áudio de Listening).
- **D5 — Answer Short Question.** Pontua apenas **Listening**, conforme a matriz oficial; a resposta
  falada é o veículo, não uma segunda habilidade pontuada.
- **D6 — FIB Dropdown.** Pontua apenas **Reading** na matriz de 2025, apesar do título histórico
  “Reading and Writing: Fill in the Blanks”. A nota do item explica a divergência.
- **D7 — Personal Introduction.** Representado como constante separada, `scored: false`, fora dos
  22 tipos e fora das métricas — fidelidade ao fluxo sem contaminar o catálogo.
- **D8 — Datas e status.** Toda fonte tem `consultedAt: "2026-10-20"`; documentos com versão
  conhecida têm `publishedAt: "2025-07"`. Nenhuma fonte não-oficial foi usada como afirmação.
- **D9 — Teste sem dependência de Node.** O teste lê o próprio ficheiro de dados com
  `import.meta.glob(..., { query: "?raw" })` em vez de `node:fs`, porque o `tsconfig` do projeto é
  browser-oriented e não inclui `@types/node` em `types`.
- **D10 — Tipo de resposta.** `until_audio` para Read Aloud (a janela acompanha o texto) e
  `shared_section` para Reading/Listening, com a exceção cronometrada de `sst` (600 s).

---

## 4. Pendências e bloqueios

1. **Gate `tsgo` do projeto (externo ao pacote).** Nas duas verificações finais,
   `tsgo --noEmit -p tsconfig.json` saiu com código 2 por erros exclusivamente em ficheiros do
   pacote `s2-domain-contracts` (`src/test/domain/backup.test.ts` primeiro, depois
   `src/test/domain/question.test.ts`), que estava em escrita concorrente. Nenhum erro aponta para
   `src/data/exam-spec.ts` ou `src/test/exam-spec.test.ts`. Ação: o agente principal deve repetir o
   `tsgo` depois de o s2 concluir; se restar erro, é do s2, não deste pacote.
2. **Matriz do Read Aloud.** A divergência entre a página de formato e o Score Guide não foi
   resolvida pela Pearson em fonte pública consultada. A aproximação está declarada; revisar quando
   houver matriz oficial definitiva.
3. **Blueprint.** A composição do simulado é aproximada (limite inferior das faixas). A Fase 9 deve
   exibir `confirmed: false`, as omissões e o rótulo de mini-simulado.
4. **Sem gates de UI/offline.** Este pacote não tem tela nem build; `vite build` e Playwright não
   foram executados por desenho e para não colidir com a instância concorrente.

---

## 5. Mudanças necessárias fora do meu recorte

- **Fase 4 (catálogo):** consumir `EXAM_TASKS`/`EXAM_TASK_ORDER` como fonte dos 22 tipos e das
  contagens de tarefas; não duplicar números.
- **Fase 6 (motores):** usar `preparationSeconds`, `responseSeconds` e `contentLimit` de cada tipo;
  tratar `until_audio` e `shared_section` conforme a semântica documentada.
- **Fase 8 (estimativas):** derivar pesos de `scoredSkills`, respeitando `weightsApproximation`
  (Read Aloud) e sem inventar pesos onde a matriz não é confirmada.
- **Fase 9 (simulado):** consumir `FULL_MOCK_BLUEPRINT` com o rótulo de aproximação e
  `MINI_MOCK_NOTE`; não apresentar 130 min como duração oficial do exame.
- **Fase 11 (números):** nenhuma contagem de banco deve ser adicionada a este ficheiro; o manifesto
  continua a ser a fonte das contagens de questões.
- **Agente principal:** repetir o `tsgo` do projeto após o término do `s2-domain-contracts` e
  registrar o resultado no gate da Fase 1.

---

## 6. Arquivos criados/alterados

| Arquivo | Ação |
|---|---|
| `src/data/exam-spec.ts` | criado (704 linhas) |
| `src/test/exam-spec.test.ts` | criado (331 linhas) |
| `.opencode/work/sub/fase-1/s1-exam-spec/report-s1-exam-spec.md` | criado (este relatório) |

Nenhum outro ficheiro foi criado, alterado ou apagado. `routeTree.gen.ts`, `package.json`,
`src/styles.css`, `src/routes/**`, `src/domain/**`, `.opencode/**` (exceto o diretório do relatório) e
o zip do banco não foram tocados.
