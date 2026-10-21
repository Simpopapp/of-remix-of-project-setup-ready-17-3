# Avaliação — Stage 05

**Data:** 2026-10-21
**Veredito:** parcial
**Confiança da avaliação:** alta

## Resumo executivo

A Fase 5 entrega um serviço de IA com fronteira server-only real, consentimento verificado no servidor, limite por instância, rubricas dos 22 tipos e correções verificáveis dos achados G1–G7 da auditoria s5. O aceite de calibração real por tipo não foi cumprido — um smoke WFD não é calibração de 22 tipos — e o próprio status registra isso com honestidade; Fase 5 permanece `[ ]` no roadmap, coerente com o código. A inspeção focada confirmou os três resíduos suspeitados no pedido: (A) vazamento dividido entre campos estruturais sobrevive à retenção, (B) o corte de 20.000 chars deixa a cauda de campos longos sem varredura, e (C) o filtro de sondas distintivas não cobre todo eco ≥ 25 chars — o comentário do código superafirma a cobertura. Nenhum achado novo é bloqueio; os graves são residuais do antivazamento pós-envio.

## Cobertura de requisitos

Requisitos do aceite da Fase 5 (PRD central §15 "Fase 5" e project1 §F5):

- **Atendido:**
  - Adaptador IA em server functions, sem chave no navegador — `LOVABLE_API_KEY` lida só dentro de `evaluate-call.server.ts`; módulos `.server.ts` fora do grafo cliente; `evaluate.functions.ts` importa `request-safety.server` dinamicamente dentro do handler.
  - Falha de serviço gera abstenção/needs_review, nunca nota — `adapter.server.ts` (`failureResult`, `classify`) e `request-safety.server.ts` (`blockedResult` com `score: null`) cobrem todos os caminhos, inclusive consentimento ausente, busy e rate_limited sem gastar chamada.
  - Saída valida contra schema — `judgeOutputSchema` (zod estrito) + `parseEvaluationResult`; `EvaluationOutputError` em saída vazia; teste de wire com SDK real (`gateway.test.ts`).
  - `evaluator.{model,promptVersion,rubricVersion}` registrado — carimbado pelo servidor (`identityOf` + `parseEvaluationResult` com identidade injetada); `judge-policy@2` e `rubric@1` confirmados no disco.
  - Consentimento: desligado por padrão (`DEFAULT_SETTINGS.aiConsent.evaluate = false`), explicação honesta na UI, e agora validado no servidor com `consent === true` estrito antes do lease e antes de importar o avaliador (`request-safety.ts:62`, `request-safety.server.ts:198-236`). Envelope remove `consent` antes do avaliador.
  - Limite de custo por instância (10 req/min, 2 em voo) implementado e testado; comentários do código declaram com honestidade que é volátil, por instância, e que consentimento é declaração, não autenticação — sem promessa de teto global. Alinhado ao pedido e ao status.
  - G1/G2/G3/G4/G5/G7 e M1: correções presentes no código e cobertas por `result-safety.test.ts` (18 casos) e `request-safety.test.ts` (17 casos). Endpoint de calibração pública removido (`calibrate.functions.ts` não existe; sem consumidores).
- **Parcial:**
  - Calibração: corpus 44 itens/22 tipos com ids reais e matemática do relatório testados (s4, 23 verdes/1 skipped); consistência real por tipo e revisão das notas de referência NÃO verificadas. O smoke WFD (scored/0, identidade `openai/gpt-6-astra/judge-policy@2/rubric@1`) prova conectividade, não calibração. Monitor não reexecutou gates nem chamada paga (fora do escopo do pedido); números aceitos como declarações consistentes entre status, roadmap e reports.
  - Honestidade de pronúncia (G6): `enforceAudioHonesty` trava os ids canônicos `pronunciation`/`prosody` e rebaixa para `needs_review` quando a nota inteira dependia deles — mas depende de o modelo usar o id canônico (residual declarado no status) e o `label` livre do modelo sobrevive ao rebaixamento (ver achado 4).
- **Ausente / não evidenciado:**
  - Relatório de consistência real por tipo (aceite literal: "calibração produz relatório de consistência por tipo") — existe o mecanismo, falta a execução real.
  - Validação de ids de dimensão desconhecidos contra a rubrica — adiada por s7 com motivo registrado (fixtures legadas `rubric@1` incompatíveis); M4 (nota agregada não revalidada contra pesos das dimensões) permanece aberto.

## Qualidade do código

