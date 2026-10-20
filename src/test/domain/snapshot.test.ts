/**
 * Contrato de snapshot por questão (`src/domain/snapshot.ts` + `parseSnapshot`).
 *
 * O snapshot é a fonte das métricas e sobrevive ao truncamento do log. As datas
 * de estudo são chaves de dia local — nunca timestamps.
 */

import { describe, expect, it } from "vitest";

import {
  DomainValidationError,
  emptySnapshot,
  hasBeenReviewed,
  parseSnapshot,
  type QuestionSnapshot,
} from "@/domain";
import { NOW, validSnapshot } from "./fixtures";

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

describe("emptySnapshot", () => {
  it("começa sem tentativas, caixa zero e sem agenda", () => {
    const snapshot = emptySnapshot({ questionId: "q-1", questionType: "wfd", now: NOW });
    expect(snapshot).toMatchObject({
      questionId: "q-1",
      questionType: "wfd",
      canonicalId: "q-1",
      attempts: 0,
      scoredAttempts: 0,
      lastScore: null,
      bestScore: null,
      srsBox: 0,
      nextReviewDay: null,
      lastReviewedDay: null,
      errorCounts: {},
      favorite: false,
      privateNote: null,
      firstSeenAt: NOW,
      updatedAt: NOW,
    });
    expect(hasBeenReviewed(snapshot)).toBe(false);
  });

  it("aceita canonicalId de quase-duplicata", () => {
    const snapshot = emptySnapshot({
      questionId: "q-2",
      questionType: "wfd",
      canonicalId: "canon-1",
      now: NOW,
    });
    expect(snapshot.canonicalId).toBe("canon-1");
  });

  it("é revalidável pelo parser (ida e volta)", () => {
    const snapshot = emptySnapshot({ questionId: "q-1", questionType: "wfd", now: NOW });
    expect(parseSnapshot(snapshot)).toEqual(snapshot);
  });
});

describe("parseSnapshot", () => {
  it("aceita snapshot preenchido", () => {
    const snapshot = parseSnapshot(
      validSnapshot({
        attempts: 3,
        scoredAttempts: 2,
        lastScore: 70,
        bestScore: 85,
        lastSubmittedAt: NOW,
        srsBox: 2,
        nextReviewDay: "2026-01-18",
        lastReviewedDay: "2026-01-15",
        errorCounts: { content: 1, omission: 2 },
        favorite: true,
        privateNote: "rever conectores",
      }),
    );
    expect(snapshot.srsBox).toBe(2);
    expect(snapshot.nextReviewDay).toBe("2026-01-18");
    expect(snapshot.errorCounts.omission).toBe(2);
    expect(hasBeenReviewed(snapshot)).toBe(true);
  });

  it("recusa srsBox negativo", () => {
    expectFailure(
      () => parseSnapshot(validSnapshot({ srsBox: -1 })),
      "snapshot.srsBox",
      "out_of_range",
    );
  });

  it("recusa nextReviewDay como timestamp (regra de dia local)", () => {
    expectFailure(
      () => parseSnapshot(validSnapshot({ nextReviewDay: "2026-01-18T00:00:00.000Z" })),
      "snapshot.nextReviewDay",
      "not_local_day_key",
    );
  });

  it("recusa nextReviewDay com data inexistente", () => {
    expectFailure(
      () => parseSnapshot(validSnapshot({ nextReviewDay: "2026-02-30" })),
      "snapshot.nextReviewDay",
      "not_local_day_key",
    );
  });

  it("recusa scoredAttempts maior que attempts", () => {
    expectFailure(
      () => parseSnapshot(validSnapshot({ attempts: 1, scoredAttempts: 2 })),
      "snapshot.scoredAttempts",
      "inconsistent",
    );
  });

  it("recusa bestScore menor que lastScore", () => {
    expectFailure(
      () => parseSnapshot(validSnapshot({ lastScore: 80, bestScore: 60 })),
      "snapshot.bestScore",
      "inconsistent",
    );
  });

  it("recusa nota fora da escala de tentativa 0–100", () => {
    expectFailure(
      () => parseSnapshot(validSnapshot({ lastScore: 101, bestScore: 101 })),
      "snapshot.lastScore",
      "out_of_range",
    );
  });

  it("recusa categoria de erro desconhecida", () => {
    expectFailure(
      () => parseSnapshot(validSnapshot({ errorCounts: { grammar: 1 } })),
      "snapshot.errorCounts.grammar",
      "invalid_enum",
    );
  });

  it("recusa updatedAt anterior a firstSeenAt", () => {
    expectFailure(
      () =>
        parseSnapshot(validSnapshot({ firstSeenAt: NOW, updatedAt: "2026-01-14T12:00:00.000Z" })),
      "snapshot.updatedAt",
      "inconsistent",
    );
  });

  it("aceita privateNote vazia (nota apagada pelo aluno)", () => {
    const snapshot: QuestionSnapshot = parseSnapshot(validSnapshot({ privateNote: "" }));
    expect(snapshot.privateNote).toBe("");
  });
});
