# Report — s1-bank-import (Fase 2, pacote s1-bank-import)

**Data:** 2026-10-20
**Escopo:** importação do banco de questões (2.823 itens · 22 tipos · 20 imagens) com integridade provada, manifesto derivado e loader lazy.
**Status:** B2.1–B2.5 entregues. Gates do pacote: **vitest 28/28 verde**, **manifesto idêntico ao do pacote**, **zero erros de tipo nos meus arquivos**. O `tsgo --noEmit` global segue vermelho por **1 erro em arquivo do `s2-progresso-local`** (`src/test/app/db.test.ts`), em edição concorrente — evidência e impacto na §4.

---

## 1. Feito (por fase do roadmap)

### B2.1 — Validar insumo
- Extração de `pte-question-bank.zip` para `/tmp/bank-import/pte-question-bank` (somente leitura).
- `node tools/validate-bank.mjs` → `ERROS (0)` / `OK — banco íntegro` (exit 0), com 6 AVISOS de faixa de palavras do próprio pacote (não são erros; não corrigi nada).
- `sha256sum -c CHECKSUMS.sha256` → 51/51 `OK` (exit 0).

### B2.2 — Copiar para o projeto
- `src/data/bank/questions/*.json` (22 arquivos) + `src/data/bank/aliases.json` + `src/data/bank/MANIFEST.json`.
- `public/di/*.png` (20 imagens do Describe Image).
- **Não** copiei `schema/`, `sources/`, `evidence/`, `reports/`, `tools/` (ficam no pacote; proveniência fina é Fase 11).
- Conferência byte a byte: dos 51 checksums do pacote, os **44 arquivos do recorte** (22 questions + 2 de topo + 20 imagens) foram recalculados já no destino → **0 divergências, 0 ausentes**. Os 7 restantes são fora do recorte (`schema/`, `tools/`, `sources/`, `evidence/`).

### B2.3 — Manifesto derivado por script
- `scripts/bank/build-manifest.mjs` (node puro, sem dependências): recontagem a partir dos arquivos copiados, validações estruturais e comparação 1:1 com `MANIFEST.json`.
- Gera `src/data/generated/manifest.json` (agregados) e `src/data/generated/index.json` (índice por item, lazy).
- Saída: `OK — manifesto derivado idêntico ao MANIFEST.json do pacote.`
- Determinismo provado: duas execuções seguidas produzem hashes idênticos (`sha256` de `manifest.json` = `d17332d4501e…`, de `index.json` = `172503bfce80…`).

### B2.4 — Loader lazy + testes
- `src/data/loader.ts`: API pública (`loadManifest`, `loadBankIndex`, `loadAliases`, `loadQuestionsByType`, `bankImageUrl`, `resetBankCache`) + validadores exportados (`parseBankManifest`, `parseBankIndex`) e `BANK_QUESTION_CHUNKS`.
- `src/test/bank/integrity.test.ts` (13 testes): arquivos copiados, 1:1 tipos × `@/domain`/`exam-spec`, execução real do script, contagens (total/tipo/seção/proveniência), anti-número-digitado, índice completo, `parseQuestions` nos 2.823 itens, ids únicos, imagens (licença, atribuição, existência, órfãs).
- `src/test/bank/loader.test.ts` (13 testes): 22 chunks como **funções** (prova de lazy, não inspeção de string), contagem por tipo do manifesto, tipo pequeno (`rts` 31) e gigante (`repeat_sentence` 682), cache por identidade, tipo inválido, manifesto coerente/cacheado, índice com `canonicalId = id` e seção derivada, `aliases` vazio, `bankImageUrl` (normalização e rejeição de traversal).
- `src/test/domain/bank-contract.test.ts` repontado de `/tmp/pteq/...` para o banco versionado (`join(process.cwd(), "src", "data", "bank")`). O `skipIf` antigo foi substituído por falha explícita quando o banco falta — auto-skip silencioso mascararia exatamente o gate desta fase.

---

## 2. Evidências (saída real)

### Gate de testes (o meu)
```
$ bunx vitest run src/test/bank src/test/domain/bank-contract.test.ts
 ✓ src/test/domain/bank-contract.test.ts (2 testes)
 ✓ src/test/bank/integrity.test.ts (13 testes)
 ✓ src/test/bank/loader.test.ts (13 testes)

 Test Files  3 passed (3)
      Tests  28 passed (28)
   Duration  1.41s
```

