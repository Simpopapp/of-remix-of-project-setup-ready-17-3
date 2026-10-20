---
name: opencode-swarm
description: Como rodar enxames de subagentes OpenCode de forma confiável e adaptativa — entender o ambiente atual, escolher concorrência por medição, detectar falhas, retomar em vez de refazer, verificar entregas e registrar aprendizados com evidência para a skill melhorar a cada rodada. Use sempre que uma fase/remix delegar pacotes a subagentes OpenCode (junto com a skill dos 3 pilares em .opencode/SKILL.md).
---

# Swarm OpenCode adaptativo

A skill dos 3 pilares (`.opencode/SKILL.md`) define O QUE cada subagente recebe. Esta define COMO operar o enxame. Ela não traz scripts prontos de propósito: o ambiente muda (versão do OpenCode, modelo, limites do provedor), e um script velho quebra calado. Escreva o mecanismo na hora, a partir do estado real, e teste antes de confiar nele.

Ordem de autoridade: **evidência medida nesta rodada > Registro de aprendizados abaixo > princípios > memória de treino**.

## 1. Reconhecer o terreno (sempre, antes de spawnar)
Descubra, não presuma:
- O runtime está de pé? (`/api/health` na porta configurada, processo, log). Sem prova em disco de um pedido mínimo, não spawne.
- Qual versão e quais comandos existem? (`opencode --help`, `opencode run --help`). Flags mudam entre versões: confira se há continuação de sessão, escolha de modelo e saída em formato estruturado.
- Qual modelo e provedor estão em `opencode.json`, e se existem alternativas gratuitas (`opencode models`).
- Qual é o estado de cada pacote: pilares presentes, report existe, arquivos do pacote já alterados, gates já verdes.

## 2. Escolher a concorrência medindo
O limite seguro depende do provedor naquele momento. Comece pelo valor do Registro (ou 1 se não houver), suba de 1 em 1 enquanto não aparecerem erros do provedor e desça na hora quando aparecerem. Anote o valor observado no Registro.

## 3. Mecanismo de execução (escreva na hora, teste em pequeno)
Escreva o próprio wrapper ou loop para a situação. Ele precisa cobrir:
- **Retry com espera crescente** só para falhas transitórias (provedor fora, timeout). Erros de lógica não se repetem cegamente.
- **Retomar, não refazer**: se a versão permitir continuar a sessão, continue-a. Se não, relance com "verifique o estado atual, complete o que falta, escreva o report".
- **Detectar travamento**: um log ou disco sem mudança por muito tempo conta como travado. Mate e retome.
- **Plano B de modelo**: depois de falhas repetidas do provedor, tente outro modelo disponível antes de desistir.
- **Critério de sucesso por artefato**: o report está salvo no arquivo esperado e os gates passam. Sair com código 0 não basta.
Teste o mecanismo num pedido mínimo antes de usá-lo nos pacotes.

## 4. Contrato com o subagente
- Prompt montado por script a partir dos arquivos reais (confira os nomes com `ls`, use delimitadores seguros no sed).
- Exija o report gravado em disco no caminho exato, com os números dos gates.
- Liste os arquivos exclusivos do pacote.

## 5. Verificação independente
Para cada entrega:
- Rode os gates você mesmo.
- Compare os arquivos alterados com a lista de arquivos exclusivos. Alteração fora do escopo vira reabertura.
- Confira se o que o report afirma bate com o disco.
Só então integre as costuras e marque `[x]` no roadmap central com a linha "Subagentes: …".

## 6. Fechar a rodada
Estado de cada pacote (entregue/verificado/pendente + motivo), aviso ao project-monitor conforme `.opencode/plan.md`, linha "Próximo remix: …" se sobrar trabalho.

## 7. Auto-aprimoramento (obrigatório ao fim de cada rodada)
Atualize o Registro abaixo e reaplique a skill:
- Adicione apenas aprendizados **com evidência** desta rodada (erro real, número medido, comando que funcionou ou falhou), datados.
- Confirmou um aprendizado antigo? Reforce ("confirmado em DATA"). Foi contradito? Corrija ou remova, sem guardar os dois.
- Uma regra que se mostrou útil em 2 ou mais rodadas sobe para as seções 1–6. Uma regra que nunca mais se aplicou sai.
- Mantenha o Registro curto (até cerca de 25 itens); junte os repetidos.

## Registro de aprendizados
- 2026-10-20: 5 instâncias simultâneas com `deepseek-v4.1-flash-free` → todas morreram com "Upstream request failed: Endpoint is unavailable", sem arquivos salvos. 2 simultâneas funcionaram (s2-home + s3-catalogo).
- 2026-10-20: um subagente caiu antes de escrever o report e perdeu o resumo, mas o código já estava em disco. Verificar o disco antes de relançar evitou refazer o trabalho.
- 2026-10-20: o binário não vinha pré-instalado; o instalador oficial deu a v1.19.3 em `~/.opencode/bin/opencode`; `opencode web --hostname 127.0.0.1 --port 4096` serviu `/oc`.
- 2026-10-20: os nomes dos pilares usam sufixo numérico (`project1-s2`); o sed com `/` no caminho quebrou, e usar `s|..|..|` resolveu.
- 2026-10-20 (não medido ainda): o limite real de concorrência entre 2 e 4; se `opencode run` tem continuação de sessão nesta versão; tempo médio por pacote.
