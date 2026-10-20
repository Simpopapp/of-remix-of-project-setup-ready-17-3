/**
 * Agregação pura do relatório de calibração (Fase 5/s4).
 *
 * O runner apenas coleta o que o avaliador devolveu; este módulo compara com a
 * nota de referência e classifica a consistência por tipo. Nenhuma nota é
 * decidida aqui — `abstained`/`needs_review` permanecem sem delta e contam como
 * abstenção.
 *
 * Client-safe e puro: sem I/O, sem servidor, sem Data atual.
 */

import type { TaskType, Verdict } from "@/domain";

export const CALIBRATION_LEVELS = ["high", "medium", "low", "insufficient"] as const;
export type CalibrationLevel = (typeof CALIBRATION_LEVELS)[number];

export interface CalibrationOutcome {
  type: TaskType;
  questionId: string;
  referenceScore: number;
  verdict: Verdict;
  score: number | null;
}

export interface CalibrationReportItem extends CalibrationOutcome {
  /** `score − referenceScore` apenas para `scored`; arredondado a 1 casa. */
  delta: number | null;
}

export interface TypeConsistency {
  type: TaskType;
  /** Itens avaliados do tipo (inclui abstenções). */
  itemCount: number;
  scoredCount: number;
  /** `abstained` + `needs_review`. */
  abstentionCount: number;
  /** Erro médio absoluto |score − referenceScore| entre os scored. */
  meanAbsoluteError: number;
  /** Fração de scored com |delta| ≤ 10 (0–1). */
  agreementWithin10: number;
  level: CalibrationLevel;
}

export interface CalibrationReport {
  /** ISO-8601 em UTC. */
  generatedAt: string;
  perType: TypeConsistency[];
  items: CalibrationReportItem[];
}

interface ScoredOutcome extends CalibrationOutcome {
  score: number;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isScored(item: CalibrationOutcome): item is ScoredOutcome {
  return item.verdict === "scored" && typeof item.score === "number";
}

function isAbstention(item: CalibrationOutcome): boolean {
  return item.verdict === "abstained" || item.verdict === "needs_review";
}

function deltaOf(item: CalibrationOutcome): number | null {
  if (!isScored(item)) return null;
  return roundTo(item.score - item.referenceScore, 1);
}

/**
 * Consistência de um tipo. Itens de outros tipos são ignorados; a ausência de
 * itens devolve `insufficient` em vez de lançar.
 */
export function computeTypeConsistency(
  type: TaskType,
  items: readonly CalibrationOutcome[],
): TypeConsistency {
  const scoped = items.filter((item) => item.type === type);
  const scored = scoped.filter(isScored);
  const itemCount = scoped.length;
  const scoredCount = scored.length;
  const abstentionCount = scoped.filter(isAbstention).length;

  const meanAbsoluteError =
    scoredCount === 0
      ? 0
      : roundTo(
          scored.reduce((total, item) => total + Math.abs(item.score - item.referenceScore), 0) /
            scoredCount,
          1,
        );

  const agreementWithin10 =
    scoredCount === 0
      ? 0
      : roundTo(
          scored.filter((item) => Math.abs(item.score - item.referenceScore) <= 10).length /
            scoredCount,
          2,
        );

  let level: CalibrationLevel;
  if (itemCount < 2 || scoredCount < 1) {
    level = "insufficient";
  } else if (
    abstentionCount === 0 &&
    scoredCount === itemCount &&
    meanAbsoluteError <= 10 &&
    agreementWithin10 >= 0.8
  ) {
    level = "high";
  } else if (meanAbsoluteError <= 15 && agreementWithin10 >= 0.6) {
    level = "medium";
  } else {
    level = "low";
  }

  return {
    type,
    itemCount,
    scoredCount,
    abstentionCount,
    meanAbsoluteError,
    agreementWithin10,
    level,
  };
}

export interface BuildCalibrationReportOptions {
  /** Tipos pedidos, na ordem em que o relatório deve apresentá-los. */
  types: readonly TaskType[];
  generatedAt: string;
}

/** Monta o DTO serializável do relatório, preservando a ordem dos tipos pedidos. */
export function buildCalibrationReport(
  outcomes: readonly CalibrationOutcome[],
  options: BuildCalibrationReportOptions,
): CalibrationReport {
  return {
    generatedAt: new Date(options.generatedAt).toISOString(),
    perType: options.types.map((type) => computeTypeConsistency(type, outcomes)),
    items: outcomes.map((outcome) => ({
      type: outcome.type,
      questionId: outcome.questionId,
      referenceScore: outcome.referenceScore,
      verdict: outcome.verdict,
      score: outcome.score,
      delta: deltaOf(outcome),
    })),
  };
}

/** Predicado consumido pela Fase 8: só `high` ou `medium` libera confiança. */
export function isCalibrationSufficient(report: CalibrationReport, type: TaskType): boolean {
  const entry = report.perType.find((candidate) => candidate.type === type);
  return entry?.level === "high" || entry?.level === "medium";
}