### Gate do manifesto
```
$ node scripts/bank/build-manifest.mjs
Banco: 2823 questões · 22 tipos · 20 imagens · 40 fontes (16 domínios)
Por seção: speaking 1538 · writing 132 · reading 241 · listening 912
Proveniência: verificada 74 · corroborada 207 · comunitaria 2542
Gerado: /dev-server/src/data/generated/manifest.json (d17332d4501e…)
Gerado: /dev-server/src/data/generated/index.json (172503bfce80…)
OK — manifesto derivado idêntico ao MANIFEST.json do pacote.
```
(exit 0; duas execuções consecutivas com hashes idênticos)

### Gate de tipos
```
$ bunx tsgo --noEmit
src/test/app/db.test.ts(22,27): error TS2339: Property 'objectStoreNames' does not exist on type 'ProgressDatabase'
count = 1

$ bunx tsgo --noEmit | grep -E "error TS" | grep -vE '^src/(lib|test)/app/'
(vazio — nenhum erro fora do pacote s2)
```
Meus arquivos (`src/data/loader.ts`, `src/data/bank/**`, `src/test/bank/**`, `scripts/bank/**`, `src/test/domain/bank-contract.test.ts`) **nunca** apareceram no relatório do `tsgo` em nenhuma execução. O erro remanescente é de `src/test/app/db.test.ts`, arquivo de `s2-progresso-local` (fora do meu recorte, não editado por mim) e mudou de conteúdo/arquivo ao longo da execução concorrente — sinal de trabalho em andamento, não de regressão minha.

### Contagens e tamanhos no destino
```
questions=22  top=2 (aliases + MANIFEST)  images=20
src/data/bank        2.5M
public/di            2.2M
src/data/generated   392K  (manifest.json 6.323 B · index.json 384.984 B)
aliases.json         2 B (objeto vazio, como no pacote)
```

### Validação do insumo
```
$ node tools/validate-bank.mjs
AVISOS (6): itens fora da faixa de palavras (stormedugo-read_aloud-025/045,
edknot-retell_lecture-006/010, band9-write_essay-041/042)
ERROS (0):
OK — banco íntegro.

$ sha256sum -c CHECKSUMS.sha256
51/51: OK
```

### Contrato entregue para a Fase 4
```ts
loadManifest(): Promise<BankManifest>
loadBankIndex(): Promise<BankIndex>
loadAliases(): Promise<Record<string, string>>
loadQuestionsByType(type: TaskType): Promise<Question[]>
bankImageUrl(file: string): string   // "/di/x.png" | "di/x.png" | "x.png" → "/di/x.png"
resetBankCache(): void               // utilidade de teste
BANK_QUESTION_CHUNKS: Readonly<Partial<Record<TaskType, Loader>>>
parseBankManifest(raw: unknown): BankManifest
parseBankIndex(raw: unknown, manifest: BankManifest): BankIndex
```
`BankManifest` = `{ format, version, generatedBy, source, totals:{questions,types,images,sources,sourceDomains,words}, byType, bySection, byProvenance, bySourceId, byDomain, images[] }`.
`BankIndexItem` = `{ id, type, section, domain, provenance, words }` (sem `canonicalId` no JSON; o parser preenche `canonicalId = id` enquanto `aliases.json` for vazio).

---

## 3. Decisões tomadas (registro no PRD do pacote)

1. **Imagens flat em `public/di/`** (e não `public/di/describe_image/`). O campo `data.image` do banco já é `/di/<arquivo>.png` e o README do pacote instrui cópia flat; criar subpasta exigiria reescrever dado aprovado. `bankImageUrl` recusa subpastas para evitar divergência silenciosa.
2. **Manifesto dividido em dois arquivos**: `manifest.json` (agregados, 6 KB) e `index.json` (por item, 385 KB, lazy). Mantém a Home/badge leves e deixa o catálogo/proveniência (Fases 4/11) carregarem o índice sob demanda. `parseBankIndex` exige `items.length === totals.questions`.
3. **Contagem por fonte usa `source.id`** (`bySourceId`, 40 chaves — bate com `itensPorFonte` do MANIFEST); **`byDomain`** (16) foi adicionado como métrica de independência de operador para a Fase 11, sem substituir a oficial.
4. **Mapa seção×tipo espelhado no script** com guarda de teste contra `SECTION_BY_TYPE` de `@/domain` (o script é `.mjs` puro e não importa TS).
5. **Anti-número-envelhecido com fronteira numérica** (`(?<![\w.])<count>(?![\w.])`): a primeira versão acusava falso positivo em `sha256` (`25`).
6. **`canonicalId` derivado no parser, não gravado**: `aliases.json` atual é `{}`; quando a Fase 11 popular aliases, o parser passa a resolver e as métricas já usam o campo.
7. **Cache de questões com remoção em falha**: promise rejeitada não envenena o cache; o erro de tipo inválido é `Promise.reject` (nunca `throw` síncrono), para o consumidor sempre poder usar `.catch`.
8. **`skipIf` removido do `bank-contract.test.ts`**: com o banco versionado, ausência deve falhar alto, não pular dois testes e produzir gate falso-verde.
9. **Nada de `schema/sources/evidence/reports` no app**: o app carrega só os JSON de questões + manifesto; `sources.json`/`corroboration.json` continuam no pacote (fora do bundle).

