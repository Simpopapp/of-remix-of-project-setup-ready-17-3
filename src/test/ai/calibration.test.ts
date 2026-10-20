/**
 * Fase 5/s4 — corpus, relatório e runner de calibração.
 *
 * Prova, contra o banco real:
 * - todo id do corpus existe no tipo declarado e o payload passa nos limites de s1;
 * - cobertura dos 22 tipos, sem duplicatas, com notas 0–100 e respostas não vazias;
 * - a matemática do relatório (MAE/agreement/level) nas quatro classes e fronteiras;
 * - o runner agrega o que o avaliador devolveu, conta abstenções, isola exceções e
 *   produz um DTO serializável.
 *
 * O adaptador fake é injetado; nenhuma chamada real ao gateway acontece aqui.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { CALIBRATION_CORPUS, itemsForType } from "@/data/ai/calibration/corpus";
import { MAX_CALIBRATION_TYPES, parseCalibrationInput } from "@/data/ai/calibration/input";
import { loadQuestionsByType } from "@/data/loader";
import {
  ATTEMPT_SCORE_SCALE,
  TASK_TYPES,
  type EvaluationResult,
  type Question,
  type TaskType,
  type Verdict,
} from "@/domain";
import {
  createEvaluationAdapter,
  validateEvaluationInput,
  type EvaluateInput,
  type EvaluationAdapter,
} from "@/lib/ai/adapter.server";
import {
  buildCalibrationReport,
  computeTypeConsistency,
  isCalibrationSufficient,
  type CalibrationOutcome,
  type CalibrationReport,
} from "@/lib/ai/calibration-report";
import { runCalibration, type CalibrationLogEntry } from "@/lib/ai/calibration.server";

const FIXED_NOW = Date.parse("2026-10-20T12:00:00.000Z");
const WFD_REFERENCE = "Scientists are discovering new links between genes and diseases.";
const WFD_064_REFERENCE =
  "There are more opportunities to receive the grants in most artistic fields.";

const BANK_BY_TYPE = new Map<TaskType, Map<string, Question>>();

beforeAll(async () => {
  const loaded = await Promise.all(
    TASK_TYPES.map(async (type) => [type, await loadQuestionsByType(type)] as const),
  );
  for (const [type, questions] of loaded) {
    BANK_BY_TYPE.set(type, new Map(questions.map((question) => [question.id, question])));
  }
}, 30_000);

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function scored(score: number): EvaluationResult {
  return {
    scale: ATTEMPT_SCORE_SCALE,
    verdict: "scored",
    score,
    confidence: "high",
    dimensions: [
      {
        id: "content",
        label: "Conteúdo",
        status: "measured",
        score,
        rationale: "A resposta cobre o conteúdo esperado.",
      },
    ],
    evidence: [
      {
        observation: "A resposta apresenta o ponto principal da tarefa.",
        dimensionId: "content",
      },
    ],
    feedback: "Avaliação de treino concluída.",
    uncertainty: null,
    unmeasured: [],
    evaluator: { model: "fake-model", promptVersion: "prompt@1", rubricVersion: "rubric@1" },
    scoredAt: "2026-10-20T12:00:00.000Z",
  };
}

function abstained(reason: string): EvaluationResult {
  return {
    scale: ATTEMPT_SCORE_SCALE,
    verdict: "abstained",
    score: null,
    confidence: "low",
    dimensions: [],
    evidence: [],
    feedback: "Não foi possível avaliar esta resposta.",
    uncertainty: null,
    unmeasured: [],
    evaluator: { model: "fake-model", promptVersion: "prompt@1", rubricVersion: "rubric@1" },
    scoredAt: "2026-10-20T12:00:00.000Z",
    abstentionReason: reason,
  };
}

function outcome(
  type: TaskType,
  questionId: string,
  referenceScore: number,
  verdict: Verdict = "scored",
  score: number | null = referenceScore,
): CalibrationOutcome {
  return { type, questionId, referenceScore, verdict, score };
}

function fixedOutcomes(referenceScore: number, deltas: readonly number[]): CalibrationOutcome[] {
  return deltas.map((delta, index) =>
    outcome("wfd", `q-${String(index)}`, referenceScore, "scored", referenceScore + delta),
  );
}

function assertJsonSafe(value: unknown, path = "report"): void {
  expect(value, `${path} não pode ser undefined`).not.toBeUndefined();
  expect(typeof value, `${path} não pode ser função`).not.toBe("function");
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertJsonSafe(entry, `${path}[${String(index)}]`);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertJsonSafe(entry, `${path}.${key}`);
    }
  }
}

describe("F5.4.1 — corpus de calibração", () => {
  it("cobre os 22 tipos com exatamente dois itens cada (44 entradas)", () => {
    expect(CALIBRATION_CORPUS).toHaveLength(44);
    for (const type of TASK_TYPES) {
      expect(itemsForType(type), `itens de ${type}`).toHaveLength(2);
    }
  });

  it("usa apenas ids reais do banco, no tipo declarado", () => {
    for (const item of CALIBRATION_CORPUS) {
      const bank = BANK_BY_TYPE.get(item.type);
      expect(bank, `banco de ${item.type}`).toBeDefined();
      const question = bank?.get(item.questionId);
      expect(question, `${item.type}/${item.questionId} deve existir no banco`).toBeDefined();
      expect(question?.type, `${item.type}/${item.questionId} deve ser do tipo declarado`).toBe(
        item.type,
      );
    }
  });

  it("não repete o par (tipo, questão)", () => {
    const keys = CALIBRATION_CORPUS.map((item) => `${item.type}:${item.questionId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("tem notas inteiras 0–100 e justificativa não vazia", () => {
    for (const item of CALIBRATION_CORPUS) {
      expect(Number.isInteger(item.referenceScore), `${item.questionId} inteiro`).toBe(true);
      expect(item.referenceScore).toBeGreaterThanOrEqual(0);
      expect(item.referenceScore).toBeLessThanOrEqual(100);
      expect(item.note.trim().length, `${item.questionId} note`).toBeGreaterThan(10);
    }
  });

  it("tem resposta de amostra não vazia, num único campo, e payload válido em s1", () => {
    for (const item of CALIBRATION_CORPUS) {
      const text = item.response.text ?? item.response.transcript ?? "";
      expect(text.trim().length, `${item.questionId} resposta vazia`).toBeGreaterThan(0);
      expect(
        Boolean(item.response.text) && Boolean(item.response.transcript),
        `${item.questionId} não deve ter text e transcript juntos`,
      ).toBe(false);
      expect(
        validateEvaluationInput({
          type: item.type,
          questionId: item.questionId,
          response: item.response,
          mode: "practice",
        }),
        `${item.questionId} deve passar nos limites de s1`,
      ).toEqual({ ok: true });
    }
  });

  it("respeita os limites de palavras dos tipos que os têm", () => {
    const limits: {
      type: TaskType;
      field: "text" | "transcript";
      min: number;
      max: number;
    }[] = [
      { type: "swt", field: "text", min: 5, max: 75 },
      { type: "write_essay", field: "text", min: 200, max: 300 },
      { type: "sst", field: "text", min: 50, max: 70 },
      { type: "wfd", field: "text", min: 3, max: 15 },
      { type: "read_aloud", field: "transcript", min: 1, max: 60 },
    ];

    for (const limit of limits) {
      for (const item of itemsForType(limit.type)) {
        const text = item.response[limit.field] ?? "";
        const words = countWords(text);
        expect(words, `${item.questionId} mínimo de palavras`).toBeGreaterThanOrEqual(limit.min);
        expect(words, `${item.questionId} máximo de palavras`).toBeLessThanOrEqual(limit.max);
      }
    }
  });
});

describe("F5.4.2 — consistência por tipo", () => {
  it("devolve insufficient para tipo sem itens ou com menos de dois", () => {
    expect(computeTypeConsistency("wfd", [])).toEqual({
      type: "wfd",
      itemCount: 0,
      scoredCount: 0,
      abstentionCount: 0,
      meanAbsoluteError: 0,
      agreementWithin10: 0,
      level: "insufficient",
    });

    expect(computeTypeConsistency("wfd", fixedOutcomes(80, [0]))).toMatchObject({
      itemCount: 1,
      scoredCount: 1,
      level: "insufficient",
    });
  });

  it("classifica high no caso sem abstenções e com erro baixo", () => {
    const consistency = computeTypeConsistency("wfd", fixedOutcomes(80, [0, 5, -5, 10, -10]));

    expect(consistency).toMatchObject({
      itemCount: 5,
      scoredCount: 5,
      abstentionCount: 0,
      meanAbsoluteError: 6,
      agreementWithin10: 1,
      level: "high",
    });
  });

  it("classifica high na fronteira MAE 10 / agreement 0,8", () => {
    expect(computeTypeConsistency("wfd", fixedOutcomes(40, [0, 0, 0, 0, 50]))).toMatchObject({
      meanAbsoluteError: 10,
      agreementWithin10: 0.8,
      level: "high",
    });
  });

  it("classifica medium na fronteira MAE 15 / agreement 0,6", () => {
    expect(computeTypeConsistency("wfd", fixedOutcomes(40, [0, 0, 0, 25, 50]))).toMatchObject({
      meanAbsoluteError: 15,
      agreementWithin10: 0.6,
      level: "medium",
    });
  });

  it("classifica low quando o erro passa de 15", () => {
    expect(computeTypeConsistency("wfd", fixedOutcomes(40, [0, 0, 0, 30, 60]))).toMatchObject({
      meanAbsoluteError: 18,
      agreementWithin10: 0.6,
      level: "low",
    });
  });

  it("conta abstenções e impede high mesmo com erro zero", () => {
    const items = [
      outcome("wfd", "scored", 80, "scored", 80),
      outcome("wfd", "abstained", 80, "abstained", null),
      outcome("wfd", "review", 80, "needs_review", null),
    ];

    expect(computeTypeConsistency("wfd", items)).toMatchObject({
      itemCount: 3,
      scoredCount: 1,
      abstentionCount: 2,
      meanAbsoluteError: 0,
      agreementWithin10: 1,
      level: "medium",
    });
  });

  it("ignora itens de outro tipo", () => {
    const items = [
      outcome("wfd", "wfd-1", 80, "scored", 80),
      outcome("wfd", "wfd-2", 80, "scored", 80),
      outcome("sst", "sst-1", 80, "scored", 20),
    ];

    expect(computeTypeConsistency("wfd", items)).toMatchObject({
      itemCount: 2,
      scoredCount: 2,
      meanAbsoluteError: 0,
      level: "high",
    });
  });

  it("encerra o DTO com delta nulo para abstenções e serializa sem undefined", () => {
    const report = buildCalibrationReport(
      [outcome("wfd", "wfd-1", 80, "scored", 75), outcome("wfd", "wfd-2", 80, "abstained", null)],
      { types: ["wfd"], generatedAt: "2026-10-20T12:00:00.000Z" },
    );

    expect(report.generatedAt).toBe("2026-10-20T12:00:00.000Z");
    expect(report.items).toEqual([
      {
        type: "wfd",
        questionId: "wfd-1",
        referenceScore: 80,
        verdict: "scored",
        score: 75,
        delta: -5,
      },
      {
        type: "wfd",
        questionId: "wfd-2",
        referenceScore: 80,
        verdict: "abstained",
        score: null,
        delta: null,
      },
    ]);
    assertJsonSafe(report);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("só libera suficiência para high e medium", () => {
    const report: CalibrationReport = {
      generatedAt: "2026-10-20T12:00:00.000Z",
      perType: [
        {
          type: "wfd",
          itemCount: 2,
          scoredCount: 2,
          abstentionCount: 0,
          meanAbsoluteError: 0,
          agreementWithin10: 1,
          level: "high",
        },
        {
          type: "sst",
          itemCount: 2,
          scoredCount: 2,
          abstentionCount: 0,
          meanAbsoluteError: 15,
          agreementWithin10: 0.6,
          level: "medium",
        },
        {
          type: "swt",
          itemCount: 2,
          scoredCount: 2,
          abstentionCount: 0,
          meanAbsoluteError: 30,
          agreementWithin10: 0.2,
          level: "low",
        },
        {
          type: "rts",
          itemCount: 0,
          scoredCount: 0,
          abstentionCount: 0,
          meanAbsoluteError: 0,
          agreementWithin10: 0,
          level: "insufficient",
        },
      ],
      items: [],
    };

    expect(isCalibrationSufficient(report, "wfd")).toBe(true);
    expect(isCalibrationSufficient(report, "sst")).toBe(true);
    expect(isCalibrationSufficient(report, "swt")).toBe(false);
    expect(isCalibrationSufficient(report, "rts")).toBe(false);
    expect(isCalibrationSufficient(report, "read_aloud")).toBe(false);
  });
});

describe("F5.4.3 — runner com adaptador fake", () => {
  it("agrega a matemática do avaliador e devolve um DTO determinístico", async () => {
    const calls: EvaluateInput[] = [];
    const adapter = createEvaluationAdapter({
      callModel: async (input) => {
        calls.push(input);
        const text = input.untrusted.map((part) => part.content).join("\n");
        return scored(text.includes("Scientists are discovering") ? 95 : 75);
      },
      log: () => undefined,
    });

    const report = await runCalibration(
      { types: ["wfd"] },
      { adapter, nowMs: () => FIXED_NOW, log: () => undefined },
    );

    expect(report.perType).toEqual([
      {
        type: "wfd",
        itemCount: 2,
        scoredCount: 2,
        abstentionCount: 0,
        meanAbsoluteError: 5,
        agreementWithin10: 1,
        level: "high",
      },
    ]);
    expect(report.items).toEqual([
      {
        type: "wfd",
        questionId: "goarno-wfd-001",
        referenceScore: 100,
        verdict: "scored",
        score: 95,
        delta: -5,
      },
      {
        type: "wfd",
        questionId: "cand-85-wfd-064",
        referenceScore: 70,
        verdict: "scored",
        score: 75,
        delta: 5,
      },
    ]);
    expect(report.generatedAt).toBe("2026-10-20T12:00:00.000Z");
    assertJsonSafe(report);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.systemPrompt).toContain(WFD_REFERENCE);
    expect(calls[0]?.systemPrompt).toContain("RUBRICA DO TIPO DE TAREFA");
    expect(calls[1]?.systemPrompt).toContain(WFD_064_REFERENCE);
    const secondUntrusted = (calls[1]?.untrusted ?? []).map((part) => part.content).join("\n");
    expect(secondUntrusted).not.toContain(WFD_064_REFERENCE);
    expect(secondUntrusted).toContain("There are more opportunities to receive grants");
  });

  it("conta abstained como abstenção e não entra no MAE", async () => {
    const adapter: EvaluationAdapter = {
      async evaluate(input) {
        return input.questionId === "goarno-wfd-001"
          ? abstained("referência indisponível")
          : scored(70);
      },
    };

    const report = await runCalibration(
      { types: ["wfd"] },
      { adapter, nowMs: () => FIXED_NOW, log: () => undefined },
    );

    expect(report.items[0]).toMatchObject({
      verdict: "abstained",
      score: null,
      delta: null,
    });
    expect(report.items[1]).toMatchObject({ verdict: "scored", delta: 0 });
    expect(report.perType[0]).toMatchObject({
      itemCount: 2,
      scoredCount: 1,
      abstentionCount: 1,
      meanAbsoluteError: 0,
      level: "medium",
    });
  });

  it("isola exceção por item como needs_review e preserva o lote", async () => {
    const logs: CalibrationLogEntry[] = [];
    const adapter: EvaluationAdapter = {
      async evaluate(input) {
        if (input.questionId === "cand-85-wfd-064") throw new Error("falha simulada");
        return scored(100);
      },
    };

    const report = await runCalibration(
      { types: ["wfd"] },
      { adapter, nowMs: () => FIXED_NOW, log: (entry) => logs.push(entry) },
    );

    expect(report.items[1]).toMatchObject({
      verdict: "needs_review",
      score: null,
      delta: null,
    });
    expect(report.perType[0]).toMatchObject({
      scoredCount: 1,
      abstentionCount: 1,
      level: "medium",
    });
    expect(logs.find((entry) => entry.questionId === "cand-85-wfd-064")?.errorKind).toBe(
      "unexpected_error",
    );
    expect(JSON.stringify(logs)).not.toContain("Scientists are discovering");
  });

  it("trata questão ausente no banco como abstenção", async () => {
    const adapter: EvaluationAdapter = {
      async evaluate() {
        return scored(90);
      },
    };

    const report = await runCalibration(
      { types: ["wfd"] },
      {
        adapter,
        loadQuestionsByType: async () => [],
        nowMs: () => FIXED_NOW,
        log: () => undefined,
      },
    );

    expect(report.items).toHaveLength(2);
    expect(report.items.every((item) => item.verdict === "abstained")).toBe(true);
    expect(report.perType[0]).toMatchObject({
      scoredCount: 0,
      abstentionCount: 2,
      level: "insufficient",
    });
  });

  it("deduplica tipos, usa a ordem canônica e não chama o avaliador para lista vazia", async () => {
    let calls = 0;
    const adapter: EvaluationAdapter = {
      async evaluate() {
        calls += 1;
        return scored(80);
      },
    };

    const report = await runCalibration(
      { types: ["wfd", "read_aloud", "wfd"] },
      { adapter, nowMs: () => FIXED_NOW, log: () => undefined },
    );

    expect(report.perType.map((entry) => entry.type)).toEqual(["read_aloud", "wfd"]);
    expect(report.items.filter((item) => item.type === "wfd")).toHaveLength(2);
    expect(report.items.filter((item) => item.type === "read_aloud")).toHaveLength(2);

    calls = 0;
    const empty = await runCalibration(
      { types: [] },
      { adapter, nowMs: () => FIXED_NOW, log: () => undefined },
    );
    expect(empty.perType).toEqual([]);
    expect(empty.items).toEqual([]);
    expect(calls).toBe(0);
  });

  it("classifica corpus vazio por tipo como insufficient sem lançar", () => {
    const report = buildCalibrationReport([], {
      types: ["read_aloud"],
      generatedAt: "2026-10-20T12:00:00.000Z",
    });

    expect(report.perType).toEqual([
      {
        type: "read_aloud",
        itemCount: 0,
        scoredCount: 0,
        abstentionCount: 0,
        meanAbsoluteError: 0,
        agreementWithin10: 0,
        level: "insufficient",
      },
    ]);
  });
});

describe("F5.4.3 — validação do input público", () => {
  it("aceita ausência de tipos, lista vazia e deduplica", () => {
    expect(parseCalibrationInput({})).toEqual({});
    expect(parseCalibrationInput({ types: [] })).toEqual({ types: [] });
    expect(parseCalibrationInput({ types: ["wfd", "wfd", "read_aloud"] })).toEqual({
      types: ["wfd", "read_aloud"],
    });
    expect(parseCalibrationInput({ types: [...TASK_TYPES, ...TASK_TYPES] })).toEqual({
      types: [...TASK_TYPES],
    });
    expect(MAX_CALIBRATION_TYPES).toBe(22);
  });

  it("rejeita tipo inválido, formato inválido e campo extra", () => {
    expect(() => parseCalibrationInput({ types: ["not_a_task"] })).toThrow();
    expect(() => parseCalibrationInput({ types: "wfd" })).toThrow();
    expect(() => parseCalibrationInput({ types: [1] })).toThrow();
    expect(() => parseCalibrationInput({ types: ["wfd"], extra: true })).toThrow();
    expect(() => parseCalibrationInput(null)).toThrow();
  });
});
