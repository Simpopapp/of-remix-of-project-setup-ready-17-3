import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/layout/coming-soon";

export const Route = createFileRoute("/simulado")({
  head: () => ({
    meta: [
      { title: "Simulado cronometrado — PTE Master Hub" },
      {
        name: "description",
        content:
          "Simulado cronometrado por blueprint, separado do treino, com mini-simulado rotulado. Área em construção na Fase 9.",
      },
      { property: "og:title", content: "Simulado cronometrado — PTE Master Hub" },
      {
        property: "og:description",
        content:
          "Fluxo sem auxílios, sem gabarito e sem Studie Plus, com relatório pós-prova separado do treino.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SimuladoPage,
});

function SimuladoPage() {
  return (
    <ComingSoon
      title="Simulado cronometrado"
      description="O simulado é uma coisa diferente do treino: cronometrado, sem auxílios, sem gabarito e sem Studie Plus, seguindo o blueprint oficial conferido na Fase 1."
      phase="Fase 9"
      bullets={[
        "Blueprint com omissões e aproximações declaradas — sem chamar de oficial o que não foi conferido.",
        "Mini-simulado separado e rotulado como distinto do blueprint de ~2 horas.",
        "Envio único e fluxo inviolável: nenhum atalho revela a resposta.",
        "Relatório pós-prova separado do histórico de treino.",
      ]}
      footnote="Esta área depende dos motores de prática (Fase 6) e da medição honesta (Fase 8)."
      nextHref="/"
      nextLabel="Ir para o início"
    />
  );
}
