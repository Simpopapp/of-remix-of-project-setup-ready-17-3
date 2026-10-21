# Report — Fase 5 s7-result-safety

**Data:** 2026-10-21 · **Executor:** s7-result-safety (opencode/glm-5.3-flash-free)
**Escopo:** correções G1/G2/G3/G4/G6 da auditoria s5 + cache M1, testes de regressão, gates.

## Estado de execução

Duas rodadas reais nesta sessão: a rodada anterior (modelo anterior) ficou
incompleta por indisponibilidade de endpoint (429) após editar `leak-guard.ts`
e `judge-policy.ts` em disco, mas antes de adaptador, testes e report. Esta
sessão retomou do disco, corrigiu o teste corrompido, integrou o adaptador e
rodou os gates. Tudo abaixo é verificado no disco, não alegado.

## G1 — Gabarito curto (palavra reservada) é segredo

Status: **resolvido** (`src/lib/ai/leak-guard.ts`).

- O piso histórico de 25 chars foi removido para o caminho real: o adaptador
  chama `sanitizeEvaluationResult(..., { type, studentResponse })` e o contexto
  arma a varredura de amostras curtas. Chamadas sem contexto preservam o piso
  (compatibilidade documentada no JSDoc e no comportamento).
- Comparação por frase inteira com fronteira de palavra
  (`containsWordPhrase` — espaços delimitadores): "art" não casa dentro de
  "part"; casa isolada (`A primeira palavra é art.`).
- O contexto `studentResponse` isenta um trecho somente quando o TRECHO INTEIRO
  já aparece na resposta do aluno (`containsWordPhrase` na resposta
  normalizada). Teste prova os dois lados: aluno escreveu "crucial" → não
  retém; aluno errou a lacuna e o modelo entrega a palavra → retém. Um termo
  solto na resposta nunca libera eco de gabarito nem a lista completa.

## G2 — Eco parcial de referência longa

Status: **resolvido** (`leak-guard.ts`, sondas).

- Sondas de 20 chars em passo 6 (`LEAK_PROBE_LENGTH`/`LEAK_PROBE_STRIDE`),
  sempre incluindo o sufixo; qualquer eco contíguo ≥ 25 chars normalizados é
  coberto por alguma sonda. Probe só entra se for distinta (≥ 3 palavras ou
  palavra ≥ 16 chars) — evita falso positivo com frase genérica.
- Teto de 20 000 chars por campo (`MAX_SCANNED_TEXT_LENGTH`); sem busca
  quadrática no texto inteiro; sondas geradas por fatia fixa da amostra.
- Testes com valores reais: eco de 25/64 da transcrição `wfd` → retido; eco de
  729 de ≈1824 da referência longa `write_essay` → retido; eco de 15 chars →
  não retido (limite previsível, sem falso positivo); vazamento dividido entre
  `feedback` e `uncertainty` → retido (campos juntados na varredura).

## G3 — Todos os campos vigiados

Status: **resolvido** (`leak-guard.ts`, `visibleTextsOf`).

- `dimension.id/label/rationale`, `evidence.observation/dimensionId/quote`,
  `unmeasured[]`, `abstentionReason` e `reviewReason` entram na varredura.
- No caminho de retenção nada contaminado sobrevive: dimensão com label ecoando
  a referência → removida; `unmeasured` que carrega a referência → esvaziado;
  evidência com quote restrito → removida enquanto evidência limpa é mantida.
  Testes cobrem cada caso; `JSON.stringify(result)` não contém a referência.

## G4 — Referência cercada e declarada como dados

Status: **resolvido** (`src/lib/ai/judge-policy.ts`).

- Blocos reservados com `REFERENCE_BLOCK_OPEN`/`REFERENCE_BLOCK_CLOSE`; o
  conteúdo é escapado (`escapeReferenceContent`) contra fechamento dos blocos e
  dos delimitadores (`<<<`, `>>>`, `[[[REF_FIM]]]` etc.).
- A política declara a referência como "dados apenas" e proíbe segui-la como
  instrução; `JUDGE_POLICY` nomeia os marcadores; versão incrementada para
  **judge-policy@2**. Rubricas inalteradas (informação necessária à avaliação
  preservada). Escape reaproveitado do padrão anti-injection quando aplicável.

## G6 — Pronúncia inventada sem áudio

Status: **resolvido nesta sessão** (`src/lib/ai/adapter.server.ts`).

- Novo pós-processamento `enforceAudioHonesty(parsed)` logo após o parse do
  schema e antes do antivazamento: nenhuma avaliação em toda a plataforma
  entrega sinal de áudio hoje — `EvaluationResponsePayload` só carrega
  texto/transcrição e `EvaluateInput` não tem campo de áudio.
