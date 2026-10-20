/**
 * Testes do plano do dia (F4.1).
 *
 * O que provamos aqui:
 * 1. Determinismo: mesma entrada ⇒ mesma saída (sem relógio, sem aleatório).
 * 2. Fila vencida só entra quando é conhecida e > 0 (null nunca vira falso 0).
 * 3. Seção sem histórico gera "explorar" na seção menos coberta, com empate
 *    resolvido pela ordem oficial.
 * 4. Meta: data ausente convida a Ajustes; data passada pede atualização.
 * 5. Honestidade: nenhum item fala de estimativa/prontidão (Fase 8), o teto
 *    de itens é respeitado e todo `href` é destino real do produto (nada de
 *    rota inventada).
 * 6. A agregação por seção usa os snapshots (fonte independente do log) e
 *    resiste a valores corrompidos.
 */

import { describe, expect, it } from "vitest";

import { emptySnapshot, type QuestionSnapshot, type TaskType } from "@/domain";
import {
  DAY_PLAN_MAX_ITEMS,
  SECTION_DISPLAY_NAMES,
  buildDayPlan,
  emptyPracticeBySection,
  leastPracticedSection,
  practiceBySectionFromSnapshots,
  totalPracticeAttempts,
  type DayPlanInput,
} from "@/lib/app/plano-do-dia";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/app/settings";

const TODAY = "2026-10-20";

function makeSettings(meta: Partial<AppSettings["meta"]> = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    meta: { ...DEFAULT_SETTINGS.meta, ...meta },
  };
}

function makeInput(overrides: Partial<DayPlanInput> = {}): DayPlanInput {
  return {
    settings: makeSettings(),
    dueCount: 0,
    practiceBySection: { speaking: 0, writing: 0, reading: 0, listening: 0 },
    todayKey: TODAY,
    ...overrides,
  };
}

let snapshotCounter = 0;

function snapshotOf(type: TaskType, attempts: number): QuestionSnapshot {
  snapshotCounter += 1;
  return {
    ...emptySnapshot({
      questionId: `q-${type}-${snapshotCounter}`,
      questionType: type,
      now: "2026-10-20T10:00:00.000Z",
    }),
    attempts,
  };
}

function itemText(input: DayPlanInput): string {
  return buildDayPlan(input)
    .map((item) => `${item.title} ${item.description}`)
    .join(" ")
    .toLowerCase();
}

describe("buildDayPlan — determinismo e limites", () => {
  it("devolve exatamente a mesma saída para a mesma entrada", () => {
    const input = makeInput({
      dueCount: 3,
      practiceBySection: { speaking: 4, writing: 0, reading: 2, listening: 9 },
      settings: makeSettings({ examDate: null }),
    });

    expect(buildDayPlan(input)).toEqual(buildDayPlan(input));
    expect(JSON.stringify(buildDayPlan(input))).toBe(JSON.stringify(buildDayPlan(input)));
  });

  it("não altera a entrada (função pura)", () => {
    const bySection = { speaking: 4, writing: 0, reading: 2, listening: 9 };
    const input = makeInput({ practiceBySection: bySection });
    const copy = { ...bySection };

    buildDayPlan(input);

    expect(bySection).toEqual(copy);
  });

  it("nunca passa do teto de itens", () => {
    const input = makeInput({
      dueCount: 12,
      practiceBySection: { speaking: 0, writing: 0, reading: 0, listening: 0 },
      settings: makeSettings({ examDate: null }),
    });

    const plan = buildDayPlan(input);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(DAY_PLAN_MAX_ITEMS);
  });

  it("sempre devolve ao menos um item, mesmo sem pendências", () => {
    const plan = buildDayPlan(
      makeInput({
        dueCount: 0,
        practiceBySection: { speaking: 5, writing: 3, reading: 4, listening: 6 },
        settings: makeSettings({ examDate: "2026-12-01" }),
      }),
    );

    expect(plan).toHaveLength(1);
    expect(plan[0]?.href).toBe("/catalogo");
  });
});

