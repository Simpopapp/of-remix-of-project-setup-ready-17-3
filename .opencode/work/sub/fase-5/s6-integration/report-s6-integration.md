# Report — Fase 5 / s6-integration

## O que foi feito

1. **Gateway compatível com AI SDK 7 (`src/lib/ai/gateway/evaluate-call.server.ts`)**
   - Causa medida no smoke da s4: o SDK 7 rejeita `role: "system"` dentro de `messages`
     (`AI_InvalidPromptError: ... Use the instructions option instead.`) antes de qualquer request.
   - `buildEvaluatorMessages` (em `prompt-injection.ts`) continua produzindo o par
     `system` (política + `UNTRUSTED_RULE`) + `user` (dados delimitados). **Não editei
     `prompt-injection.ts`.**
   - Adicionei `splitEvaluatorPrompt(messages)`, que separa a política confiável das
     mensagens de conversa e falha com `EvaluationOutputError` se não houver instruções
     de sistema.
   - `streamText` passou a receber `instructions: prompt.instructions` e
     `messages: prompt.messages`. Nada mais mudou: Responses
     (`provider.responses(model)`), `store:false`, `forceReasoning:true`,
     `reasoningEffort:"medium"`, `reasoningSummary:"auto"`, `include:
     ["reasoning.encrypted_content"]`, `maxRetries:0`, cancelamento, `Output.object`
     com `judgeOutputSchema` e o provider/run-id criados por chamada.

2. **Teste de regressão de wire (`src/test/ai/gateway.test.ts`, novo)**
   - Usa o **SDK real** e um `fetch` fake (sem rede, sem credencial real; chave dummy via
     `vi.stubEnv`, restaurada em `afterEach` com `vi.unstubAllGlobals/Envs`).
   - Verifica o corpo efetivamente emitido (Responses SSE), não mocks de `streamText`:
     - URL `.../v1/responses` e header `Lovable-API-Key`;
     - política do juiz + `UNTRUSTED_RULE` em **um único** turno confiável
       (`developer` no wire do SDK 7), ausente do turno `user`;
     - nenhum `role:"system"` na conversa e ausência de campo `messages`;
     - delimitadores `<<<RESPOSTA_DO_ALUNO>>>`/`<<<QUESTAO>>>` e conteúdo do aluno no
       turno `user`;
     - `model` preservado, `stream:true`, `store:false`, `reasoning {effort:"medium",
       summary:"auto"}` e `include` com encrypted reasoning;
     - schema estrito: `text.format.type:"json_schema"`, `strict:true`, raiz
       `object`, `required` completo (comparado a `Object.keys(judgeOutputSchema.shape)`),
       `additionalProperties:false` na raiz e nos itens de `dimensions`/`evidence`;
     - saída normalizada para o contrato de domínio (escala `attempt_0_100`,
       `evaluator.{model,promptVersion,rubricVersion}`, `scoredAt`, `quote:null` descartado);
     - saída vazia → `EvaluationOutputError` (nunca `scored`);
     - sem `LOVABLE_API_KEY` → `MissingApiKeyError` e **zero** requests.

3. **Lint (`eslint.config.js`)**
   - Override restrito a `src/integrations/supabase/**/*.{ts,tsx}` desligando **somente**
     `prettier/prettier`. Nenhuma outra regra foi alterada nesse diretório nem no resto do
     projeto (`no-restricted-imports` de `server-only`, regras de segurança e hooks intactas).
   - Override pontual adicional (autorizado no complemento do PRD), **somente** para
     `src/integrations/supabase/previewAuthStorage.ts`: `prefer-const:
     ["error", { ignoreReadBeforeAssign: true }]`. A regra permanece em `error`; apenas o
     padrão legítimo "lido no closure antes da atribuição" deixa de ser falso positivo.
     Opção confirmada no schema da versão instalada (ESLint 9.39.5): `prefer-const` aceita
     `{ destructuring, ignoreReadBeforeAssign }` com `additionalProperties: false`.
     O arquivo gerado **não foi editado**.

## Como foi verificado

Comandos (nenhum build/typecheck manual, nenhum git de escrita, nenhuma chamada real de IA):

```
bunx vitest run src/test/ai/gateway.test.ts src/test/ai/adapter.test.ts --maxWorkers=2
→ Test Files 2 passed (2) · Tests 22 passed (22)   (6 gateway + 16 adapter)

bunx eslint src --format json
→ reexecução final (00:26 UTC): 7 erros, 6 warnings — todos os 7 em arquivos de
  pacotes concorrentes (s7/s8), nenhum meu; detalhe abaixo.
```

- **Prova de que o teste pega o bug antigo:** revertendo temporariamente o gateway para
  `messages: buildEvaluatorMessages(...)`, o mesmo teste falha em **5 de 6** casos
  (`AI_NoOutputGeneratedError`/`AI_InvalidPromptError`, nenhum request capturado); o caso
  "sem chave" passa nos dois códigos por design. Arquivo restaurado em seguida e suíte
  verde de novo.
- **Wire real do SDK** (script offline em `/tmp`, removido depois): request
  `POST https://ai.gateway.lovable.dev/v1/responses` com
  `input[0] = {role:"developer", content:"<política>\n\n<UNTRUSTED_RULE>"}`,
  `input[1] = {role:"user", content:[{type:"input_text", ...}]}`, sem `system`,
  `text.format` json_schema estrito, `store:false`, reasoning/include preservados, e
  `result.output` normalizado (`verdict:"scored"`, `score:74`). Nenhum segredo real usado.

### Números reais do ESLint

