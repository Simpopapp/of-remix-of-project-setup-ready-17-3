# Relatório — s1-fundacao-ia (Fase 5)

**Pacote:** s1-fundacao-ia
**Data:** 2026-10-20
**Status:** concluído (gates do pacote verdes)

## 1. Feito

Fundação do serviço de avaliação por IA, com fronteira cliente/servidor estrita, adaptador
testável, cache, retry restrito, structured output, leak-guard e anti-injection.

- `src/lib/ai/evaluation-io.ts` — contrato de entrada/saída, schema zod com os limites do PRD
  (id 1–64, texto 1–20 000, modos `practice|session|mock`), `responseTextOf`, motivo único de
  entrada inválida, modelo default e versão de rubrica indisponível.
- `src/lib/ai/result-builders.ts` — construtores puros de `abstained`/`needs_review` com
  `score: null` e identidade preenchida (falha nunca vira zero).
- `src/lib/ai/leak-guard.ts` — retenção de resultado quando feedback/evidência/justificativa/
  incerteza/motivo ecoa amostra reservada ≥ 25 chars; remove evidências contaminadas, zera a nota,
  preserva `unmeasured`, nunca lança.
- `src/lib/ai/prompt-injection.ts` — delimitadores rotulados, escape de `<<<`/`>>>`, regra fixa de
  dado não confiável, system prompt separado do conteúdo do aluno.
- `src/lib/ai/judge-policy.ts` — política-base do juiz com `JUDGE_PROMPT_VERSION = "judge-policy@1"`,
  referência reservada e composição com rubrica.
- `src/lib/ai/reference.ts` — resolução server-side da referência por tipo, separando
  `judgeReference` (system, nunca no cliente) de `protectedSamples` (leak-guard) e do conteúdo
  visível `untrusted`; cobre os 22 tipos.
- `src/lib/ai/errors.ts` — erros tipados sem conteúdo sensível.
- `src/lib/ai/adapter.server.ts` — validação em runtime, cache (TTL 10 min, teto 100), retry só
  429/5xx (máx. 2 extras, backoff 500/1000 ms + jitter, `Retry-After`), tradução de falhas para
  `needs_review`/`abstained`, parse do contrato e carimbo de `evaluator`/`scoredAt` no servidor,
  log apenas estrutural.
- `src/lib/ai/gateway/run-id.ts`, `gateway-helpers.ts`, `responses.ts` — helpers oficiais do
  gateway copiados/adaptados.
- `src/lib/ai/gateway/evaluate-call.server.ts` — chamada real `streamText` +
  `Output.object(judgeOutputSchema)`, `maxRetries: 0`, provider por request, 5 opções obrigatórias de
  reasoning, `LOVABLE_API_KEY` lida dentro da chamada, `NoObjectGeneratedError` →
  `EvaluationOutputError`.
- `src/lib/ai/evaluate-handler.ts` — orquestração testável; questão inexistente, tipo divergente,
  referência insuficiente ou falha de banco viram resultado sem nota, sem chamar o modelo.
- `src/lib/ai/evaluate.server.ts` — composição server-only; adaptador singleton com cache, handler
  por request para ler o modelo configurado no ambiente.
- `src/lib/ai/evaluate.functions.ts` — `evaluateResponseFunction` (`createServerFn` POST); validação
  sem erro cru, import dinâmico do módulo server-only dentro do handler.
- `src/test/ai/guardas.test.ts` — 8 testes de leak-guard e anti-injection.
- `src/test/ai/adapter.test.ts` — 13 testes de limites, retry, cache, falhas, contrato e log.
- `src/test/ai/evaluate-wrapper.test.ts` — 6 testes de orquestração com item real `goarno-wfd-001`.
- `.opencode/work/sub/fase-5/s1-fundacao-ia/prd-project1-s1` — seção 6 com 10 decisões registradas.

## 2. Evidências

- `bunx vitest run src/test/ai/ --reporter=dot`
  - `Test Files  3 passed (3)`
  - `Tests  30 passed (30)`
  - duração ~1,0 s
