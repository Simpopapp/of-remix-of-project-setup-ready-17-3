# Relatório — s2-home (Fase 4, onda 1)

Status: **concluído** · Data: 2026-10-20 · Pacote: `s2-home` · Dono exclusivo respeitado.

## 1. Feito (por fase do meu roadmap)

### F4.1.1 — `buildDayPlan` pura + testes (ok)
- `src/lib/app/plano-do-dia.ts` (222 linhas):
  - contrato exato do PRD: `DayPlanInput { settings, dueCount, practiceBySection, todayKey }`,
    `DayPlanItem { kind: "review"|"practice"|"explore", title, description, href }`,
    `buildDayPlan()` **pura** (zero I/O, zero relógio, zero aleatoriedade).
  - Regra 1: `dueCount > 0` → primeiro item "Revisar N …" → `/sessoes`; `null` desconhecido **nunca**
    vira revisão falsa; `0`/negativo/`NaN` também não.
  - Regra 2: seção sem histórico → item "explorar" apontando a seção **menos coberta**
    (`leastPracticedSection`, empate na ordem oficial `SECTIONS`), destino `/catalogo`.
  - Regra 3: `examDate === null` → convite para `/ajustes`; **data já passada** → item pedindo
    atualização (decisão 2 do meu PRD).
  - Regra 4: nenhum texto cita estimativa/prontidão/nota prevista/desempenho (assert no teste).
  - Regra 5: `DAY_PLAN_MAX_ITEMS = 4`, ordem estável (mesma entrada ⇒ mesma saída).
  - Auxiliares puros e testados: `practiceBySectionFromSnapshots` (agrega tentativas do snapshot,
    fonte independente do log truncável; valores corrompidos → 0), `totalPracticeAttempts`,
    `leastPracticedSection`, `emptyPracticeBySection`, `SECTION_DISPLAY_NAMES`.
- `src/test/app/plano-do-dia.test.ts` (333 linhas): **24 testes** (antes 22; +2 nesta execução:
  "só aponta para destinos reais do produto" e "nomeia as quatro seções do exame").

### F4.1.2 — Home (`src/routes/index.tsx`, ok)
- `head()` próprio pt-BR: title único ("PTE Master Hub — Seu plano de estudo de hoje"),
  `description`, `og:title`, `og:description`, `og:type`, `twitter:card` — sem "Lovable App".
- Blocos: saudação + meta (nota alvo com rótulo "escala 10–90", data da prova formatada em pt-BR e
  contagem de dias), plano do dia, atalhos (Catálogo, Progresso, Ajustes), bloco "Neste dispositivo"
  (revisões vencidas, tentativas registradas, seções com histórico), bloco do banco com contagens do
  **manifesto**, rodapé de honestidade.
- Dados 100% locais lidos **só** em `useEffect` via `getProgressLayer()` + `readAppSettings` +
  `reviewQueue(snapshots, localDayKey())`; `isProgressAvailable()` decide o estado degradado. Nada de
  IndexedDB no render/SSR.
- Estados: `loading` (skeleton por bloco, `aria-busy`), `unavailable` (explicado, sem crash),
  `error` (explicado + "Tentar novamente"), `ready`. `aria-live="polite"` no plano.
- Revalidação em `focus`, `visibilitychange` e no evento global `REVIEW_STATUS_EVENT`.
- Nenhum número literal de contagem (usa `manifest.totals.questions/types` e `SECTIONS.length`);
  zero cor hardcoded; mobile-first (coluna única em 390 px, alvos `min-h-11` = 44 px ou mais).
- Ajustes desta execução (defeitos reais vistos em screenshot):
  1. selo "Em breve" saiu de irmão flex e passou para a linha do título (`ComingSoonChip`) — antes
     partia a descrição no meio em 390 px;
  2. `lg:items-start` no grid — antes o card do plano esticava vazio até a altura da coluna lateral;
  3. saudação por hora local ("Bom dia/Boa tarde/Boa noite") hidratação-safe (SSR "Olá" → efeito).

### F4.1.3 — Verificação final (ok)
- Gates do pacote verdes (ver §2). Nenhuma métrica inventada: Home só mostra fila SRS real,
  tentativas reais dos snapshots e contagens do manifesto; estimativa por habilidade aparece
  explicitamente como "ainda não disponível" (Fase 8).

### F4.1.4 — Relatório (este arquivo)

## 2. Evidências (saída real dos gates)

```
$ bunx vitest run src/test/app/plano-do-dia.test.ts
 RUN  v5.0.3 /dev-server
 Test Files  1 passed (1)
      Tests  24 passed (24)
   Duration  767ms
VITEST_EXIT=0
```

```
$ bunx tsgo --noEmit
TSGO_EXIT=0        # saída vazia (0 linhas) — projeto inteiro limpo
```

Verificações auxiliares (grep, sem build/dev):
- `rg -n --pcre2 "2823|2\.823"` e `rg -n --pcre2 "(?<![0-9.,])22(?![0-9.,])"` em `routes/index.tsx` e
  `plano-do-dia.ts` → exit 1 (nenhuma ocorrência): **nenhum** literal de contagem.
- `text-white|bg-black|bg-[#|text-[#` → **nenhuma** cor hardcoded.
- `process.env|localStorage|sessionStorage` nos meus arquivos → **nenhum** acesso direto fora da
  camada de progresso.
- `git status` → `src/routeTree.gen.ts` aparece modificado **somente por regeneração automática**
  (diff = +42 linhas, só as rotas dos irmãos `/ajustes` e `/praticar/$type`); nenhuma edição manual
  minha.

