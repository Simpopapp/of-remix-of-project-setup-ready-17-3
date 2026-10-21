# Report — s8-request-safety (Fase 5)

**Escopo:** fechar G5 (superfície pública de custo) e G7 (consentimento não verificado no
servidor) apontados na auditoria s5, sem conta, sem auth, sem tabela e sem tocar dados do aluno.

## 1. Medidas da auditoria s5 e o que foi feito

| Lacuna (s5) | Medida aplicada | Evidência |
|---|---|---|
| **G7** — `aiConsent` só era checado no cliente; o endpoint aceitava qualquer payload e chamava o avaliador | Envelope explícito `{ ...payload, consent: true }`; no servidor `parseEvaluationEnvelope` exige `consent === true` **estrito** (sem coerção, sem `truthy`) **antes** de adquirir lease e antes de importar `evaluate.server`. Ausente/false/`"true"`/`1` → abstenção com `score: null`, zero chamadas ao avaliador | `request-safety.ts:56`, `request-safety.server.ts:195`; 17 testes em `request-safety.test.ts` (5 de consentimento) |
| **G5** — `evaluate.functions.ts` era endpoint público sem limite; um chamador podia disparar dezenas de chamadas pagas | Guarda server-only com limite por instância (10 req/min) e concorrência (2 em voo); bloqueio devolve abstenção **sem** chamar o gateway | `request-safety.server.ts:39` e `:97`; testes de limite, janela e concorrência |
| **G5 (correlato)** — endpoint público de calibração sem consumidor no app | `src/lib/ai/calibrate.functions.ts` removido; runner server-only, corpus e testes de calibração continuam disponíveis para execução controlada fora do endpoint | arquivo inexistente (`ls` → *No such file*); `rg` sem consumidores; `calibration.test.ts` 23 passed / 1 skipped |

## 2. Formato único do request envelope

Decisão: **plano, sem aninhamento** — `{ type, questionId, response, mode, consent: true }`.
`consent` **não** entra em `EvaluationRequestPayload` (contrato compartilhado com runner e
adapter); `withEvaluationConsent(payload)` devolve cópia (não muta) e `parseEvaluationEnvelope`
remove a chave antes de entregar o payload ao avaliador. Teste garante que o avaliador recebe o
payload **sem** `consent`.

## 3. Arquitetura do fluxo no servidor

```
createServerFn handler (evaluate.functions.ts)
  └─ import dinâmico de ./request-safety.server   ← fora do bundle cliente
       └─ evaluateGuarded(raw)
            1. parseEvaluationEnvelope(raw)      → consent !== true ⇒ abstenção (sem custo)
            2. limiter.acquire()                 → busy/rate_limited ⇒ abstenção (sem custo)
            3. loadEvaluator()                   → import("./evaluate.server") só aqui
            4. evaluate(payload)                 → erros propagam (cliente → service_error)
            5. finally lease.release()           → idempotente, em sucesso/erro/erro de import
```

- Dependências injetáveis (`limiter`, `loadEvaluator`, `nowMs`) permitem testar o orquestrador
  sem `createServerFn` e sem mock frágil do framework.
- `evaluationLimiter` é singleton de módulo (por instância do Worker).
- `snapshot()` expõe apenas `inFlight`, `usedInWindow`, `windowResetAt` — nunca payload,
  resposta, referência de questão ou chave.

## 4. Limites reais da proteção (honestidade)

- **Por instância, em memória.** Restarts, múltiplas instâncias ou distribuição geográfica não
  compartilham contador: **não existe teto financeiro global**. A proteção reduz abuso casual e
  rajadas acidentais da UI; não substitui budget no provedor.
- **Janela fixa de 60 s.** Um pico na virada da janela pode, no pior caso, atravessar duas
  janelas consecutivas. Não é limitador de taxa distribuído.
- **Sem identidade de cliente.** Não usa IP nem header (falsificáveis); o limite é global por
  instância. Produto individual sem contas — adequado agora, insuficiente para multiusuário.
- **Consentimento é declaração explícita, não autenticação.** Prova que o cliente declarou a
  opção ligada no envio; não prova identidade nem autorização. Quem alcançar o endpoint pode
  enviar `consent: true`; o controle de custo é o limiter, não o envelope.
