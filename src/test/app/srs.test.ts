import { describe, expect, it } from "vitest";
import { TASK_TYPES } from "@/domain";
import {
  DEFAULT_SRS_POLICY,
  SRS_POLICY_BY_TYPE,
  isSrsDue,
  maxSrsBox,
  nextReviewDayFor,
  passedForScore,
  reviewQueue,
  scheduleSrs,
  srsPolicyFor,
} from "@/lib/app/srs";

const EMPTY = { srsBox: 0, nextReviewDay: null, lastReviewedDay: null } as const;

describe("SRS (F3.4) — uma regra por teste", () => {
  it("regra 1: só promove quando a revisão está VENCIDA", () => {
    // Não vencida (revisão amanhã) + acerto → NÃO promove.
    const early = scheduleSrs(
      { srsBox: 3, nextReviewDay: "2026-02-10", lastReviewedDay: "2026-02-01" },
      { type: "wfd", today: "2026-02-09", passed: true },
    );
    expect(early.reason).toBe("early");
    expect(early.srsBox).toBe(3);
    expect(early.nextReviewDay).toBe("2026-02-10");

    // Vencida no próprio dia + acerto → promove exatamente UMA caixa.
    const due = scheduleSrs(
      { srsBox: 3, nextReviewDay: "2026-02-09", lastReviewedDay: "2026-02-01" },
      { type: "wfd", today: "2026-02-09", passed: true },
    );
    expect(due.reason).toBe("promoted");
    expect(due.srsBox).toBe(4);
    expect(due.nextReviewDay).toBe(nextReviewDayFor(4, "2026-02-09", SRS_POLICY_BY_TYPE.wfd));
  });

  it("regra 2: lapso rebaixa EXATAMENTE uma caixa (nunca duas, nunca zero)", () => {
    const lapsed = scheduleSrs(
      { srsBox: 4, nextReviewDay: "2026-02-01", lastReviewedDay: "2026-01-01" },
      { type: "read_mcq_single", today: "2026-02-09", passed: false },
    );
    expect(lapsed.reason).toBe("lapsed");
    expect(lapsed.srsBox).toBe(3);
    expect(lapsed.previousBox).toBe(4);

    const floor = scheduleSrs(
      { srsBox: 0, nextReviewDay: "2026-02-01", lastReviewedDay: null },
      { type: "read_mcq_single", today: "2026-02-09", passed: false },
    );
    expect(floor.srsBox).toBe(0);
  });

  it("regra 3: limiar/intervalos variam por tipo (wfd ≠ answer_short)", () => {
    expect(passedForScore("wfd", 65)).toBe(false);
    expect(passedForScore("answer_short", 65)).toBe(true);
    expect(passedForScore("wfd", 70)).toBe(true);
    expect(srsPolicyFor("wfd").passScore).toBeGreaterThan(srsPolicyFor("answer_short").passScore);

    const wfdNext = nextReviewDayFor(1, "2026-01-01", srsPolicyFor("wfd"));
    const shortNext = nextReviewDayFor(1, "2026-01-01", srsPolicyFor("answer_short"));
    expect(wfdNext).toBe("2026-01-04"); // [1,3,7,...] → caixa 1 = 3 dias
    expect(shortNext).toBe("2026-01-03"); // [1,2,4,...] → caixa 1 = 2 dias
    expect(srsPolicyFor("wfd").intervals.length).toBeGreaterThan(
      srsPolicyFor("read_mcq_single").intervals.length,
    );
  });

  it("primeira exposição agenda sem promover (mesmo com nota máxima)", () => {
    const first = scheduleSrs(EMPTY, { type: "wfd", today: "2026-03-01", passed: true });
    expect(first.reason).toBe("first_exposure");
    expect(first.srsBox).toBe(0);
    expect(first.nextReviewDay).toBe("2026-03-02");
    expect(first.lastReviewedDay).toBe("2026-03-01");
  });

  it("acertar 5 vezes em 5 minutos NÃO empurra a revisão para 30 dias", () => {
    let snapshot = {
      srsBox: 0,
      nextReviewDay: null as string | null,
      lastReviewedDay: null as string | null,
    };
    for (let i = 0; i < 5; i += 1) {
      const update = scheduleSrs(snapshot, { type: "wfd", today: "2026-03-01", passed: true });
      snapshot = {
        srsBox: update.srsBox,
        nextReviewDay: update.nextReviewDay,
        lastReviewedDay: update.lastReviewedDay,
      };
    }
    expect(snapshot.srsBox).toBe(0);
    expect(snapshot.nextReviewDay).toBe("2026-03-02");
  });

  it("abstenção (nota não medida) não altera o agendamento", () => {
    const snapshot = { srsBox: 2, nextReviewDay: "2026-04-01", lastReviewedDay: "2026-03-01" };
    const update = scheduleSrs(snapshot, { type: "wfd", today: "2026-03-15", passed: null });
    expect(update.reason).toBe("unmeasured");
    expect(update.changed).toBe(false);
    expect(update.srsBox).toBe(2);
    expect(update.nextReviewDay).toBe("2026-04-01");
  });

  it("lapso antecipado rebaixa e reagenda (não mantém item 'aprendido')", () => {
    const early = scheduleSrs(
      { srsBox: 3, nextReviewDay: "2026-05-01", lastReviewedDay: "2026-04-01" },
      { type: "wfd", today: "2026-04-10", passed: false },
    );
    expect(early.reason).toBe("lapsed");
    expect(early.srsBox).toBe(2);
    expect(early.nextReviewDay).toBe(nextReviewDayFor(2, "2026-04-10", srsPolicyFor("wfd")));
  });

  it("caixa é limitada ao maior intervalo da política", () => {
    const max = maxSrsBox(srsPolicyFor("read_mcq_single"));
    const update = scheduleSrs(
      { srsBox: max, nextReviewDay: "2026-01-01", lastReviewedDay: null },
      { type: "read_mcq_single", today: "2026-01-02", passed: true },
    );
    expect(update.srsBox).toBe(max);
  });

  it("fila de revisão: só vencidos, ordenados por data e id, nunca null", () => {
    const queue = reviewQueue(
      [
        { questionId: "b", nextReviewDay: "2026-01-05" },
        { questionId: "a", nextReviewDay: "2026-01-05" },
        { questionId: "futuro", nextReviewDay: "2026-01-06" },
        { questionId: "novo", nextReviewDay: null },
      ],
      "2026-01-05",
    );
    expect(queue.map((row) => row.questionId)).toEqual(["a", "b"]);
  });

  it("isSrsDue: null = nunca agendado (não vencido)", () => {
    expect(isSrsDue({ nextReviewDay: null }, "2026-01-01")).toBe(false);
    expect(isSrsDue({ nextReviewDay: "2026-01-01" }, "2026-01-01")).toBe(true);
    expect(isSrsDue({ nextReviewDay: "2026-01-02" }, "2026-01-01")).toBe(false);
  });

  it("política definida para TODOS os 22 tipos, com defaults válidos", () => {
    for (const type of TASK_TYPES) {
      const policy = srsPolicyFor(type);
      expect(policy.intervals.length).toBeGreaterThan(0);
      expect(policy.intervals.every((days) => Number.isInteger(days) && days > 0)).toBe(true);
      // intervalos estritamente crescentes (promoção sempre espaça mais)
      for (let i = 1; i < policy.intervals.length; i += 1) {
        expect(policy.intervals[i]!).toBeGreaterThan(policy.intervals[i - 1]!);
      }
      expect(policy.passScore).toBeGreaterThan(0);
      expect(policy.passScore).toBeLessThanOrEqual(100);
    }
    expect(DEFAULT_SRS_POLICY.intervals.length).toBeGreaterThan(0);
  });
});
