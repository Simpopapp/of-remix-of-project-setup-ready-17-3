# Relatório final — s3-consentimento (Fase 5, projeto 1)

**Data:** 2026-10-20 · **Pacote:** fase-5/s3-consentimento · **Escopo:** consentimento de
avaliação por IA + porta client-side de envio honesto + seção em Ajustes.

---

## 1. Feito (por fase do roadmap)

- [x] **F5.3.1 — `aiConsent` em `src/lib/app/settings.ts`**
  - `AppSettings.aiConsent: { evaluate: boolean; acknowledgedAt: string | null }` e
    `DeepPartialAppSettings.aiConsent?: Partial<...>`.
  - `DEFAULT_SETTINGS.aiConsent = { evaluate: false, acknowledgedAt: null }` (congelado por
    `deepFreeze`); `cloneDefaults` copia a seção.
  - `normalizeAppSettings`: boolean via `pickBoolean` (default `false`); timestamp só aceito se
    `typeof === "string"` e `!Number.isNaN(Date.parse(v))`, senão `null` (helper
    `pickAcknowledgedAt`).
  - `applySettingsPatch`: merge por seção como as demais; `aiConsent: null` é ignorado.
  - Comportamento existente preservado (spread de `raw` mantém chaves desconhecidas).
- [x] **F5.3.2 — `src/lib/app/evaluation-client.ts`**
  - `NO_CONSENT_MESSAGE` / `EMPTY_RESPONSE_MESSAGE` / `SERVICE_ERROR_MESSAGE` em pt-BR.
  - `hasResponseContent` reaproveita `responseTextOf` (texto **ou** transcrição contam).
  - `canEvaluate(settings, hasResponse)` → `{ ok: true }` | `{ ok: false, reason:
    "no_consent" | "empty_response", message }`, com consentimento verificado primeiro.
  - `requestEvaluation(settings, payload)` aplica o gate **antes** da rede; chama
    `evaluateResponseFunction({ data: payload })` e propaga `{ evaluation }`; qualquer exceção
    vira `{ ok: false, reason: "service_error", message: SERVICE_ERROR_MESSAGE }` — nunca nota
    substituta, nunca stack na UI.
- [x] **F5.3.3 — UI em Ajustes**
  - `src/components/settings/ai-consent-section.tsx`: `SettingsSection id="avaliacao-ia"` com
    `StatusPill` Autorizada/Não autorizada, 5 bullets honestos (o que é enviado; quem processa;
    o que fica no dispositivo; estudar sem envio; estimativa de treino ≠ nota oficial),
    `ToggleRow` (alvo ≥ 44 px, `min-h-11`), status com `role="status" aria-live="polite"`, data
    do aceite em pt-BR (dd/mm/aaaa) e `InlineNote` de "como funciona sem consentimento".
  - Regras do aceite: ligar grava ISO; segundo aceite **preserva** a data original; revogar
    desliga e **preserva** o histórico.
  - Registro em `settings-sections.tsx` (re-export) e render em `ajustes.tsx` entre Studie Plus e
    Backup e restauração. Nenhum texto promete nota oficial; só tokens do tema.
- [x] **F5.3.4 — Relatório** (este arquivo) com evidências reais.

---

## 2. Evidências (saída real dos gates)

Gate do pacote:

```
$ bunx vitest run src/test/app/ai-consent.test.ts src/test/app/settings.test.ts
 RUN  v5.0.3 /dev-server
 Test Files  2 passed (2)
      Tests  33 passed (33)
   Start at  22:27:55
   Duration  2.28s (environment 57%, setup 17%, transform 10%, tests 9%, import 7%)
```

Arquivo novo isolado (16 testes: 5 settings + 5 gate/porta + 6 componente):

```
$ bunx vitest run src/test/app/ai-consent.test.ts
 Test Files  1 passed (1)
      Tests  16 passed (16)
   Duration  1.92s
```

Regressão na camada de aplicação (settings, backup, srs, db, media etc.):

```
$ bunx vitest run src/test/app --maxWorkers=2
 Tests  219 passed (219)   (15 arquivos)
 Duration  15.06s
```

Lint:

```
$ bunx eslint src/lib/app src/components/settings src/test/app/ai-consent.test.ts
(sem saída) exit=0
```

Harness (ADR-04 — sem build/typecheck manual):

```
/tmp/observability/build-errors.log
=== build 2026-10-20T22:19:33Z === build OK
=== build 2026-10-20T22:28:38Z === build OK
```

Verificação visual real (`http://localhost:8080/ajustes`):

- Desktop 1280×1600 e 1280×3200: seção "Avaliação por IA" renderiza com pill "Não autorizada",
  5 bullets e toggle; `errors: []`.
- Mobile 390×4200: coluna única, bullets legíveis, toggle e nota inline presentes sem overflow
  horizontal; `errors: []`.
- Interação real: clique em `#avaliacao-ia-consentimento` → pill muda para **"Autorizada"**,
  status passa a "Consentimento registrado em 20/10/2026…" e aparece "Ajustes salvos neste
  dispositivo."; `errors: []`. A seção seguinte (Backup e restauração) continua no lugar.

