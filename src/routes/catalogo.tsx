/**
 * `/catalogo` — catálogo unificado dos tipos de tarefa do PTE Academic (Fase 4 — s3).
 *
 * O que esta tela faz (e o que ela deliberadamente não faz):
 *
 * - Mostra os tipos pontuados agrupados por seção do exame, cada um com a **contagem
 *   derivada do manifesto do banco** e um caminho para praticar. Nenhum número de
 *   questão é digitado aqui: `deriveCatalog(manifest)` é a única fonte.
 * - Diz a verdade sobre cobertura: tipos com menos itens do que o desejável aparecem
 *   com "cobertura limitada"; tipos sem nenhum item aprovado aparecem como "em breve"
 *   com o motivo — nunca preenchidos com conteúdo duvidoso.
 * - Não promete disponibilidade que não existe: o botão de praticar só vira link quando
 *   a rota `/praticar/$type` está registrada (ela chega na onda da prática). Antes disso
 *   o card mostra um estado honesto, sem link morto.
 *
 * Mobile-first: cards empilhados, alvos de toque ≥ 44 px, âncoras de seção no topo.
 */

import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, TriangleAlert } from "lucide-react";
import { useMemo, type ComponentType, type ReactNode } from "react";

import { useResolvedPath } from "@/components/layout/use-resolved-path";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { loadManifest } from "@/data/loader";
import {
  SPARSE_COUNT_THRESHOLD,
  deriveCatalog,
  groupCatalog,
  isComingSoon,
  summarizeCatalog,
  type CatalogEntry,
  type CatalogSection,
} from "@/lib/app/catalogo";

/**
 * Manifesto do banco: dado estático do bundle, carregado uma vez por sessão.
 * `staleTime: Infinity` porque o manifesto só muda com um novo build.
 */
