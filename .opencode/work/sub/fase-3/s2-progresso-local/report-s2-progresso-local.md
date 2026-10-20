# Relatório final — s2-progresso-local (Fase 3)

**Pacote:** s2-progresso-local · **Data:** 20/10/2026 · **Gates:** verdes.

## 1. Feito (por fase do roadmap)

### F3.1 — Wrapper IndexedDB (`src/lib/app/db.ts`)
- DB `pte-master-hub` versão 1 com stores `snapshots`, `aggregates`, `aggregateHistory` (+ índice
  `bySeries`), `attempts` (+ índice `byQuestionId`), `media`, `quarantine`, `undo`, `meta`.
- `ProgressDatabase.transaction(names, mode, fn)`: abre a transação, executa o callback, resolve só no
  `oncomplete` e rejeita no `onabort`/`onerror`; evita transações vazias aguardando `requestResult`
  antes de abrir.
- Erros: `ProgressDbUnavailableError` (`indexeddb_unavailable`), `ProgressDbClosedError`,
  `ProgressTransactionError` (storeNames + causa + detalhe). Erros de request do IndexedDB são
  reembrulhados (`IDB_ERROR_NAMES`); `ProgressStoreError` e demais erros de domínio passam intactos
  para não perder o `code`.
- Diagnóstico: `objectStoreNames`, `isClosed`, `tryOpenProgressDb`, `isProgressDbAvailable`,
  `deleteProgressDb`; `indexedDB` injetável (testes) em `openProgressDb`/`openProgressLayer`.

### F3.2 — Snapshots + agregados independentes (`src/lib/app/storage.ts`)
- `ProgressStore` com `recordOpenAttempt` (rascunho idempotente que sobrevive ao reload),
  `submitAttempt` (append-only; finaliza rascunho; recusa duplicata fechada), `setFavorite`,
  `setPrivateNotes`, `getSnapshot(s)`, `getDueSnapshots`, `getAttemptLog`, `getAggregates`,
  `getAggregateHistory`, `getSettings`/`setSettings`.
- `mergeSnapshot` puro (contadores monotônicos, melhor nota, última nota medida, `canonicalId`
  preservado, favorito/notas, erros por categoria).
- `deriveAggregates`: buckets por tipo/seção sempre, por habilidade só com `skillWeights` injetado;
  `recentWeightedScore` = média exponencial (meia-vida 14 dias); `trend` contra o último ponto diário
  anterior (`TREND_THRESHOLD = 2.5`); confiança por volume (high ≥20 tentativas e ≥8 questões,
  medium ≥6/≥3); `estimate` por habilidade permanece `null`/`"uncalibrated"` (sem inventar 10–90).
- Histórico diário (`aggregateHistory`) para tendência/gráficos da Fase 8; gravação na mesma
  transação do snapshot.

### F3.3 — Log append-only truncável
- Política registrada no PRD do pacote: máx. **2.000** tentativas submetidas e **180 dias** locais;
  tentativas abertas nunca são removidas; snapshots/agregados/histórico não dependem do log.
- Truncagem roda na mesma transação do `submitAttempt` (quando `autoTruncate`) ou explicitamente em
  `truncateAttempts`; desempate determinístico por `attemptId` quando `submittedAt` empata.
- Exportação de backup é tolerante a log corrompido: registros ilegíveis são descartados (log não é
  fonte de métrica), em vez de impedir o backup.

### F3.4 — SRS (`src/lib/app/srs.ts`)
- `SRS_POLICY_BY_TYPE` com intervalos por tipo (ex.: `wfd` começa em 1 dia; `swt`/`write_essay`
  escalas longas) e limiar de aprovação 50–70 por tipo; `nextReviewDayFor`, `isSrsDue`,
  `reviewQueue`, `passedForScore`.
- Regras provadas: revisão vencida + acerto promove **1** caixa; lapso rebaixa **1** caixa; acerto
  não vencido **não** remarca (mata "5 acertos em 5 min ⇒ 30 dias"); primeira exposição agenda sem
  promover; abstenção (`passed === null`) não altera caixa nem revisão.
- Datas sempre em chave de dia local via `@/domain/day` (nunca UTC).

### F3.5 — Backup (`src/lib/app/backup-io.ts`)
- Export de envelope versionado (default últimas 500 tentativas; `0` = sem log) com snapshots,
  agregados, histórico, ajustes e `attemptsTail`; envelope V1 é migrado aditivamente.
- `inspect` (prévia): versão, migração, contagens, questões novas/compartilhadas, melhora de melhor
  nota, conflitos de tipo, chaves de ajustes, `device`/`createdAt`.
- `replace`: troca snapshots/agregados/ajustes, mas **nunca apaga** o log (união por `attemptId`).
- `merge`: máximo de contadores/notas/caixa, revisão mais cedo, última revisão mais recente,
  favorito OR, união de erros por categoria.
- `undo`: um slot com o estado anterior completo (snapshots, log, ajustes, agregados, histórico).
- Entrada inválida, JSON ilegível ou versão futura → **quarentena somente-leitura** com `add`
  (nunca `put`) e id com contador de módulo + entropia, impedindo colisão/sobrescrita; o estado atual
  fica intocado. `exportQuarantine` devolve o payload cru para auditoria.

### F3.6 — Mídia/áudio (`src/lib/app/media.ts`)
- `MediaStore.save`: valida buffer não vazio, grava `ArrayBuffer` + metadados (mime, duração,
  `questionId`, `attemptId`, `createdAt`), id único com contador; leitura via `arrayBuffer()` feita
  antes da transação.
- `estimateQuota`: usa `navigator.storage.estimate()` (injetável); aviso preventivo 80 % (warn),
  95 % ou espaço insuficiente (critical), `unknown` sem API; **nunca bloqueia** a gravação.