---

## 3. Decisões tomadas (registradas no PRD do pacote, §5)

1. Usar o contrato real do wrapper de s1 — `evaluateResponseFunction({ data: payload })` →
   `{ evaluation }` — em vez do nome `evaluateResponse` citado no PRD; sem adaptador.
2. Gate verifica consentimento **antes** de resposta vazia (mensagem de privacidade tem
   prioridade).
3. `hasResponseContent` via `responseTextOf` (texto + transcrição), sem mapa de campos por tipo.
4. Falha do serviço → `service_error` honesto, sem nota e sem detalhe técnico.
5. `acknowledgedAt` é imutável: re-aceite não sobrescreve a data; revogar preserva o histórico.
6. Data exibida em pt-BR dd/mm/aaaa; ISO guardado; valor inválido vira texto neutro.
7. Seção recebe `settings`/`onPatch`/`saving` e não conhece IndexedDB.
8. Teste em `.ts` com `createElement` (padrão do projeto), sem renomear para `.tsx`.
9. `vi.mock` com `vi.hoisted` isola o wrapper e prova zero chamadas sem consentimento.
10. Clique de verificação usa `#avaliacao-ia-consentimento` porque `SettingsSection` não escreve
    seu `id` no `<section>` — `ui.tsx` não foi alterado (arquivo compartilhado).
11. `settings-patch.ts` não foi tocado (dono: s4), mesmo com `defaultsPatch()` sem `aiConsent`.

---

## 4. Pendências e bloqueios

- **Pendência (fora do recorte):** `defaultsPatch()` em `src/components/settings/settings-patch.ts`
  não inclui `aiConsent`. "Restaurar padrões" mantém a autorização atual — comportamento
  inconsistente com "defaults desligados". Arquivo pertence a s4 (Fase 4); não editei.
- **Pendência (fora do recorte):** `SettingsSection` aceita `id` mas o usa só em `aria-labelledby`;
  o `<section>` não recebe `id`, então âncoras/links diretos para `#avaliacao-ia` não funcionam e
  testes visuais por seletor falham. Sugestão: aplicar `id={id}` no `<section>` em `ui.tsx`.
- **Bloqueio de tooling:** `mcp-projectops_lsp--check` indisponível ("Unable to connect" na porta
  9999) — sem typecheck via LSP. Typecheck/build manual é proibido por ADR-04; o harness Lovable
  reportou `build OK` após as edições, mas o typecheck estrito fica para o agente principal.
- **Nota de contrato:** o PRD do pacote cita `evaluateResponse` e `EvaluationRequestPayload`
  importável de `./settings`; o disco tem `evaluateResponseFunction` e o payload em
  `@/lib/ai/evaluation-io`. Segui o disco e registrei a divergência (decisão 1).

---

## 5. Mudanças necessárias fora do recorte (para o agente principal)

1. `src/components/settings/settings-patch.ts` (s4): adicionar `aiConsent` ao `defaultsPatch()`
   para que "Restaurar padrões" volte a `{ evaluate: false, acknowledgedAt: null }`.
2. `src/components/settings/ui.tsx` (s4): escrever `id={id}` no elemento `<section>` de
   `SettingsSection` (melhora acessibilidade/âncoras e destrava testes por seletor).
3. PRD central §6.3/§15 Fase 5: atualizar o nome do wrapper para `evaluateResponseFunction` e a
   origem de `EvaluationRequestPayload` (`@/lib/ai/evaluation-io`), evitando que a Fase 6 procure
   um símbolo inexistente.
4. Fase 6 (integração): a tela de prática deve chamar `canEvaluate(...)` para desabilitar/explicar
   o botão **antes** de montar a resposta, e tratar `no_consent` com link para `/ajustes`. A porta
   não faz prefetch nem retry — o motor decide quando perguntar.

---

## 6. Arquivos criados/alterados

Criados:

- `src/lib/app/evaluation-client.ts` — gate de consentimento + `requestEvaluation`.
- `src/components/settings/ai-consent-section.tsx` — seção "Avaliação por IA".
- `src/test/app/ai-consent.test.ts` — 16 testes (settings, gate/porta, componente).

Alterados (dentro do recorte):

- `src/lib/app/settings.ts` — nova seção `aiConsent` (tipo, default, normalização, clone, patch).
- `src/components/settings/settings-sections.tsx` — re-export de `AiConsentSection` e do tipo.
- `src/routes/ajustes.tsx` — render da seção na ordem do PRD.

Alterados (documentação do pacote):

- `.opencode/work/sub/fase-5/s3-consentimento/prd-project1-s3` — §5 com 11 decisões.
- `.opencode/work/sub/fase-5/s3-consentimento/roadmap-proj1-s3` — F5.3.1–F5.3.4 marcados `[x]`.
- `.opencode/work/sub/fase-5/s3-consentimento/report-s3-consentimento.md` — este relatório.

Não tocados (por regra): `src/lib/ai/**` (s1/s2), `src/domain/**`, `src/data/**`, shell de
prática, `settings-patch.ts`, `ui.tsx`, `routeTree.gen.ts`.
