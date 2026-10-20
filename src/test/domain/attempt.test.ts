/**
 * Contrato de tentativa (`src/domain/attempt.ts` + `parseAttempt`).
 *
 * O log é append-only e truncável; o contrato precisa garantir que o payload
 * corresponde ao tipo de tarefa e que os instantes são coerentes.
 */

import { describe, expect, it } from "vitest";

import {
  DomainValidationError,
  PAYLOAD_KIND_BY_TYPE,
  TASK_TYPES,
  expectedPayloadKind,
  isAttemptTypeCompatible,
  isEvaluated,
  isSubmitted,
  parseAttempt,
  parseAttemptPayload,
} from "@/domain";
import { LATER, NOW, validAttempt } from "./fixtures";

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

describe("parseAttempt", () => {
  it("aceita tentativa de texto concluída", () => {
    const attempt = parseAttempt(validAttempt());
    expect(attempt.attemptId).toBe("att-1");
    expect(attempt.payload).toEqual({ kind: "text", text: "The library closes at six." });
    expect(attempt.submittedAt).toBe(LATER);
    expect(isSubmitted(attempt)).toBe(true);
    expect(isEvaluated(attempt)).toBe(false);
  });

  it("aceita tentativa aberta (sem submittedAt)", () => {
    const attempt = parseAttempt(validAttempt({ submittedAt: null }));
    expect(attempt.submittedAt).toBeNull();
    expect(isSubmitted(attempt)).toBe(false);
  });

  it("aceita payload oral sem áudio, declarando a origem da transcrição", () => {
    const attempt = parseAttempt(
      validAttempt({
        questionId: "q-read_aloud-1",
        questionType: "read_aloud",
        payload: { kind: "spoken", durationMs: 12_000, audioRef: null, transcriptSource: "none" },
      }),
    );
    expect(attempt.payload.kind).toBe("spoken");
  });

  it("aceita payload de lacunas misto (índice e texto)", () => {
    const attempt = parseAttempt(
      validAttempt({
        questionId: "q-lst_fib-1",
        questionType: "lst_fib",
        payload: { kind: "blanks", values: ["sky", 2] },
      }),
    );
    expect(attempt.payload).toEqual({ kind: "blanks", values: ["sky", 2] });
  });

  it("recusa payload incompatível com o tipo de tarefa", () => {
    expectFailure(
      () =>
        parseAttempt(
          validAttempt({ questionType: "wfd", payload: { kind: "choice", selected: [0] } }),
        ),
      "attempt.payload.kind",
      "inconsistent",
    );
  });

  it("recusa submittedAt anterior a startedAt", () => {
    expectFailure(
      () => parseAttempt(validAttempt({ startedAt: LATER, submittedAt: NOW })),
      "attempt.submittedAt",
      "inconsistent",
    );
  });

  it("recusa modo desconhecido", () => {
    expectFailure(
      () => parseAttempt(validAttempt({ mode: "exam" })),
      "attempt.mode",
      "invalid_enum",
    );
  });

  it("recusa instante fora do formato ISO-8601", () => {
    expectFailure(
      () => parseAttempt(validAttempt({ startedAt: "15/01/2026 12:00" })),
      "attempt.startedAt",
      "not_iso_timestamp",
    );
  });

  it("recusa spoken com transcriptSource desconhecido", () => {
    expectFailure(
      () =>
        parseAttempt(
          validAttempt({
            questionType: "read_aloud",
            payload: { kind: "spoken", durationMs: 1, audioRef: null, transcriptSource: "ai" },
          }),
        ),
      "attempt.payload.transcriptSource",
      "invalid_enum",
    );
  });

  it("valida o resultado embutido quando presente", () => {
    expectFailure(
      () =>
        parseAttempt(
          validAttempt({
            result: {
              verdict: "scored",
              scale: "attempt_0_100",
              score: 50,
              confidence: "low",
              dimensions: [],
              evidence: [],
              feedback: "x",
              uncertainty: null,
              unmeasured: [],
              evaluator: { model: "m", promptVersion: "p", rubricVersion: "r" },
              scoredAt: LATER,
            },
          }),
        ),
      "attempt.result.dimensions",
      "inconsistent",
    );
  });
});

describe("mapa tipo → payload", () => {
  it("cobre os 22 tipos e bate com expectedPayloadKind", () => {
    expect(Object.keys(PAYLOAD_KIND_BY_TYPE)).toHaveLength(TASK_TYPES.length);
    for (const type of TASK_TYPES) {
      expect(expectedPayloadKind(type)).toBe(PAYLOAD_KIND_BY_TYPE[type]);
    }
    expect(expectedPayloadKind("read_aloud")).toBe("spoken");
    expect(expectedPayloadKind("lst_hiw")).toBe("highlights");
    expect(expectedPayloadKind("reorder_paragraphs")).toBe("order");
  });

  it("isAttemptTypeCompatible confere o kind", () => {
    expect(isAttemptTypeCompatible(validAttempt())).toBe(true);
    expect(
      isAttemptTypeCompatible(
        validAttempt({
          questionType: "read_mcq_single",
          payload: { kind: "choice", selected: [0] },
        }),
      ),
    ).toBe(true);
  });
});

describe("parseAttemptPayload", () => {
  it("aceita os 7 kinds", () => {
    const payloads = [
      { kind: "text", text: "" },
      { kind: "choice", selected: [0, 2] },
      { kind: "blanks", values: [0, "x"] },
      { kind: "order", order: [2, 0, 1] },
      { kind: "highlights", words: [3] },
      {
        kind: "spoken",
        durationMs: 1000,
        audioRef: "audio/1.webm",
        transcriptSource: "browser_stt",
      },
      { kind: "none" },
    ];
    for (const payload of payloads) {
      expect(parseAttemptPayload(payload).kind).toBe(payload.kind);
    }
  });

  it("recusa kind desconhecido", () => {
    expectFailure(() => parseAttemptPayload({ kind: "audio" }), "payload.kind", "invalid_enum");
  });
});
