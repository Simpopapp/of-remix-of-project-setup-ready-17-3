# Relatório final — s3-catalogo (Fase 4, onda 1)

**Pacote:** s3-catalogo · **Data:** 2026-10-20 · **Pilares locais:** `project1-s3`, `prd-project1-s3`,
`roadmap-proj1-s3` (todos em `.opencode/work/sub/fase-4/s3-catalogo/`).

## 1. Feito (por fase do meu roadmap)

### F4.2.1 — `deriveCatalog` + nomes pt-BR + testes (concluído)
- `src/lib/app/catalogo.ts` (novo): `SPARSE_COUNT_THRESHOLD = 60`, `TASK_DISPLAY_NAMES` (22 tipos,
  formato `"English — Português"`), `CatalogEntry`/`CatalogSection`/`CatalogSummary`,
  `practiceHref`, `isComingSoon`, `deriveCatalog`, `groupCatalog`, `summarizeCatalog`,
  `officialTaskNames`.
- `deriveCatalog` valida o manifesto (ordem `EXAM_TASK_ORDER`, cobertura dos 22 tipos, seção correta
  por `SECTION_BY_TYPE`, contagem/palavras inteiros ≥ 0) e falha com `Catálogo inválido: …` em vez de
  exibir número errado.
- `src/test/app/catalogo.test.ts` (novo): 17 testes com manifesto **sintético** (nenhum literal do
  banco real), cobrindo cobertura exata, ordem, derivação de contagem/palavras, limiar `sparse`,
  `isComingSoon`, `href`, agrupamento/soma por seção, nomes ancorados em `EXAM_TASKS`, integração com
  o manifesto real e um smoke SSR da rota.

### F4.2.2 — Página `/catalogo` (concluída)
- `src/routes/catalogo.tsx` (novo): `head()` próprio pt-BR (title, description, og:title/og:description,
  og:type, twitter:card), sem contagem literal; loading por `queryOptions` + `ensureQueryData` no loader
  + `useSuspenseQuery` + `pendingComponent` (skeleton); tiles de resumo (tipos, questões, palavras,
  cobertura limitada), âncoras de seção, cards por tipo com contagem/palavras derivadas
  (`Intl.NumberFormat("pt-BR")`), badge `Cobertura limitada` quando `sparse`, aviso `Em breve` para
  `count === 0`, link de prática com fallback honesto `Prática em breve` quando `/praticar/$type` ainda
  não existe, alvos ≥ 44 px (`min-h-11`), layout mobile-first.
- `src/routeTree.gen.ts`: regenerado pelo **gerador oficial** (`@tanstack/router-generator`), não
  editado à mão — ver §4.

### F4.2.3 — Gates (verdes)
- `bunx vitest run src/test/app/catalogo.test.ts` → 17/17 passed.
- `bunx tsgo --noEmit` → exit 0.

### F4.2.4 — Relatório + decisões
- Este arquivo; 10 decisões registadas em `prd-project1-s3`; `roadmap-proj1-s3` marcado 100%.

## 2. Evidências (saída real dos gates e contagens)

```
$ cd /dev-server && bunx vitest run src/test/app/catalogo.test.ts
 RUN  v5.0.3 /dev-server
 Test Files  1 passed (1)
      Tests  17 passed (17)
   Duration  3.34s

$ cd /dev-server && bunx tsgo --noEmit
EXIT=0
```

Regeneração do route tree (após o erro `TS2345` de `/catalogo` não estar em `FileRoutesByPath`):

```
$ bun /tmp/s3/generate-route-tree.mjs     # Generator({config, root}).run() de @tanstack/router-generator
route tree generated
$ grep -n "catalogo" src/routeTree.gen.ts | head
13:import { Route as CatalogoRouteImport } from './routes/catalogo'
26:  id: '/catalogo',
27:  path: '/catalogo',
58:  '/catalogo': typeof CatalogoRoute
```

Verificação de derivação no SSR real (manifesto do banco, `/tmp/s3/catalogo-ssr.html`):

| Seção | Total exibido | Soma dos tipos no `manifest.json` |
|---|---|---|
| Speaking | 1.538 | 340+682+20+62+378+25+31 = 1.538 |
| Writing | 132 | 53+79 = 132 |
| Reading | 241 | 41+50+50+50+50 = 241 |
| Listening | 912 | 58+50+53+50+50+50+50+551 = 912 |
| **Total** | 2.823 | `manifest.totals.questions` = 2.823 |

- `Cobertura limitada`: 16 cards (tipos com `count < 60`) + 1 rótulo no resumo — coerente com o
  manifesto (describe_image 20, rts 31, sgd 25, sst 58, swt 53, lst_fib 53, read_fib_dropdown 41 e os
  demais tipos em 50).
- Cabeçalho SSR: `<title>Catálogo de tarefas do PTE Academic — PTE Master Hub</title>`,
  `og:type=website`, `twitter:card=summary`, description sem número fixo.