Antes (primeira rodada): 172 erros (168 em `src/integrations/supabase/*.ts`, sendo 167
`prettier/prettier` + 1 `prefer-const`; 4 `prettier` no teste novo).
Depois do override de Prettier + desta exceção pontual: **0 erros e 0 warnings** no arquivo
gerado (`bunx eslint src/integrations/supabase/previewAuthStorage.ts` → `errors: 0,
warnings: 0`), que era o único resíduo sob minha responsabilidade.

O `prefer-const` era falso positivo: `timer` é lido por `finish` (`clearTimeout(timer)`)
antes da atribuição em `timer = setTimeout(...)`, e `const` sem inicializador não compila.
A opção `ignoreReadBeforeAssign: true` é a prevista pelo ESLint para esse padrão; não
desliguei a regra nem toquei no arquivo. **Observação:** o diagnóstico do PRD citava
`no-explicit-any`; no scaffold atual esse erro não existe mais.

Estado do `eslint src` na reexecução final (00:28:47 UTC): **0 erros** em todos os meus
arquivos (`eslint.config.js`, `evaluate-call.server.ts`, `gateway.test.ts`,
`previewAuthStorage.ts`, demais gerados), + **6 warnings preexistentes** tolerados
(`react-refresh/only-export-components` em `components/ui/*`) + **2 erros
`prettier/prettier` em arquivos do pacote s7**, não meus e não tocados:

```
src/lib/ai/judge-policy.ts  (1)  préttier:68   mtime 00:26:28
src/lib/ai/leak-guard.ts    (1)  prettier:120  mtime 00:26:12
```

Timeline medida: 00:26 → 7 erros (s7+s8); 00:28 → 2 erros (s8 formatado por seu dono, s7
ainda em voo). A expectativa "0 erros/6 warnings" do complemento **não está confirmada
globalmente** por causa desses 2, que pertencem ao s7; o meu recorte está limpo.

## Decisões

- Separação feita **no gateway**, não em `prompt-injection.ts`: preserva o contrato atual
  (`buildEvaluatorMessages` continua sendo a fonte única do texto da política e do rótulo
  untrusted) e mantém a política como conteúdo confiável separado dos dados do aluno.
- `splitEvaluatorPrompt` junta múltiplos `system` com `\n\n` e exige ao menos um; prompt sem
  política falha como `EvaluationOutputError` (schema) em vez de seguir sem rubrica.
- Override de lint limitado a Prettier nos gerados; qualquer outra violação nesses arquivos
  é reportada, não ignorada.
- Resíduo `prefer-const` resolvido por `ignoreReadBeforeAssign: true` **escopado ao único
  arquivo** (não ao diretório): mantém a regra como `error` para qualquer outro `let`
  realmente constante em arquivos gerados e documenta o padrão legítimo de leitura antes da
  atribuição.
- Nenhum timeout, retry, modelo ou endpoint alternativo foi adicionado/trocado; versões
  `ai@7.0.143` e `@ai-sdk/openai@4.0.96` preservadas.
- Narrowing por guard explícito (`if (!request) throw`) em vez de `captured[0]!`: o
  `toHaveLength` é uma asserção de runtime e não estreita o tipo; o guard também transforma
  um eventual "nenhum request" em falha legível em vez de `Cannot read properties of
  undefined`.

## Bloqueios / pendências

- ~~1 erro de lint residual em `previewAuthStorage.ts:38`~~ **Resolvido** pelo override
  autorizado (`ignoreReadBeforeAssign: true`, regra em `error`, arquivo gerado intocado).
- **2 erros `prettier/prettier` remanescentes em `judge-policy.ts:68` e `leak-guard.ts:120`
  (s7)** medidos às 00:28:47 UTC. Fora do meu escopo; não editei. Gate global de lint
  depende de o s7 fechar esses arquivos. (Às 00:26 eram 7 erros s7+s8; o s8 já formatou.)
- Nenhum arquivo de gateway/adaptador foi tocado nesta rodada (outros pacotes lendo).
- Types/build não foram executados manualmente (gate do harness, conforme PRD). O `TS18048`
  apontado pelo build das 00:19:09 foi corrigido no teste; a verificação final é do harness.
- Nota operacional: a plataforma auto-commitou o trabalho em `0b65b0a` (00:16 UTC) e de novo
  em `44ebf7e` (00:19 UTC, já com o override de ESLint e a reformatação do teste). Por isso
  `git status` não mostra os arquivos de produto como modificados; ficam não commitados
  apenas os pilares deste pacote e os logs de sessão. Nenhum comando git de escrita foi
  executado por mim.

## Arquivos tocados (exatos)

Rodada inicial (instruções SDK 7 + teste + override de Prettier):

- `src/lib/ai/gateway/evaluate-call.server.ts` — `instructions` + `messages` (SDK 7),
  `splitEvaluatorPrompt` exportado.
- `src/test/ai/gateway.test.ts` — novo teste de wire (SDK real + fetch fake), 6 casos;
  narrowing de `captured[0]` por guard explícito (`TS18048`).
- `eslint.config.js` — override `prettier/prettier: off` só em `src/integrations/supabase/**`.

Rodada de integração final (somente lint/report; gateway e adapter intocados):

- `eslint.config.js` — bloco adicional `files: ["src/integrations/supabase/previewAuthStorage.ts"]`,
  `prefer-const: ["error", { ignoreReadBeforeAssign: true }]`.
- `.opencode/work/sub/fase-5/s6-integration/report-s6-integration.md` — este report.
- `.opencode/work/sub/fase-5/s6-integration/prd-project1-s6` e `roadmap-proj1-s6` — decisões
  e estado deste pacote.