const manifestQuery = queryOptions({
  queryKey: ["bank", "manifest"],
  queryFn: () => loadManifest(),
  staleTime: Infinity,
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export const Route = createFileRoute("/catalogo")({
  head: () => ({
    meta: [
      { title: "Catálogo de tarefas do PTE Academic — PTE Master Hub" },
      {
        name: "description",
        content:
          "Todos os tipos de tarefa pontuados do PTE Academic organizados por seção, com a quantidade de questões disponíveis em cada tipo — contagem derivada do banco local, nunca digitada.",
      },
      { property: "og:title", content: "Catálogo de tarefas do PTE Academic — PTE Master Hub" },
      {
        property: "og:description",
        content:
          "Escolha um tipo de tarefa para treinar: contagens reais do banco, cobertura declarada e prática por questão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(manifestQuery),
  pendingComponent: CatalogoPendente,
  component: CatalogoPage,
});

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

function CatalogoPage() {
  const { data: manifest } = useSuspenseQuery(manifestQuery);
  const entries = useMemo(() => deriveCatalog(manifest), [manifest]);
  const sections = useMemo(() => groupCatalog(entries), [entries]);
  const summary = useMemo(() => summarizeCatalog(entries), [entries]);

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Catálogo
        </p>
        <div className="space-y-3">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            As tarefas pontuadas do PTE Academic
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Cada tipo de tarefa tem o seu próprio motor de prática, os seus limites e a sua forma de
            avaliação. As quantidades abaixo vêm do banco de questões deste dispositivo — se o banco
            mudar, os números mudam com ele.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryTile label="Tipos com conteúdo" value={formatNumber(summary.typesWithContent)} />
          <SummaryTile label="Questões no banco" value={formatNumber(summary.questions)} />
          <SummaryTile label="Palavras de referência" value={formatNumber(summary.words)} />
          <SummaryTile label="Cobertura limitada" value={formatNumber(summary.sparseTypes)} />
        </dl>
      </header>

      <nav aria-label="Ir para uma seção do catálogo" className="flex flex-wrap gap-2">
        {sections.map((section) => (
          <a
            key={section.section}
            href={`#secao-${section.section}`}
            className="inline-flex min-h-11 items-center rounded-full border border-border/70 px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {section.label}
            <span className="ml-2 text-xs text-muted-foreground/70">{section.labelPt}</span>
          </a>
        ))}
      </nav>

      <div className="space-y-8">
        {sections.map((section) => (
          <SectionBlock key={section.section} section={section} />
        ))}
      </div>

      <footer className="rounded-xl border border-border/60 bg-card/40 p-4 text-xs leading-relaxed text-muted-foreground sm:p-5">
        <p className="flex items-start gap-2">
          <BookOpen className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="text-foreground/80">Como ler este catálogo.</span> Questões são
            conteúdo real do banco, com fonte registrada — nada é gerado por IA. Um tipo marcado
            como <span className="text-foreground/80">cobertura limitada</span> continua praticável,
            mas tem menos variedade para repetição; a lacuna é reportada como está, sem inventar
            itens para preencher. Tipo sem nenhum item aprovado fica{" "}
            <span className="text-foreground/80">em breve</span>, com o motivo à vista. O limiar de
            cobertura adotado é de {formatNumber(SPARSE_COUNT_THRESHOLD)} questões por tipo — uma
            política de honestidade desta plataforma, não uma regra do exame.
          </span>
        </p>
      </footer>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2.5">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-serif text-xl font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

function SectionBlock({ section }: { section: CatalogSection }) {
  return (
    <section
      id={`secao-${section.section}`}
      aria-labelledby={`secao-${section.section}-titulo`}
      className="scroll-mt-24 space-y-3"
    >
      <div className="flex flex-col gap-1 border-b border-border/60 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id={`secao-${section.section}-titulo`}
            className="font-serif text-xl font-semibold tracking-tight text-foreground"
          >
            {section.label}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {section.labelPt}
            </span>
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {section.description}
          </p>
        </div>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatNumber(section.types)} tipos · {formatNumber(section.questions)} questões
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {section.entries.map((entry) => (
          <li key={entry.type} className="h-full">
            <TaskCard entry={entry} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TaskCard({ entry }: { entry: CatalogEntry }) {
  const comingSoon = isComingSoon(entry);
  const headingId = `tipo-${entry.type}`;

  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col gap-2 rounded-xl border border-border/60 bg-card/50 p-4 transition-colors hover:border-border"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 id={headingId} className="text-sm font-medium leading-snug text-foreground">
          {entry.name}
        </h3>
        {comingSoon ? (
          <Badge variant="outline" className="shrink-0 border-border/70 text-muted-foreground">
            Em breve
          </Badge>
        ) : entry.status === "sparse" ? (
          <Badge
            variant="outline"
            className="shrink-0 border-warning/40 bg-warning/10 text-warning-foreground"
          >
            Cobertura limitada
          </Badge>
        ) : null}
      </div>

      {comingSoon ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Nenhum item aprovado no banco para este tipo. A prática só é liberada quando houver
          conteúdo com fonte verificável.
        </p>
      ) : (
        <p className="text-sm tabular-nums leading-relaxed text-muted-foreground">
          {formatNumber(entry.count)} questões · {formatNumber(entry.words)} palavras de referência
        </p>
      )}

      {!comingSoon && entry.status === "sparse" ? (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground/90">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            Menos questões do que o desejável para treino repetido. A lacuna é exibida como está.
          </span>
        </p>
      ) : null}

      <div className="mt-auto pt-1">
        {comingSoon ? (
          <span
            aria-disabled="true"
            className="inline-flex min-h-11 items-center rounded-md border border-border/60 px-3 text-sm font-medium text-muted-foreground/60"
          >
            Prática em breve
          </span>
        ) : (
          <PracticeLink type={entry.type} label={`Praticar ${entry.name}`} />
        )}
      </div>
    </article>
  );
}

/**
 * Link para `/praticar/$type`.
 *
 * Dois cuidados:
 * - O destino é resolvido contra o route tree em runtime: enquanto a rota de prática não
 *   existir (outra onda), o card mostra "Prática em breve" em vez de um link morto.
 * - O único cast do arquivo existe porque a rota é dinâmica e ainda não está no union
 *   type gerado. Ele só é usado depois de `useResolvedPath` confirmar o destino.
 */
interface PracticeLinkProps {
  to: string;
  params: { type: string };
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
}

const DynamicLink = Link as unknown as ComponentType<PracticeLinkProps>;

function PracticeLink({ type, label }: { type: CatalogEntry["type"]; label: string }) {
  const resolved = useResolvedPath("/praticar/$type");

  if (resolved === null) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex min-h-11 items-center rounded-md border border-border/60 px-3 text-sm font-medium text-muted-foreground/60"
      >
        Prática em breve
      </span>
    );
  }

  return (
    <DynamicLink
      to={resolved}
      params={{ type }}
      aria-label={label}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      Praticar
      <ArrowRight className="size-4" aria-hidden="true" />
    </DynamicLink>
  );
}

/* ------------------------------------------------------------------ */
/* Carregamento                                                        */
/* ------------------------------------------------------------------ */

function CatalogoPendente() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </div>
      <p className="sr-only" role="status">
        Carregando o catálogo de tarefas.
      </p>
    </div>
  );
}
