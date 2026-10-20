# Relatório — s4-ajustes (Fase 4, onda 1)

**Data:** 20/10/2026
**Pacote:** s4-ajustes — página `/ajustes`, backup/restauração, quota, privacidade, Studie Plus (controles)
**Status:** entregue com gates verdes; 1 observação de integração (dev server em execução com tabela de rotas antiga).

---

## 1. Feito (por fase do roadmap)

### F4.3.1 — Estrutura da página + seções Meta/Timers/TTS/Studie Plus
- `src/routes/ajustes.tsx`: `createFileRoute("/ajustes")` com `head()` próprio em pt-BR (title,
  description, og:title, og:description, og:type, twitter:card), shell responsivo (`max-w-4xl`),
  estados `loading` (skeletons), `unavailable` (sem IndexedDB) e `error` (abriu e falhou), ambos com
  texto explícito de que **nada foi apagado**.
- Dados do navegador somente em `useEffect`/eventos; `getProgressLayer()` (singleton) nunca fechado no
  unmount; `readAppSettings` no boot; `updateAppSettings` por seção com indicador discreto
  "Salvando…/Ajustes salvos…" (`role=status`) e toast honesto em falha.
- **Meta:** seletor 50/58/65/79 (`TARGET_SCORES`), `<input type="date">` com `YYYY-MM-DD` local,
  normalização de entrada inválida → sem data, texto da data por extenso.
- **Timers:** `timersEnabled` + escala 1×/1,5×/2×; escala desabilitada quando timers off, com nota de
  que o simulado ignora esses ajustes.
- **TTS:** `isSpeechAvailable()`, `listEnglishVoices()` + `onVoicesChanged()`, seleção por
  `voiceUri` (com opção "Automática" e voz salva ausente marcada), `rate` 0,5–2 com rascunho local e
  commit em `pointerup/keyup/blur`, botão "Ouvir exemplo em inglês" que informa a voz **realmente**
  usada (`SpeakHandle.voiceName`) ou diz que nada foi falado. Sem voz → explicação honesta do serviço
  de voz do navegador (sem simular pronúncia).
- **Studie Plus:** master `enabled` desligado por padrão + três controles independentes
  (`word`/`sentence`/`pronunciation`) e modo `ai`/`offline`; controles preservados quando o pack está
  off; nota visível de que os recursos completos chegam na Fase 10 e que offline é preferência
  guardada (pacote local é recurso futuro).

### F4.3.2 — Backup, restauração, desfazer e quarentena
- **Exportar:** `backup.exportJson()` → download local via `Blob`/`createObjectURL`
  (`downloadTextFile` com guarda de SSR), nome `pte-master-hub-backup-YYYY-MM-DD.json` (dia local).
  Texto explica o escopo do envelope (snapshots, agregados, ajustes, até 500 tentativas) e que
  **áudio não entra no JSON**.
- **Importar:** `<input type="file" accept=".json">` → `file.text()` → `inspectBackupFile` →
  **prévia obrigatória** (contagens, versão/migração, criado em, dispositivo, questões novas,
  compartilhadas, melhores notas, conflitos de tipo). Nenhuma escrita antes da prévia.
- **Mesclar / Substituir:** mesclar aplica direto; substituir exige confirmação em segundo toque com
  texto de risco. Resultado mostra contagens reais (`snapshotCount`, `attemptCount`) e oferece
  **Desfazer** apenas quando `undoId !== null`; sem slot, a tela diz que não há como desfazer.
- **Quarentena:** lista de resumos (`listQuarantine`), exportação do payload cru
  (`exportQuarantine`), aviso "somente leitura", selo de versão futura; nunca há ação de apagar nem de
  "consertar" o arquivo. Estados `quarantined`/`failed` são explícitos e afirmam que o progresso
  local permanece.
- **Armazenamento:** `media.estimateQuota()` + `media.totalBytes()` com barra `role=progressbar`,
  bytes legíveis, nível `ok/warn/critical/unknown` (80 %/95 %) e conselhos honestos; "Atualizar
  informação" relê. Quota desconhecida nunca é disfarçada de "ok".

### F4.3.3 — Privacidade/processamento externo + erros honestos
- Seção estática em pt-BR: progresso 100 % local; IA recebe somente o mínimo por endpoints seguros;
  nenhuma chave no navegador; processamento externo explicado antes do primeiro uso; é possível
  estudar sem enviar respostas; áudio local e enviado só quando há avaliação de fala; TTS é o serviço
  do navegador. Sem jargão interno ("Supabase"/"Cloud"/"endpoint").
- Erros de importação preservam o arquivo e explicam o próximo passo; falha do serviço vira mensagem
  clara (nunca sucesso silencioso).

### F4.3.4 — Testes (`src/test/app/ajustes.test.ts`, 20 testes)
- `buildSettingsPatch`: escreve só a seção presente; preserva meta/tts/practice/studiePlus;
  velocidade clampada (0,1→0,5; 9→2); voz em branco → `null`; data inválida → `null`.
- `defaultsPatch`: volta aos padrões com **Studie Plus desligado**; `normalizeAppSettings(null)` nasce
  com os três recursos off.
- Máquina de importação (serviço fake): válido → `preview` **sem** chamar `import`; inválido →
  `quarantined` com `import(..., {strategy:"merge", saveUndo:false})`; vazio → `failed` sem chamadas;
  aplicar sem prévia → `failed`; mesclar → `imported` com `undoAvailable`; `undoId:null` → aviso;
  desfazer ok e "sem undo"; exceção do serviço → `failed` com a mensagem real.
