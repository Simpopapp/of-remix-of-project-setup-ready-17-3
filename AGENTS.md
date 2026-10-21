<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS.md

*Regras técnicas do protocolo de remix*

## Arquitetura de monitoramento
- O proxy do OpenCode expõe o runtime OpenCode na rota `/oc`. oculta nas rotas do app, só utilizar o runtime OpenCode
## Verificação e ativação do protocolo
- instruções de remix: "/.opencode/plan.md"
- um remix é ativado quando se recebe o comando "I've successfully remixed this project. What would be a good next step?" ou "I've remixed this project, but there are still some steps required to get it up and running. 

Can you help me with the following actions:
1. Cleared the copied Drizzle migrations and rescaffolded an empty migration set for the new project's database". para iniciar um remix é obrigatorio usar o project monitor e seguir as regras do plan.md para evitar bugs e erros no projeto
- Em remix, o agente principal só orquestra; todo código do produto é produzido por subagentes opencode, cada um com seus 3 pilares próprios, conforme "REGRA DE EXECUÇÃO" em `.opencode/plan.md` — porque produção feita à mão pelo principal pula os pilares, a verificação independente e o paralelismo.
- Fase do roadmap só pode ser marcada `[x]` com a linha "Subagentes: …" apontando pilares e reports reais em `.opencode/work/sub/` — porque é a prova auditável de que a delegação aconteceu.
- Nunca confunda informar o monitor do projeto com fazer uma ask para o usuário (tem uma skill pra isso)
- Nunca pergunte qualquer coisa ao usuário sem ter relatado a falta dos 3 arquivos descritos no plan.md para o project-monitor antes! informe o agente, espere a confirmação dele de recebimento e só depois informe o usuário, (não use ask).

*Regras técnicas do projeto.*

## Arquitetura e Ambiente
- Keep the evaluation RPC client-safe and dynamically load server-only evaluation modules inside its handler; this prevents gateway credentials and reserved references entering the browser bundle.
- Validate explicit consent before acquiring a per-instance evaluation lease or loading the evaluator; the lease limits bursts but must never be described as authentication or a distributed spending cap.
- Sanitize model output before caching, keep the effective model in the cache key, and downgrade audio-only measurements when no audio is analyzed; these boundaries preserve result honesty across evaluators.
- Use the SDK instructions field for trusted evaluation policy and conversation messages for untrusted content; SDK wire tests protect the provider contract from silent integration regressions.
## Verificação e Qualidade
- Use Lovable's automatic harness for builds and typechecks; run tests and lint explicitly, because manual project builds/typechecks are prohibited in this sandbox.
- Run integration tests with at most two Vitest workers when sandbox load causes the observed bank-loader timeout; this keeps the existing assertions and timeout values intact.