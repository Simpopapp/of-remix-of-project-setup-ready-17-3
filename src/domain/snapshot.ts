/**
 * Contrato de snapshot por questão (`QuestionSnapshot`).
 *
 * Princípio "progresso que nunca se perde" (PRD §6.2/§10): o snapshot é escrito de
 * forma independente do log de tentativas, que pode ser truncado. Tudo que uma
 * métrica precisa (contagens, última/melhor nota, caixa SRS, próxima revisão,
 * erros por categoria, favorito, nota privada) vive aqui.
 *
 * Datas de estudo são `LocalDayKey` (`YYYY-MM-DD` no fuso do aluno) — nunca
 * timestamps UTC, porque passos de 24 h não podem quebrar com horário de verão.
 *
 * Consumidores: Fase 3 (storage/migração), Fase 7 (fila do dia/diagnóstico),
 * Fase 8 (agregados/estimativa), Fase 10 (notas privadas), Fase 11 (`canonicalId`).
 * Módulo puro: zero I/O.
 */

import type { LocalDayKey } from "./day";
import type { TaskType } from "./question";

/**
 * Categorias de diagnóstico de erro (project1 §2B). Ids estáveis em inglês;
 * rótulos pt-BR pertencem à UI.
 * - `content` — conteúdo ausente/incorreto
 * - `fluency` — hesitação, pausas, ritmo
 * - `omission` — omissões (palavras/ideias)
 * - `trap` — armadilha do tipo (distrator, ordem, penalidade)
 * - `most_missed_words` — palavras mais erradas
 */
export const ERROR_CATEGORIES = [
  "content",
  "fluency",
  "omission",
  "trap",
  "most_missed_words",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export function isErrorCategory(value: unknown): value is ErrorCategory {
  return typeof value === "string" && (ERROR_CATEGORIES as readonly string[]).includes(value);
}

/** Contagem de erros por categoria. Categorias ausentes = zero. */
export type ErrorCounts = Partial<Record<ErrorCategory, number>>;

export interface QuestionSnapshot {
  questionId: string;
  questionType: TaskType;
  /** identidade estatística — quase-duplicatas compartilham o valor */
  canonicalId: string;

  /** tentativas submetidas (todas) */
  attempts: number;
  /** tentativas que produziram nota (verdict `scored`) */
  scoredAttempts: number;
  /** última nota na escala de TENTATIVA (0–100); `null` se nunca pontuou */
  lastScore: number | null;
  /** melhor nota na escala de TENTATIVA (0–100); `null` se nunca pontuou */
  bestScore: number | null;
  /** instante ISO do último envio */
  lastSubmittedAt: string | null;

  /** caixa do SRS (inteiro >= 0); o limiar por tipo é definido na Fase 3 */
  srsBox: number;
  /** próximo dia de revisão (chave de dia local) — `null` = fora da agenda */
  nextReviewDay: LocalDayKey | null;
  /** último dia revisado (chave de dia local) */
  lastReviewedDay: LocalDayKey | null;

  errorCounts: ErrorCounts;
  favorite: boolean;
  /** anotação privada do aluno; `null` = sem nota */
  privateNote: string | null;

  /** instante ISO em que a questão entrou no progresso */
  firstSeenAt: string;
  /** instante ISO da última escrita no snapshot */
  updatedAt: string;
}

/** Campos mínimos para criar um snapshot vazio (`srsBox: 0`, sem nota). */
export interface NewSnapshotInit {
  questionId: string;
  questionType: TaskType;
  canonicalId?: string;
  /** instante ISO; por padrão o chamador deve passar `new Date().toISOString()` */
  now: string;
}

/**
 * Snapshot inicial de uma questão ainda não praticada.
 * `canonicalId` cai para `questionId` quando não informado (aliases vazio hoje).
 */
export function emptySnapshot(init: NewSnapshotInit): QuestionSnapshot {
  return {
    questionId: init.questionId,
    questionType: init.questionType,
    canonicalId: init.canonicalId ?? init.questionId,
    attempts: 0,
    scoredAttempts: 0,
    lastScore: null,
    bestScore: null,
    lastSubmittedAt: null,
    srsBox: 0,
    nextReviewDay: null,
    lastReviewedDay: null,
    errorCounts: {},
    favorite: false,
    privateNote: null,
    firstSeenAt: init.now,
    updatedAt: init.now,
  };
}

/** A questão já foi revisada ao menos uma vez? */
export function hasBeenReviewed(snapshot: QuestionSnapshot): boolean {
  return snapshot.lastReviewedDay !== null;
}
