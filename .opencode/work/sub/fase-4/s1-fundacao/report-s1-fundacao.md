# Relatório final — s1-fundacao (Fase 4, onda 0)

**Pacote:** s1-fundacao · **Onda:** 0 (contratos + shell) · **Data:** 2026-10-20
**Status:** concluído · **Gates do pacote:** verdes (evidência real abaixo, reexecutada nesta sessão)

> Observação de contexto: a execução anterior caiu por falha de rede **antes** do relatório.
> O código já estava no disco e foi confirmado pelo agente principal. Esta sessão **não reescreveu
> nem reverteu nada**: apenas reexecutou os gates do pacote, marcou o roadmap do subagente, registou
> as decisões no PRD do subagente e emitiu este relatório.

---

## 1. Feito (por fase do meu roadmap)

### F4.0.1 — Contratos compartilhados (dono exclusivo, consumidos pela onda 1)

- **`src/lib/app/settings.ts` (287 linhas)** — schema tipado único dos ajustes do aluno:
  `AppSettings { meta{targetScore, examDate}, practice{timersEnabled, timerScale},
  tts{enabled, voiceUri, rate}, studiePlus{enabled, word, sentence, pronunciation, mode} }`.
  - `DEFAULT_SETTINGS` congelado (`deepFreeze`), `studiePlus.enabled = false` (pack desligado por padrão).
  - `normalizeAppSettings(raw: unknown)` é a fronteira de confiança: nunca lança, aplica default por
    chave inválida, valida `examDate` como dia local (`isLocalDayKey`), clampa `rate` a 0.5–2.0,
    restringe `targetScore` a 50/58/65/79, `timerScale` a 1/1.5/2 e `mode` a `ai|offline`.
  - `readAppSettings(store)` / `updateAppSettings(store, patch)` com **merge profundo por seção**;
    chaves desconhecidas gravadas por outras fases são preservadas.
- **`src/lib/app/progress-client.ts` (135 linhas)** — singleton browser-only do progresso:
  `isProgressAvailable()`, `getProgressLayer()` (mesma Promise para todos os chamadores),
  `peekProgressLayer()`, `closeProgressLayer()`, `configureProgressClient()` (injeção para testes).
  Em SSR rejeita com `ProgressDbUnavailableError`; falha de abertura **não envenena** o singleton.
- **`src/lib/speech.ts` (178 linhas)** — TTS Web Speech API SSR-safe: `isSpeechAvailable()`,
  `listEnglishVoices()` (somente `en-*`), `onVoicesChanged()`, `speak()` devolvendo
  `{ cancel, voiceName }` com a **voz realmente usada**, `stopSpeaking()`, `speakWithSettings()`
  (integra `AppSettings["tts"]`), `DEFAULT_SPEECH_LANG = "en-GB"`.
- **`src/hooks/use-review-status.ts` (120 linhas)** — `useReviewStatus()` →
  `{ dueCount, loading, error, available, refresh }`; fonte é `store.getDueSnapshots(localDayKey())`
  (SRS da Fase 3), revalida em foco da janela, `visibilitychange` e evento global
  `pte:review-status-changed` (exportado com `notifyReviewStatusChanged()`).

### F4.0.2 — Shell, navegação e design system

- **`src/components/layout/`**:
  - `app-shell.tsx` (99) — header sticky com marca, nav desktop, badge de revisão, `<main id="conteudo">`,
    rodapé com nav secundária + aviso de honestidade ("estimativas de treino, não a nota oficial"),
    barra inferior mobile com safe-area, skip-link "Pular para o conteúdo".
  - `nav-items.ts` — `MAIN_NAV` / `MOBILE_NAV` / `SECONDARY_NAV` como dados (sem JSX, sem contagens
    do banco). "Praticar" **não** é item de menu: a prática começa pela escolha do tipo em `/catalogo`
    (a rota real é `/praticar/$type`, sem índice — um item `/praticar` seria link morto).
  - `nav-link.tsx` (92) — 3 variantes (desktop/mobile/footer), alvos ≥ 40 px desktop e ≥ 56 px mobile;
    rota ausente renderiza `span` desabilitado "em breve" em vez de link 404.
  - `use-resolved-path.ts` — resolve o caminho contra `router.routesByPath` em runtime (com variante de
    barra final), `isPathActive()`; resultado idêntico em SSR e cliente (route tree é estático).
  - `internal-link.tsx` (45) — `Link` tipado em runtime com um único cast justificado no ponto de uso;
    nunca navega para caminho não registrado.
  - `review-badge.tsx` (71) — três estados honestos: desconhecido (sem número), > 0 (contagem + link
    `/sessoes`), 0 ("Em dia", nunca o dígito solto); indisponível/erro → não renderiza.
  - `coming-soon.tsx` (99) — empty-state "em construção" com fase e descrição (usado pelas rotas-placeholder).
