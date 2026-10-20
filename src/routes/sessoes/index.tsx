import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/layout/coming-soon";

export const Route = createFileRoute("/sessoes/")({
  head: () => ({
    meta: [
      { title: "Sessões e fila de revisão — PTE Master Hub" },
      {
        name: "description",
        content:
          "Sessões retomáveis de estudo e fila do dia por repetição espaçada (SRS) para o PTE Academic. Área em construção na Fase 7.",
      },
      { property: "og:title", content: "Sessões e fila de revisão — PTE Master Hub" },
      {
        property: "og:description",
        content:
          "Sessões que sobrevivem ao recarregamento, fila do dia por SRS e histórico de estudo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SessoesPage,
});

function SessoesPage() {
  return (
    <ComingSoon
      title="Sessões e fila de revisão"
      description="Aqui ficará a fila do dia e as sessões de estudo retomáveis: você começa, fecha o navegador e continua de onde parou, sem perder o que já respondeu."
      phase="Fase 7"
      bullets={[
        "Fila do dia montada pelo SRS (revisão vencida primeiro, com o limiar de cada tipo de tarefa).",
        "Sessões que persistem ao recarregar a página, com posição e tentativas abertas preservadas.",
        "Histórico de sessões com o que foi treinado, quando e com qual resultado.",
        "Atalhos para treinar o ponto fraco a partir do diagnóstico.",
      ]}
      footnote="O agendamento de revisão já está implementado por trás do badge no topo; o que falta é a tela de sessão."
      nextHref="/"
      nextLabel="Ir para o início"
    />
  );
}
