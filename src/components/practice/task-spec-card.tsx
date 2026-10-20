/**
 * Ficha do formato oficial de um tipo de tarefa (Fase 4 — s5-pratica).
 *
 * Tudo aqui é derivado de `exam-spec.ts` (tempos, limites, habilidades, notas e
 * divergências) e do manifesto do banco (quantidade de itens). A ficha existe para o
 * aluno entender o que a prova exige ANTES de treinar — e para deixar explícito o que
 * é aproximação, sem transformar nota de treino em promessa de nota oficial.
 *
 * Nenhum tempo é digitado neste arquivo: `formatPreparation`/`formatResponseWindow`
 * leem o `ExamTaskSpec`. A data de consulta das fontes também vem de `EXAM_SOURCES`.
 */

import { CalendarCheck, FileText, Info, Lock, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { EXAM_META, type ExamTaskSpec } from "@/data/exam-spec";
import type { CatalogEntry } from "@/lib/app/catalogo";
import { Badge } from "@/components/ui/badge";
import {
  explainResponseWindow,
  formatPreparation,
  formatResponseWindow,
  formatScoredSkillsDetailed,
  formatSourcesDate,
  formatTaskCount,
  sectionLabel,
} from "./spec-format";

const numberFormatter = new Intl.NumberFormat("pt-BR");

export interface TaskSpecCardProps {
  spec: ExamTaskSpec;
  entry: CatalogEntry;
}

export function TaskSpecCard({ spec, entry }: TaskSpecCardProps) {
  const section = sectionLabel(spec.section);
  const consultedAt = formatSourcesDate();
  const humanReviewed = (EXAM_META.humanReviewedTypes as readonly string[]).includes(spec.id);

  return (
    <section
      aria-labelledby="formato-titulo"
      className="rounded-2xl border border-border/60 bg-card/40 p-4 sm:p-5"
    >
      <h2
        id="formato-titulo"
        className="flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <FileText className="size-4 text-primary" aria-hidden="true" />
        Formato no exame
      </h2>

      <dl className="mt-4 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-1">
        <Fact label="Seção">
          <span>
            {section.label} <span className="text-muted-foreground">({section.labelPt})</span>
          </span>
        </Fact>
        <Fact label="Tarefas na prova">
          <span className="tabular-nums">{formatTaskCount(spec.scoredTasksInExam)}</span>
        </Fact>
        <Fact label="Preparação">
          <span className="tabular-nums">{formatPreparation(spec)}</span>
        </Fact>
        <Fact label="Tempo de resposta">
          <span className="tabular-nums">{formatResponseWindow(spec.responseSeconds)}</span>
          <span className="mt-0.5 block text-xs font-normal leading-relaxed text-muted-foreground">
            {explainResponseWindow(spec.responseSeconds)}
          </span>
        </Fact>
        <Fact label="Limite de conteúdo">
          <span>{spec.contentLimit ?? "Sem limite declarado na fonte"}</span>
        </Fact>
        <Fact label="Habilidades pontuadas">
          <span>{formatScoredSkillsDetailed(spec.scoredSkills)}</span>
          {spec.weightsApproximation === true ? (
            <Badge
              variant="outline"
              className="mt-1.5 border-warning/40 bg-warning/10 text-warning-foreground"
            >
              Matriz aproximada
            </Badge>
          ) : null}
        </Fact>
        <Fact label="Questões no banco">
          {entry.count > 0 ? (
            <span className="tabular-nums">
              {numberFormatter.format(entry.count)}
              {entry.status === "sparse" ? (
                <span className="ml-1.5 text-xs font-normal text-warning">cobertura limitada</span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">Nenhum item aprovado ainda</span>
          )}
        </Fact>
      </dl>

      {spec.weightsApproximation === true ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            A matriz oficial tarefa×habilidade não é inequívoca para este tipo. As habilidades acima
            são uma aproximação declarada — pesos de estimativa (Fase 8) nunca serão apresentados
            como fato da Pearson.
          </span>
        </p>
      ) : null}

      {humanReviewed ? (
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <CalendarCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Na Pearson, este tipo tem revisão humana adicional do critério de conteúdo. Aqui a
            avaliação é uma estimativa de treino por IA, com evidências e limitações declaradas.
          </span>
        </p>
      ) : null}

      {spec.notes !== undefined ? (
        <details className="group mt-4 border-t border-border/60 pt-3">
          <summary className="flex min-h-9 cursor-pointer items-center gap-2 rounded-sm text-xs font-medium text-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Info className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Notas do formato oficial
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{spec.notes}</p>
        </details>
      ) : null}

      <p className="mt-4 flex items-start gap-2 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground/90">
        <Lock className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          Tempos, limites e habilidades vêm do formato vigente do PTE Academic, conferido em
          material da Pearson{consultedAt === null ? "" : ` em ${consultedAt}`}. O app aproxima os
          critérios de avaliação; não reproduz o avaliador oficial nem promete nota.
        </span>
      </p>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm leading-relaxed text-foreground">{children}</dd>
    </div>
  );
}