- `pronunciation`/`prosody` (`AUDIO_ONLY_DIMENSION_IDS`) são forçadas para
  `not_measured`, score `null`, sem `rationale` que reivindique análise de
  áudio; ids entram em `unmeasured` (união dedup).
- Se a nota agregada dependia inteiramente dessas dimensões
  (`, verdict === "scored"` e nenhuma dimensão `measured` restante), o resultado
  é rebaixado para `needs_review`, score `null`, evidência vazia, feedback
  constante (`AUDIO_DOWNGRADE_FEEDBACK`) e `reviewReason` público explicando que
  nenhum áudio foi analisado. Nada do texto do modelo sobre áudio sobrevive.
- **Sem nota substituta e sem reescrita por pesos (M4 fora do escopo):** quando
  outras dimensões honestas permanecem medidas (ex. `content` + `oral_fluency`
  proxy), a nota agregada do modelo segue intacta — o pós-processamento só
  impede afirmações falsas, não recalcula nota (AI-first, conforme pilar).
- `oral_fluency` mantém-se como proxy rotulado quando a entrada é
  texto/transcrição — nada muda aqui, pois a rubrica de speaking já a marca como
  proxy e o contrato coerente do esquema está preservado.

## M1 — Cache separado por modelo

Status: **confirmado** (já implementado no adaptador — chave inclui
`identity.model`) e agora protegido por teste de regressão: mesma entrada com
`openai/model-a` → 1 chamada (cache hit) e `evaluator.model` reflete o modelo
servido; troca para `openai/model-b` na mesma entrada → nova chamada, sem servir
a identidade anterior.

## Estratégia registrada — validação de ids de dimensão contra rubrica

A auditoria pedia validar ids das dimensões contra `getRubric(type)`. Decisão
deliberada: **validação ampla não foi introduzida**, com motivo registrado:

- `RUBRIC_VERSION` atual é `rubric@1` — idêntico ao `rubricVersion` das fixtures
  legadas de testes de outros donos (ex. `adapter.test.ts`, tipo `wfd`,
  dimensão `content`, que não consta na rubrica corrente). Filtro por igualdade
  de `rubricVersion` não separa fixture legada de produção.
- Ativar a retenção por id desconhecido agora quebraria esses testes
  incompatíveis, que não posso editar. Alternativas descartadas: lista de
  exceção por tipo (imprecisa) e `try/catch` global (mascara outras falhas).
- A proteção **central e inegociável** do achado — pronúncia/prosódia medidas
  sem áudio — está implementada por conjunto próprio de ids
  (`AUDIO_ONLY_DIMENSION_IDS`), independente de versão de rubrica.
- Pendência honesta para fase de integração/integração do principal: quando as
  fixtures de testes alinharem `rubricVersion`, ativar a retenção por ids
  desconhecidos no caminho de produção dentro da regra de "sem quebra de
  contrato", com testes próprios.

## Limitações declaradas

1. **Paráfrase perfeita** da referência (nenhum trecho literal comum) não é
   detectada pela guarda determinística; isso é documentado no JSDoc e a
   instrução do juiz (barreira política) continua sendo a camada para esse
   caso. Não há promessa de proteção contra paráfrase.
2. Guarda não substitui abstenção de IA e não cria autoridade determinística de
   nota — apenas valida honestidade e schema.
3. Escaneamento é literal/normalizado; não cobre reordenação de palavras nem
   vazamento semântico.
4. A validação por ids desconhecidos contra rubrica ficou pendente (ver acima);
   todo o resto do G6 é coercente com o esquema sem rebaixamento extra.
5. `evaluate-call` `callModel` dos testes usa fake determinístico; nenhum
   modelo real foi chamado nesta sessão nem nas rodadas anteriores do pacote.

## Testes de regressão (novo arquivo)

`src/test/ai/result-safety.test.ts` — 18 casos, todos passando:

- G1: retenção de gabarito curto no chamador e no caminho real do adaptador;
  fronteira de palavra ("art"/"part"); isenção total vs. não-isenção.
- G2: eco 25/64, eco 729/≈1824, limite previsível (15 chars), vazamento
  dividido entre campos.
- G3: label contaminado → retenção limpa; `unmeasured` contaminado → limpo;
  evidência com quote restrito removida preservando evidência limpa.
- G4: escape anti-fechamento; marcadores + "dados apenas"; composição com
  política e versão `judge-policy@2`.
