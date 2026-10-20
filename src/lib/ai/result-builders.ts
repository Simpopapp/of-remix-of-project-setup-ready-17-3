/**
 * Construtores puros de resultados sem nota.
 *
 * Centralizam a regra "falha nunca vira zero": abstenção e revisão sempre têm
 * `score: null`, motivo em pt-BR e identidade de avaliação preenchida.
 */

import { ATTEMPT_SCORE_SCALE, type Confidence, type EvaluationResult } from "@/domain";

export interface EvaluationIdentity {
  model: string;
  promptVersion: string;
  rubricVersion: string;
}

interface ResultBase {
  scale: typeof ATTEMPT_SCORE_SCALE;
  confidence: Confidence;
  dimensions: EvaluationResult["dimensions"];
  evidence: EvaluationResult["evidence"];
  feedback: string;
  uncertainty: string | null;
  unmeasured: string[];
  evaluator: EvaluationIdentity;
  scoredAt: string;
}

export function baseEvaluationResult(identity: EvaluationIdentity, nowMs: number): ResultBase {
  return {
    scale: ATTEMPT_SCORE_SCALE,
    confidence: "low",
    dimensions: [],
    evidence: [],
    feedback: "",
    uncertainty: null,
    unmeasured: [],
    evaluator: identity,
    scoredAt: new Date(nowMs).toISOString(),
  };
}

export function abstainedResult(
  identity: EvaluationIdentity,
  nowMs: number,
  reason: string,
  feedback = "A avaliação não pôde ser concluída.",
): EvaluationResult {
  return {
    ...baseEvaluationResult(identity, nowMs),
    verdict: "abstained",
    score: null,
    feedback,
    abstentionReason: reason,
  };
}

export function needsReviewResult(
  identity: EvaluationIdentity,
  nowMs: number,
  reason: string,
  feedback = "A avaliação precisa de revisão antes de gerar nota.",
): EvaluationResult {
  return {
    ...baseEvaluationResult(identity, nowMs),
    verdict: "needs_review",
    score: null,
    feedback,
    reviewReason: reason,
  };
}