---

## 4. Pendências e bloqueios

1. **`tsgo --noEmit` global ainda não está limpo** — 1 erro em `src/test/app/db.test.ts(22,27)` (`objectStoreNames` em `ProgressDatabase`), arquivo do pacote `s2-progresso-local`. Não posso editar `src/test/app/**` (dono s2). Ação: s2 finalizar/corrigir e o agente principal rerodar o gate; meus arquivos já estão limpos.
2. **`vite build`, `eslint` e `vite dev` não rodados** por instrução explícita (agente principal). Consequência não verificada: o split real dos 22 chunks no bundle de produção (o teste prova que os valores são importadores dinâmicos, não o grafo final). Sugestão: no build da Fase 4, conferir que existem 22 chunks `questions/*.json` e que a Home não baixa nenhum.
3. **`src/data/generated/*` são artefatos gerados**: precisam ser versionados junto (o app os importa). Não há hook de build; se alguém editar `src/data/bank/**` sem rodar o script, `integrity.test.ts` acusa (o teste executa o script e compara com o MANIFEST). Recomendo ao agente principal adicionar `node scripts/bank/build-manifest.mjs` ao pipeline de build/testes (é `package.json`, fora do meu recorte).
4. **6 AVISOS de faixa de palavras** vêm do pacote e foram preservados (nada apagado/corrigido, §9). Não bloqueiam a importação; ficam registrados para a Fase 11 (qualidade editorial).
5. **`aliases.json` vazio** é o estado correto do pacote; `loadAliases()` devolve `{}`. Nenhuma quase-duplicata conhecida hoje.

---

## 5. Mudanças necessárias fora do meu recorte (para o agente principal)

- **`package.json`/CI:** rodar `node scripts/bank/build-manifest.mjs` antes de build/testes e versionar `src/data/generated/*`.
- **Fase 4 (catálogo/Home):** consumir `loadManifest()` para toda contagem exibida; nunca literais. `loadBankIndex()` só onde precisar de item/proveniência (evita baixar 385 KB na Home).
- **Fase 11 (proveniência/`canonicalId`):** ao popular `aliases.json`, o loader já resolve `canonicalId`; métricas devem agrupar por ele, não por `id`.
- **Fase 12 (offline):** o pré-cache precisa incluir `src/data/generated/*` e os 22 chunks de questões + `public/di/*.png` (20).
- **Gate global:** fechar o erro de `src/test/app/db.test.ts` (s2) e rerodar `tsgo --noEmit` para o gate de integração.
- **Documentação central:** PRD §5.1 já diz "imagens em `public/di/`" (correto); o texto do pacote s1-bank-import que citava `public/di/describe_image/` está desatualizado — este relatório é a fonte da decisão.

---

## 6. Arquivos criados/alterados

Criados (meus):
- `scripts/bank/build-manifest.mjs` (358 linhas)
- `src/data/loader.ts` (483 linhas)
- `src/test/bank/integrity.test.ts` (204 linhas, 13 testes)
- `src/test/bank/loader.test.ts` (166 linhas, 13 testes)
- `src/data/bank/questions/*.json` (22 arquivos, cópia fiel)
- `src/data/bank/aliases.json`, `src/data/bank/MANIFEST.json` (cópia fiel)
- `src/data/generated/manifest.json`, `src/data/generated/index.json` (gerados)
- `public/di/*.png` (20 imagens, cópia fiel)

Alterado (edição autorizada):
- `src/test/domain/bank-contract.test.ts` — `BANK_DIR` para o banco versionado + remoção do auto-skip.

Não tocados: `src/domain/**`, `src/routes/**`, `src/lib/**`, `.opencode/**` (exceto este report), `routeTree.gen.ts`, `package.json`, `src/styles.css`.
