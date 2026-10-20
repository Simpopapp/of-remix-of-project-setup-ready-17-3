Protocolo dos 3 arquivos (planejamento → PRD → roadmap)

O trabalho agentico de remix é guiado por 3 arquivos (N = 1 neste projeto; com ou sem extensão `.md`, é o mesmo arquivo):

| Arquivo | Papel |
|---|---|
| `project{N}` | Planejamento: o QUÊ e o POR QUÊ (falhas, direção, ordem lógica ou idealização do projeto). Fonte de verdade do escopo. |
| `prd-project{N}` | PRD: o COMO. Decisões técnicas, escopo por fase, critérios de aceite. |
| `roadmap-proj{N}` | Roadmap: fases em ordem de dependência, checkboxes e gates. Registro de progresso. |

### O que fazer, conforme o que existe (a ordem de criação dos arquivos não importa, mas todos devem existir e serem preenchidos e seguidos conforme as necessidades do projeto)
- **Os 3 existem:** execute o roadmap, a partir da primeira fase não concluída.
- **2 existem:** crie o que falta e depois execute.
- **1 existe:** crie os outros 2 (ordem: planejamento → PRD → roadmap) e depois execute.
- **Nenhum existe:** informe o project-monitor e em seguida o usuário (a proxima mensagem do usuário deve ser imediatamente colada em project{N} substituindo o "null")
- **NULL** "null" demarca a não existencia (nesse caso a prioridade é preenche-lo e registrar através do project monitor que aguarda a atualização de um dos arquivos para iniciar o projeto). é obrigatorio confirmar que o agente leu a mensagem
*(use o project-monitor apenas pra 2 finalidades, apenas avisar quando algum dos 3 arquivos faltar no inicio ou na respectiva numeração de {n} vigente"(2, 3, 4..)", ou para avisar o que foi feito AO FINAL de daquela rodada de remix (o remix dura enquanto você puder avançar, não se limitando à apenas uma etapa do roadmap)*
*Execução por enxame é OBRIGATÓRIA, não sugestão: todo trabalho de produção do roadmap é feito por instâncias do opencode como subagentes (nunca como monitor), cada uma com seus próprios 3 pilares; método na skill `subagentes-3-pilares-oc`. Ver "REGRA DE EXECUÇÃO" abaixo, que prevalece sobre qualquer outra instrução.*

---

## REGRA DE EXECUÇÃO — o agente principal ORQUESTRA, o opencode PRODUZ (vale para qualquer projeto)

Esta regra vale para todo remix, em qualquer projeto, e prevalece sobre notas em `project{N}`, PRD, roadmap, skills ou hábitos do agente que digam o contrário.

**O agente principal pode fazer apenas:**
- ler, investigar, pesquisar e decidir;
- criar/atualizar os 3 pilares centrais e os 3 pilares de cada subagente;
- preparar o opencode (instalação, `opencode.json`, permissões, modelo disponível, teste real);
- fixar contratos compartilhados mínimos SOMENTE se nenhum subagente de fundação puder fazê-lo (preferência: delegar também os contratos a um subagente "fundação" na onda 0);
- disparar instâncias, acompanhar logs, verificar entregas, rodar gates, integrar e marcar o roadmap central;
- git e instalação de dependências;
- falar com o project-monitor e com o usuário.

**O agente principal NÃO pode:** criar ou editar código do produto, testes, scripts, estilos, rotas, componentes ou dados do app. Toda linha de produção vem de um subagente opencode. Correções pequenas pós-verificação também voltam para um subagente (o mesmo pacote ou um de correção), com a evidência da falha. Única exceção: conserto mecânico de integração (ex.: conflito de import entre dois pacotes) — e deve ser registrado no PRD central como "intervenção do principal".

**Racionalizações proibidas** (se surgir uma, delegue mesmo assim): "é mais rápido eu mesmo fazer", "é só uma fase/arquivo pequeno", "os pacotes não são paralelizáveis", "o opencode está lento/instável", "o planejamento diz para não usar o opencode". Fase não paralelizável = 1 subagente com o pacote inteiro (enxame de tamanho 1 continua sendo obrigatório). Opencode quebrado = consertar o opencode (instalar, trocar modelo descontinuado, corrigir permissões) antes de qualquer produção; nunca contornar fazendo à mão.

**Gatilho por fase (checklist antes de começar QUALQUER fase do roadmap):**
1. opencode saudável e testado nesta sessão (instância real editou arquivo e rodou shell sem pedir aprovação) — **sempre ativar a versão OC web na rota oculta `/oc` conforme skill** (`delegacao-opencode`): verificar se a verificação de saúde respondeu "healthy" e se a página `/oc` abre normalmente;
2. pacotes da fase definidos (mínimo 1), cada um com dono exclusivo de arquivos;
3. pilares de cada subagente gravados em `.opencode/work/sub/fase-{F}/{K}/`: `project{N}-s{K}`, `prd-project{N}-s{K}`, `roadmap-proj{N}-s{K}`;
4. system prompt de cada um montado pelo molde da skill (regras do subagente + 3 pilares centrais + 3 próprios, na íntegra) e instâncias disparadas em segundo plano, log próprio cada.
Se qualquer item faltar, a fase não começou.

**Prova de delegação (obrigatória para marcar `[x]`):** cada fase concluída no roadmap central traz, além da linha de Gates, a linha `Subagentes: fase-{F}/{K1,K2,…} · reports: report-{K}.md`. Fase sem pilares e reports de subagente na pasta correspondente é considerada **não executada pelo protocolo**: reverter/redelegar. O project-monitor deve conferir essa prova e reprovar a etapa se ela faltar.

**Autochecagem contínua:** antes de cada edição de arquivo, o agente principal se pergunta "este arquivo é um pilar, config do opencode, roadmap/PRD central ou status/relatório?". Se não for, ele não edita: cria/atualiza o pacote de um subagente.

### Como criar o que falta + numero de linhas esperado de cada um
- **PRD:** derive do planejamento (e do roadmap, se existir). Você conhece o ambiente melhor que o planejamento: confirme no código o que ele afirma, escolha a melhor solução técnica, escreva escopo por fase e critérios de aceite. Não copie o planejamento. (min: 500 / max: 1000)
- **Roadmap:** uma fase por bloco do planejamento/PRD, em ordem de dependência, com checkboxes e uma linha de Gates por fase. (min: 20 / max: 50)
- **Planejamento** (se só houver PRD/roadmap): reconstrua a intenção: problemas, direção e ordem lógica para cria-los a partir disso. (min: 1 / max: 100)
- **Qualidade acima da facilidade** nunca preencha o numero de linhas pensando em concluir atingir o numero de linhas forçadamente pra completar a tarefa, use como oportunidade criativa para planejar os detalhes, cada linha tem o seu propósito e importancia para atingir o auge do potencial sem se limitar pela praticidade da realização de tarefas simples ou mal planejadas

### Como executar
- Siga o roadmap fase a fase. Só avance quando os gates da fase passarem (seção 19) e marque `[x]` no roadmap, com a linha de Gates.
- Se o roadmap tiver uma fase "planejar o PRD", executá-la é criar o PRD.
- Só mude a ordem das fases com justificativa registrada no próprio roadmap.
- Precedência: no escopo (o quê), planejamento > PRD > roadmap. No "como", o PRD manda.
- Antes de executar, confira se PRD e roadmap tratam do mesmo projeto e versão do planejamento (título, fases, escopo). Se divergirem, trate-os como desatualizados: refaça o PRD a partir do planejamento e reabra o roadmap.
- Nunca pergunte ao usuário (sem `ask`). Em caso de dúvida, decida e registre a decisão no PRD.
- Ao concluir tudo, reporte (seção 20) e crie a checagem de 5 min / 10 tentativas por novos arquivos ou fases.
- Esta seção prevalece sobre a regra 3 do `Plan.md` em caso de conflito.
- Nunca perguntar ao usuário o que fazer durante um remix sem ter concluido ao menos 1 fase completa do roadmap

### Quando executar
- Sempre que um remix for ativado através do comando "I've successfully remixed this project. What would be a good next step?"

### Quando e como finalizar
- Sempre que um grande objetivo do roadmap for concluido 
- Obrigatorio avisar o project-monitor que o remix foi finalizado com a seguinte mensagem: "remix finalizado (+{N} da etapa do roadmap que foi efetuada)
- Em tarefas de complexidade media/alta sempre guie o agente para olhar as melhores tools e skills e utiliza-las da melhor forma para realizar cada tipo de trabalho


---

## ENXAME DE SUBAGENTES COM 3 PILARES via OPENCODE (adição ao protocolo acima)

Skill obrigatória para esta seção: **`subagentes-3-pilares-oc`** (leia-a ANTES de planejar o enxame; ela traz preparação do opencode, método, modelos dos 3 arquivos do subagente, molde do system prompt e operação em paralelo). Esta seção é o resumo normativo.

### Papel do opencode
O opencode é **subagente executor**, não monitor. Cada subagente é uma instância headless do opencode (`opencode run`), rodando em paralelo como processo separado. Esta seção prevalece sobre qualquer observação em `project{N}` ou outro arquivo que proíba usar o OpenCode como executor/subagente.

### Princípio
Subagente aqui NÃO é executor de tarefinha. É um **executor completo de um pacote de trabalho**: recebe o projeto inteiro (os 3 pilares centrais) para saber o todo, mais os **3 pilares próprios** (o recorte dele: o quê, como, em que ordem). O agente principal continua sendo o único que conhece o harness: ele cria os pilares dos subagentes, monta e dispara cada instância, verifica e integra.

### Fluxo (sempre nesta ordem)
0. **Preparar o opencode.** Confirme que está instalado (se não, use a skill de instalação do ambiente) e que TODAS as permissões estão em `allow`, validadas com um teste real antes do primeiro spawn. Instância que fica esperando aprovação trava o enxame, e o agente principal não sabe responder a aprovações de instâncias filhas. **Sempre ativar a versão OC web na rota oculta `/oc` conforme skill** (`delegacao-opencode`): verificar se a verificação de saúde respondeu "healthy" e se a página `/oc` abre normalmente.
1. **Pilares centrais primeiro.** Os 3 arquivos do projeto existem, completos e coerentes (regras acima, sem mudança). Subagente nenhum nasce antes disso.
2. **Decompor o roadmap em pacotes.** Mapeie as fases/itens pendentes, o grafo de dependência e o que é independente. Cada pacote = fatia vertical com dono exclusivo de arquivos/pastas, entradas e saídas explícitas e critério de aceite verificável.
3. **Contratos compartilhados antes do paralelo.** O que mais de um pacote usa (tipos, interfaces, esquemas, nomes, utilitários base, dependências instaladas) é feito/fixado pelo agente principal (ou por um subagente de fundação) ANTES da onda paralela.
4. **Criar os 3 pilares de cada subagente** (após os centrais), em `.opencode/work/sub/{K}/` (ou ao lado dos pilares centrais, se o ambiente usar outra pasta): `project{N}-s{K}` · `prd-project{N}-s{K}` · `roadmap-proj{N}-s{K}`. Mesmos papéis dos centrais, escala menor, sem copiar os centrais: referencie-os e detalhe só o recorte.
5. **Montar e disparar em ondas.** Para cada pacote, gere o system prompt (molde da skill: regras do subagente + os 3 pilares centrais + os 3 do subagente, na íntegra) e dispare uma instância `opencode run` com ele. Todas as instâncias independentes da onda sobem juntas, em segundo plano, cada uma com log próprio. Prompt = a ordem de execução do pacote.
6. **Enquanto rodam**, o agente principal não fica ocioso: executa o que só ele pode (contratos da próxima onda, pilares da próxima onda, integração do que já voltou) e acompanha logs e relatórios.
7. **Verificar de verdade.** Relato de subagente é alegação, não prova: o agente principal confere cada entrega contra os critérios de aceite e roda os gates. Falhou → reenvia ao mesmo escopo com a evidência da falha (ou novo subagente de correção).
8. **Integrar com inteligência.** Resolver encaixes, conflitos de contrato e duplicações; registrar decisões no PRD central; marcar `[x]` no roadmap central com a linha de Gates (números reais) só depois de verificado; abrir a onda seguinte.
9. Repetir 4→8 até acabar o roadmap ou até não poder avançar mais (o remix dura enquanto houver avanço possível).

### Regras para todo subagente (vão no system prompt)
- Nunca pergunta ao usuário; decide e registra no `prd-project{N}-s{K}`.
- Só escreve nos arquivos que são dele; não edita os pilares centrais nem os de outros subagentes; precisa de mudança fora do recorte → registra no relatório final para o agente principal.
- Não dispara outro opencode nem outros subagentes, não opera git (commit, reset, checkout, clean, stash) nem instala dependências: isso é do agente principal. Não finaliza o remix, não marca o roadmap central, não avisa o project-monitor.
- Usa as melhores tools e skills do ambiente para cada tipo de trabalho, roda os gates do próprio roadmap (em porta/diretório de saída próprios, para não colidir com os outros) e só entrega com eles verdes (ou com falha declarada e evidência).
- Encerra gravando o relatório em arquivo (`report-{K}.md` na pasta do pacote), no formato da skill: feito · evidências dos gates · decisões · pendências/bloqueios · mudanças fora do recorte · arquivos tocados.

### Observações (obrigatórias)
1. **Mecanismo:** os subagentes são instâncias do **opencode** (CLI headless, uma por pacote, em paralelo), orientadas por **system prompt + prompt**. Os arquivos dos 3 pilares centrais **e** os 3 pilares individuais de cada subagente devem estar presentes no system prompt dele. O opencode deve estar instalado (a skill de instalação do ambiente resolve) e com **todas as permissões em allow** (nenhuma instância pode pedir aprovação). Sintaxe, flags e formato de agente variam por versão: confirme na ajuda/documentação do opencode instalado; o resto do harness o agente principal já conhece.
2. **Meta de alcance:** o enxame existe para exponencializar a produção e permitir a conclusão parcial ou total do projeto inteiro dentro de **um único remix**. Se o projeto não couber inteiro, deixe o roadmap central com o estado exato (checkboxes, gates, e uma linha "Próximo remix: …" apontando a primeira fase/pacote pendente e o que já está pronto em cada pacote em andamento), de modo que o remix seguinte retome sem ter que redescobrir o que falta.