**Pontos fortes:**
- Ordem defensiva correta no endpoint: parse do envelope → consentimento estrito → lease → só então `import("./evaluate.server")` (`request-safety.server.ts:198-236`). Bloqueios não gastam.
- Cache por modelo na chave (`adapter.server.ts:481-488`, M1 fechado com teste) e resultado **sanitizado** é o que entra no cache (`:543`).
- `leak-guard.ts` vigia todos os campos estruturais (`visibleTextsOf:123-135` inclui `dimension.label`, `unmeasured`, `evidence.quote/dimensionId`) e a retenção zera nota, substitui feedback e preserva `unmeasured` honesto.
- G4 bem resolvido: `REFERENCE_BLOCK_OPEN/CLOSE` + `escapeReferenceContent` (`judge-policy.ts:59-89`) e a regra 5 da política declara a referência como dados; versão bumpada para `judge-policy@2`.
- Testes de regressão novos exercitam comportamento, não mocks: wire real do SDK 7 com fetch fake, rebaixamento de áudio, fronteira de palavra ("art"/"part"), cache por modelo.

**Pontos de atenção (achados desta avaliação, com classificação):**

1. **GRAVE (residual de G2/G3) — vazamento dividido entre campos estruturais sobrevive à retenção.** `leaksReference` detecta por campo individual **e** pelo `joined` (`leak-guard.ts:152-162`), mas `sanitizeEvaluationResult` filtra dimensões/evidências/`unmeasured` **individualmente** (`:187-204`). Exemplo concreto: amostra `wfd` "Scientists are discovering new links between genes and diseases" (64 chars); metade A em `dimensions[0].rationale`, metade B em `evidence[0].quote` — `joined` casa, retenção dispara (`needs_review`, score null, feedback substituído), mas nenhum dos dois campos casa sozinho em `contaminated()` e ambos **sobrevivem no payload retido**: o gabarito é reconstruíável pelo aluno. O teste de s7 ("vazamento dividido entre feedback e uncertainty", `result-safety.test.ts:199`) passa porque feedback/uncertainty são substituídos por inteiro — não cobre divisão entre dimension+evidence. O JSDoc "Nenhum campo contaminado sobrevive" (`:171-173`) não se sustenta neste caso. Viola §4.4 pós-envio (a nota é retida; o texto não).
2. **MENOR — corte de 20.000 chars deixa cauda sem varredura.** `normalize()` faz `slice(0, MAX_SCANNED_TEXT_LENGTH)` (`leak-guard.ts:65`), e o schema de saída **não tem `.max()`** em `feedback`, `rationale`, `quote`, `observation`, `label` nem em entradas de `unmeasured` (`evaluate-call.server.ts:30-55`). Um campo de saída > 20k tem sua cauda nunca varrida; o `joined` também é truncado em 20k. Eco colocado após o char 20.000 escapa. Probabilidade baixa (exige saída anormalmente longa), mas estrutural.
3. **MENOR — sondas distintivas não cobrem TODO eco ≥ 25 chars; comentário superafirma.** `probesOf` descarta sondas com < 12 chars após trim ou não-distintivas (< 3 palavras e nenhuma palavra ≥ 16) (`leak-guard.ts:76-88`). Para um eco de exatamente 25 chars existe **uma única** janela-sonda que o cobre (stride 6 ⇒ j ∈ [k, k+5]); se essa sonda for genérica, o eco escapa. O comentário `:41-42` ("qualquer eco contíguo ≥ 25 chars é coberto") é verdadeiro apenas para sondas que passam no filtro. Janela estreita, mas a alegação no código é mais forte que a garantia real.
4. **GRAVE residual (declarado) — honestidade de áudio depende do id canônico.** `AUDIO_ONLY_DIMENSION_IDS = ["pronunciation", "prosody"]` com igualdade exata (`adapter.server.ts:49,70`). Uma dimensão `id: "pronunciation_score"` ou `"pronuncia"` com `status: "measured", score: 72` passaria intacta — exatamente o cenário que o G6 queria eliminar por não depender da obediência do modelo. Residual já declarado no status e no report s7; a trava de ids desconhecidos contra a rubrica é o fechamento pendente. Adicionalmente, no rebaixamento o `label` do modelo sobrevive (`:74-79`) e é texto livre renderizado ao aluno — pode reivindicar "Pronúncia: 72" mesmo com score null (o `rationale` é descartado; o `label` não).
5. **MENOR (M3, ainda aberto) — código morto sem sufixo `.server`.** `src/lib/ai/gateway/responses.ts` e `gateway-helpers.ts` continuam sem importadores e importam o SDK `ai`; se um dia entrarem no grafo do cliente, arrastam o SDK. Confirmado por busca de importadores (nenhum).
6. **OBSERVAÇÃO — comentário obsoleto.** `src/data/ai/calibration/input.ts:5` ainda cita o wrapper removido `calibrate.functions.ts` (já registrado por s8 como fora do seu recorte).

## Discrepâncias

