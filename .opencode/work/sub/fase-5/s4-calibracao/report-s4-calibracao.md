# Relatório final — s4-calibracao (Fase 5)

**Data:** 2026-10-21 · **Pacote:** s4-calibracao · **Estado:** completo (com 1 bloqueio externo)

## 1. Feito (por fase do meu roadmap)

- **F5.4.1 — Corpus de calibração** (`src/data/ai/calibration/corpus.ts`, client-safe, puro):
  44 entradas = 2 por tipo × 22 tipos, todas com `questionId` REAL do banco do próprio tipo,
  `referenceScore` inteiro 0–100, `note` em pt-BR e resposta de amostra em um único campo
  (`text` ou `transcript`). Respostas de seleção derivam do gabarito do item; escrita/fala usam
  amostras **anotadas como artefato de medição** (rotulado no cabeçalho) — nenhuma questão nova
  foi inventada. `itemsForType` para consumo do runner.
  Testes: cobertura dos 22 tipos e 44 entradas, ids existentes no banco via `loadQuestionsByType`,
  ausência de par `(type, questionId)` repetido, notas inteiras no intervalo, resposta não vazia,
  payload aprovado por `validateEvaluationInput` (limites de s1) e limites de palavras por tipo.
- **F5.4.2 — Relatório e suficiência** (`src/lib/ai/calibration-report.ts`, puro):
  `computeTypeConsistency`, `buildCalibrationReport`, `isCalibrationSufficient`; MAE a 1 casa,
  `agreementWithin10` a 2 casas, 4 níveis, `delta: null` fora de `scored`, DTO serializável.
  Testes cobrem `insufficient` (0 e 1 item), `high` e fronteira 10 / 0,8, `medium` e fronteira
  15 / 0,6, `low`, abstenções impedindo `high`, isolamento por tipo e predicado de suficiência.
- **F5.4.3 — Runner e wrapper** (`src/lib/ai/calibration.server.ts`,
  `src/lib/ai/calibrate.functions.ts`): runner agrega apenas o que o avaliador devolveu; caminho
  real do adaptador/gateway importado só quando não há injeção; exceção por item vira
  `needs_review`/`score: null` sem derrubar o lote; logs só estruturais (ids, veredito, nota,
  duração). Wrapper `createServerFn({ method: "POST" })` com `parseCalibrationInput` (zod):
  dedupe, máx. 22 tipos, rejeita tipo/formato inválidos e campo extra, devolve só o relatório.
  Testes com adaptador fake: matemática do relatório, abstenção fora do MAE, exceção isolada,
  questão ausente, dedupe/ordem canônica, lista vazia sem chamadas e DTO JSON-round-trip.
- **Correção solicitada (TS2739):** em `src/test/ai/calibration.test.ts:392` o array de captura era
  `EvaluateInput[]`, mas `callModel` recebe apenas o subconjunto encaminhado ao modelo. Agora é
  `Parameters<EvaluatorModelCall["call"]>[0][]`, com import de `EvaluatorModelCall` no lugar de
  `EvaluateInput`. Todos os testes e asserções foram preservados.
- **F5.4.4 — Fumo real:** teste mantido opt-in (`S4_REAL_SMOKE=1`), 1 tipo × 2 itens. **Não houve
  nova chamada de IA nesta retomada** (bloqueio externo, ver §4).
- **F5.4.5 —** este relatório + atualização do PRD do pacote (§5, decisões 1–7) e do roadmap.

## 2. Evidências (saída real dos gates)

```
$ bunx vitest run src/test/ai/calibration.test.ts --maxWorkers=2
 RUN  v5.0.3 /dev-server
 Test Files  1 passed (1)
      Tests  23 passed | 1 skipped (24)
   Duration  3.36s

$ bunx eslint src/data/ai src/lib/ai/calibration.server.ts src/lib/ai/calibrate.functions.ts src/test/ai/calibration.test.ts
eslint exit=0
```

- 23 testes verdes; o único skipped é o smoke real opt-in
  (`it.runIf(process.env["S4_REAL_SMOKE"] === "1")`), como projetado.
- ESLint: zero avisos/erros no recorte.
- Nenhum build/typecheck manual executado (ADR-04); tsgo/build ficam com o harness Lovable.

## 3. Decisões tomadas (registradas no PRD do pacote §5)

1. Corpus de 44 itens com ids reais; amostras anotadas de escrita/fala rotuladas como artefato de
   medição — nunca conteúdo do exame.
