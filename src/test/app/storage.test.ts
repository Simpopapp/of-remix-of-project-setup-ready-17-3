import { describe, expect, it } from "vitest";
import type { QuestionSnapshot } from "@/domain";
import { PROGRESS_STORES, getStore, requestResult, type ProgressDatabase } from "@/lib/app/db";
import {
  DEFAULT_TRUNCATION_POLICY,
  ProgressStore,
  ProgressStoreError,
  deriveAggregates,
  mergeSnapshot,
  type ProgressStoreOptions,
} from "@/lib/app/storage";
import {
  abstainedEvaluation,
  clockAt,
  makeAttempt,
  makeDb,
  makeSnapshot,
  scoredEvaluation,
} from "./helpers";

const NOW = "2026-01-10T12:00:00";

function makeStore(
  db: ProgressDatabase,
  options: Partial<Omit<ProgressStoreOptions, "db">> = {},
): ProgressStore {
  return new ProgressStore({
    db,
    now: options.now ?? clockAt(NOW),
    autoTruncate: options.autoTruncate ?? false,
    ...(options.truncation === undefined ? {} : { truncation: options.truncation }),
    ...(options.srsPolicy === undefined ? {} : { srsPolicy: options.srsPolicy }),
    ...(options.derive === undefined ? {} : { derive: options.derive }),
    ...(options.skillWeights === undefined ? {} : { skillWeights: options.skillWeights }),
  });
}