- **Status vs código — coerente no geral.** O status declara "partial", lista as pendências reais (calibração, ids de dimensão, antivazamento literal) e o código confirma cada uma. Nenhuma divergência material encontrada.
- **Comentário do código vs comportamento:** `leak-guard.ts:41-42` afirma cobertura universal de ecos ≥ 25 chars; o filtro `isDistinctive` torna a garantia condicional (achado 3). O JSDoc `:171-173` ("nenhum campo contaminado sobrevive") não vale para vazamento dividido entre campos estruturais (achado 1).
- **Reports s1/s4 vs auditoria s5 (histórico, já resolvido):** s1 alegou serviço pronto com o bug B1 presente e s4 registrou "bloqueio externo" sem causa; s5 desmentiu ambos com probe. A correção (s6) e o teste de wire existem no disco; registrado aqui para rastreabilidade, sem ação pendente.
- **Teste de s7 vs alegação:** o caso de vazamento dividido cobre apenas feedback+uncertainty (campos substituídos por inteiro), não a divisão entre dimension/evidence/unmeasured — a cobertura testada é menor do que o report s7 sugere.

## Riscos para as próximas etapas

1. **Fase 6 (motores):** os motores vão chamar `canEvaluate`/`requestEvaluation`; o envelope `{ ...payload, consent: true }` já está pronto e testado — risco baixo. Atenção ao pendente de s3: `defaultsPatch()` sem `aiConsent` (ADR-06 diz que foi corrigido; conferir na integração) e `SettingsSection` sem `id` no `<section>`.
2. **Fase 8 (medição honesta):** sem calibração real, `isCalibrationSufficient` deve tratar todos os tipos como não calibrados (estimativa oculta ou confiança baixa explícita) — o report s4 já orienta; M4 (nota agregada vs pesos) pode contaminar a estimativa se nunca for revalidado.
3. **Antivazamento:** os achados 1–3 são o mesmo vetor (eco da referência no feedback/evidência pós-envio). Se ficarem para "depois", a Fase 6 herda um leak-guard com buracos conhecidos e documentados — pior momento para descobrir em produção.
4. **Custo:** o limite é por instância e volátil (corretamente declarado); qualquer exposição futura multiusuário exige repensar G5/G7 do zero. Não prometer teto global em nenhum texto de UI.

## Recomendações

1. **Antes de marcar Fase 5 ou iniciar Fase 6 (prioridade alta):** fechar o achado 1 — na retenção, quando o vazamento foi detectado via `joined` mas nenhum campo individual casa, remover também dimensões/evidências/`unmeasured` por janela deslizante sobre o `joined` (ou reter removendo todo campo estrutural não essencial). Adicionar o caso de teste divisão dimension+evidence.
2. **Prioridade alta:** executar a calibração real por tipo (22 tipos × 2 itens) com orçamento controlado e registrar o relatório — é o aceite literal que falta; sem ele, Fase 5 não fecha.
3. **Prioridade média:** corrigir o comentário de `leak-guard.ts:41-42` e o JSDoc `:171-173` para refletir as garantias reais; opcionalmente reduzir o limiar de distintividade das sondas ou varrer por n-gramas com fronteira de palavra.
4. **Prioridade média:** no fechamento da validação de ids contra rubrica (pendente de s7), incluir a trava de aliases de áudio (qualquer id contendo "pronunc"/"prosod" fora da rubrica ⇒ `not_measured`) e sanitizar o `label` no rebaixamento de áudio.
5. **Prioridade baixa:** apagar ou renomear para `.server.ts` os módulos mortos `gateway/responses.ts` e `gateway-helpers.ts` (M3); atualizar o comentário de `calibration/input.ts:5`.
6. **Não fazer agora:** nenhuma correção foi implementada por este monitor (papel de auditoria); os achados 1–4 são para o builder, com exemplos concretos acima.

## Evidências consultadas

- Planejamento: `.opencode/project1`, `.opencode/prd-project1.md` (§4.3/§4.4/§4.6, §7.1–§7.4, §15 Fase 5, ADR-05–ADR-08), `.opencode/roadmap-proj1` (Fase 5 + estado).
- Status do builder: `docs/planning/stages/stage-05-status.md`.
- Reports dos subagentes: `.opencode/work/sub/fase-5/{s1-fundacao-ia,s2-rubricas,s3-consentimento,s4-calibracao,s5-auditoria,s6-integration,s7-result-safety,s8-request-safety}/report-*.md`.
- Código inspecionado: `src/lib/ai/leak-guard.ts`, `adapter.server.ts`, `judge-policy.ts`, `request-safety.ts`, `request-safety.server.ts`, `evaluate.functions.ts`, `gateway/evaluate-call.server.ts` (schema de saída), `src/lib/app/evaluation-client.ts` (trecho), `src/domain/schema.ts` (busca de tetos), `src/data/ai/calibration/input.ts` (comentário).
- Testes conferidos por leitura: `src/test/ai/result-safety.test.ts` (18 casos; divisão coberta só feedback+uncertainty), presença de `gateway.test.ts`, ausência de `calibrate.functions.ts` e de consumidores.
- Não executado por restrição do pedido: testes, lint, build/typecheck, chamada real de IA, git. Gates (642 passed/1 skipped, lint 0 erros, build OK 00:48:13) e smoke aceitos como declarações consistentes entre status, roadmap e reports s6–s8.
