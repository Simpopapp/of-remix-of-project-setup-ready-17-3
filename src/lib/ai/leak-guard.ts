/**
 * Guarda antivazamento do resultado de avaliação.
 *
 * Regra do produto (PRD central §4.4; PRD s1 §2.3): o navegador NUNCA recebe o
 * gabarito/transcrição reservada. Se o modelo ecoar um trecho reservado em qualquer
 * campo visível (feedback, evidência, justificativa, incerteza ou motivo), o
 * resultado é retido como `needs_review`, perde a nota e tem as evidências
 * contaminadas removidas.
 *
 * Falso positivo é limitado por desenho: amostras com menos de 25 caracteres
 * (palavras comuns) não disparam a retenção.
 *
 * Módulo puro: zero I/O.
 */

import type { EvaluationDimension, EvaluationEvidence, EvaluationResult } from "@/domain";

export const MIN_LEAK_SAMPLE_LENGTH = 25;
export const LEAK_REVIEW_REASON = "resultado retido para revisão de segurança";

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function usableSamples(referenceSamples: readonly string[]): string[] {
  return referenceSamples
    .map((sample) => normalize(sample))
    .filter((sample) => sample.length >= MIN_LEAK_SAMPLE_LENGTH);
}

function visibleTextsOf(result: EvaluationResult): string[] {
  const texts: string[] = [result.feedback, result.uncertainty ?? ""];
  for (const dimension of result.dimensions) texts.push(dimension.rationale ?? "");
  for (const evidence of result.evidence) {
    texts.push(evidence.observation, evidence.quote ?? "");
  }
  if (result.verdict === "abstained") texts.push(result.abstentionReason);
  if (result.verdict === "needs_review") texts.push(result.reviewReason);
  return texts.filter((text) => text.length > 0);
}

/** `true` quando algum campo visível contém uma amostra reservada. */
export function leaksReference(
  result: EvaluationResult,
  referenceSamples: readonly string[],
): boolean {
  const samples = usableSamples(referenceSamples);
  if (samples.length === 0) return false;
  const visible = visibleTextsOf(result).map(normalize);
  return samples.some((sample) => visible.some((text) => text.includes(sample)));
}

function cleanEvidence(
  evidence: EvaluationEvidence[],
  samples: readonly string[],
): EvaluationEvidence[] {
  return evidence.filter((item) => {
    const text = normalize(`${item.observation} ${item.quote ?? ""}`);
    return !samples.some((sample) => text.includes(sample));
  });
}

function cleanDimensions(
  dimensions: EvaluationDimension[],
  samples: readonly string[],
): EvaluationDimension[] {
  return dimensions.map((dimension) => {
    if (!dimension.rationale) return dimension;
    const contaminated = samples.some((sample) =>
      normalize(dimension.rationale ?? "").includes(sample),
    );
    if (!contaminated) return dimension;
    const { rationale: _rationale, ...rest } = dimension;
    return rest;
  });
}

/**
 * Retém o resultado se houver vazamento. Nunca lança e nunca devolve `score`
 * quando retém. `unmeasured` é preservado (é declaração de limitação, não conteúdo
 * da referência).
 */
export function sanitizeEvaluationResult(
  result: EvaluationResult,
  referenceSamples: readonly string[],
): EvaluationResult {
  const samples = usableSamples(referenceSamples);
  if (samples.length === 0 || !leaksReference(result, samples)) return result;

  return {
    scale: result.scale,
    verdict: "needs_review",
    score: null,
    confidence: result.confidence,
    dimensions: cleanDimensions(result.dimensions, samples),
    evidence: cleanEvidence(result.evidence, samples),
    feedback: "Resultado retido para revisão de segurança.",
    uncertainty: null,
    unmeasured: result.unmeasured,
    evaluator: result.evaluator,
    scoredAt: result.scoredAt,
    reviewReason: LEAK_REVIEW_REASON,
  };
}
