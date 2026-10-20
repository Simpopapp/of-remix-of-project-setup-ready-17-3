/**
 * Contrato de agregados (`src/domain/aggregates.ts` + `parseAggregates`).
 *
 * Duas regras de honestidade provadas aqui:
 * 1. escala de TENTATIVA (0–100) ≠ escala de HABILIDADE (10–90);
 * 2. estimativa 10–90 só existe rotulada como `calibrated` — sem calibração
 *    fica `null`/`uncalibrated` (nunca uma aproximação disfarçada).
 */

import { describe, expect, it } from "vitest";

import {
  DomainValidationError,
  SKILL_ESTIMATE_MAX,
  SKILL_ESTIMATE_MIN,
  emptyAggregates,
  emptyBucket,
  parseAggregates,
} from "@/domain";
import { NOW, validAggregates } from "./fixtures";

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

describe("emptyAggregates", () => {
  it("zera tudo e é revalidável", () => {
    const aggregates = emptyAggregates(NOW);
    expect(aggregates.version).toBe(1);
    expect(aggregates.totalAttempts).toBe(0);
    expect(aggregates.overall).toEqual(emptyBucket());
    expect(parseAggregates(aggregates)).toEqual(aggregates);
  });

  it("declara a faixa da estimativa de habilidade como 10–90", () => {
    expect(SKILL_ESTIMATE_MIN).toBe(10);
    expect(SKILL_ESTIMATE_MAX).toBe(90);
  });
});

describe("parseAggregates", () => {
  it("aceita recortes por tipo, seção e habilidade", () => {
    const aggregates = parseAggregates(
      validAggregates({
        totalAttempts: 4,
        totalQuestions: 2,
        overall: {
          attempts: 4,
          scoredAttempts: 4,
          questionCount: 2,
          lastScore: 75,
          bestScore: 88,
          recentWeightedScore: 80,
          trend: "improving",
          confidence: "medium",
          lastActivityAt: NOW,
        },
        byType: {
          wfd: {
            attempts: 4,
            scoredAttempts: 4,
            questionCount: 2,
            lastScore: 75,
            bestScore: 88,
            recentWeightedScore: 80,
            trend: "improving",
            confidence: "medium",
            lastActivityAt: NOW,
          },
        },
        bySection: {
          listening: {
            attempts: 4,
            scoredAttempts: 4,
            questionCount: 2,
            lastScore: 75,
            bestScore: 88,
            recentWeightedScore: 80,
            trend: "stable",
            confidence: "medium",
            lastActivityAt: NOW,
          },
        },
        bySkill: {
          listening: {
            skill: "listening",
            attempts: 4,
            scoredAttempts: 4,
            questionCount: 2,
            lastScore: 75,
            bestScore: 88,
            recentWeightedScore: 80,
            trend: "improving",
            confidence: "medium",
            lastActivityAt: NOW,
            estimate: 72,
            estimateBasis: "calibrated",
          },
        },
      }),
    );

    expect(aggregates.byType.wfd?.recentWeightedScore).toBe(80);
    expect(aggregates.bySkill.listening?.estimate).toBe(72);
    expect(aggregates.bySkill.listening?.estimateBasis).toBe("calibrated");
  });

  it("recusa estimativa acima da escala 10–90", () => {
    const base = validAggregates();
    const bucket = {
      attempts: 1,
      scoredAttempts: 1,
      questionCount: 1,
      lastScore: 70,
      bestScore: 70,
      recentWeightedScore: 70,
      trend: "stable",
      confidence: "low",
      lastActivityAt: NOW,
    };
    expectFailure(
      () =>
        parseAggregates({
          ...base,
          bySkill: {
            speaking: {
              ...bucket,
              skill: "speaking",
              estimate: 95,
              estimateBasis: "calibrated",
            },
          },
        }),
      "aggregates.bySkill.speaking.estimate",
      "out_of_range",
    );
  });

  it("recusa estimativa sem base calibrada (aproximação não pode parecer calibração)", () => {
    const base = validAggregates();
    const bucket = {
      attempts: 1,
      scoredAttempts: 1,
      questionCount: 1,
      lastScore: 70,
      bestScore: 70,
      recentWeightedScore: 70,
      trend: "stable",
      confidence: "low",
      lastActivityAt: NOW,
    };
    expectFailure(
      () =>
        parseAggregates({
          ...base,
          bySkill: {
            reading: { ...bucket, skill: "reading", estimate: 60, estimateBasis: "uncalibrated" },
          },
        }),
      "aggregates.bySkill.reading.estimateBasis",
      "inconsistent",
    );
  });

  it("recusa base calibrada sem estimativa", () => {
    const base = validAggregates();
    const bucket = {
      attempts: 1,
      scoredAttempts: 1,
      questionCount: 1,
      lastScore: 70,
      bestScore: 70,
      recentWeightedScore: 70,
      trend: "stable",
      confidence: "low",
      lastActivityAt: NOW,
    };
    expectFailure(
      () =>
        parseAggregates({
          ...base,
          bySkill: {
            writing: { ...bucket, skill: "writing", estimate: null, estimateBasis: "calibrated" },
          },
        }),
      "aggregates.bySkill.writing.estimate",
      "inconsistent",
    );
  });

  it("recusa nota de tentativa acima de 100", () => {
    expectFailure(
      () =>
        parseAggregates({
          ...validAggregates(),
          overall: { ...emptyBucket(), recentWeightedScore: 150 },
        }),
      "aggregates.overall.recentWeightedScore",
      "out_of_range",
    );
  });

  it("recusa tendência desconhecida", () => {
    expectFailure(
      () =>
        parseAggregates({
          ...validAggregates(),
          overall: { ...emptyBucket(), trend: "melhorando" as never },
        }),
      "aggregates.overall.trend",
      "invalid_enum",
    );
  });

  it("recusa tipo, seção e habilidade desconhecidos", () => {
    expectFailure(
      () => parseAggregates({ ...validAggregates(), byType: { reading_x: emptyBucket() } }),
      "aggregates.byType.reading_x",
      "invalid_enum",
    );
    expectFailure(
      () => parseAggregates({ ...validAggregates(), bySection: { grammar: emptyBucket() } }),
      "aggregates.bySection.grammar",
      "invalid_enum",
    );
    expectFailure(
      () => parseAggregates({ ...validAggregates(), bySkill: { listening_v2: emptyBucket() } }),
      "aggregates.bySkill.listening_v2",
      "invalid_enum",
    );
  });

  it("recusa versão de cache diferente de 1", () => {
    expectFailure(
      () => parseAggregates({ ...validAggregates(), version: 2 }),
      "aggregates.version",
      "invalid_literal",
    );
  });
});