- **`src/routes/__root.tsx`** — `RootShell`/`RootComponent` preservados (`html lang="pt-BR" class="dark"`,
  `HeadContent`, `Scripts`, `QueryClientProvider`, `notFoundComponent`, `errorComponent`); apenas
  `<Outlet />` passou a ser envolvido pelo `AppShell` e `<Toaster />` (sonner) montado uma vez.
  `head()` da raiz com título/descrição/`og:type`/`twitter:card` próprios (sem "Lovable App").
- **`src/styles.css`** — tokens OKLCH do produto (fundo escuro calmo, `--primary` âmbar, `--success`
  semântico, `--font-serif: Fraunces`), dark como padrão. Nenhuma cor hardcoded nos componentes.

### F4.0.3 — Rotas-placeholder do §12 (com `head()` próprio)

- `src/routes/sessoes/index.tsx` — `/sessoes/` · "Sessões e fila de revisão".
- `src/routes/sessoes/$id.tsx` — `/sessoes/$id` · "Sessão de estudo".
- `src/routes/diagnostico.tsx` — `/diagnostico` · "Diagnóstico de erros".
- `src/routes/progresso.tsx` — `/progresso` · "Progresso e estimativa por habilidade".
- `src/routes/simulado.tsx` — `/simulado` · "Simulado cronometrado".

Todas com `title`, `description`, `og:title`, `og:description`, `og:type: website` e `twitter:card`,
conteúdo honesto (fase em que a área chega + o que entregará) e link de volta — sem simular função
inexistente. Presentes em `src/routeTree.gen.ts` (regenerado pelo plugin, **não editado à mão**).

### F4.0.4 — Testes do pacote

- `src/test/app/settings.test.ts` — 17 testes: defaults (Studie Plus inteiramente desligado, defaults
  congelados), normalização de entrada não confiável (lixo → defaults, nota fora da lista, `examDate`
  inválido, `timerScale` inválido, `rate` clampado, `mode` restrito, chave inválida não contamina as
  válidas), merge profundo e persistência real com `fake-indexeddb` (round-trip, merge de dois patches,
  valor inválido não derruba leitura, chaves desconhecidas preservadas).
- `src/test/app/progress-client.test.ts` — 5 testes: mesma Promise para todos os chamadores, reabertura
  após `close`, indisponibilidade injetada (`indexedDB: null`), rejeição clara sem pendurar, e falha que
  não envenena o singleton (nova tentativa funciona).

### F4.0.5 — Relatório

- Este arquivo, com gates reexecutados e contratos finais; roadmap do subagente marcado; decisões
  registadas em `prd-project1-s1`.

---

## 2. Evidências (saída real dos gates, nesta sessão)

```
$ bunx vitest run src/test/app/settings.test.ts src/test/app/progress-client.test.ts
 RUN  v5.0.3 /dev-server
 Test Files  2 passed (2)
      Tests  22 passed (22)
   Start at  19:28:24
   Duration  5.70s (environment 68%, setup 18%, transform 10%, import 3%, tests 1%, worker 1%)
```

```
$ bunx tsgo --noEmit > /tmp/tsgo-s1.log 2>&1; echo "TSGO_EXIT=$?"
TSGO_EXIT=0
$ wc -l /tmp/tsgo-s1.log
0 /tmp/tsgo-s1.log
```

Verificações complementares:

- Rotas em `src/routeTree.gen.ts`: `/diagnostico` (L25-26), `/progresso` (L30-31), `/simulado` (L35-36),
  `/sessoes/` (L40-41), `/sessoes/$id` (L45-46) — imports nas L13-17.
- Varredura de cores hardcoded (`bg-[#`, `text-white`, `bg-black`, `text-black`, hex) em
  `src/components/layout/*.tsx`, `src/routes/__root.tsx`, `src/routes/sessoes/*.tsx`,
  `diagnostico.tsx`, `progresso.tsx`, `simulado.tsx` → **0 ocorrências**.
- Badge: `dueCount === null` durante loading (nenhum "0" falso), `available: false`/`error: true` → `null`
  renderizado (badge oculto), verificado no código e coberto pelo contrato do hook.

---

## 3. Decisões tomadas (registadas em `prd-project1-s1`)

1. Normalização na fronteira (`unknown` → defaults por chave), nunca schema que lança — backup antigo
   não pode quebrar a tela.
2. Meta inicial `50` — a mais conservadora das metas típicas; a UI troca livremente.
3. `studiePlus.mode = "ai"` com `enabled: false` — o modo só vale depois de ligar o pack; evita um
   quarto estado "indefinido".