describe("buildDayPlan — fila de revisão (regra 1)", () => {
  it("põe a revisão em primeiro, com a contagem real", () => {
    const plan = buildDayPlan(makeInput({ dueCount: 5 }));

    expect(plan[0]?.kind).toBe("review");
    expect(plan[0]?.title).toContain("5");
    expect(plan[0]?.href).toBe("/sessoes");
  });

  it("usa singular para uma revisão", () => {
    const plan = buildDayPlan(makeInput({ dueCount: 1 }));
    expect(plan[0]?.title).toContain("1 item");
  });

  it("não cria revisão quando o número é desconhecido (null)", () => {
    const plan = buildDayPlan(makeInput({ dueCount: null }));
    expect(plan.some((item) => item.kind === "review")).toBe(false);
  });

  it("não cria revisão para zero nem para valores inválidos", () => {
    for (const dueCount of [0, -3, Number.NaN]) {
      const plan = buildDayPlan(makeInput({ dueCount }));
      expect(plan.some((item) => item.kind === "review")).toBe(false);
    }
  });
});

describe("buildDayPlan — seção menos coberta (regra 2)", () => {
  it("aponta para a seção sem histórico", () => {
    const plan = buildDayPlan(
      makeInput({
        practiceBySection: { speaking: 5, writing: 0, reading: 2, listening: 3 },
      }),
    );

    const explore = plan.find((item) => item.kind === "explore");
    expect(explore).toBeDefined();
    expect(explore?.title).toContain("Writing");
    expect(explore?.description).toContain("Writing");
    expect(explore?.href).toBe("/catalogo");
  });

  it("desempata pela ordem oficial das seções", () => {
    const plan = buildDayPlan(
      makeInput({
        practiceBySection: { speaking: 5, writing: 0, reading: 0, listening: 3 },
      }),
    );

    const explore = plan.find((item) => item.kind === "explore");
    expect(explore?.title).toContain("Writing");
  });

  it("não cria 'explorar' quando todas as seções têm histórico", () => {
    const plan = buildDayPlan(
      makeInput({
        practiceBySection: { speaking: 2, writing: 1, reading: 1, listening: 4 },
      }),
    );

    expect(plan.some((item) => item.kind === "explore")).toBe(false);
  });

  it("quando todas têm histórico, sugere a menos praticada", () => {
    const plan = buildDayPlan(
      makeInput({
        practiceBySection: { speaking: 2, writing: 7, reading: 1, listening: 4 },
      }),
    );

    const practice = plan.find((item) => item.title.startsWith("Continuar"));
    expect(practice?.title).toContain("Reading");
  });
});

describe("buildDayPlan — meta e data da prova (regra 3)", () => {
  it("sem data da prova, convida a definir a meta em Ajustes", () => {
    const plan = buildDayPlan(makeInput({ settings: makeSettings({ examDate: null }) }));

    const meta = plan.find((item) => item.href === "/ajustes");
    expect(meta).toBeDefined();
    expect(meta?.title.toLowerCase()).toContain("meta");
  });

  it("data no passado gera aviso para atualizar em Ajustes", () => {
    const plan = buildDayPlan(makeInput({ settings: makeSettings({ examDate: "2026-10-19" }) }));

    const meta = plan.find((item) => item.href === "/ajustes");
    expect(meta?.title).toContain("Atualizar a data");
    expect(meta?.description).toContain("2026-10-19");
  });

  it("data no futuro não cria item de Ajustes", () => {
    const plan = buildDayPlan(makeInput({ settings: makeSettings({ examDate: "2026-12-01" }) }));

    expect(plan.some((item) => item.href === "/ajustes")).toBe(false);
  });

  it("data de hoje não é tratada como passada", () => {
    const plan = buildDayPlan(makeInput({ settings: makeSettings({ examDate: TODAY }) }));

    expect(plan.some((item) => item.href === "/ajustes")).toBe(false);
  });
});

