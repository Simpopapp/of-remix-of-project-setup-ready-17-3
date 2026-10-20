# Monitor — Remix Fase 4 (fundação web)

**Data:** 2026-10-20
**Papel:** Project Monitor (read-only, exceto este relatório)
**Veredito:** concluída
**Confiança da avaliação:** alta

## Reconhecimento de receção

Recebido. Remix finalizado com +1 etapa (Fase 4). Os três pilares centrais foram confirmados e são a fonte autoritativa:

1. `.opencode/project1` — populado (23 937 bytes), autoritativo.
2. `.opencode/prd-project1.md` — presente.
3. `.opencode/roadmap-proj1` — presente, Fase 4 marcada `[x]`, Fase 5 `[ ]`.

O duplicado `.opencode/project1.md` é nulo por desenho e **não** conta como pilar em falta. Nenhuma ação de implementação, alteração de roadmap, git write, build/typecheck, instalação ou leitura de segredos foi executada por este monitor. Este ficheiro é o único artefacto escrito.

## Resumo executivo

A Fase 4 está substancialmente entregue e a evidência independente sustenta o estado declarado. Os seis pacotes da onda 4 existem em `.opencode/work/sub/fase-4/` com relatórios reais, e a linha de subagentes/reports no roadmap central corresponde a ficheiros auditáveis. Os gates finais são coerentes entre si: 388 testes verdes, eslint 0 erros/6 warnings preexistentes, harness build OK e 10 rotas com 200/título único/sem pageerrors. A persistência de meta 65 e data 2026-12-15 está comprovada pelo backup exportado (`export.json`), não apenas pelo relato do agente principal.

## Cobertura de requisitos vs. roadmap central

Requisitos da Fase 4: rotas do PRD §12 com `head()` próprio; catálogo com contagens derivadas; Home/plano do dia; badge de revisão global; Ajustes (meta, prova, timers, TTS, backup, privacidade); shell de prática; Playwright desktop + 390×844.

- **Atendido:** rotas `/`, `/catalogo`, `/ajustes`, `/diagnostico`, `/progresso`, `/simulado`, `/sessoes`, `/sessoes/$id`, `/praticar/$type` existem no disco e responderam 200 no preview. Títulos únicos observados nas 10 rotas verificadas. `head()` por rota documentado nos reports e confirmado pelos títulos recolhidos.
- **Atendido:** catálogo derivado do manifesto, com validação e testes sintéticos (s3).
- **Atendido:** Home e plano do dia puros/testados, sem números inventados (s2).
- **Atendido:** badge global de revisão com estados honestos (desconhecido/0/>0) e indisponibilidade sem crash (s1).
- **Atendido:** Ajustes com meta, data local, timers, TTS com voz real, backup com prévia/mesclar/substituir/desfazer/quarentena, quota e privacidade (s4).
- **Atendido:** shell de prática `/praticar/$type`, validação de tipo, timers derivados do `exam-spec` e slot de motor honesto para a Fase 6 (s5).
- **Atendido:** integração de lint sem mudança de comportamento; 21 ficheiros, +226/−181, apenas formatação e um `prefer-const` (s6).
- **Parcial (não bloqueante):** verificação móvel 390×844 foi feita em 4 rotas representativas (`/`, `/catalogo`, `/ajustes`, `/praticar/describe_image`), não nas 10. O requisito diz "rotas tocadas"; a amostra cobre as superfícies críticas, mas não é exaustiva.

## Auditoria dos pacotes da Fase 4

| Pacote | Report real | Estado | Observação do monitor |
|---|---|---|---|
| s1-fundacao | `report-s1-fundacao.md` | concluído | Contratos, shell, TTS, badge e placeholders presentes; gates reexecutados e reportados. |
| s2-home | `report-s2-home.md` | concluído | `buildDayPlan` pura, 24 testes; ajustes de screenshot documentados. |
| s3-catalogo | `report-s3-catalogo.md` | concluído | 17 testes; route tree regenerado pelo gerador oficial, não editado à mão. |
| s4-ajustes | `report-s4-ajustes.md` | concluído | Backup/quarentena/quota com testes reais; observação de dev server antigo foi resolvida na verificação final. |
| s5-pratica | `report-s5-pratica.md` | concluído | 49 testes de timers; observação de preview pendente resolvida (`/praticar/describe_image` 200). |
| s6-integration | `report-s6-integration.md` | concluído | Escopo estritamente lint; build/typecheck/browser explicitamente fora do pacote e assumidos pelo principal. |

