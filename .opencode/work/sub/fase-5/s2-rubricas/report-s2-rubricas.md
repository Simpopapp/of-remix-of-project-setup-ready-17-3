# Relatório — s2-rubricas (Fase 5)

**Pacote:** s2-rubricas
**Data:** 2026-10-20
**Status:** concluído (gates do pacote verdes; typecheck/build ficam com o harness, ADR-04)

## 1. Feito (por fase do roadmap)

### F5.2.1 — Tipos e registry
- `src/lib/ai/rubrics/types.ts`: `RubricDimension`, `RubricInputLimits` e `TypeRubric` conforme o
  contrato do pacote, com `defaultStatus` obrigatório e opcionais `| undefined` para
  `exactOptionalPropertyTypes`.
- `src/lib/ai/rubrics/index.ts`: registry único com `getRubric`, `listRubricTypes` e `hasRubric`.
  Valida na carga que não há tipo duplicado nem tipo de `TASK_TYPES` sem rubrica; tipo desconhecido
  lança erro com a lista de tipos válidos.
- `src/lib/ai/rubrics/shared.ts`: `RUBRIC_VERSION = "rubric@1"`, construtor `dim`, dimensões
  `pronunciation` (`not_measured`) e `oral_fluency` (`proxy`), e regras/ressalvas comuns por família.

### F5.2.2 — As 22 rubricas
- `speaking.ts` — 7 tipos (`read_aloud`, `repeat_sentence`, `describe_image`, `retell_lecture`,
  `answer_short`, `sgd`, `rts`), 19 dimensões no total. Pronúncia `not_measured` nos 6 tipos que a
  declaram; `answer_short` tem só `content` (peso 1) e nenhuma dimensão de fala.
- `writing.ts` — 2 tipos (`swt`, `write_essay`), 11 dimensões. `swt` 4 dimensões; `write_essay` 7
  (inclui `form` 0.10 para acolher a regra oficial de contagem).
- `reading.ts` — 5 tipos, 5 dimensões (uma `reading` por tipo, conforme a matriz do `exam-spec`).
  `selectionPenalty: true` só em `read_mcq_multi`.
- `listening.ts` — 8 tipos, 16 dimensões. Cruzadas conforme o `exam-spec`: `lst_fib`/`wfd`
  Listening+Writing; `lst_hcs`/`lst_hiw` Listening+Reading; `sst` com critérios de escrita.
  `selectionPenalty: true` em `lst_mcq_multi` e `lst_hiw`.
- `exam-derived.ts` — janela de resposta, `scoredSkills`, `contentLimit` e faixa de palavras
  derivados de `EXAM_TASKS` sem digitar tempos/limites. `wfd` 3–15 é a única exceção, marcada como
  vinda do PRD §17.
- Pesos de todos os 22 tipos somam 1.00 (tolerância ±0.001), com `caveats` declarando que são
  aproximações e que a nota é estimativa de treino.

### F5.2.3 — Construtor de prompt versionado
- `src/lib/ai/prompts/type-prompt.ts`: `TYPE_PROMPT_VERSION = "type-prompt@1"`, `TypePrompt` e
  `buildTypePrompt(type)`.
- O addendum contém, por tipo: papel; formato oficial (janela, habilidades, limite); dimensões com
  id/label/peso/status/measurement; regras de abstenção na íntegra; escala 0–100 e média ponderada;
  regras de status (`measured`/`proxy`/`not_measured`); referência reservada e exigência de
  `evidence[].quote` literal da resposta do aluno; aviso de resposta-template; penalidade negativa
  quando aplicável; contrato JSON estrito; feedback sempre em pt-BR; versões no rodapé.
- `src/lib/ai/prompts/index.ts`: `evaluationRubricFor(type)` (forma `{ text, version }` consumida por
  `EvaluationHandlerDependencies.rubricFor` de s1) e `rubricAndPromptFor(type)`.
- Testes de prompt: cobertura dos 22, presença de cada dimensão/peso/regra, ausência de penalidade
  fora dos 3 tipos, `wfd`/`read_aloud` com `shared_section`/`until_audio`, `answer_short` sem
  dimensões de fala, antivazamento e determinismo.