describe("Storage: snapshots e agregados (F3.2)", () => {
  it("submeter grava snapshot + log + agregados atomicamente", async () => {
    const harness = await makeDb("submit");
    try {
      const store = makeStore(harness.db);
      const result = await store.submitAttempt(
        makeAttempt({ questionId: "q-wfd", result: scoredEvaluation(80) }),
        { questionType: "wfd", reviewDay: "2026-01-10" },
      );

      expect(result.snapshot).toMatchObject({
        questionId: "q-wfd",
        questionType: "wfd",
        attempts: 1,
        scoredAttempts: 1,
        lastScore: 80,
        bestScore: 80,
        srsBox: 0,
        nextReviewDay: "2026-01-11",
      });
      expect(await store.getAttemptLog()).toHaveLength(1);
      const aggregates = await store.getAggregates();
      expect(aggregates.totalAttempts).toBe(1);
      expect(aggregates.totalQuestions).toBe(1);
      expect(aggregates.byType.wfd?.lastScore).toBe(80);
      expect(aggregates.bySection.listening?.attempts).toBe(1);
      expect(aggregates.overall.recentWeightedScore).toBe(80);
      expect(aggregates.overall.confidence).toBe("low");
    } finally {
      await harness.close();
    }
  });

  it("mantém melhor nota e atualiza a última sem perder histórico", async () => {
    const harness = await makeDb("best");
    try {
      const store = makeStore(harness.db);
      await store.submitAttempt(
        makeAttempt({ attemptId: "a1", questionId: "q-1", result: scoredEvaluation(80) }),
        { questionType: "wfd", reviewDay: "2026-01-10" },
      );
      const second = await store.submitAttempt(
        makeAttempt({
          attemptId: "a2",
          questionId: "q-1",
          startedAt: "2026-01-10T12:05:00.000Z",
          submittedAt: "2026-01-10T12:06:00.000Z",
          result: scoredEvaluation(60, "2026-01-10T12:06:00.000Z"),
        }),
        { questionType: "wfd", reviewDay: "2026-01-10" },
      );
      expect(second.snapshot.attempts).toBe(2);
      expect(second.snapshot.scoredAttempts).toBe(2);
      expect(second.snapshot.bestScore).toBe(80);
      expect(second.snapshot.lastScore).toBe(60);
      expect(second.aggregates.totalAttempts).toBe(2);
    } finally {
      await harness.close();
    }
  });

  it("abstenção não vira nota: não conta scored e não agenda SRS", async () => {
    const harness = await makeDb("abstain");
    try {
      const store = makeStore(harness.db);
      const result = await store.submitAttempt(
        makeAttempt({
          questionId: "q-speak",
          questionType: "read_aloud",
          result: abstainedEvaluation(),
        }),
        { questionType: "read_aloud", reviewDay: "2026-01-10" },
      );
      expect(result.snapshot.attempts).toBe(1);
      expect(result.snapshot.scoredAttempts).toBe(0);
      expect(result.snapshot.lastScore).toBeNull();
      expect(result.snapshot.bestScore).toBeNull();
      expect(result.snapshot.nextReviewDay).toBeNull();
      expect(result.aggregates.totalAttempts).toBe(1);
      expect(result.aggregates.overall.scoredAttempts).toBe(0);
      expect(result.aggregates.overall.recentWeightedScore).toBeNull();
    } finally {
      await harness.close();
    }
  });

  it("acumula erros por categoria (diagnóstico da Fase 7)", async () => {
    const harness = await makeDb("errors");
    try {
      const store = makeStore(harness.db);
      await store.submitAttempt(
        makeAttempt({ attemptId: "e1", questionId: "q-1", result: scoredEvaluation(50) }),
        { questionType: "wfd", reviewDay: "2026-01-10", errorCategories: ["omission", "content"] },
      );
      const second = await store.submitAttempt(
        makeAttempt({ attemptId: "e2", questionId: "q-1", result: scoredEvaluation(50) }),
        { questionType: "wfd", reviewDay: "2026-01-10", errorCategories: ["omission"] },
      );
      expect(second.snapshot.errorCounts).toEqual({ omission: 2, content: 1 });
    } finally {
      await harness.close();
    }
  });

  it("tentativa fechada não pode ser reenviada (log append-only)", async () => {
    const harness = await makeDb("duplicate");
    try {
      const store = makeStore(harness.db);
      const attempt = makeAttempt({
        attemptId: "same",
        questionId: "q-1",
        result: scoredEvaluation(70),
      });
      await store.submitAttempt(attempt, { questionType: "wfd", reviewDay: "2026-01-10" });
      await expect(
        store.submitAttempt(attempt, { questionType: "wfd", reviewDay: "2026-01-10" }),
      ).rejects.toMatchObject({ code: "duplicate_attempt" });
      const snapshot = await store.getSnapshot("q-1");
      expect(snapshot?.attempts).toBe(1);
      expect(await store.getAttemptLog()).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it("rascunho aberto sobrevive ao reload e é finalizado no envio", async () => {
    const harness = await makeDb("open");
    try {
      const store = makeStore(harness.db);
      const draft = makeAttempt({ attemptId: "draft-1", questionId: "q-1", submittedAt: null });
      await store.recordOpenAttempt(draft);
      expect(await store.listOpenAttempts()).toHaveLength(1);

      const reopened = await harness.reopen();
      const store2 = makeStore(reopened);
      expect(await store2.listOpenAttempts()).toHaveLength(1);

      const finalized = makeAttempt({
        attemptId: "draft-1",
        questionId: "q-1",
        result: scoredEvaluation(75),
      });
      const result = await store2.submitAttempt(finalized, {
        questionType: "wfd",
        reviewDay: "2026-01-10",
      });
      expect(result.snapshot.attempts).toBe(1);
      expect(await store2.listOpenAttempts()).toHaveLength(0);
      expect(await store2.getAttemptLog()).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it("fila do dia reflete apenas revisões vencidas", async () => {
    const harness = await makeDb("due");
    try {
      const store = makeStore(harness.db);
      const result = await store.submitAttempt(
        makeAttempt({ questionId: "q-due", result: scoredEvaluation(80) }),
        { questionType: "wfd", reviewDay: "2026-01-09" },
      );
      expect(result.snapshot.nextReviewDay).toBe("2026-01-10");
      expect(await store.getDueSnapshots("2026-01-09")).toEqual([]);
      const due = await store.getDueSnapshots("2026-01-10");
      expect(due.map((snapshot) => snapshot.questionId)).toEqual(["q-due"]);
    } finally {
      await harness.close();
    }
  });

  it("não registra tentativa já submetida como rascunho", async () => {
    const harness = await makeDb("open-reject");
    try {
      const store = makeStore(harness.db);
      await expect(
        store.recordOpenAttempt(makeAttempt({ attemptId: "closed", questionId: "q-1" })),
      ).rejects.toMatchObject({ code: "attempt_not_submitted" });
      expect(await store.getAttemptLog()).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("atualiza favorito/nota sem tocar em métricas", async () => {
    const harness = await makeDb("meta");
    try {
      const store = makeStore(harness.db);
      await store.submitAttempt(makeAttempt({ questionId: "q-1", result: scoredEvaluation(70) }), {
        questionType: "wfd",
        reviewDay: "2026-01-10",
      });
      const updated = await store.updateSnapshotMeta("q-1", {
        favorite: true,
        privateNote: "revisar 'th'",
      });
      expect(updated.favorite).toBe(true);
      expect(updated.privateNote).toBe("revisar 'th'");
      expect(updated.attempts).toBe(1);
      expect(updated.lastScore).toBe(70);
      await expect(store.updateSnapshotMeta("missing", { favorite: true })).rejects.toBeInstanceOf(
        ProgressStoreError,
      );
    } finally {
      await harness.close();
    }
  });
});

describe("Storage: log truncável (F3.3)", () => {
  it("truncar o log NÃO perde métrica (snapshot/agregados independem)", async () => {
    const harness = await makeDb("truncate");
    try {
      const store = makeStore(harness.db, {
        truncation: { maxAttempts: 2, retentionDays: 3650 },
      });
      for (let i = 0; i < 5; i += 1) {
        await store.submitAttempt(
          makeAttempt({
            attemptId: `t-${i}`,
            questionId: `q-${i}`,
            startedAt: `2026-01-10T0${i}:00:00.000Z`,
            submittedAt: `2026-01-10T0${i}:30:00.000Z`,
            result: scoredEvaluation(60 + i, `2026-01-10T0${i}:30:00.000Z`),
          }),
          { questionType: "wfd", reviewDay: "2026-01-10" },
        );
      }
      expect(await store.getAttemptLog()).toHaveLength(5);
      const removed = await store.truncateAttemptLog(new Date(NOW));
      expect(removed).toBe(3);
      expect(await store.getAttemptLog()).toHaveLength(2);

      const recomputed = await store.recomputeAggregates();
      expect(recomputed.totalAttempts).toBe(5);
      expect(recomputed.totalQuestions).toBe(5);
      expect(await store.getSnapshots()).toHaveLength(5);
    } finally {
      await harness.close();
    }
  });

  it("truncagem nunca remove tentativa aberta", async () => {
    const harness = await makeDb("truncate-open");
    try {
      const store = makeStore(harness.db, {
        truncation: { maxAttempts: 1, retentionDays: 3650 },
      });
      await store.recordOpenAttempt(
        makeAttempt({ attemptId: "open-1", questionId: "q-open", submittedAt: null }),
      );
      for (let i = 0; i < 3; i += 1) {
        await store.submitAttempt(
          makeAttempt({
            attemptId: `s-${i}`,
            questionId: `q-${i}`,
            startedAt: `2026-01-10T0${i}:00:00.000Z`,
            submittedAt: `2026-01-10T0${i}:30:00.000Z`,
            result: scoredEvaluation(60, `2026-01-10T0${i}:30:00.000Z`),
          }),
          { questionType: "wfd", reviewDay: "2026-01-10" },
        );
      }
      await store.truncateAttemptLog(new Date(NOW));
      const log = await store.getAttemptLog();
      expect(log.map((attempt) => attempt.attemptId).sort()).toEqual(["open-1", "s-2"]);
    } finally {
      await harness.close();
    }
  });

  it("respeita a janela de retenção em dias locais", async () => {
    const harness = await makeDb("truncate-window");
    try {
      const store = makeStore(harness.db, {
        truncation: { maxAttempts: 100, retentionDays: 1 },
      });
      await store.submitAttempt(
        makeAttempt({
          attemptId: "old",
          questionId: "q-old",
          startedAt: "2026-01-01T10:00:00.000Z",
          submittedAt: "2026-01-01T10:05:00.000Z",
          result: scoredEvaluation(60),
        }),
        { questionType: "wfd", reviewDay: "2026-01-01" },
      );
      await store.submitAttempt(
        makeAttempt({
          attemptId: "today",
          questionId: "q-today",
          startedAt: "2026-01-10T10:00:00.000Z",
          submittedAt: "2026-01-10T10:05:00.000Z",
          result: scoredEvaluation(60),
        }),
        { questionType: "wfd", reviewDay: "2026-01-10" },
      );
      await store.truncateAttemptLog(new Date(NOW));
      const log = await store.getAttemptLog();
      expect(log.map((attempt) => attempt.attemptId)).toEqual(["today"]);
    } finally {
      await harness.close();
    }
  });

  it("política padrão é explícita e conservadora", () => {
    expect(DEFAULT_TRUNCATION_POLICY.maxAttempts).toBeGreaterThan(0);
    expect(DEFAULT_TRUNCATION_POLICY.retentionDays).toBeGreaterThan(0);
  });
});

describe("Derivação de agregados", () => {
  it("bySkill só existe com pesos injetados (nunca inventa matriz)", () => {
    const snapshots = [makeSnapshot({ questionId: "q1", questionType: "wfd" })];
    const without = deriveAggregates(snapshots, {
      computedAt: "2026-01-10T12:00:00.000Z",
      today: "2026-01-10",
    });
    expect(without.bySkill).toEqual({});

    const withWeights = deriveAggregates(snapshots, {
      computedAt: "2026-01-10T12:00:00.000Z",
      today: "2026-01-10",
      skillWeights: (type) => (type === "wfd" ? { listening: 0.6, writing: 0.4 } : undefined),
    });
    expect(Object.keys(withWeights.bySkill).sort()).toEqual(["listening", "writing"]);
    expect(withWeights.bySkill.listening?.estimate).toBeNull();
    expect(withWeights.bySkill.listening?.estimateBasis).toBe("uncalibrated");
  });

  it("tendência usa histórico diário (declining/improving/stable)", () => {
    const history = [
      {
        key: "overall|2026-01-09",
        series: "overall",
        day: "2026-01-09",
        recentWeightedScore: 90,
        scoredAttempts: 1,
      },
      {
        key: "type:wfd|2026-01-09",
        series: "type:wfd",
        day: "2026-01-09",
        recentWeightedScore: 90,
        scoredAttempts: 1,
      },
    ];
    const declining = deriveAggregates([makeSnapshot({ lastScore: 60, bestScore: 60 })], {
      computedAt: "2026-01-10T12:00:00.000Z",
      today: "2026-01-10",
      history,
    });
    expect(declining.overall.trend).toBe("declining");
    expect(declining.byType.wfd?.trend).toBe("declining");

    const stable = deriveAggregates([makeSnapshot({ lastScore: 89, bestScore: 89 })], {
      computedAt: "2026-01-10T12:00:00.000Z",
      today: "2026-01-10",
      history,
    });
    expect(stable.overall.trend).toBe("stable");

    const improvingHistory = [{ ...history[0]!, recentWeightedScore: 50 }];
    const improving = deriveAggregates([makeSnapshot({ lastScore: 70, bestScore: 70 })], {
      computedAt: "2026-01-10T12:00:00.000Z",
      today: "2026-01-10",
      history: improvingHistory,
    });
    expect(improving.overall.trend).toBe("improving");
  });

  it("sem ponto anterior não inventa tendência", () => {
    const aggregates = deriveAggregates([makeSnapshot()], {
      computedAt: "2026-01-10T12:00:00.000Z",
      today: "2026-01-10",
    });
    expect(aggregates.overall.trend).toBeNull();
  });

  it("tendência é gravada no histórico ao submeter (não depende do log)", async () => {
    const harness = await makeDb("history");
    try {
      // ponto do dia anterior, como se o aluno tivesse estudado ontem
      await harness.db.transaction([PROGRESS_STORES.aggregateHistory], "readwrite", async (tx) => {
        await requestResult(
          getStore(tx, PROGRESS_STORES.aggregateHistory).put({
            key: "overall|2026-01-09",
            series: "overall",
            day: "2026-01-09",
            recentWeightedScore: 90,
            scoredAttempts: 1,
          }),
        );
      });
      const store = makeStore(harness.db);
      const result = await store.submitAttempt(
        makeAttempt({
          questionId: "q-1",
          startedAt: "2026-01-10T11:00:00.000Z",
          submittedAt: "2026-01-10T11:30:00.000Z",
          result: scoredEvaluation(60, "2026-01-10T11:30:00.000Z"),
        }),
        { questionType: "wfd", reviewDay: "2026-01-10" },
      );
      expect(result.aggregates.overall.trend).toBe("declining");
      const history = await store.getHistory();
      expect(history.some((point) => point.key === "overall|2026-01-10")).toBe(true);
    } finally {
      await harness.close();
    }
  });
});

describe("Mesclagem de snapshots (sem perda)", () => {
  it("max de contadores, melhor nota máxima, caixa maior, revisão mais cedo", () => {
    const existing = makeSnapshot({
      attempts: 2,
      scoredAttempts: 2,
      bestScore: 70,
      lastScore: 60,
      srsBox: 2,
      nextReviewDay: "2026-02-10",
      favorite: false,
      errorCounts: { content: 1 },
    });
    const incoming = makeSnapshot({
      attempts: 3,
      scoredAttempts: 2,
      bestScore: 80,
      lastScore: 50,
      srsBox: 1,
      nextReviewDay: "2026-02-01",
      favorite: true,
      errorCounts: { content: 2, omission: 1 },
      lastSubmittedAt: "2026-01-09T12:00:00.000Z",
    });
    const merged: QuestionSnapshot = mergeSnapshot(existing, incoming);
    expect(merged.attempts).toBe(3);
    expect(merged.scoredAttempts).toBe(2);
    expect(merged.bestScore).toBe(80);
    expect(merged.lastScore).toBe(60); // última submissão é a existente
    expect(merged.srsBox).toBe(2);
    expect(merged.nextReviewDay).toBe("2026-02-01");
    expect(merged.favorite).toBe(true);
    expect(merged.errorCounts).toEqual({ content: 2, omission: 1 });
  });

  it("colisão de id com tipo diferente mantém o snapshot local", () => {
    const existing = makeSnapshot({ questionType: "wfd" });
    const incoming = makeSnapshot({ questionType: "read_mcq_single" });
    expect(mergeSnapshot(existing, incoming)).toBe(existing);
  });
});
