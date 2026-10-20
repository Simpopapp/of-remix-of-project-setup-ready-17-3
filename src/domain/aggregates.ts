/**
 * Contrato de agregados (`Aggregates`) — cache derivável 100% dos snapshots.
 *
 * Regra de honestidade: existem duas escalas e elas nunca se misturam.
 * - `AggregateBucket.recentWeightedScore` → escala de TENTATIVA (0–100).
 * - `SkillAggregate.estimate` → escala de HABILIDADE (10–90), só com calibração
 *   (`estimateBasis: "calibrated"`); sem calibração fica `null`/`"uncalibrated"`.
 *
 * O mapa tarefa×habilidade que dá peso a cada tipo vem de `src/data/exam-spec.ts`
 * (pacote s1). Este módulo declara apenas os identificadores de habilidade e a
 * forma do resultado — não inventa pesos.
 *
 * Consumidores: Fase 8 (estimativa/prontidão/relatório), Fase 3 (persistência do
 * cache no backup), Fase 9 (relatório pós-simulado). Módulo puro: zero I/O.
 */

import type { Confidence } from "./evaluation";
import type { Section, TaskType } from "./question";

/** Habilidades comunicativas pontuadas. */
export const COMMUNICATIVE_SKILLS = ["speaking", "writing", "reading", "listening"] as const;
export type CommunicativeSkill = (typeof COMMUNICATIVE_SKILLS)[number];

/**
 * Habilidades capacitantes (enabling skills) segundo a Pearson. Entram na medição
 * como subscores; o peso por tarefa vem da matriz oficial (exam-spec).
 */
export const ENABLING_SKILLS = [
  "grammar",
  "oral_fluency",
  "pronunciation",
  "spelling",
  "vocabulary",
  "written_discourse",
] as const;
export type EnablingSkill = (typeof ENABLING_SKILLS)[number];

export const SKILLS = [...COMMUNICATIVE_SKILLS, ...ENABLING_SKILLS] as const;
export type Skill = CommunicativeSkill | EnablingSkill;

/** Escala da estimativa de treino por habilidade (rotulada, com confiança). */
export const SKILL_ESTIMATE_MIN = 10;
export const SKILL_ESTIMATE_MAX = 90;
/** Escala de nota de tentativa. */
export const ATTEMPT_SCORE_MIN = 0;
export const ATTEMPT_SCORE_MAX = 100;

export const TRENDS = ["improving", "stable", "declining"] as const;
export type Trend = (typeof TRENDS)[number];

/** Como a estimativa foi obtida — impede apresentar aproximação como calibração. */
export const ESTIMATE_BASES = ["calibrated", "uncalibrated", "insufficient"] as const;
export type EstimateBasis = (typeof ESTIMATE_BASES)[number];

export function isSkill(value: unknown): value is Skill {
  return typeof value === "string" && (SKILLS as readonly string[]).includes(value);
}

export function isCommunicativeSkill(value: unknown): value is CommunicativeSkill {
  return typeof value === "string" && (COMMUNICATIVE_SKILLS as readonly string[]).includes(value);
}

export function isTrend(value: unknown): value is Trend {
  return typeof value === "string" && (TRENDS as readonly string[]).includes(value);
}

export function isEstimateBasis(value: unknown): value is EstimateBasis {
  return typeof value === "string" && (ESTIMATE_BASES as readonly string[]).includes(value);
}

/** Recorte agregado (por tipo, por seção ou global). Notas na escala 0–100. */
export interface AggregateBucket {
  /** tentativas submetidas no recorte */
  attempts: number;
  /** tentativas com nota (verdict `scored`) */
  scoredAttempts: number;
  /** questões distintas (por `canonicalId`) no recorte */
  questionCount: number;
  /** última nota de tentativa (0–100) */
  lastScore: number | null;
  /** melhor nota de tentativa (0–100) */
  bestScore: number | null;
  /** média ponderada da janela recente, escala de TENTATIVA (0–100) */
  recentWeightedScore: number | null;
  /** tendência (`null` quando não há dados suficientes) */
  trend: Trend | null;
  confidence: Confidence;
  lastActivityAt: string | null;
}

/** Recorte por habilidade: acrescenta a estimativa 10–90 devidamente rotulada. */
export interface SkillAggregate extends AggregateBucket {
  skill: Skill;
  /** estimativa de treino 10–90; `null` sem dados/calibração */
  estimate: number | null;
  estimateBasis: EstimateBasis;
}

export interface Aggregates {
  /** versão do formato do cache; subir só de forma aditiva */
  version: 1;
  /** instante ISO do cálculo */
  computedAt: string;
  totalAttempts: number;
  /** questões distintas por `canonicalId` */
  totalQuestions: number;
  overall: AggregateBucket;
  byType: Partial<Record<TaskType, AggregateBucket>>;
  bySection: Partial<Record<Section, AggregateBucket>>;
  bySkill: Partial<Record<Skill, SkillAggregate>>;
}

/** Bucket vazio (sem tentativas) — base para `Aggregates` zerado. */
export function emptyBucket(): AggregateBucket {
  return {
    attempts: 0,
    scoredAttempts: 0,
    questionCount: 0,
    lastScore: null,
    bestScore: null,
    recentWeightedScore: null,
    trend: null,
    confidence: "low",
    lastActivityAt: null,
  };
}

/** Agregados zerados — estado inicial antes de qualquer tentativa. */
export function emptyAggregates(computedAt: string): Aggregates {
  return {
    version: 1,
    computedAt,
    totalAttempts: 0,
    totalQuestions: 0,
    overall: emptyBucket(),
    byType: {},
    bySection: {},
    bySkill: {},
  };
}