- G6: pronúncia e prosódia measuradas sem áudio → `not_measured` sem rationale
  e em `unmeasured`; nota dependente de áudio → `needs_review` sem nota, sem
  evidência, sem "72" no feedback e com `reviewReason` público de áudio.
- M1: cache separado por modelo (modelo diferente → nova chamada; modelo igual →
  resultado do cache com identidade consistente).

## Gates

- `bunx vitest run src/test/ai --maxWorkers=2` → **9 arquivos, 238 passed,
  1 skipped** (fumo real S4, esperado skip em unidade). Zero falhas; testes de
  outros donos (guardas/adapter/calibration/gateway/wrapper/rubrics/
  type-prompt) permanecem verdes, inalterados.
- ESLint dos arquivos próprios (`leak-guard.ts`, `judge-policy.ts`,
  `adapter.server.ts`, `result-safety.test.ts`) → **0 erros, 0 avisos**
  (aplicado `--fix` cosmético do prettier uma vez e re-verificado).
- Nenhum build, typecheck manual, IA real, installation ou git nesta sessão.
  Build/tsgo seguem como gate automático do harness, conforme ADR-04.

### Correção pós-gates — narrowing de discriminante (typecheck do harness)

O gate independente de typecheck apontou **TS2339** em
`result-safety.test.ts(108,19)` e `(394,19)`: `result.reviewReason` só existe
no variante `needs_review` da união `EvaluationResult`, e `expect(
result.verdict).toBe("needs_review")` não estreita tipos para o TS
(afirmação em runtime ≠ narrowing estático). Correção aplicada nos dois
pontos, **sem `!`, cast ou supressão**: guard explícito
`if (result.verdict !== "needs_review") throw new Error(...)` logo após o
`expect` do veredito — o throw falha o teste com mensagem própria se o
veredito divergir, e o narrowing estático libera o acesso a
`reviewReason`. Re-rodado após a correção: suíte `src/test/ai` completa
**238 passed / 1 skipped**, 18 resultado-segurança testes passando,
ESLint próprio **0 erros / 0 avisos**. Nenhuma outra referência a campos
exclusivos de discriminante (`abstentionReason`) existe no arquivo.

## Arquivos entregues (dono exclusivo do pacote)

- `src/lib/ai/leak-guard.ts` — guardas G1/G2/G3 (rodada anterior em disco;
  re-lida, re-verificada e testada nesta sessão; sem alterações de lógica).
- `src/lib/ai/judge-policy.ts` — cerca G4, versão `judge-policy@2` (idem).
- `src/lib/ai/adapter.server.ts` — `enforceAudioHonesty` (G6), constants
  `AUDIO_*`, passagem de contexto `{ type, studentResponse }` ao antivazamento.
- `src/test/ai/result-safety.test.ts` — regressões completas (novo arquivo).
- `report-s7-result-safety.md` (este arquivo).

## Decisões

1. **Contexto opcional de compatibilidade:** `sanitizeEvaluationResult` ganhou
   parâmetro opcional `context`; variada sem contexto comporta-se como antes
   (piso de 25), preservando testes alheios e qualquer chamador legítimo.
2. **Isenção por resposta do aluno:** trecho só é isentado quando o inteiro já
   está na resposta — decisão conservadora; termo solto nunca libera lista.
3. **Rebaixamento para needs_review sem nota** quando toda nota dependia de
   medições só possíveis com áudio; rebaixamento não recalcula a nota de
   dimensões honestas (AI-first; sem ditado determinístico).
4. **Validação por ids desconhecidos contra rubrica adiada** com motivo e
   plano de retomada (ver seção "Estratégia registrada").
5. **Sondas com passo fixo e comparação literal** para custo previsível
   (evitando o padrão quadrático apontado pela auditoria); filtro de
   distintividade REMOVIDO na reabertura (ver "Reabertura do monitor").

## Reabertura do monitor (2026-10-21) — achados 1–4 do stage-05-eval

Implementação dos findings da reabertura, todos nos arquivos do dono do
pacote. Gates re-rodados ao fim desta seção.

### Achado 1 (GRAVE) — vazamento dividido entre campos sobrevivia

**Antes:** o sanitize filtrava campo a campo (`contaminated` por campo),
preservando dimensões/evidências "limpas" e `unmeasured` quando o eco aparecia
em outro campo. Metade do gabarito numa justificativa + metade numa citação
escapava da comparação de cada campo isolado, e o济南市 juntado existia apenas
entre feedback/uncertainty — não cobrindo campos estruturais.