### F5.2.4 — Evidências e decisões
- Roadmap do pacote atualizado com `[x]` em F5.2.1–F5.2.3 e números reais dos gates.
- PRD do pacote §5 preenchido com 16 decisões.

## 2. Evidências (saída real dos gates)

Comando final do pacote:

```
$ bunx vitest run src/test/ai/rubrics.test.ts src/test/ai/type-prompt.test.ts
 RUN  v5.0.3 /dev-server
 Test Files  2 passed (2)
      Tests  144 passed (144)
   Start at  22:28:12
   Duration  2.36s
```

Contagens por arquivo (execuções individuais):

```
$ bunx vitest run src/test/ai/rubrics.test.ts
 Test Files  1 passed (1)
      Tests  86 passed (86)

$ bunx vitest run src/test/ai/type-prompt.test.ts
 Test Files  1 passed (1)
      Tests  58 passed (58)
```

Cobertura comportamental provada pelos 86 testes de rubrica: 22 tipos exatos, ids de dimensão
únicos, pesos somando 1, `abstentionRules` ≥ 1, `rubric@1` em todos, pronúncia `not_measured` nos 7
de fala (ausente em `answer_short`), fluência `proxy`, penalidade só nos 3 tipos oficiais, limites
`swt`/`write_essay`/`sst`/`wfd`, e tipos sem faixa não inventando `minWords`/`maxWords`.

Cobertura comportamental provada pelos 58 testes de prompt: cada dimensão e cada regra de abstenção
presente no addendum, `pt-BR` exigido, `0–100`, `unmeasured`, `evidence`, JSON estrito, versões,
`shared_section`/`until_audio`, ausência de marcação negativa fora dos 3 tipos, e antivazamento com
itens reais (`loadQuestionsByType("wfd")` e `("read_aloud")`, 3 itens por tipo, primeiros 60
caracteres de cada — nenhum aparece em nenhum dos 22 addenda).

Gate de lint exatamente como no pacote:

```
$ bunx eslint src/lib/ai/rubrics src/lib/ai/prompts src/test/ai
ESLINT_EXIT:0
```

(sem saída; 0 erros e 0 warnings).

**Limites da verificação:** `tsgo`/`vite build` não foram executados por este subagente (ADR-04 —
harness Lovable). A tentativa de `lsp--check` falhou porque a porta 9999 não tinha serviço
(`Unable to connect`), então a verificação de tipos fica explicitamente com o harness do agente
principal.

## 3. Decisões tomadas (registradas no PRD §5)

1. `rubric@1` e `type-prompt@1` para as 22 rubricas e o construtor.
2. Reading segue o `exam-spec` (apenas `reading` nos 5 tipos), não a tabela §17 do PRD central.
3. `lst_hiw` = Listening + Reading (exam-spec), não Writing como na tabela §17.
4. `lst_mcq_single` = apenas Listening (exam-spec).
5. `write_essay` ganhou `form` 0.10: content .25 · form .10 · development .15 · structure .15 ·
   grammar .15 · vocabulary .10 · orthography .10.
6. `sst` tem `form` 0.20: content .30 · form .20 · grammar .20 · vocabulary .15 · orthography .15.
7. `answer_short` só tem `content` (1.0); uma palavra correta é válida; não há dimensão de fala.
8. Pronúncia `not_measured` nos 6 tipos orais que a declaram; `score` null e id em `unmeasured`.
9. Fluência oral sempre `proxy` da transcrição, com limitação explícita.
10. Limites de resposta derivados do `contentLimit` por regex (`swt` 5–75, `write_essay` 200–300,
    `sst` 50–70); nenhum limite inventado para os demais.
11. `wfd` 3–15 do PRD §17, com a origem declarada na nota e nas ressalvas.
12. Penalidade oficial só em `read_mcq_multi`, `lst_mcq_multi` e `lst_hiw`.
13. Addendum em inglês, feedback em pt-BR, regras de abstenção em pt-BR na íntegra.
14. Nenhum conteúdo do banco no prompt; teste antivazamento com itens reais.
15. `evaluationRubricFor` entrega `{ text: addendum, version: rubricVersion }`; a versão do
    type-prompt fica embutida no texto.
