---
name: subagentes-3-pilares-oc
description: Planeja e executa enxames de subagentes usando o opencode (opencode run, instâncias paralelas) como executor, em que cada subagente recebe os 3 pilares centrais do projeto (planejamento, PRD, roadmap) mais os próprios 3 pilares. Use em todo remix de complexidade média/alta, sempre que o roadmap tiver trabalho divisível em pacotes paralelos, e antes de disparar qualquer instância do opencode. Cobre preparação do opencode com permissões allow, decomposição, pilares do subagente, system prompt, disparo paralelo, verificação e integração.
---

# Subagentes com 3 pilares (via opencode)

Objetivo: transformar o remix em produção paralela de verdade. Cada subagente (uma instância headless do opencode) sabe o TODO (pilares centrais) e tem o SEU recorte detalhado (3 pilares próprios), então entrega trabalho de nível de agente principal, não de "ajudante de tarefinha". O agente principal planeja, monta, dispara, verifica e integra. O opencode aqui é **executor**, nunca monitor.

Pré-requisito: os 3 pilares centrais já existem e estão coerentes entre si (regras do `plan.md`). Sem isso, não dispare nada.

**Obrigatoriedade:** esta skill não é opcional nem "para tarefas grandes". Em remix, TODA fase do roadmap é executada por ela (mínimo 1 subagente por fase). O agente principal não escreve código do produto; se o opencode falhar, conserte o opencode — nunca faça a fase à mão. Pasta padrão dos pacotes: `.opencode/work/sub/fase-{F}/{K}/` (pilares + `report-{K}.md`). Ao marcar a fase no roadmap central, inclua `Subagentes: fase-{F}/{K…} · reports: report-{K}.md`. Detalhes na "REGRA DE EXECUÇÃO" do `plan.md`.

## 0. Preparar o opencode (antes do primeiro spawn)

Sintaxe, flags e diretórios de agente mudam entre versões: confirme tudo em `opencode --help`, `opencode run --help` e na documentação da versão instalada. O que segue é o desenho, não um comando garantido.

1. **Instalado?** `opencode --version`. Se faltar, use a skill de instalação do ambiente.
2. **Permissões 100% em `allow`.** O agente principal não sabe responder a pedido de aprovação de uma instância filha: qualquer prompt de permissão trava o subagente para sempre. No `opencode.json` do projeto (e, se o projeto usar config global, também nela), deixe em `allow` tudo o que a versão oferece: no mínimo `edit`, `bash`, `webfetch`, `external_directory` e `doom_loop` (ou o curinga `"*": "allow"`, se suportado). Camada extra, se a versão suportar: variável de ambiente `OPENCODE_PERMISSION` com o mesmo JSON, definida no lançamento de cada instância. Se houver agentes customizados, a permissão deles também precisa estar em allow (a do agente prevalece sobre a global).
3. **Teste real, uma vez por projeto:** rode uma instância descartável que edite um arquivo de teste e execute um comando de shell, com timeout curto. Se pediu aprovação, travou ou negou algo, corrija a config e repita até passar sem nenhuma interação. Só então apague o arquivo de teste e siga.
4. **Isolamento mínimo.** Instâncias paralelas compartilham o mesmo diretório de trabalho: a proteção é a regra de dono exclusivo de arquivos (seção 3), portas/saídas distintas por subagente e git/instalação de dependências só pelo agente principal.

## 1. Decidir se e quanto paralelizar

Paralelize quando houver 2+ pacotes independentes de peso real (uma fase inteira, um módulo com testes, um lote de dados, uma bateria de verificação). Não dispare para: ajuste de poucas linhas, algo que bloqueia tudo e precisa de uma decisão só (faça você), ou pacotes que editam os mesmos arquivos (junte-os ou serialize).

Número de instâncias por onda = número de pacotes realmente independentes, sem teto fixo inventado. Cada instância consome memória, CPU e cota do provedor de modelo: se o ambiente ou o provedor sinalizar limite (processos mortos, erros de rate limit), reduza a onda e enfileire o excedente na seguinte.