**Agora:** política conservadora — quando `leaksReference` retorna `true` em
QUALQUER campo (ou no conjunto unido), `sanitizeEvaluationResult` descarta
TODOS os campos estruturais do modelo de uma vez (`dimensions: []`,
`evidence: []`, `unmeasured: []`), zera `score` e substitui feedback por
`LEAK_SAFE_FEEDBACK` constante (motivo público sem segredo). Regressões:
vazamento dividido rationale/quote; `guardas.test.ts` atualizado (2 testes,
autorizados pelo complemento do PRD: antes preservavam evidência/unmeasured).

### Achado 2 (MENOR) — teto de 20k deixava cauda sem varredura

**Antes:** `normalize` truncava em `MAX_SCANNED_TEXT_LENGTH`; campo maior que
20k era escaneado apenas até o teto e o resto descartado SILENCIOSAMENTE.

**Agora (fail-closed, sem truncamento):**
- Campo INDIVIDUAL com comprimento bruto > 20.000 → `leaksReference` retém
  imediatamente (comparação de `length` SEM normalizar, evitando falso
  negativo por trim).
- SOMA BRUTA dos campos > 20.000 → também retém (muitos campos médios totais
  fazem o conjunto juntado ser truncado; a sobreposição não é analisada).
- Regressões: eco de `wfd` escondido após o char 20.500 é retido; campo
  inofensivo de 27k é retido por volume (orientação conservadora: revisão
  sem nota, nunca texto não-auditado devolvido ao navegador).

### Achado 3 (MENOR) — probe de cobertura SUPERREIVINDICADA

**Antes:** sondas de 20 chars (passo 6) só eram mantidas se passassem em
`isDistinctive` (3+ palavras ou palavra ≥ 16 chars); o comentário afirmava
cobertura que não existia para ecos cujas janelas fossem todas genéricas.

**Agora:** filtro `isDistinctive` REMOVIDO (instrução complementar do
monitor). Cada janela de 20 chars (passo 6, incluindo sufixo, piso de trim
12) é comparada literalmente por `includes`; como todo intervalo de 6 posições
contém um múltiplo de 6, QUALQUER eco contíguo ≥ 25 chars normalizados contém
pelo menos uma sonda inteira — cobertura UNIVERSAL restaurada e documentada
(`LEAK_PROBE_STRIDE`/cabeçalho). Eco ≤ 15 chars permanece permitido (nenhuma
sonda de 20 cabe e o sample inteiro não). Efeito admitido: janela que
apareça por acaso em texto honesto → revisão sem nota (falso positivo
conservador). Regressão: eco genérico de 25 chars (palavras curtas) hoje
retém — antes escapava.

### Achado 4 (GRAVE) — aliases de áudio driblavam ids canônicos

**Antes:** trava compare ids canônicos (`pronunciation`, `prosody`); modelo
hostil com id `pronunciation_score`/`audio_fluency` e label livre publicava
subscore inventado.

**Agora:** `isAudioOnlyClaim` compara `audioClaimKey(id)` E
`audioClaimKey(label)` (minúsculas + diacríticos NFD removidos) contra
`AUDIO_ALIAS_PATTERN = /pronunc|prosod/`; qualquer status ≠ `not_measured`
incluindo `proxy` COM SCORE mantém reivindicação → retenção INTEGRAL
(`needs_review`, nota null, feedback constante, sem dims/evidências).
Exceção legitimada: `oral_fluency` `measured` → normalizado `proxy`
(dados deriváveis de transcript; sem recrição de score). Regressões:
alias com feedback "71/90" retido (JSON sem "71"/"Pronunciation"/
"pronunciation_score"); label livre "Prosódia percebida: 69" retido;
proxy de prosódia retido.

### Residuais registrados (sem ampliar escopo)

1. Prosa de áudio: menções a medição de pronúncia/prosódia em
   rationale/feedback (sem id/label alias) NÃO disparam retenção — o
   padrão vigia apenas identificadores; feedback hostil que afirme score
   verbalmente e não ecoe gabarito só cai na retenção genérica e não na
   trava de áudio (documentado; mitigação futura exigiria análise de
   prosa, fora do escopo).
2. IDs amplos: validação de ids de dimensão contra `getRubric(type)`
   no caminho de produção segue ADIADA (ver seção "Estratégia registrada") —
   a proteção central de áudio não depende disso.

### Gates da reabertura (evidência real)

- `bunx vitest run src/test/ai --maxWorkers=2` → **9 arquivos, 248 passed /
  1 skipped** (inclui os 2 refits de `guardas.test.ts` e ~9 regressões novas).
- `bunx eslint` nos 5 arquivos do pacote (`--fix`) → **exit 0**, zerado;
  re-rodada da suíte após o fix: verde.
- Arquivos conferidos no disco (leitura de volta), não só stdout.
