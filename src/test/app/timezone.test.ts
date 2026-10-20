import { describe, expect, it } from "vitest";
import { addLocalDays, diffLocalDays, localDayKey, localDayKeyOfTimestamp } from "@/domain";
import { ProgressStore } from "@/lib/app/storage";
import { clockAt, makeAttempt, makeDb, scoredEvaluation } from "./helpers";

function withTz<T>(tz: string, fn: () => T): T {
  const previous = process.env["TZ"];
  process.env["TZ"] = tz;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env["TZ"];
    else process.env["TZ"] = previous;
  }
}

async function withTzAsync<T>(tz: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env["TZ"];
  process.env["TZ"] = tz;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env["TZ"];
    else process.env["TZ"] = previous;
  }
}

describe("Chaves de dia local: America/Sao_Paulo (UTC-3)", () => {
  it("instante UTC à noite pertence ao dia local anterior (nunca UTC)", () => {
    withTz("America/Sao_Paulo", () => {
      const instant = new Date("2026-03-08T02:30:00.000Z");
      // Prova do erro que queremos impedir: o corte UTC diria 2026-03-08.
      expect(instant.toISOString().slice(0, 10)).toBe("2026-03-08");
      expect(localDayKey(instant)).toBe("2026-03-07");
      expect(localDayKeyOfTimestamp("2026-03-08T02:30:00.000Z")).toBe("2026-03-07");
    });
  });

  it("passos de 24 h não quebram na virada de dia local", () => {
    withTz("America/Sao_Paulo", () => {
      expect(addLocalDays("2026-03-07", 1)).toBe("2026-03-08");
      expect(addLocalDays("2026-03-08", 1)).toBe("2026-03-09");
      expect(diffLocalDays("2026-03-07", "2026-03-09")).toBe(2);
    });
  });

  it("SRS/armazenamento usam o dia local do envio", async () => {
    const harness = await makeDb("tz-sao-paulo");
    try {
      await withTzAsync("America/Sao_Paulo", async () => {
        const store = new ProgressStore({
          db: harness.db,
          now: clockAt("2026-03-08T02:30:00.000Z"),
          autoTruncate: false,
        });
        // sem `reviewDay`: o store deriva do submittedAt no fuso local
        const result = await store.submitAttempt(
          makeAttempt({
            questionId: "q-tz",
            startedAt: "2026-03-08T02:00:00.000Z",
            submittedAt: "2026-03-08T02:30:00.000Z",
            result: scoredEvaluation(80, "2026-03-08T02:30:00.000Z"),
          }),
          { questionType: "wfd" },
        );
        expect(result.snapshot.lastReviewedDay).toBe("2026-03-07");
        expect(result.snapshot.nextReviewDay).toBe("2026-03-08");
        expect(result.aggregates.overall.lastActivityAt).toBe("2026-03-08T02:30:00.000Z");
      });
    } finally {
      await harness.close();
    }
  });
});

describe("Chaves de dia local: America/New_York (DST)", () => {
  it("início do horário de verão (2026-03-08) mantém dias de calendário", () => {
    withTz("America/New_York", () => {
      // 2026-03-08 02:00 EST → 03:00 EDT (dia de 23 h)
      expect(addLocalDays("2026-03-07", 1)).toBe("2026-03-08");
      expect(addLocalDays("2026-03-08", 1)).toBe("2026-03-09");
      expect(diffLocalDays("2026-03-07", "2026-03-09")).toBe(2);

      const beforeSpring = new Date("2026-03-08T04:30:00.000Z"); // 23:30 de 07/03 EST
      expect(localDayKey(beforeSpring)).toBe("2026-03-07");
      const afterSpring = new Date("2026-03-09T03:30:00.000Z"); // 23:30 de 08/03 EDT
      expect(localDayKey(afterSpring)).toBe("2026-03-08");
    });
  });

  it("fim do horário de verão (2026-11-01, dia de 25 h) também preserva passos", () => {
    withTz("America/New_York", () => {
      expect(addLocalDays("2026-10-31", 1)).toBe("2026-11-01");
      expect(addLocalDays("2026-11-01", 1)).toBe("2026-11-02");
      expect(diffLocalDays("2026-10-31", "2026-11-02")).toBe(2);
      const repeatedHour = new Date("2026-11-01T05:30:00.000Z"); // 01:30 EDT (primeira passagem)
      expect(localDayKey(repeatedHour)).toBe("2026-11-01");
    });
  });

  it("revisão agendada no dia de DST continua sendo o dia seguinte", async () => {
    const harness = await makeDb("tz-new-york");
    try {
      await withTzAsync("America/New_York", async () => {
        const store = new ProgressStore({
          db: harness.db,
          now: clockAt("2026-03-08T04:30:00.000Z"),
          autoTruncate: false,
        });
        const result = await store.submitAttempt(
          makeAttempt({
            questionId: "q-dst",
            startedAt: "2026-03-08T04:00:00.000Z",
            submittedAt: "2026-03-08T04:30:00.000Z",
            result: scoredEvaluation(75, "2026-03-08T04:30:00.000Z"),
          }),
          { questionType: "wfd" },
        );
        expect(result.snapshot.lastReviewedDay).toBe("2026-03-07");
        expect(result.snapshot.nextReviewDay).toBe("2026-03-08");
      });
    } finally {
      await harness.close();
    }
  });
});