- Integração real (`BackupIo` + `fake-indexeddb`): exportar → inspecionar → mesclar (2 snapshots,
  local preservado, ajustes importados) → desfazer (volta a 1 snapshot); JSON ilegível → quarentena,
  snapshots idênticos, `exportQuarantine` devolve o payload cru; envelope `version: 999` →
  `future_version`/`future:true`, sem undo e sem alterar snapshots.
- Formatos: `describeInspection`, `inspectionHighlights` (migração/novas/mescladas/melhor nota/
  conflito e lista vazia quando nada é digno de nota), `formatBytes`, `formatPercent`,
  `backupFileName` (sanitização), `formatDayKey`, `levelFromEstimate`.

### F4.3.5 — Relatório
- Este arquivo, com gates reais abaixo.

---

## 2. Evidências (gates reais)

```
$ bunx vitest run src/test/app/ajustes.test.ts
Test Files  1 passed (1)
     Tests  20 passed (20)

$ bunx tsgo --noEmit
exit:0        (projeto inteiro, sem saída de erros)

$ bunx vitest run
Test Files  26 passed (26)
     Tests  385 passed (385)

$ bunx eslint src/routes/ajustes.tsx src/components/settings src/test/app/ajustes.test.ts
(sem saída — 0 erros, 0 warnings)
```

- `src/routeTree.gen.ts` **não** foi editado à mão; contém `Route as AjustesRouteImport` e
  `id: '/ajustes'` gerados pelo plugin.
- Nenhuma dependência adicionada.
- Arquivos fora do recorte não foram alterados (consumo apenas de `@/lib/app`, `@/lib/speech`,
  `@/domain`, `@/components/ui`).

---

## 3. Decisões tomadas (registradas em `prd-project1-s4`)

1. `TtsDraft` inclui `enabled` — sem isso o interruptor de voz não teria efeito no patch.
2. Slider de velocidade com rascunho local e commit em `pointerup/keyup/blur` (evita N gravações).
3. Importação em duas etapas com prévia obrigatória; "substituir" pede confirmação adicional.
4. Arquivo inválido vai à quarentena via `import(..., {saveUndo:false})` — único caminho que grava o
   cru sem tocar no estado; `importState` não é chamado.
5. `onDataChange` no backup para reler ajustes/quota após importar/desfazer (sem contrato novo).
6. Quarentena somente leitura (sem apagar/corrigir), com exportação do payload cru.
7. Estados `unavailable` e `error` separados, ambos afirmando preservação dos dados.
8. Zero rede na página; exportação via `Blob` com guarda de SSR.
9. Exemplo de TTS sempre em inglês e informando a voz real; sem voz, não finge áudio.
10. Não fechar a camada singleton no unmount; apenas `mountedRef` para evitar `setState` após saída.

---

## 4. Pendências e bloqueios

1. **Verificação visual em `/ajustes` não foi possível nesta sessão** (causa: o dev server em execução
   em `:8080` mantém a tabela de rotas carregada antes da criação do arquivo).
   - Evidência: `curl -o /dev/null -w "%{http_code}" http://localhost:8080/ajustes` → `404`;
     `/`, `/catalogo`, `/progresso` → `200`; `src/routeTree.gen.ts` já contém `id: '/ajustes'`.
   - Sugestão: reiniciar o Vite (ação do agente principal). Depois, um screenshot desktop + 390×844
     confirma a página. Não reiniciei o servidor por ser fora do meu escopo.
2. **Nada mais bloqueado.** `tsgo` do projeto fechou em 0 após correções de terceiros; a suíte
   completa passou.

---

## 5. Mudanças necessárias fora do recorte (agente principal)

1. Reiniciar o dev server para servir `/ajustes` (route tree já regenerado).
2. Na integração das ondas, conferir que `MAIN_NAV` resolve `/ajustes` (hoje `use-resolved-path`
   marca "em breve" apenas por causa da tabela de rotas antiga do processo).
3. Fase 10: os controles de Studie Plus já persistem (`enabled`, `word`, `sentence`,
   `pronunciation`, `mode`); a implementação dos cards e da matriz tipo×campo×fase deve ler essas
   chaves sem renomeá-las.
4. Fase 5: a explicação de processamento externo já existe em `/ajustes`; o consentimento de envio
   pode referenciar esta seção.

---

## 6. Arquivos criados/alterados

Criados:
- `src/routes/ajustes.tsx`
- `src/components/settings/ui.tsx`
- `src/components/settings/settings-patch.ts`
- `src/components/settings/format.ts`
- `src/components/settings/import-flow.ts`
- `src/components/settings/download.ts`
- `src/components/settings/settings-sections.tsx`
- `src/components/settings/backup-section.tsx`
- `src/components/settings/storage-section.tsx`
- `src/test/app/ajustes.test.ts`

Alterados (do próprio pacote):
- `.opencode/work/sub/fase-4/s4-ajustes/roadmap-proj1-s4` (checkboxes + gates reais)
- `.opencode/work/sub/fase-4/s4-ajustes/prd-project1-s4` (registro de decisões)
- `.opencode/work/sub/fase-4/s4-ajustes/report-s4-ajustes.md` (este relatório)
