import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/layout/coming-soon";

export const Route = createFileRoute("/progresso")({
  head: () => ({
    meta: [
      { title: "Progresso e estimativa por habilidade — PTE Master Hub" },
      {
        name: "description",
        content:
          "Estimativa de treino na escala 10–90 por habilidade, com confiança declarada, tendência e relatório semanal. Área em construção na Fase 8.",
      },
      { property: "og:title", content: "Progresso e estimativa por habilidade — PTE Master Hub" },
      {
        property: "og:description",
        content:
          "Acompanhe evolução, lacunas de cobertura e prontidão com números rotulados como estimativa de treino.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgressoPage,
});

function ProgressoPage() {
  return (
    <ComingSoon
      title="Progresso e estimativa por habilidade"
      description="A estimativa de treino (escala 10–90) é sempre rotulada e vem com nível de confiança: ela nunca se mistura com a nota da tentativa nem se apresenta como nota oficial."
      phase="Fase 8"
      bullets={[
        "Estimativa por habilidade derivada da matriz oficial tarefa×habilidade, com tendência e confiança.",
        "Prontidão baseada em desempenho recente ponderado — não no tamanho do banco.",
        "Relatório semanal exportável e gráficos de evolução.",
        "Lacunas de cobertura explícitas: o que ainda não foi treinado o suficiente para estimar.",
      ]}
      footnote="Depende da calibração do avaliador por IA (Fase 5), das sessões (Fase 7) e dos pesos da matriz conferida na Fase 1."
      nextHref="/"
      nextLabel="Ir para o início"
    />
  );
}