describe("buildDayPlan — honestidade (regra 4)", () => {
  it("nenhum item fala de estimativa, prontidão ou nota prevista", () => {
    const scenarios: DayPlanInput[] = [
      makeInput({ dueCount: 7 }),
      makeInput({
        practiceBySection: { speaking: 1, writing: 2, reading: 3, listening: 4 },
        settings: makeSettings({ examDate: "2026-12-01" }),
      }),
      makeInput({
        practiceBySection: { speaking: 0, writing: 0, reading: 0, listening: 0 },
        settings: makeSettings({ examDate: null }),
      }),
      makeInput({ dueCount: null }),
    ];

    for (const scenario of scenarios) {
      const text = itemText(scenario);
      expect(text).not.toContain("estimativa");
      expect(text).not.toContain("prontidão");
      expect(text).not.toContain("nota prevista");
      expect(text).not.toContain("desempenho");
    }
  });

  it("todos os itens têm título, descrição e href", () => {
    const plan = buildDayPlan(
      makeInput({
        dueCount: 2,
        practiceBySection: { speaking: 0, writing: 1, reading: 0, listening: 0 },
      }),
    );

    for (const item of plan) {
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(item.description.trim().length).toBeGreaterThan(0);
      expect(item.href.startsWith("/")).toBe(true);
    }
  });

  it("só aponta para destinos reais do produto", () => {
    const allowed = new Set(["/sessoes", "/catalogo", "/ajustes"]);
    const scenarios: DayPlanInput[] = [
      makeInput({ dueCount: 9, settings: makeSettings({ examDate: null }) }),
      makeInput({
        dueCount: 0,
        practiceBySection: { speaking: 3, writing: 3, reading: 3, listening: 3 },
        settings: makeSettings({ examDate: "2026-10-19" }),
      }),
      makeInput({ dueCount: null }),
    ];

    for (const scenario of scenarios) {
      for (const item of buildDayPlan(scenario)) {
        expect(allowed.has(item.href)).toBe(true);
      }
    }
  });

  it("nomeia as quatro seções do exame", () => {
    expect(Object.keys(SECTION_DISPLAY_NAMES).sort()).toEqual([
      "listening",
      "reading",
      "speaking",
      "writing",
    ]);
    for (const [section, label] of Object.entries(SECTION_DISPLAY_NAMES)) {
      expect(label.length).toBeGreaterThan(0);
      expect(section.length).toBeGreaterThan(0);
    }
  });
});

describe("agregação por seção a partir dos snapshots", () => {
  it("soma tentativas por seção", () => {
    const bySection = practiceBySectionFromSnapshots([
      snapshotOf("read_aloud", 2),
      snapshotOf("write_essay", 1),
      snapshotOf("read_fib_drag", 3),
      snapshotOf("wfd", 4),
      snapshotOf("rts", 5),
    ]);

    expect(bySection).toEqual({ speaking: 7, writing: 1, reading: 3, listening: 4 });
    expect(totalPracticeAttempts(bySection)).toBe(15);
  });

  it("trata valores corrompidos como zero", () => {
    const bySection = practiceBySectionFromSnapshots([
      snapshotOf("read_aloud", Number.NaN),
      { ...snapshotOf("read_aloud", 0), attempts: -9 },
      snapshotOf("read_aloud", 2.9),
    ]);

    expect(bySection.speaking).toBe(2);
  });

  it("devolve todas as seções zeradas sem snapshots", () => {
    expect(practiceBySectionFromSnapshots([])).toEqual(emptyPracticeBySection());
  });

  it("menor contagem respeita a ordem oficial no empate", () => {
    expect(leastPracticedSection({ speaking: 3, writing: 0, reading: 0, listening: 1 })).toBe(
      "writing",
    );
    expect(leastPracticedSection({ speaking: 0, writing: 0, reading: 2, listening: 1 })).toBe(
      "speaking",
    );
  });
});
