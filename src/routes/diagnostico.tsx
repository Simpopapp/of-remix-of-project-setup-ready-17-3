import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/layout/coming-soon";

export const Route = createFileRoute("/diagnostico")({
  head: () => ({
    meta: [
      { title: "Diagnóstico de erros — PTE Master Hub" },
      {
        name: "description",
        content:
          "Diagnóstico por categoria (conteúdo, fluência, omissão, armadilha e palavras mais erradas) com atalhos para treinar o ponto fraco. Área em construção na Fase 7.",
      },
      { property: "og:title", content: "Diagnóstico de erros — PTE Master Hub" },
      {
        property: "og:description",
        content:
          "Entenda por que a resposta errou e treine exatamente o ponto fraco, em vez de repetir o tipo inteiro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiagnosticoPage,
});

function DiagnosticoPage() {
  return (
    <ComingSoon
      title="Diagnóstico de erros"
      description="Em vez de um corte único de nota, o diagnóstico mostra a categoria do erro: conteúdo, fluência, omissão, armadilha e as palavras em que você mais erra."
      phase="Fase 7"
      bullets={[
        "Agregação por categoria de erro, alimentada pelo resultado de cada tentativa.",
        "Palavras mais erradas, com atalho para treiná-las em contexto.",
        'Atalhos "treinar o ponto fraco" que montam uma sessão focada.',
        "Comparação com o período anterior para ver se o erro está diminuindo.",
      ]}
      footnote="Depende do resultado estruturado da avaliação por IA (Fase 5) e das sessões (Fase 7)."
      nextHref="/"
      nextLabel="Ir para o início"
    />
  );
}
