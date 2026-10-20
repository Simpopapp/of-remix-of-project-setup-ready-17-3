# Relatório — s5-pratica (Fase 4, onda 1)

**Pacote:** `s5-pratica` · shell genérico de prática `/praticar/$type`
**Data:** 2026-10-20
**Estado:** entregue; gates do pacote verdes; render no preview :8080 pendente de reinício (ver §4)

---

## 1. Feito (por fase do roadmap do pacote)

### F4.4.1 — `timerForType` puro + testes com specs reais do `exam-spec` ✅

- `src/lib/app/practice-timer.ts` (264 linhas, zero I/O, zero React):
  - `timerForType(type, spec, settings)` converte `preparationSeconds`/`responseSeconds` do
    `exam-spec` em ms, com escala de treino (`timerScale`), e devolve:
    `{ preparationMs, responseMs, adjustable, responseKind, enabled, scale }`.
  - `shared_section` e `until_audio` → `responseMs: null` + `responseKind` honesto (nunca `0 s`).
  - `timersEnabled: false` → `enabled: false`, `adjustable: false`, tempos preservados.
  - `adjustable` só é `true` quando existe contagem que a escala altera.
  - `timerForType` lança se `spec.id !== type` (erro de dados, não estado de tela).
  - `findExamTaskSpec(type)` estrito; `examTaskSpecFor(raw: string)` tolerante para `head()`/URL.
  - Máquina de estados determinística: `initialTimerState`, `startTimer`, `pauseTimer`,
    `resetTimer`, `tickTimer(state, spec, deltaMs)`, `timerProgress`, `startsIn`.
  - Formatação pt-BR: `formatDuration` (45 s / 1 min / 1 min 30 s) e `formatCountdown`
    (arredonda para cima; nunca mostra 0 s antes de zerar).
- `src/test/app/practice-timer.test.ts` (343 linhas, **49 testes**), incluindo:
  - cobertura exata dos 22 tipos do contrato, com `EXAM_TASKS` sem sobra/falta;
  - 4 formatos reais: preparação+resposta (`describe_image` 25/40), resposta sem preparação
    (`repeat_sentence` 15), `until_audio` (`read_aloud`), `shared_section` (`wfd`);
  - escrita longa (`swt` 10 min, `write_essay` 20 min);
  - escalas 1×/1,5×/2× e cronômetro desligado;
  - máquina de estados (transição preparação→resposta, restante nunca negativo, pausa/retomada,
    preparação sem resposta fixa encerra, tipo sem contagem fica `unavailable`);
  - contrato da rota (`head` válido/inválido e `beforeLoad` aceitando os 22 tipos, rejeitando
    slug inventado/vazio).

### F4.4.2 — Rota `/praticar/$type` ✅

- `src/routes/praticar.$type.tsx` (arquivo plano, mesmo path `/praticar/$type`):
  - `beforeLoad` valida o parâmetro com `examTaskSpecFor`; tipo desconhecido → `notFound()`
    (404 do root). Nenhum tipo inventado é renderizado.
  - `head()` próprio por tipo: `title` "Praticar <Nome pt-BR> — PTE Master Hub", description com
    nome oficial + seção, `og:title`, `og:description`, `og:type: article`, `twitter:card`.
    Para slug inválido, `noindex` defensivo (a rota nem chega a renderizar).
  - loader usa o mesmo `manifestQuery` do catálogo (`staleTime: Infinity`), com
    `pendingComponent` próprio (skeleton mobile-first).
  - componente: `PracticeTaskHeader` + `PracticeEngineSlot` + `PracticeTimerBar` +
    `TaskSpecCard`; grade de uma coluna no mobile (ficha primeiro) e duas no desktop
    (`lg:grid-cols-[minmax(0,1fr)_340px]`).
  - `timerSpec` derivado de `timerForType` + Ajustes; guarda `isTaskType(spec.id)` fecha a
    fronteira `string` do `exam-spec` antes do contrato da Fase 6.
- `src/routeTree.gen.ts` **não foi editado**. O gerador registrou a rota:
  linhas 53–54 (`id: '/praticar/$type'`, `path: '/praticar/$type'`), linha 75 no union.

### F4.4.3 — Estrutura `src/components/practice/**` pronta para a Fase 6 ✅

- `task-header.tsx` (96): nome pt-BR + inglês, seção, tarefas na prova, itens no banco
  (do `CatalogEntry`), selo "Pesos aproximados" quando `weightsApproximation`.