## 2. Decompor o roadmap em pacotes

1. Liste o que está pendente no roadmap central (primeira fase não concluída em diante, e o que mais couber neste remix).
2. Desenhe o grafo de dependência: o que depende de quê.
3. Corte em **fatias verticais** (uma capacidade ponta a ponta: lógica + testes + UI daquele recorte), não em camadas horizontais ("todos os testes", "todo o CSS"), que geram acoplamento e retrabalho.
4. Cada pacote precisa ter:
   - **Dono exclusivo** de arquivos/pastas (dois pacotes na mesma onda nunca escrevem no mesmo arquivo; um arquivo aberto por duas instâncias é corrida certa).
   - **Entradas** (o que já deve existir) e **saídas** (o que passa a existir, com caminhos).
   - **Aceite verificável** (comando, teste, medição, checklist), não "ficar bom".
   - Tamanho para um agente trabalhar fundo: grande o bastante para valer o contexto, pequeno o bastante para fechar.
5. Agrupe em **ondas**: onda 0 (fundação/contratos, feita por você ou por um subagente de fundação), onda 1 (paralela), onda 2 (depende da 1) etc. Fatias que não dependem de nada entram já na onda 1.
6. Reserve para si as **costuras**: arquivos compartilhados (rotas, índices, manifestos, configs, tipos), integração e gates globais. Subagente não toca neles; pede por relatório. Também são só seus: git, instalação de dependências e qualquer comando global que mexa no estado compartilhado.

## 3. Contratos antes do paralelo

Tudo que mais de um pacote consome (tipos, interfaces, esquemas de dados, nomes de funções, convenções de pastas, constantes) é fixado ANTES da onda paralela, em arquivo real no código e descrito no PRD central. Subagentes implementam contra o contrato; se o contrato estiver errado, avisam no relatório em vez de improvisar uma variante própria.

## 4. Criar os 3 pilares de cada subagente

Pasta: `.opencode/work/sub/{K}/` (ou ao lado dos pilares centrais, se o ambiente usar outra). `{K}` = nome curto do pacote (ex.: `s1-persistencia`). Nomes:

`project{N}-s{K}` · `prd-project{N}-s{K}` · `roadmap-proj{N}-s{K}`

Mesmos papéis dos centrais, em escala de pacote. **Não copie** os centrais (o subagente já os recebe inteiros): referencie seções e detalhe o que o recorte exige. Qualidade acima de contagem de linhas: cada linha tem função; sem enchimento.

### 4.1 `project{N}-s{K}` — planejamento do subagente (≈ 15–60 linhas)
- **Missão** em 2–3 frases e como ela serve ao objetivo central (o todo que ele precisa ter em mente).
- **Escopo**: o que é dele; **fora do escopo**: o que é de outros pacotes (nomeie quais) e o que ele não pode tocar.
- **Por quê**: riscos/falhas que este recorte evita; princípios do planejamento central que mais pesam aqui.
- **Fronteiras**: o que recebe de quem (entradas/contratos) e o que entrega a quem (saídas).
- **Dono exclusivo de**: lista de arquivos/pastas.

### 4.2 `prd-project{N}-s{K}` — o COMO do subagente (≈ 60–250 linhas)
- **Decisões técnicas já tomadas** que ele deve seguir (recortes dos centrais com referência de seção) e o "jeito exato de fazer" do harness/projeto: convenções, estrutura, nomes, estilo de testes, comandos de gate, armadilhas conhecidas.
- **Contratos** que consome e produz (assinaturas, formatos, exemplos).
- **Escopo por fase** do pacote, com critérios de aceite mensuráveis.
- **Casos de borda e testes esperados** (o que ele deve provar, não só implementar).
- **Tools e skills do ambiente** recomendadas para cada tipo de trabalho do pacote.
- **Registro de decisões** do subagente (começa vazio; ele preenche, numerado).
- **Proibições** específicas (arquivos alheios, dependências novas, etc.).