- Auditoria de literais em `src/routes/catalogo.tsx`: `grep -nE "[0-9]{2,}"` retorna apenas classes
  Tailwind, `h-3 w-24`, contagem de skeletons e o comentário "44 px" — **nenhuma contagem/total do
  banco**. O limiar aparece na UI vindo da constante `SPARSE_COUNT_THRESHOLD`.

## 3. Decisões tomadas (registadas em `prd-project1-s3`)

1. Limiar `sparse` = 60 (`SPARSE_COUNT_THRESHOLD`), política de honestidade — não regra do exame.
2. `status` mantém exatamente `"available" | "sparse"`; "sem conteúdo" vem de `isComingSoon` (`count === 0`).
3. Nomes pt-BR em mapa local, com teste que exige conter `name`/`namePt` de `EXAM_TASKS` (anti-drift).
4. `groupCatalog` agrupa pela ordem de aparição em `EXAM_TASK_ORDER` (sem segunda lista de seções).
5. `deriveCatalog` valida o manifesto e lança `Catálogo inválido: …` (falha alto, não exibe errado).
6. `href` `/praticar/<type>`; `<Link>` só quando a rota existe (`useResolvedPath`), fallback honesto
   `Prática em breve`; um único cast documentado (`DynamicLink`).
7. Manifesto por `queryOptions` + `ensureQueryData` + `useSuspenseQuery` (SSR-friendly, sem `useEffect`-fetch).
8. `head()` sem contagem literal; todos os números derivados em runtime.
9. Smoke test de SSR da rota, tolerante aos dois estados do link de prática.
10. `routeTree.gen.ts` regenerado pelo gerador oficial, nunca editado à mão.

## 4. Pendências e bloqueios

- **Bloqueio resolvido (F4.2.3):** `tsgo` falhava com
  `src/routes/catalogo.tsx(54,38): error TS2345: Argument of type '"/catalogo"' is not assignable to
  parameter of type 'keyof FileRoutesByPath | undefined'`. Causa: o dev server em execução subiu antes
  da rota existir e não regenerou `src/routeTree.gen.ts`. Solução: rodar o gerador oficial
  (`@tanstack/router-generator` → `getConfig` + `new Generator({config, root}).run()`) a partir de
  `/tmp/s3/generate-route-tree.mjs`. Gate passou a exit 0.
- **Pendência (fora do meu gate, do agente principal):** o dev server atual (pid 242) continua
  servindo `GET /catalogo` → **404**, porque mantém o route tree antigo em memória e já apresenta erros
  `Error: aborted` no log. Precisa de reload/restart do preview (ou `vite build` + preview) para a rota
  aparecer em `:8080`. Prova de que a página funciona sem isso: o smoke test de SSR renderiza
  `/catalogo` com `RouterProvider` + `renderToString` (heading, seção e card presentes).
- **Pendência de integração (esperada, não é bug):** a rota `/praticar/$type` pertence ao pacote
  s5-pratica e ainda não existe; por isso os cards mostram `Prática em breve`. Assim que a rota entrar
  no route tree, `useResolvedPath` resolve e o card passa a renderizar `<Link>` — o teste SSR aceita os
  dois estados de propósito.

## 5. Mudanças necessárias fora do meu recorte (para o agente principal)

1. **Reiniciar/republicar o dev server** (`:8080`) para carregar o `routeTree.gen.ts` regenerado e
   servir `/catalogo`; hoje retorna 404 apesar do arquivo correto.
2. Confirmar na integração que `src/routeTree.gen.ts` regenerado inclui apenas rotas reais do disco
   (index, diagnostico, progresso, simulado, sessoes, catalogo) — foi gerado com o gerador oficial, sem
   edição manual.
3. Quando s5-pratica criar `/praticar/$type`, nada a mudar no catálogo: o link ativa sozinho. Se o
   agente principal quiser um estado “em breve” centralizado por tipo, isso é Fase 11.
4. Fase 11 (fora de escopo aqui): selo de proveniência por item, filtro “só verificadas” e SEO dinâmico
   com contagens por rota — o catálogo já expõe `deriveCatalog`/`summarizeCatalog` prontos para consumo.

## 6. Arquivos criados/alterados

| Arquivo | Ação |
|---|---|
| `src/lib/app/catalogo.ts` | criado (derivação pura do catálogo + nomes pt-BR + agrupamento/resumo) |
| `src/test/app/catalogo.test.ts` | criado (17 testes: 16 puros + 1 smoke SSR) |
| `src/routes/catalogo.tsx` | criado (página `/catalogo` com `head()` próprio) |
| `src/routeTree.gen.ts` | regenerado pelo gerador oficial (não editado à mão) |
| `.opencode/work/sub/fase-4/s3-catalogo/prd-project1-s3` | decisões 1–10 registadas |
| `.opencode/work/sub/fase-4/s3-catalogo/roadmap-proj1-s3` | F4.2.1–F4.2.4 marcados com evidências |
| `/tmp/s3/generate-route-tree.mjs` | script temporário de regeneração (fora do worktree) |

Nenhum arquivo de outro pacote foi tocado (`index.tsx`, `ajustes.tsx`, `praticar/**`, `src/data/**`,
`src/domain/**`, testes alheios e pilares centrais intactos). Nenhuma dependência adicionada.
