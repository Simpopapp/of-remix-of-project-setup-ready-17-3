/**
 * Cabeçalho da tela de prática (Fase 4 — s5-pratica).
 *
 * Mostra o que o aluno precisa saber antes de treinar, sem prometer nada:
 * nome em pt-BR + nome oficial em inglês, seção do exame, quantas tarefas
 * deste tipo existem na prova, quantos itens aprovados existem no banco e,
 * quando a matriz oficial é ambígua, que os pesos são aproximados.
 *
 * Nenhuma dessas quantidades é digitada: tarefas vêm de `exam-spec.ts` e itens
 * vêm do `CatalogEntry` derivado do manifesto (Fase 2/4).
 */

import { Link } from "@tanstack/react-router";
import { ChevronRight, TriangleAlert } from "lucide-react";

import type { ExamTaskSpec } from "@/data/exam-spec";
import type { CatalogEntry } from "@/lib/app/catalogo";
import { Badge } from "@/components/ui/badge";
import { formatTaskCount, sectionLabel } from "./spec-format";

const numberFormatter = new Intl.NumberFormat("pt-BR");

export interface PracticeTaskHeaderProps {
  spec: ExamTaskSpec;
  entry: CatalogEntry;
}

export function PracticeTaskHeader({ spec, entry }: PracticeTaskHeaderProps) {
  const section = sectionLabel(spec.section);
  const hasContent = entry.count > 0;

  return (
    <header className="space-y-4">
      <nav aria-label="Trilha de navegação">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <li>
            <Link
              to="/catalogo"
              className="inline-flex min-h-9 items-center rounded-sm px-1 underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Catálogo
            </Link>
          </li>
          <li aria-hidden="true" className="flex items-center">
            <ChevronRight className="size-3.5" />
          </li>
          <li aria-current="page" className="px-1 text-foreground/80">
            {spec.name}
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Prática por tipo
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {spec.namePt}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="text-foreground/80">{spec.name}</span>
            <span aria-hidden="true"> · </span>
            <span>
              {section.label} — {section.labelPt}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge variant="outline" className="border-border/70 text-muted-foreground">
            {formatTaskCount(spec.scoredTasksInExam)} tarefas na prova
          </Badge>
          {hasContent ? (
            <Badge variant="outline" className="border-border/70 text-muted-foreground">
              {numberFormatter.format(entry.count)} no banco
            </Badge>
          ) : (
            <Badge variant="outline" className="border-border/70 text-muted-foreground">
              Sem conteúdo aprovado
            </Badge>
          )}
          {spec.weightsApproximation === true ? (
            <Badge
              variant="outline"
              className="gap-1 border-warning/40 bg-warning/10 text-warning-foreground"
            >
              <TriangleAlert className="size-3" aria-hidden="true" />
              Pesos aproximados
            </Badge>
          ) : null}
        </div>
      </div>
    </header>
  );
}