### 4.3 `roadmap-proj{N}-s{K}` — fases do subagente (≈ 10–30 linhas)
Fases em ordem de dependência, checkboxes, uma linha de Gates por fase, gates finais do pacote. Ele marca `[x]` aqui conforme avança, com números reais.

## 5. Montar o system prompt (molde)

Para cada subagente, gere um **único arquivo de system prompt** concatenando as partes abaixo, nesta ordem, com os arquivos **na íntegra** (não resuma; se o tamanho for problema real, mantenha íntegros planejamento e roadmap centrais e o PRD central completo, e só então corte, nunca os pilares do subagente). Monte por script (`cat`/concatenação), nunca copiando à mão, para garantir que o conteúdo é exatamente o dos arquivos em disco.

```
# PAPEL
Você é o subagente {K} do projeto {N}. Você é executor completo do pacote "{nome}":
tem contexto do projeto inteiro e autonomia total dentro do seu escopo. Qualidade e
entrega verificada acima de velocidade.

# REGRAS
- Nunca pergunte ao usuário nem peça aprovação/confirmação de nada. Em dúvida, decida
  e registre no seu PRD (seção de decisões).
- Escreva somente nos arquivos listados como seus. Não edite pilares centrais nem de
  outros subagentes. Precisa de algo fora do seu recorte: registre no relatório final.
- Não dispare outro opencode nem outros subagentes. Não use git (commit, reset,
  checkout, clean, stash) nem instale dependências: isso é do agente principal.
  Nunca apague nem sobrescreva arquivos fora do seu escopo.
- Não marque o roadmap central, não finalize o remix, não avise o project-monitor.
- Siga os contratos exatamente. Contrato errado: não improvise, relate.
- Use as melhores tools e skills do ambiente para cada tipo de trabalho.
- Rode gates em porta e pasta de saída próprias ({PORTA}, {SAIDA}) para não colidir
  com outras instâncias. Só marque [x] com gates verdes e números reais.
- Se travar, entregue o que está sólido + relatório do bloqueio com evidência.
- Ao terminar, grave o relatório final em {PASTA}/report-{K}.md (formato abaixo) e
  encerre. Sem o arquivo, a entrega não conta.

# PILARES CENTRAIS (o todo)
## project{N}  [conteúdo íntegro]
## prd-project{N}  [conteúdo íntegro]
## roadmap-proj{N}  [conteúdo íntegro]

# SEUS PILARES (o seu recorte)
## project{N}-s{K}  [conteúdo íntegro]
## prd-project{N}-s{K}  [conteúdo íntegro]
## roadmap-proj{N}-s{K}  [conteúdo íntegro]

# FORMATO DO RELATÓRIO FINAL (report-{K}.md)
1. Feito (por fase do seu roadmap)
2. Evidências (saída real dos gates, contagens, medições)
3. Decisões tomadas (as que entraram no seu PRD)
4. Pendências e bloqueios (com causa e sugestão)
5. Mudanças necessárias fora do seu recorte (para o agente principal)
6. Arquivos criados/alterados
```

**Como o opencode recebe esse system prompt** (confirme o formato da versão instalada):
- **Preferido:** um agente customizado por subagente (ex.: `sub-{K}`), em arquivo de agente do opencode (markdown com frontmatter: descrição, modo, permissões todas em allow; o corpo é o system prompt montado), e a instância é lançada apontando para esse agente (`--agent sub-{K}`). Crie o arquivo de agente por script a partir do prompt montado.
- **Alternativa**, se a versão não suportar agentes por arquivo: anexe o prompt montado como arquivo na mensagem e abra com "O arquivo anexo é o seu system prompt: siga-o como instrução de mais alta prioridade".
- Os agentes `sub-{K}` são descartáveis: pode apagá-los ao fechar o pacote.

