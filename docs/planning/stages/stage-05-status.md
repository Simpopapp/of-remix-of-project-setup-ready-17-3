# Stage 05 — serviço de IA seguro e harness

Status: partial
Date: 2026-10-21

## Fontes canônicas
- `.opencode/project1`, `.opencode/prd-project1.md`, `.opencode/roadmap-proj1`.
- O planejamento deste projeto está nesses pilares, não em cópias PRD/ROADMAP sob docs.

## Entregas e provas
- Oito pacotes com três pilares e reports em `.opencode/work/sub/fase-5/`.
- Rubricas 22 tipos, schema, retry restrito, cache por modelo, referências server-only, consentimento e antivazamento.
- s6 consertou protocolo SDK 7; s7 guardas de saída/áudio; s8 removeu calibração pública e limitou rajadas por instância.
- Independente: 36 arquivos, 642 passed/1 opt-in skipped; eslint src 0 erros/6 warnings preexistentes; harness build OK 2026-10-21 00:48:13 UTC; recheck segurança/gateway 41/41 após correções de narrow.
- Browser localhost: consentimento começa desligado, autorização/revogação persistem após reload. RPC sem consentimento retorna abstained/null. Uma chamada real WFD consentida retornou scored/0, duas dimensões listening/writing measured, identidade openai/gpt-6-astra/judge-policy@2/rubric@1. Gateway HTTP 200, log 01a15bee-cd62-702f-9f4b-e9d0f8f9542b, 9,4 s, 0,20582 créditos. Zero pageerrors.
- Captura do consentimento vista pelo principal em `/tmp/browser/f5-evaluation/consent.png`. Prática ainda é shell Fase 4, sem submissão UI (Fase 6): não alegar E2E treino→nota verificado.
- Drizzle migrations sem SQL copiado; journal entries=[]; dados pessoais permanecem locais.

## Pendências e limites
- Consistência real por tipo e revisão das notas de referência do corpus ainda não verificadas. Um smoke WFD não é calibração dos 22 tipos; Fase 5 segue `[ ]`.
- Só uma chamada paga nesta verificação final; orçamento anunciado de no máximo duas chamadas não autoriza varredura automática de 44 itens.
- IDs desconhecidos de dimensão não validados contra rubrica (s7 registrou fixtures legadas incompatíveis); guardas de áudio cobrem IDs pronunciation/prosody, não aliases arbitrários.
- Antivazamento é literal/normalizado, não semântico; verificar independemente retenção de eco dividido entre campos, prefixos/sufixos e campos maiores que teto da varredura. Não presumir que testes verdes equivalem a segurança absoluta.
- Consentimento é declaração, não autenticação; limite por instância é volátil, não teto financeiro global. Nenhuma credencial ou referência em logs de aplicação.

## Pedido ao monitor
Remix finalizado (+5 parcial). Confirmar recebimento e avaliar entregas contra pilares, reports e código; escrever `docs/planning/reports/stage-05-eval.md` com veredito próprio e achados acionáveis. Não implementar nem editar roadmap, não chamar IA real nem rodar builds/typechecks manuais, não operar git. O smoke não permite marcar calibração concluída.

## Reabertura e verificação final — 2026-10-21 01:15 UTC
- Monitor entregou veredito parcial; seu report original está preservado para rechecagem.
- s7 retomado pela mesma sessão e com pilares ampliados fechou achados 1–4: retenção de leak agora descarta todas dimensões/evidências/unmeasured; campo individual ou soma textual acima de 20k retém inteiro; filtro de distintividade removido; dimensão audio-only reconhecida por aliases/labels provoca needs_review inteiro mesmo com content measured. Fluência canônica measured vira proxy.
- Dois testes antigos de guardas alinhados à política legítima mais conservadora (sem preservar evidência no leak); 10 regressões adicionais. Todos os acessos a reviewReason têm guards de união.
- Verificação independente final: 36 arquivos, 652 passed/1 skipped; eslint src 0 erros/6 warnings; harness build OK 2026-10-21 01:14:39 UTC. Logs de execução em /tmp/f5-final-security-tests.log e /tmp/f5-final-security-lint.log.
- Sem nova chamada paga após alterar somente guardas; gateway/consentimento não mudaram. Smoke anterior verifica RPC real, não envio UI nem calibração.
- Residual honesto: alegações de áudio exclusivamente em feedback/rationale sem nenhuma dimensão audio-only, aliases gerais de fluência/IDs arbitrários e paráfrase de referência não têm proteção semântica geral. Calibração 22 tipos depende de orçamento acima do smoke autorizado e revisão externa de notas.
- Pedido final: atualizar avaliação com rechecagem focada dessas correções, confirmar recebimento e manter veredito próprio (Fase 5 continua parcial). Nenhum código, testes, roadmap ou chamada IA pelo monitor.