- `task-spec-card.tsx` (150): ficha do formato (seção, tarefas, preparação, resposta com
  explicação do tipo de janela, limite de conteúdo, habilidades, itens no banco, notas oficiais,
  revisão humana da Pearson quando aplicável, data de consulta das fontes). Nada digitado:
  tudo de `EXAM_TASKS`/`EXAM_META`/`EXAM_SOURCES`.
- `timer-bar.tsx` (309): demonstração rotulada do tempo do tipo. Contagem com delta real de
  relógio (250 ms), pausar/retomar/zerar, transição automática preparação→resposta,
  `aria-live` para início/fim (o relógio não é anunciado a cada tique), `progressbar` com
  `aria-valuenow`, aviso honesto quando os Ajustes não puderam ser lidos, link condicional
  para `/ajustes` (nunca link morto).
- `engine-slot.tsx` (85): `PracticeEngineSlot` com `data-practice-engine={type}` e
  `data-practice-engine-state="pending"`; estado honesto "chega na Fase 6", sem pergunta fake,
  sem campo morto, sem botão "Enviar"; aviso específico quando o tipo não tem itens aprovados.
- `use-practice-settings.ts` (58): lê `settings.practice` só em `useEffect` (SSR-safe), com
  `status: loading | ready | unavailable | error`; sem IndexedDB usa `DEFAULT_SETTINGS` e avisa.
- `spec-format.ts` (79): rótulos/formatação da ficha (nº de tarefas, preparação, janela de
  resposta, habilidades, data de consulta).
- `index.ts` (9): barrel do pacote.

### F4.4.4 — Relatório ✅

- Este arquivo, com evidências reais dos gates abaixo.

---

## 2. Evidências (saída real dos gates)

### Gate 1 — `bunx vitest run src/test/app/practice-timer.test.ts`

```
 RUN  v5.0.3 /dev-server
 Test Files  1 passed (1)
      Tests  49 passed (49)
   Duration  1.14s
```

### Gate 2 — `bunx tsgo --noEmit`

```
tsgo exit=0
(saída vazia — 0 linha em /tmp/tsgo-s5.log)
```

### Extra — suíte completa (estado do repo no momento da entrega)

```
 Test Files  26 passed (26)
      Tests  388 passed (388)
   Duration  5.03s
```

### Extra — eslint nos arquivos do pacote

```
eslint exit=0
```

### Extra — contrato da rota exercitado em teste (não só typecheck)

`head({params:{type:"wfd"}})` → título com "Escuta: escrever a partir do ditado" e description
com "Listening"; `head({params:{type:"nao_existe"}})` → `robots: noindex`; `beforeLoad` não lança
para os 22 `TASK_TYPES` e lança para `"nao_existe"`/`""` (3 testes em §F4.4.1).

### Contagens derivadas (nenhum literal)

- Tarefas na prova: de `spec.scoredTasksInExam` (`formatTaskCount`, ex. "6–7").
- Itens no banco: `deriveCatalog(manifest)`, `Intl.NumberFormat("pt-BR")`, com selo de
  cobertura limitada do próprio catálogo.
- Tempos/limites/habilidades: `EXAM_TASKS`; data de consulta: `EXAM_SOURCES`.

---

## 3. Decisões tomadas (registradas no `prd-project1-s5`)

1. `TimerSpec` aditivo: mantém os 3 campos exigidos e acrescenta `responseKind`, `enabled`,
   `scale` para a UI rotular sem adivinhar.
2. `adjustable` só quando existe contagem; `timersEnabled: false` mantém tempos visíveis.
3. `timerForType` lança em par tipo/spec divergente; `examTaskSpecFor` tolerante para URL.
4. Máquina de estados pura no lib, alimentada por delta real de relógio (não "1 tick = 1 s").
5. Cronômetro é **demonstração** rotulada, não tentativa avaliada.
6. Ajustes lidos só em `useEffect`, com status explícito; degradação honesta sem IndexedDB.
7. Link para `/ajustes` condicional via `useResolvedPath` (onda irmã s4).
8. Rota em arquivo plano `src/routes/praticar.$type.tsx` porque a pasta nova
   `src/routes/praticar/` não foi observada pelo watcher do dev server desta sessão; o arquivo
   plano foi capturado pelo gerador. Nenhuma edição manual do `routeTree.gen.ts`.