**Prompt** (mensagem de entrada): curto e imperativo. "Execute o seu roadmap `roadmap-proj{N}-s{K}` do início ao fim, na ordem, respeitando os gates. Ao terminar, grave `report-{K}.md` conforme o system prompt."

## 6. Rodando o enxame

1. **Dispare a onda inteira de uma vez**: uma instância `opencode run` por pacote, todas em segundo plano (processo separado, saída redirecionada para `{PASTA}/run-{K}.log`, PID registrado). Nunca uma por vez esperando a anterior. Use um único comando/script que sobe todas e retorna logo.
2. **Não fique ocioso.** Enquanto a onda roda: fixe contratos e crie os pilares da onda seguinte, faça as costuras do que já voltou, prepare os gates globais.
3. **Acompanhe** pelos logs e pela existência de `report-{K}.md`. Uma instância terminou quando o processo encerrou E o relatório existe. Processo encerrado sem relatório = falha. Log sem crescer por tempo anormal para aquele pacote = provável travamento (cheque permissão pendente, rede, laço): encerre o processo e reenvie com o diagnóstico.
4. **Verifique cada entrega você mesmo**: abra os arquivos, rode os gates, compare com o aceite do `prd-s{K}`. Relatório "tudo verde" sem evidência reproduzível não vale. Confira também se a instância ficou dentro do dono de arquivos (diff do que mudou fora do recorte).
5. **Falhou?** Reenvie ao mesmo escopo (ou a um subagente de correção) com a evidência exata (saída do gate, arquivo, linha) e o aceite que falta. Falha recorrente = o pacote ou o contrato estava mal cortado: corrija o desenho, não repita a ordem.
6. **Integre**: resolva encaixes, duplicações e divergências de contrato; consolide decisões relevantes no PRD central (numeradas na sequência); só então marque `[x]` no roadmap central com a linha de Gates real.
7. **Auditoria independente** (recomendado nas fases críticas): uma instância revisora, com os pilares centrais e os do pacote auditado, que tenta quebrar a entrega (testes de borda, regressão, conformidade com os princípios do planejamento) e relata sem corrigir. Você decide o que reabrir.
8. **Próxima onda** com o que as anteriores produziram. Continue enquanto houver avanço possível.

## 7. Fechamento do remix

- Terminou o roadmap: gates globais, relatório final e demais obrigações do `plan.md` (project-monitor, checagem de 5 min / 10 tentativas). Confirme que não sobrou nenhuma instância opencode rodando.
- Não coube tudo: deixe o roadmap central exato. Checkboxes fiéis, e uma linha **"Próximo remix: …"** com a primeira fase/pacote pendente, o estado de cada pacote em andamento (o que está pronto, o que falta, onde estão os pilares `-s{K}` e os relatórios) e qualquer decisão pendente de integração. Os pilares dos subagentes ficam em disco para reuso.
- O número N da mensagem ao project-monitor reflete as etapas do roadmap central efetivamente concluídas (verificadas), somando as das ondas.

## 8. Erros que anulam o ganho

- Permissão não configurada (ou só parcialmente): a instância trava esperando aprovação que ninguém dá. Teste antes do primeiro spawn.
- Pacotes minúsculos ("crie este componente"): o custo de contexto supera o ganho; agrupe em fatias verticais.
- Subagente sem os pilares centrais ou sem os próprios: volta a ser executor cego.
- Duas instâncias na mesma onda escrevendo no mesmo arquivo, usando a mesma porta ou a mesma pasta de build, ou contrato ainda indefinido quando o paralelo começa.
- Instância que mexe em git ou instala dependências no meio da onda, quebrando as outras.
- Disparo em série, um por vez, esperando; ou agente principal fazendo sozinho o que estava no plano de paralelizar.
- Aceitar relatório sem verificar; marcar `[x]` central sem gates reproduzidos.
- Subagente que dispara outro opencode, pergunta ao usuário ou edita pilar central.
- Encher pilares do subagente com cópia dos centrais ou linhas só para bater contagem.