16. Módulos puros e determinísticos (sem `Date`, aleatoriedade, rede ou filesystem).

## 4. Pendências e bloqueios

- **Integração do `rubricFor` no runtime (não é do meu recorte):** `src/lib/ai/evaluate.server.ts`
  ainda cria o handler sem `rubricFor`, então a avaliação real continua usando
  `rubrics@unavailable`. Sem essa linha, as 22 rubricas existem e são testadas, mas não chegam ao
  juiz em produção. Sugestão: `createEvaluationHandler({ adapter, loadQuestionsByType, rubricFor:
  evaluationRubricFor, ... })` a cargo de s1/main.
- **Identidade de versão do type-prompt:** `EvaluationResult.evaluator.promptVersion` registra apenas
  `JUDGE_PROMPT_VERSION`; `type-prompt@1` só aparece dentro do texto do addendum. Se o produto
  quiser rastrear a versão do prompt por tipo em `evaluator`, isso exige mudança de contrato de s1
  (novo campo ou composição de string). Não alterei o contrato.
- **Typecheck:** não executado aqui (ADR-04); `lsp--check` indisponível. O harness deve confirmar
  `tsgo`/build antes da integração.
- **Divergências de matriz no PRD central §17:** `read_fib_dropdown`/`read_fib_drag`
  (“reading + writing”), `lst_hiw` (“+ writing”) e `lst_mcq_single` (“listening + reading”)
  contradizem o `exam-spec` da Fase 1. Segui o `exam-spec` por ser a base normativa declarada no
  pacote; sugiro reconciliar o PRD §17 na próxima passada de documentação.
- **`wfd` sem faixa no exam-spec:** o 3–15 vem do PRD §17. Se o `exam-spec` ganhar
  `contentLimit` para `wfd` em uma passada de dados, `inputLimitsFor` pode passar a derivar a faixa
  e a nota deixa de precisar do fallback.

## 5. Mudanças necessárias fora do meu recorte (para o agente principal)

1. `src/lib/ai/evaluate.server.ts` — injetar `rubricFor: evaluationRubricFor` (import de
   `@/lib/ai/prompts`) na composição do handler. É a única mudança de código necessária para o
   runtime usar as rubricas.
2. Decidir se a identidade de avaliação deve expor a versão do type prompt (mudança de contrato de
   s1) ou se basta a versão embutida no addendum.
3. Reconciliar o PRD §17 com `src/data/exam-spec.ts` nos três pontos de matriz citados.
4. Opcional: adicionar `contentLimit` de `wfd` ao `exam-spec.ts` para eliminar o fallback 3–15.
5. O harness Lovable deve rodar `tsgo`/build; nenhum arquivo fora do recorte foi alterado.

## 6. Arquivos criados/alterados

Criados:

- `src/lib/ai/rubrics/types.ts` (65 linhas)
- `src/lib/ai/rubrics/shared.ts` (119 linhas)
- `src/lib/ai/rubrics/exam-derived.ts` (106 linhas)
- `src/lib/ai/rubrics/speaking.ts` (167 linhas)
- `src/lib/ai/rubrics/writing.ts` (127 linhas)
- `src/lib/ai/rubrics/reading.ts` (131 linhas)
- `src/lib/ai/rubrics/listening.ts` (263 linhas)
- `src/lib/ai/rubrics/index.ts` (64 linhas)
- `src/lib/ai/prompts/type-prompt.ts` (187 linhas)
- `src/lib/ai/prompts/index.ts` (38 linhas)
- `src/test/ai/rubrics.test.ts` (193 linhas)
- `src/test/ai/type-prompt.test.ts` (182 linhas)

Alterados (documentação do pacote):

- `.opencode/work/sub/fase-5/s2-rubricas/roadmap-proj1-s2` — F5.2.1–F5.2.3 marcados com evidências
  reais; F5.2.4 permanece aberto até este relatório existir.
- `.opencode/work/sub/fase-5/s2-rubricas/prd-project1-s2` — §5 com 16 decisões.

Nada fora do recorte foi editado; nenhuma dependência foi instalada; nenhum comando git de escrita
foi executado.
