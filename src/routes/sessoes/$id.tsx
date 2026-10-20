import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/sessoes/$id")({
  head: () => ({
    meta: [
      { title: "Sessão de estudo — PTE Master Hub" },
      {
        name: "description",
        content:
          "Detalhe de uma sessão de estudo do PTE Master Hub. A retomada de sessões chega na Fase 7; esta página ainda não carrega uma sessão.",
      },
      { property: "og:title", content: "Sessão de estudo — PTE Master Hub" },
      {
        property: "og:description",
        content: "Sessão retomável com questões, tentativas e resultado — em construção na Fase 7.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SessaoPage,
});

function SessaoPage() {
  const { id } = Route.useParams();

  return (
    <section className="mx-auto w-full max-w-2xl py-6">
      <div className="rounded-2xl border border-border/70 bg-card/40 p-6 sm:p-8">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <CalendarClock className="size-4 text-primary" aria-hidden="true" />
          <span>Em construção</span>
        </div>

        <h1 className="mt-4 font-serif text-3xl font-semibold tracking-tight text-foreground">
          Sessão <span className="text-primary">{id}</span>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Esta página vai retomar a sessão <span className="text-foreground/80">{id}</span>{" "}
          exatamente onde ela parou — inclusive depois de fechar o navegador. Nada é simulado aqui:
          como a persistência de sessões ainda não existe, não há estado para mostrar.
        </p>

        <p className="mt-5 border-t border-border/60 pt-5 text-xs leading-relaxed text-muted-foreground">
          A retomada de sessões, com fila do dia e histórico, chega na Fase 7.
        </p>

        <Link
          to="/sessoes"
          className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para Sessões
        </Link>
      </div>
    </section>
  );
}