- **Bloqueios não gastam**: consentimento inválido, `busy` e `rate_limited` retornam abstenção
  com `score: null` e metadados de avaliador (modelo/prompt/rubrica), sem chamada ao gateway.
- **Sem persistência de request/response no limiter** e sem retenção de referência de questão.

## 5. Testes

`bunx vitest run src/test/ai/request-safety.test.ts src/test/app/ai-consent.test.ts src/test/ai/evaluate-wrapper.test.ts --maxWorkers=2`
→ **3 arquivos, 39 testes verdes** (3,87 s).

| Arquivo | Testes | Cobertura relevante |
|---|---|---|
| `src/test/ai/request-safety.test.ts` (novo) | 17 | envelope puro (sem mutação; rejeita ausente/false/`"true"`/`1`; remove `consent`; rejeita chaves extras), G7 (sem consent ⇒ zero `loadEvaluator`/`evaluate` e cota intacta), limite concreto 3 + reset de janela, concorrência `busy`, liberação em sucesso/erro de avaliador/erro de import, release idempotente, política padrão 10/2 congelada, snapshot sem payload |
| `src/test/app/ai-consent.test.ts` (ajustado) | 16 | gate de `settings.aiConsent` preservado; chamada agora asserta envelope `{ ...PAYLOAD, consent: true }` e **chaves exatas** (`consent`, `mode`, `questionId`, `response`, `type`), sem `aiConsent`/`meta`/settings |
| `src/test/ai/evaluate-wrapper.test.ts` (inalterado) | 6 | orquestração com banco real; nenhuma dependência do envelope novo |

Prova de remoção da calibração: `bunx vitest run src/test/ai/calibration.test.ts --maxWorkers=2`
→ 23 passed, 1 skipped (24). Nenhum consumidor de `calibrate.functions` em `src/`.

## 6. Gates

- `bunx eslint src/lib/ai/request-safety.ts src/lib/ai/request-safety.server.ts src/lib/ai/evaluate.functions.ts src/lib/app/evaluation-client.ts src/test/ai/request-safety.test.ts src/test/app/ai-consent.test.ts`
  → **exit 0** (após `--fix` de formatação; sem supressões).
- `bunx vitest run … --maxWorkers=2` → **39/39** (acima).
- Build/typecheck: **não executados manualmente** (proibido nesta sandbox; harness automático).
- Sem git, sem instalação, sem chamada real de IA.

## 7. Arquivos tocados

| Arquivo | Ação |
|---|---|
| `src/lib/ai/request-safety.ts` | novo — contrato client-safe (`withEvaluationConsent`, `parseEvaluationEnvelope`) |
| `src/lib/ai/request-safety.server.ts` | novo — limiter + guarda + composição (`EVALUATION_RATE_LIMIT`, `createEvaluationLimiter`, `createGuardedEvaluation`, `evaluateGuarded`) |
| `src/lib/ai/evaluate.functions.ts` | reescrito — validador não rejeita; handler delega a `evaluateGuarded` via import dinâmico |
| `src/lib/app/evaluation-client.ts` | envia `withEvaluationConsent(payload)`; gate local preservado |
| `src/lib/ai/calibrate.functions.ts` | removido |
| `src/test/ai/request-safety.test.ts` | novo — 17 testes |
| `src/test/app/ai-consent.test.ts` | envelope mínimo + asserção de chaves exatas |

## 8. Observações e pendências

- Comentário histórico em `src/data/ai/calibration/input.ts:5` ainda cita o wrapper removido.
  Fora do escopo deste pacote (arquivo de outro dono) — fica registrado para limpeza futura.
- Não foi feito mutation testing no repositório (execução paralela de outros pacotes); os testes
  foram desenhados para falhar no comportamento anterior (sem consentimento → chamada ao
  avaliador; sem limite → rajada aceita).
- `retryAfterMs` é calculado pelo limiter e não é exibido na UI; a mensagem de abstenção apenas
  orienta nova tentativa. Expô-lo exigiria mudar o DTO/rota (fora do escopo).