A linha do roadmap central ("Subagentes: fase-4/... · reports: ...") aponta para os seis reports existentes. Rastreabilidade adequada.

## Evidência independente consultada

- `/tmp/remix-vitest-final.log` — 26 ficheiros, **388 testes passaram**, 0 falhas, execução com `--maxWorkers=2`, 43,20 s.
- `/tmp/remix-eslint-verified.log` — **0 erros, 6 warnings** (`react-refresh/only-export-components` em `src/components/ui/*`, preexistentes).
- `/tmp/observability/build-errors.log` — `build OK` às 21:07:06Z, 21:11:06Z e 21:14:02Z (o último após o pacote s6).
- `/tmp/browser/remix/final-results.txt` — 10 rotas com status 200, títulos distintos, `overflow: false` no desktop; 4 verificações móveis `False` (sem overflow); `ERRORS []`.
- `/tmp/browser/remix/export.json` — backup real com `meta.targetScore: 65` e `meta.examDate: "2026-12-15"`, `studiePlus.enabled: false`.
- `/tmp/browser/remix/settings-readback.png` e `desktop.png`/`mobile-*.png` — capturas dos estados verificados.
- Código real: rotas e ficheiros de teste existem; `git status` limpo e sem escrita de git pelo monitor.

## Discrepâncias e lacunas menores

1. **Meta/data na evidência textual:** `final-results.txt` mostra o input de data vazio no momento da captura; a persistência é provada por `export.json` (65 / 2026-12-15) e pela captura de readback. Sem contradição real, apenas evidência fragmentada.
2. **tsgo pós-s6:** os pacotes s2/s3/s5 correram `tsgo --noEmit` limpo; após a formatação do s6 (que incluiu uma troca `let`→`const`) não há registo explícito de novo `tsgo`. Risco baixo, mas é o único gate genérico do roadmap sem confirmação posterior ao último edit.
3. **Flakiness de testes:** o roadmap regista um timeout de carga na execução irrestrita, verde no rerun com `--maxWorkers=2`. É transparente, mas indica sensibilidade a paralelismo/ambiente.
4. **Cobertura móvel parcial:** 4 de 10 rotas em 390×844. Suficiente para as superfícies críticas, não exaustivo.
5. **Warnings de lint:** 6 warnings preexistentes de `react-refresh` ficaram fora do escopo declarado; não são erros nem regressões.

## Qualidade e riscos para a próxima etapa

- **Pontos fortes:** separação limpa de propriedade por pacote; s6 não misturou correção de lint com comportamento; reports com evidência de comandos e contagens; estados de UI honestos (sem métricas inventadas); progresso local sem contas, coerente com o PRD.
- **Risco para a Fase 5:** a avaliação por IA exige ativação do Lovable Cloud e desenho de consentimento/antivazamento. O estado atual de progresso local não deve ser convertido em contas ou backend de aluno. Nenhum serviço de IA foi ativado nesta rodada, como declarado.
- **Dívida técnica menor:** warnings de UI, possível flakiness de vitest e o gate tsgo não reexecutado após s6. Nenhum bloqueia a Fase 5.

## Recomendações

1. Antes de iniciar a Fase 5, correr uma única vez `tsgo --noEmit` global para fechar formalmente o gate após o s6 (sem alterar código).
2. Manter `--maxWorkers=2` (ou equivalente) nos gates de integração até estabilizar a carga do ambiente.
3. Na Fase 5, garantir teste de antivazamento e consentimento antes de qualquer chamada real; manter 100% do progresso local e sem contas.
4. Alargar a verificação móvel às restantes rotas apenas se a Fase 5 tocar os respetivos layouts; não é pré-requisito para avançar.

## Fase 5

Não iniciada. Permanece `[ ]` no roadmap central. Requer ativação do Lovable Cloud para chamadas de IA; o progresso do aluno deve continuar local e sem contas. Nenhuma evidência de backend/IA criada nesta rodada.