2. `high` exige `scoredCount === itemCount` (zero abstenções), reforçando a regra do PRD.
3. Runner com deps injetáveis e import dinâmico do adaptador real (testes nunca tocam chave/gateway).
4. Wrapper zod deduplica, limita a 22 tipos e devolve apenas o relatório.
5. Fumo real opt-in por `S4_REAL_SMOKE=1`, limitado a 2 chamadas, condicionado a `LOVABLE_API_KEY`.
6. Correção de tipo do teste via `Parameters<EvaluatorModelCall["call"]>[0]`.
7. Sem mudanças de comportamento nesta retomada: só o tipo do teste e a documentação.

## 4. Pendências e bloqueios

- **BLOQUEIO EXTERNO ao pacote (F5.4.4):** o caminho real do gateway falha **antes** da calibração,
  dentro de `src/lib/ai/gateway/evaluate-call.server.ts` (arquivo do pacote s1, fora do meu escopo).
  Evidência da tentativa registrada em `log-s4-calibracao.txt`:
  - `InvalidPromptError [AI_InvalidPromptError]: Invalid prompt: System messages are not allowed in
    the prompt or messages fields. Use the instructions option instead.`
  - em sequência: `[diag] gateway erro {"name":"AI_NoOutputGeneratedError"}`
  **Causa provável:** o system prompt composto está sendo enviado como mensagem `system` em
  `prompt/messages` em vez da opção `instructions` do provider.
  **Sugestão (para s1 / agente principal):** trocar o envio do system prompt por `instructions`
  (ou o campo equivalente do provider) e garantir ao menos uma saída válida quando o modelo não
  retorna conteúdo. Depois disso, basta rodar
  `S4_REAL_SMOKE=1 bunx vitest run src/test/ai/calibration.test.ts -t "fumo real"` para obter o
  relatório real em `/tmp/s4-calibration-real-smoke.json`.
  **Consequência no produto:** nenhum tipo pode ser classificado como `high`/`medium` por
  calibração real ainda; a Fase 8 deve tratar todos os tipos como não calibrados
  (estimativa oculta ou confiança baixa explícita) até este bloqueio cair.
- **Dívida de confiabilidade:** MAE/agreement só têm valor estatístico depois de calibração real;
  os números atuais provam a matemática, não a qualidade do avaliador.

## 5. Mudanças necessárias fora do meu recorte (para o agente principal)

1. **s1 (`src/lib/ai/gateway/evaluate-call.server.ts`):** corrigir o envio do system prompt
   (`instructions` em vez de mensagem `system`) e o caminho de "sem saída" para produzir
   resultado válido/abstenção em vez de `AI_NoOutputGeneratedError`. É o único item que impede
   F5.4.4 de ser verde.
2. **Agente principal:** incluir no gate da Fase 5 a execução do smoke opt-in **uma única vez**
   após a correção de s1 (custo de 2 chamadas), registrando o relatório resultante.
3. **Fase 8:** consumir `isCalibrationSufficient` e tratar `insufficient`/`low` como
   "não calibrar confiança" — hoje é o estado real de todos os tipos.
4. Nada além disso: nenhuma alteração de contrato, corpus ou interface foi necessária.

## 6. Arquivos criados/alterados

- `src/test/ai/calibration.test.ts` — **alterado**: tipo de `calls` passou a
  `Parameters<EvaluatorModelCall["call"]>[0][]`; import `EvaluateInput` → `EvaluatorModelCall`
  (correção do TS2739). Sem mudanças em asserções ou casos.
- `.opencode/work/sub/fase-5/s4-calibracao/prd-project1-s4` — **alterado**: §5 com as decisões 1–7
  (inclui o bloqueio externo de F5.4.4 e a correção de tipo).
- `.opencode/work/sub/fase-5/s4-calibracao/roadmap-proj1-s4` — **alterado**: itens F5.4.1–F5.4.5
  marcados `[x]` com evidências e o motivo do bloqueio.
- `.opencode/work/sub/fase-5/s4-calibracao/report-s4-calibracao.md` — **criado** (este relatório).

Arquivos pré-existentes do pacote, revisados e mantidos sem alteração de comportamento:
`src/data/ai/calibration/corpus.ts`, `src/data/ai/calibration/input.ts`,
`src/lib/ai/calibration-report.ts`, `src/lib/ai/calibration.server.ts`,
`src/lib/ai/calibrate.functions.ts`.