4. `examDate` como dia local `YYYY-MM-DD`, nunca timestamp UTC (horário de verão não desloca o dia).
5. `progress-client`: singleton de Promise com reset em falha; rejeição clara em SSR; degradação sem crash.
6. Badge de revisão em três estados honestos + revalidação por foco/visibilidade/evento global.
7. Shell integrado em `__root.tsx` preservando RootShell/RootComponent/providers/erros; só o `<Outlet />`
   é envolvido; `Toaster` montado uma vez.
8. Nav mobile fixa com alvos ≥ 44 px (≥ 56 px de fato) e skip-link; desktop horizontal; shell sem
   contagens do banco.
9. Rotas-placeholder honestas com `head()` próprio; estados "em breve" derivados do route tree em runtime.
10. `speech.ts` SSR-safe devolvendo a voz realmente usada (ou `null`), para a UI ser honesta sobre TTS.

---

## 4. Pendências e bloqueios

- **Nenhum bloqueio.** Todos os gates do pacote verdes na reexecução.
- **Não executados por desenho** (são do agente principal): `vite build`, `eslint`, `bun run dev`,
  Playwright no preview `:8080`. O código entregue não foi alterado nesta sessão.
- **Gates de UI** (badge em todas as telas, navegação desktop + 390×844) ficam para a verificação do
  agente principal no preview; o pacote entrega os componentes e os estados honestos testáveis por código.

---

## 5. Mudanças necessárias fora do meu recorte (para o agente principal)

1. **Itens de menu ainda "em breve"** — `/catalogo` (s3-catalogo), `/ajustes` (s4-ajustes) e a prática
   por tipo (`/praticar/$type`, s5-pratica) não existem ainda no route tree. O shell já lida com isso
   sem edição: `useResolvedPath` resolve em runtime e `NavLink` renderiza `span` desabilitado "em breve";
   assim que os pacotes criarem as rotas, o item vira link automaticamente — **nenhum pacote precisa
   editar `src/components/layout/**`**. Confirmar isso na integração (um rebuild regenera
   `routeTree.gen.ts` e o item passa a ativo).
2. **`/praticar` não tem índice por decisão de produto** (a prática começa no catálogo). Se o agente
   principal quiser um `/praticar` com lista, é preciso uma decisão de UX + rota nova — não é um bug
   do shell.
3. **`speakWithSettings`** existe como atalho para consumidores da onda 1; nenhum motor ainda o usa
   (Fase 6). Nada a fazer agora.
4. **`notifyReviewStatusChanged()`** deve ser chamado pelos pacotes que gravarem tentativas/importarem
   backup para o badge atualizar sem esperar o foco da janela (Fases 6–7).

---

## 6. Arquivos criados/alterados (meu recorte)

**Contratos**
- `src/lib/app/settings.ts` (novo, 287 linhas)
- `src/lib/app/progress-client.ts` (novo, 135)
- `src/lib/speech.ts` (novo, 178)
- `src/hooks/use-review-status.ts` (novo, 120)

**Shell / design system**
- `src/routes/__root.tsx` (integrado: AppShell + Toaster; restante preservado)
- `src/styles.css` (tokens OKLCH do produto)
- `src/components/layout/app-shell.tsx` (novo, 99)
- `src/components/layout/coming-soon.tsx` (novo, 99)
- `src/components/layout/internal-link.tsx` (novo, 45)
- `src/components/layout/nav-items.ts` (novo)
- `src/components/layout/nav-link.tsx` (novo, 92)
- `src/components/layout/review-badge.tsx` (novo, 71)
- `src/components/layout/use-resolved-path.ts` (novo)

**Rotas-placeholder**
- `src/routes/sessoes/index.tsx` (novo, 44)
- `src/routes/sessoes/$id.tsx` (novo, 59)
- `src/routes/diagnostico.tsx` (novo, 44)
- `src/routes/progresso.tsx` (novo, 44)
- `src/routes/simulado.tsx` (novo, 44)

**Testes**
- `src/test/app/settings.test.ts` (novo, 17 testes)
- `src/test/app/progress-client.test.ts` (novo, 5 testes)

**Governança do subagente**
- `.opencode/work/sub/fase-4/s1-fundacao/roadmap-proj1-s1` (checkboxes marcados + evidências)
- `.opencode/work/sub/fase-4/s1-fundacao/prd-project1-s1` (10 decisões registadas)
- `.opencode/work/sub/fase-4/s1-fundacao/report-s1-fundacao.md` (este relatório)

**Não editado:** `src/routeTree.gen.ts`, arquivos de outros pacotes (`index.tsx`, `catalogo.tsx`,
`ajustes.tsx`, `praticar/**`), `src/data/**`, `src/domain/**`, `src/lib/app/{storage,db,srs,backup-io,media}.ts`,
pilares centrais.