- `QuotaExceededError` → `{ ok: false, error: "quota_exceeded" }` com mensagem honesta para a UI;
  `list`/`delete` de gravações.

### F3.7 — Testes de perda (§10) e fuso
- `loss.test.ts` (8): reload no meio da sessão (rascunho recuperado, sem agregado prematuro), crash
  simulado no meio do `submitAttempt` (transação abortada, nada parcial), log corrompido não derruba
  snapshots/agregados e não impede backup, importação dupla idempotente, backup inválido →
  quarentena sem sobrescrever, truncar todo o log + reabrir mantém métricas, conexão compartilhada
  entre store/backup/mídia, abstenção sem nota/SRS.
- `timezone.test.ts` (6): `America/Sao_Paulo` (virada de dia local vs UTC, passos de 24 h, SRS),
  `America/New_York` (DST de 2026-03-08 e 2026-11-01, dias de 23 h/25 h, revisão agendada).

### F3.8 — Relatório
- Este arquivo, com gates e API entregue.

## 2. Evidências (saída real dos gates)

```
$ bunx vitest run src/test/app
Test Files  8 passed (8)
     Tests  71 passed (71)
  Duration  1.75s

$ bunx vitest run src/test/domain
Test Files  9 passed (9)
     Tests  130 passed (130)

$ bunx tsgo --noEmit
(exit 0, sem saída)

$ bunx eslint src/lib/app src/test/app
(exit 0, sem saída — 103 erros prettier auto-corrigidos com --fix)
```

Arquivos de teste: `db.test.ts`, `srs.test.ts`, `storage.test.ts`, `backup-io.test.ts`,
`media.test.ts`, `loss.test.ts`, `timezone.test.ts` (+ `helpers.ts`).

## 3. Decisões tomadas (registadas em `prd-project1-s2`, itens 1–11)

1. Conexão única compartilhada por store/backup/mídia (`openProgressLayer`).
2. Truncagem 2.000/180 dias, nunca toca tentativas abertas, roda na transação do envio.
3. Snapshot é a fonte de métrica; abstenção não inventa nem apaga nota.
4. Rascunho idempotente × submissão append-only (`duplicate_attempt` em reenvio).
5. SRS por tipo com primeira exposição e abstenção neutras; acerto não vencido não remarca.
6. Agregados com EMA de 14 dias, tendência só com histórico e confiança por volume; `bySkill`
   apenas com pesos injetados e `estimate: null`.
7. Backup: `replace` preserva log; `merge` por máximo/união; undo de um slot; quarentena add-only.
8. Exportação ignora registros ilegíveis do log (backup nunca depende do log).
9. Mídia em `ArrayBuffer` + metadados; quota só avisa (80/95/unknown).
10. Datas sempre locais; testes fixam `process.env.TZ` (São Paulo e Nova York/DST).
11. Cada teste usa `IDBFactory` e nome de DB próprios; relógio/quota injetáveis.

## 4. Pendências e bloqueios

- **Nenhum bloqueio.**
- `bySkill`/estimativa 10–90 ficam nulos até a calibração da Fase 8 (previsto no PRD central).
- UI de aviso de quota e de backup pertence às Fases 4/6; o pacote expõe os serviços prontos.
- Undo implementado como um slot (um nível); múltiplos níveis não estavam no escopo.
- `src/test/domain` passou de 128 para 130 testes durante o trabalho (alteração do agente irmão
  `s1-bank-import`); nenhum arquivo de domínio foi tocado por este pacote.

## 5. Mudanças necessárias fora do recorte (para o agente principal)

- Fases 4/7/8/9 devem consumir `@/lib/app` (não reimplementar IndexedDB/SRS/backup):
  `openProgressLayer()` → `{ db, store, backup, media }`; `store.submitAttempt(attempt, { questionType, canonicalId, errorCategories, reviewDay? })`;
  `backup.exportEnvelope/inspect/importState/undo/exportQuarantine`; `media.save/estimateQuota/list/delete`.
- Ajustes (Fase 4): ligar export/import/undo/quarentena e o aviso de quota à UI, com prévia antes de
  mesclar/substituir.
- Fase 8: injetar `skillWeights` derivados de `exam-spec` para ativar `bySkill`; manter
  `estimateBasis: "uncalibrated"` até calibração.
- Fase 11: usar `Snapshot.canonicalId` (já preservado pelo `mergeSnapshot`) nas métricas.
- Marcar a Fase 3 no roadmap central fica a cargo do agente principal (não marquei nada central).

## 6. Arquivos criados/alterados

Criados:
- `src/test/app/loss.test.ts`
- `src/test/app/timezone.test.ts`
- `.opencode/work/sub/fase-3/s2-progresso-local/report-s2-progresso-local.md`

Alterados (produção):
- `src/lib/app/db.ts` (wrap de erros IDB + `objectStoreNames`)
- `src/lib/app/storage.ts`
- `src/lib/app/srs.ts`
- `src/lib/app/backup-io.ts` (filtro de log ilegível + id de quarentena único)
- `src/lib/app/media.ts` (id único)
- `src/lib/app/index.ts` (`indexedDB` injetável na camada)

Alterados (testes/PRD):
- `src/test/app/helpers.ts`, `db.test.ts`, `srs.test.ts`, `storage.test.ts`,
  `backup-io.test.ts`, `media.test.ts`
- `.opencode/work/sub/fase-3/s2-progresso-local/prd-project1-s2` (decisões 1–11)
- `.opencode/work/sub/fase-3/s2-progresso-local/roadmap-proj1-s2` (F3.1–F3.8 `[x]` + gates)
