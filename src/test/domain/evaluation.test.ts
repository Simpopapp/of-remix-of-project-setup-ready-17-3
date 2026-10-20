/**
 * Contrato do resultado de avaliação (`src/domain/evaluation.ts` + `parseEvaluationResult`).
 *
 * Honestidade embutida no tipo: abstenção nunca vira nota, dimensão não medida
 * não pode ter score e "não avaliado" precisa ser declarado em `unmeasured`.
 */

import { describe, expect, it } from "vitest";

import {
  ATTEMPT_SCORE_SCALE,
  DomainValidationError,
  attemptScoreOf,
  isScored,
  parseEvaluationResult,
} from "@/domain";
import { LATER, validEvaluation } from "./fixtures";

function expectFailure(run: () => unknown, path: string, code?: string): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DomainValidationError);
  const failure = caught as DomainValidationError;
  expect(failure.path).toBe(path);
  if (code !== undefined) expect(failure.code).toBe(code);
}

describe("parseEvaluationResult — scored", () => {
  it("aceita avaliação com nota, dimensão medida e evidência", () => {
    const result = parseEvaluationResult(validEvaluation());
    expect(result.verdict).toBe("scored");
    expect(result.scale).toBe(ATTEMPT_SCORE_SCALE);
    expect(isScored(result)).toBe(true);
    expect(attemptScoreOf(result)).toBe(82);
    expect(result.evaluator).toEqual({
      model: "test-model",
      promptVersion: "p1",
      rubricVersion: "r1",
    });
  });

  it("aceita dimensão proxy rotulada (fluência inferida de transcrição)", () => {
    const result = parseEvaluationResult(
      validEvaluation({
        dimensions: [
          { id: "content", label: "Conteúdo", status: "measured", score: 80 },
          { id: "oral_fluency", label: "Fluência (proxy)", status: "proxy", score: 70 },
        ],
        unmeasured: ["oral_fluency (proxy via transcrição)"],
      }),
    );
    expect(result.dimensions[1]?.status).toBe("proxy");
  });

  it("recusa escala de habilidade misturada com escala de tentativa", () => {
    expectFailure(
      () => parseEvaluationResult(validEvaluation({ scale: "skill_10_90" })),
      "result.scale",
      "invalid_literal",
    );
  });

  it("recusa nota fora de 0–100", () => {
    expectFailure(
      () => parseEvaluationResult(validEvaluation({ score: 120 })),
      "result.score",
      "out_of_range",
    );
  });

  it("recusa avaliação com nota sem evidência observável", () => {
    expectFailure(
      () => parseEvaluationResult(validEvaluation({ evidence: [] })),
      "result.evidence",
      "inconsistent",
    );
  });

  it("recusa avaliação com nota sem dimensão medida", () => {
    expectFailure(
      () =>
        parseEvaluationResult(
          validEvaluation({
            dimensions: [
              {
                id: "pronunciation",
                label: "Pronúncia",
                status: "not_measured",
                score: null,
              },
            ],
            unmeasured: ["pronunciation"],
          }),
        ),
      "result.dimensions",
      "inconsistent",
    );
  });

  it("recusa dimensão not_measured com score", () => {
    expectFailure(
      () =>
        parseEvaluationResult(
          validEvaluation({
            dimensions: [
              { id: "content", label: "Conteúdo", status: "measured", score: 80 },
              { id: "pronunciation", label: "Pronúncia", status: "not_measured", score: 50 },
            ],
            unmeasured: ["pronunciation"],
          }),
        ),
      "result.dimensions[1].score",
      "inconsistent",
    );
  });

  it("recusa dimensão não medida ausente de unmeasured", () => {
    expectFailure(
      () =>
        parseEvaluationResult(
          validEvaluation({
            dimensions: [
              { id: "content", label: "Conteúdo", status: "measured", score: 80 },
              { id: "pronunciation", label: "Pronúncia", status: "not_measured", score: null },
            ],
            unmeasured: [],
          }),
        ),
      "result.unmeasured",
      "inconsistent",
    );
  });

  it("recusa dimensão medida sem score", () => {
    expectFailure(
      () =>
        parseEvaluationResult(
          validEvaluation({
            dimensions: [{ id: "content", label: "Conteúdo", status: "measured", score: null }],
          }),
        ),
      "result.dimensions[0].score",
      "inconsistent",
    );
  });
});

describe("parseEvaluationResult — abstenção e revisão", () => {
  it("aceita abstenção sem nota, com motivo", () => {
    const result = parseEvaluationResult(
      validEvaluation({
        verdict: "abstained",
        score: null,
        abstentionReason: "Áudio inaudível.",
        dimensions: [{ id: "content", label: "Conteúdo", status: "not_measured", score: null }],
        evidence: [],
        unmeasured: ["content"],
      }),
    );
    expect(result.verdict).toBe("abstained");
    expect(isScored(result)).toBe(false);
    // Nunca um zero substituto.
    expect(attemptScoreOf(result)).toBeNull();
  });

  it("recusa abstenção com nota", () => {
    expectFailure(
      () =>
        parseEvaluationResult(
          validEvaluation({
            verdict: "abstained",
            score: 30,
            abstentionReason: "Áudio inaudível.",
            dimensions: [],
            evidence: [],
          }),
        ),
      "result.score",
      "inconsistent",
    );
  });

  it("recusa abstenção sem motivo", () => {
    expectFailure(
      () =>
        parseEvaluationResult(
          validEvaluation({
            verdict: "abstained",
            score: null,
            dimensions: [],
            evidence: [],
            unmeasured: [],
          }),
        ),
      "result.abstentionReason",
      "missing",
    );
  });

  it("aceita needs_review com motivo e sem nota", () => {
    const result = parseEvaluationResult(
      validEvaluation({
        verdict: "needs_review",
        score: null,
        reviewReason: "Serviço de avaliação indisponível.",
        dimensions: [],
        evidence: [],
        unmeasured: [],
        scoredAt: LATER,
      }),
    );
    expect(result.verdict).toBe("needs_review");
    expect(attemptScoreOf(result)).toBeNull();
  });

  it("recusa verdict desconhecido", () => {
    expectFailure(
      () => parseEvaluationResult(validEvaluation({ verdict: "approved" })),
      "result.verdict",
      "invalid_enum",
    );
  });

  it("recusa identidade de avaliador incompleta (reexecução precisa ser rastreável)", () => {
    expectFailure(
      () =>
        parseEvaluationResult(validEvaluation({ evaluator: { model: "m", promptVersion: "p" } })),
      "result.evaluator.rubricVersion",
      "missing",
    );
  });
});