9. Ficha e `head` derivados do `exam-spec`; nenhum tempo/limite/contagem digitado.
10. Componentes só com `Badge`/`Button`/`Skeleton`/lucide já existentes; zero cor hardcoded.

---

## 4. Pendências e bloqueios

1. **Preview :8080 não recarregou o route tree (bloqueio de verificação, não de código).**
   O dev server em execução desde 20:40:14 não emitiu HMR após o `routeTree.gen.ts` ser
   regenerado às 20:47:24. Como consequência, `GET /praticar/wfd` e `GET /ajustes` retornam
   **404** no preview atual — inclusive `/ajustes` é uma rota da onda irmã (s4), o que confirma
   que é o processo do preview que está com o tree antigo, não a rota nova. `/catalogo` segue 200.
   *Sugestão:* reiniciar o preview uma vez ao fim da onda (ação do agente principal; este pacote
   não roda `dev`/`build`). Depois disso, validar `/praticar/wfd`, `/praticar/describe_image`,
   `/praticar/read_fib_dropdown` e `/praticar/nao-existe`.
2. **Render visual não observado nesta sessão** pela mesma causa do item 1. Typecheck, testes de
   contrato da rota e registro no route tree estão verdes; a validação visual (Playwright) fica
   para o gate da Fase 4.
3. **Sem motor (por escopo).** A tela não pratica ainda: o slot aponta a Fase 6, sem simular
   pergunta/resposta. Nenhum gabarito, resposta-modelo ou transcrição oculta é carregado.
4. **Tipos sem conteúdo aprovado** exibem o aviso no slot e "Sem conteúdo aprovado" no cabeçalho,
   mantendo o motivo no catálogo — nenhum item inventado.
5. **`exam-spec.ts` tipa `id` como `string`.** A rota protege com `isTaskType`; se o dono do
   contrato (s1) quiser, tipar `id: TaskType` elimina o guard defensivo.

---

## 5. Mudanças necessárias fora do meu recorte (para o agente principal)

1. **Reiniciar o preview :8080** para carregar `/praticar/$type` e `/ajustes` (route tree novo).
   Sem isso, ambas as rotas novas respondem 404 no preview, apesar de estarem no tree.
2. **Catálogo (s3):** com a rota registrada, `useResolvedPath("/praticar/$type")` passa a resolver
   e os cards deixam de mostrar "Prática em breve". Convém confirmar visualmente no catálogo.
3. **Playwright da Fase 4** nas rotas tocadas: `/praticar/describe_image` (preparação+resposta),
   `/praticar/read_aloud` (`until_audio`), `/praticar/wfd` (`shared_section`), slug inválido → 404,
   desktop + 390×844 (alvos ≥ 44 px, timer legível).
4. **Fase 6:** consumir `timerForType`/máquina de estados de `@/lib/app/practice-timer` e
   substituir o conteúdo de `PracticeEngineSlot` mantendo `data-practice-engine`.
5. **Opcional (s1):** tipar `ExamTaskSpec.id` como `TaskType` (hoje `string`).
6. **Observação de ambiente:** o watcher do Vite nesta sessão não reagiu à criação de pasta nova em
   `src/routes/`; reiniciar o preview no início de ondas que criem diretórios de rota evita 404
   fantasma durante a onda.

---

## 6. Arquivos criados/alterados

Criados:

- `src/lib/app/practice-timer.ts`
- `src/test/app/practice-timer.test.ts`
- `src/components/practice/spec-format.ts`
- `src/components/practice/task-header.tsx`
- `src/components/practice/task-spec-card.tsx`
- `src/components/practice/timer-bar.tsx`
- `src/components/practice/engine-slot.tsx`
- `src/components/practice/use-practice-settings.ts`
- `src/components/practice/index.ts`
- `src/routes/praticar.$type.tsx`
- `.opencode/work/sub/fase-4/s5-pratica/report-s5-pratica.md` (este arquivo)

Alterado (gerado pelo router plugin, nunca à mão):

- `src/routeTree.gen.ts` (registro de `/praticar/$type`)

Pilar atualizado:

- `.opencode/work/sub/fase-4/s5-pratica/prd-project1-s5` (registro de decisões 1–10)
- `.opencode/work/sub/fase-4/s5-pratica/roadmap-proj1-s5` (checkboxes F4.4.1–F4.4.4)

Nada fora do recorte foi editado. A pasta temporária `src/test/app/__tmp-pratica-route.test.ts`
usada para validar a rota foi removida após mesclar os testes no arquivo do pacote.