- `bunx eslint src/lib/ai src/test/ai`
  - exit 0, sem saída (limpo).
- `/tmp/observability/build-errors.log`
  - `=== build 2026-10-20T22:06:36Z ===` → `build OK`.
- Typecheck do harness (`build-errors.log`, entrada de 22:01:25) apontou 3 erros; todos corrigidos:
  - `exactOptionalPropertyTypes` em `EvaluationResponsePayload` (agora `?: string | undefined`);
  - `abortSignal` opcional passado como `undefined` ao `streamText` (agora spread condicional);
  - `runId` opcional em `ResponsesGatewayConfig` (agora `?: string | undefined`).
  O harness não reexecutou o typecheck após as correções dentro desta sessão; o build posterior
  ficou verde. O `lsp--check` estava indisponível (porta 9999 sem serviço).
- Teste com item real: `loadQuestionsByType("wfd")` carregou `goarno-wfd-001`; o fake capturou a
  frase `Scientists are discovering new links between genes and diseases.` no `systemPrompt` e
  confirmou que ela não aparece no conteúdo `untrusted`.

## 3. Decisões

1. Referência em duas camadas (`judgeReference` vs `protectedSamples`) para não reter feedback
   legítimo que cita texto visível.
2. Identidade (`evaluator`) e `scoredAt` são carimbados pelo servidor; o modelo não os controla.
3. Cache SHA-256 com fallback FNV-1a; chave inclui tipo, id, hash da resposta, prompt, rubrica e
   modelo.
4. Retry pertence ao adaptador, não ao SDK (`maxRetries: 0`).
5. Wrapper exportado como `evaluateResponseFunction` para não colidir com a composição
   `evaluateResponse`.
6. Sem rubrica de s2, a identidade usa `rubrics@unavailable`; `rubricFor` é injetável.
7. Falha de banco vira `needs_review`; questão inexistente/tipo divergente/sem referência vira
   `abstained`, sem chamada ao modelo.
8. Leak-guard remove a evidência inteira contaminada (não tenta editar o trecho).
9. Teste de orquestração usa item real do banco, sem IA real.
10. Nenhum segredo em escopo de módulo; variáveis são lidas dentro da chamada.

## 4. Pendências / bloqueios

- **Typecheck do harness não reexecutou** após as correções; a última entrada de typecheck ainda
  mostra os 3 erros já corrigidos. O build de 22:06:36 está verde. Recomenda-se confirmar com a
  próxima passagem automática do harness antes de marcar a fase inteira como fechada.
- `lsp-bridge`/porta 9999 indisponível nesta sessão, então não houve typecheck via LSP.
- Nenhuma chamada real ao gateway foi feita (proibido em teste); a integração real fica validada
  apenas por contrato/tipos e pelo build.

## 5. Mudanças fora do recorte

- Nenhuma. Só foram tocados `src/lib/ai/**`, `src/test/ai/**` e o PRD do recorte.

## 6. Arquivos criados/alterados

Criados:
- `src/lib/ai/errors.ts`
- `src/lib/ai/result-builders.ts`
- `src/lib/ai/leak-guard.ts`
- `src/lib/ai/prompt-injection.ts`
- `src/lib/ai/judge-policy.ts`
- `src/lib/ai/reference.ts`
- `src/lib/ai/adapter.server.ts`
- `src/lib/ai/evaluation-io.ts`
- `src/lib/ai/evaluate-handler.ts`
- `src/lib/ai/evaluate.server.ts`
- `src/lib/ai/evaluate.functions.ts`
- `src/lib/ai/gateway/run-id.ts`
- `src/lib/ai/gateway/gateway-helpers.ts`
- `src/lib/ai/gateway/responses.ts`
- `src/lib/ai/gateway/evaluate-call.server.ts`
- `src/test/ai/guardas.test.ts`
- `src/test/ai/adapter.test.ts`
- `src/test/ai/evaluate-wrapper.test.ts`

Alterado:
- `.opencode/work/sub/fase-5/s1-fundacao-ia/prd-project1-s1` (seção 6)
