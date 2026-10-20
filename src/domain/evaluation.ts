/**
 * Contrato do resultado de avaliação por IA (`EvaluationResult`).
 *
 * Honestidade é parte do tipo, não só da UI:
 * - `scale` é literal `attempt_0_100`: a nota de TENTATIVA nunca se confunde com a
 *   estimativa de habilidade 10–90 (essa vive em `Aggregates.bySkill`).
 * - `verdict: "scored"` exige `score` numérico e ao menos uma dimensão medida e uma
 *   evidência observável.
 * - `abstained`/`needs_review` exigem `score: null` e um motivo em pt-BR: falha do
 *   serviço, mídia inaudível ou entrada insuficiente NUNCA viram nota determinística.
 * - Dimensão `not_measured` exige `score: null` e precisa aparecer em `unmeasured`
 *   (ex.: pronúncia sem análise real de áudio).
 * - Dimensão `proxy` é proxy rotulado (ex.: fluência inferida de transcrição).
 *
 * Consumidores: Fase 5 (harness/validador de schema do avaliador), Fase 6 (motores),
 * Fase 7 (histórico), Fase 8 (estimativa), Fase 9 (relatório pós-simulado).
 * Módulo puro: zero I/O.
 */

export const VERDICTS = ["scored", "abstained", "needs_review"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** `measured` = medido no sinal real · `proxy` = aproximação rotulada · `not_measured` = não avaliado */
export const DIMENSION_STATUSES = ["measured", "proxy", "not_measured"] as const;
export type DimensionStatus = (typeof DIMENSION_STATUSES)[number];

/** Escala da nota de tentativa (0–100). Separada da escala de habilidade (10–90). */
export const ATTEMPT_SCORE_SCALE = "attempt_0_100" as const;
export type AttemptScoreScale = typeof ATTEMPT_SCORE_SCALE;

export interface EvaluationDimension {
  /** id estável da rubrica (ex.: `content`, `oral_fluency`, `pronunciation`) */
  id: string;
  /** rótulo humano em pt-BR */
  label: string;
  status: DimensionStatus;
  /** 0–100; `null` quando `status === "not_measured"` */
  score: number | null;
  /** justificativa ancorada em evidência observável */
  rationale?: string;
}

export interface EvaluationEvidence {
  /** o que foi observado na resposta */
  observation: string;
  /** dimensão a que a evidência se refere */
  dimensionId?: string;
  /** trecho literal (da resposta ou da referência) que sustenta a observação */
  quote?: string;
}

/** Identidade da avaliação — permite reconhecer reexecução sem reescrever histórico. */
export interface EvaluatorIdentity {
  model: string;
  promptVersion: string;
  rubricVersion: string;
}

interface EvaluationResultBase {
  scale: AttemptScoreScale;
  confidence: Confidence;
  dimensions: EvaluationDimension[];
  evidence: EvaluationEvidence[];
  /** feedback acionável em pt-BR */
  feedback: string;
  /** limitações da medição, em pt-BR; `null` quando não há ressalva relevante */
  uncertainty: string | null;
  /** ids/rótulos do que não foi possível medir */
  unmeasured: string[];
  evaluator: EvaluatorIdentity;
  /** instante ISO-8601 (UTC) da avaliação */
  scoredAt: string;
}

/** Avaliação com nota de treino na escala 0–100. */
export interface ScoredEvaluationResult extends EvaluationResultBase {
  verdict: "scored";
  score: number;
}

/** Abstenção: o avaliador não pôde pontuar com honestidade. */
export interface AbstainedEvaluationResult extends EvaluationResultBase {
  verdict: "abstained";
  score: null;
  /** motivo da abstenção em pt-BR (ex.: "áudio inaudível") */
  abstentionReason: string;
}

/** Encaminhado para revisão humana/retry: entrada ambígua ou serviço instável. */
export interface NeedsReviewEvaluationResult extends EvaluationResultBase {
  verdict: "needs_review";
  score: null;
  /** motivo do encaminhamento em pt-BR */
  reviewReason: string;
}

export type EvaluationResult =
  ScoredEvaluationResult | AbstainedEvaluationResult | NeedsReviewEvaluationResult;

export function isScored(result: EvaluationResult): result is ScoredEvaluationResult {
  return result.verdict === "scored";
}

/**
 * A nota que pode alimentar snapshot/agregados: só existe quando `scored`.
 * Devolve `null` em abstenção/revisão — nunca um zero substituto.
 */
export function attemptScoreOf(result: EvaluationResult): number | null {
  return result.verdict === "scored" ? result.score : null;
}