Verificação visual (preview :8080, ferramenta de screenshot, console sem erros):
- 1280×1000 (captura final, `/tmp/browser/agent-1792529441997.png`): título da página
  "PTE Master Hub — Seu plano de estudo de hoje", greeting "BOA NOITE · PTE ACADEMIC · PREPARO
  DIÁRIO", chips "EXPLORAR/PRÁTICA" na linha do título, card do plano sem esticamento,
  "2823 questões em 22 tipos" vindo do manifesto, atalho e item de menu "Ajustes" já resolvidos
  (sem "Em breve"), badge global "Em dia".
- 390×1250 (captura final, `/tmp/browser/agent-1792529483861.png`): coluna única sem overflow
  horizontal, selo do item ("EXPLORAR"/"PRÁTICA") dentro do bloco do título (quebra para a linha
  seguinte no mobile, nunca no meio da descrição), nav inferior com 4 destinos e alvos ≥ 44 px,
  badge "Em dia" visível.
- Caso "Em breve": enquanto `/ajustes` não resolvia no SSR, a captura em 390 px mostrou o selo
  "EM BREVE" na linha do título — comportamento esperado do `useResolvedPath`, sem link quebrado.
- Console do browser: apenas `[vite] connecting/connected` + aviso padrão do React DevTools —
  **zero erros**.

## 3. Decisões tomadas (registradas no meu PRD, §"Registro de decisões")

1. `SECTION_DISPLAY_NAMES` em vez de `SECTION_LABELS` — evita colisão de nome com o mapa do
   `catalogo.ts` (pacote s3) e mantém o plano desacoplado do catálogo.
2. Data da prova vencida gera item de Ajustes (o contrato só previa `examDate === null`; um plano
   que ignora prazo vencido fingiria planejamento).
3. Saudação por hora local só depois de montar (`useState("Olá")` + `useEffect`), nunca `new Date()`
   no render → sem mismatch de hidratação.
4. Destino ausente vira "Em breve" via `useResolvedPath`, nunca link quebrado (ondas paralelas);
   teste garante que todo `href` do plano ∈ {`/sessoes`, `/catalogo`, `/ajustes`}.
5. Selo "Em breve" dentro da linha do título (corrige quebra visual em 390 px).
6. `lg:items-start` no grid da Home (corrige card esticado em desktop).
7. Números exclusivamente do manifesto/domínio; nenhum literal de contagem.

## 4. Pendências e bloqueios

Nenhum bloqueio da entrega. Observação de ambiente (não é código):
- Durante a execução, `bunx tsgo --noEmit` falhou por ~1 min com **8 erros exclusivamente em arquivos
  de pacotes irmãos em edição concorrente** (`src/routes/ajustes.tsx` — s4; `src/routes/praticar/$type.tsx`
  — s5), porque `routeTree.gen.ts` ainda não tinha regenerado e `getProgressLayer/isProgressAvailable`
  ainda não eram reexportados. Nenhum erro nos meus arquivos. Depois que os irmãos estabilizaram,
  o gate voltou a `TSGO_EXIT=0` (evidência acima).
- O dev server em :8080 manteve por alguns minutos módulos SSR em cache (linhas `data-tsd-source`
  apontando para a versão anterior do `index.tsx`) e o **router instance** do SSR chegou a resolver
  `/ajustes` como ausente (a Home mostrava "Em breve" nesse atalho). É cache do processo, não do
  código: sem nenhuma intervenção, a captura final (20:50) já mostra `/ajustes` resolvido e
  `src/routeTree.gen.ts` contém `'/ajustes'` desde 20:47.

## 5. Mudanças necessárias fora do meu recorte (para o agente principal)

1. **Nada bloqueante.** O cache do router SSR que exibia "Em breve" em `/ajustes` durante a janela
   concorrente **já se resolveu sozinho**: nova captura em :8080 (20:50) mostra o atalho "Ajustes"
   ativo, sem selo "Em breve", e o badge global "Em dia" — nenhum restart é necessário.
2. **Verificado, sem ação:** `src/routes/ajustes.tsx` (s4) passou a importar
   `getProgressLayer`/`isProgressAvailable` de `@/lib/app/progress-client` (e só o *tipo*
   `ProgressLayer` de `@/lib/app`); `@/lib/app/index.ts` **não** reexporta `progress-client` por
   desenho (é módulo browser-only). O erro de tipos da janela concorrente está resolvido — `tsgo`
   global em exit 0.
3. **Build/lint/Playwright globais** são do agente principal (não rodei `vite build`, `bun run dev`
   nem `eslint` por regra do pacote).
4. `src/routeTree.gen.ts` não foi editado por mim (regenerado pelo plugin ao surgirem as rotas dos
   irmãos, como esperado).

## 6. Arquivos criados/alterados

Meus (dono exclusivo):
- `src/lib/app/plano-do-dia.ts` — contrato `buildDayPlan` + auxiliares puros; rename de
  `SECTION_LABELS` → `SECTION_DISPLAY_NAMES` com justificativa.
- `src/routes/index.tsx` — Home completa; greeting hidratação-safe; `ComingSoonChip` na linha do
  título; `lg:items-start`; head() próprio; estados loading/unavailable/error/ready; contagens do
  manifesto.
- `src/test/app/plano-do-dia.test.ts` — 24 testes (2 novos: destinos reais + rótulos das seções).
- `.opencode/work/sub/fase-4/s2-home/prd-project1-s2` — registro de decisões 1–7.
- `.opencode/work/sub/fase-4/s2-home/roadmap-proj1-s2` — checkboxes F4.1.1–F4.1.4.
- `.opencode/work/sub/fase-4/s2-home/report-s2-home.md` — este relatório.

Fora do meu recorte: nada editado. Nenhuma dependência instalada, nenhum comando git de escrita.
