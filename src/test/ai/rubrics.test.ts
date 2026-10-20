/**
 * Rubricas por tipo — cobertura, pesos, honestidade de fala e penalidades.
 * Fase 5, pacote s2-rubricas.
 */

import { describe, expect, it } from "vitest";

import { TASK_TYPES, TASK_TYPES_BY_SECTION } from "@/domain";
import { EXAM_TASKS } from "@/data/exam-spec";
import { RUBRIC_VERSION, getRubric, hasRubric, listRubricTypes } from "@/lib/ai/rubrics";

const PENALTY_TYPES = ["read_mcq_multi", "lst_mcq_multi", "lst_hiw"] as const;
const SPEAKING = TASK_TYPES_BY_SECTION.speaking;

describe("registry de rubricas", () => {
  it("cobre exatamente os 22 tipos do domínio, sem sobra nem falta", () => {
    expect(listRubricTypes()).toEqual([...TASK_TYPES]);
    expect(listRubricTypes()).toHaveLength(22);
    expect(new Set(listRubricTypes()).size).toBe(22);
  });

  it("recusa tipo inexistente com erro claro", () => {
    expect(() => getRubric("nao_existe" as never)).toThrowError(/nao_existe/);
    expect(() => getRubric("nao_existe" as never)).toThrowError(/Nenhuma rubrica/);
    expect(hasRubric("nao_existe")).toBe(false);
    expect(hasRubric("wfd")).toBe(true);
  });

  it("devolve a mesma rubrica para o mesmo tipo (sem I/O, sem aleatoriedade)", () => {
    expect(getRubric("wfd")).toBe(getRubric("wfd"));
    expect(getRubric("read_aloud")).toBe(getRubric("read_aloud"));
  });

  it("toda rubrica declara versão rubric@N e tipo coerente", () => {
    for (const type of TASK_TYPES) {
      const rubric = getRubric(type);
      expect(rubric.type).toBe(type);
      expect(rubric.rubricVersion).toBe(RUBRIC_VERSION);
      expect(rubric.rubricVersion).toMatch(/^rubric@\d+$/);
    }
  });
});

describe("dimensões das 22 rubricas", () => {
  it.each([...TASK_TYPES])("%s tem dimensões com ids únicos e pesos que somam 1", (type) => {
    const rubric = getRubric(type);
    expect(rubric.dimensions.length).toBeGreaterThanOrEqual(1);

    const ids = rubric.dimensions.map((dimension) => dimension.id);
    expect(new Set(ids).size).toBe(ids.length);

    const total = rubric.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
    expect(Math.abs(total - 1)).toBeLessThanOrEqual(0.001);

    for (const dimension of rubric.dimensions) {
      expect(dimension.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(dimension.label.trim().length).toBeGreaterThan(0);
      expect(dimension.measurement.trim().length).toBeGreaterThan(0);
      expect(dimension.weight).toBeGreaterThan(0);
      expect(["measured", "proxy", "not_measured"]).toContain(dimension.defaultStatus);
    }
  });

  it.each([...TASK_TYPES])("%s tem regras de abstenção e referência declarada", (type) => {
    const rubric = getRubric(type);
    expect(rubric.abstentionRules.length).toBeGreaterThanOrEqual(1);
    for (const rule of rubric.abstentionRules) {
      expect(rule.trim().length).toBeGreaterThan(10);
    }
    expect(rubric.referenceUsage.trim().length).toBeGreaterThan(10);
    expect(rubric.caveats.length).toBeGreaterThanOrEqual(1);
  });

  it.each([...TASK_TYPES])("%s tem limite de conteúdo derivado do exam-spec", (type) => {
    const rubric = getRubric(type);
    const spec = EXAM_TASKS.find((task) => task.id === type);
    expect(spec).toBeDefined();
    if (spec?.contentLimit === undefined) {
      expect(rubric.inputLimits.note).toBeUndefined();
    } else {
      expect(rubric.inputLimits.note).toContain(spec.contentLimit);
    }
  });
});

describe("honestidade de Speaking", () => {
  it("pronúncia é not_measured em todos os tipos de fala", () => {
    expect(SPEAKING).toHaveLength(7);
    for (const type of SPEAKING) {
      const rubric = getRubric(type);
      const pronunciation = rubric.dimensions.find((dimension) => dimension.id === "pronunciation");
      if (type === "answer_short") {
        expect(pronunciation).toBeUndefined();
        continue;
      }
      expect(pronunciation, `${type} deve declarar pronunciation`).toBeDefined();
      expect(pronunciation?.defaultStatus).toBe("not_measured");
    }
  });

  it("fluência oral é proxy — nunca medida — nos tipos com fala aberta", () => {
    for (const type of SPEAKING) {
      if (type === "answer_short") continue;
      const fluency = getRubric(type).dimensions.find(
        (dimension) => dimension.id === "oral_fluency",
      );
      expect(fluency, `${type} deve declarar oral_fluency`).toBeDefined();
      expect(fluency?.defaultStatus).toBe("proxy");
      expect(fluency?.measurement.toLowerCase()).toContain("transcript");
    }
  });

  it("answer_short avalia conteúdo e não exige fluência nem pronúncia", () => {
    const rubric = getRubric("answer_short");
    expect(rubric.dimensions.map((dimension) => dimension.id)).toEqual(["content"]);
    expect(rubric.dimensions[0]?.weight).toBe(1);
    expect(rubric.caveats.join(" ")).toMatch(/uma palavra/i);
    expect(rubric.caveats.join(" ")).toMatch(/pronúncia/i);
  });
});

describe("penalidade oficial de seleção", () => {
  it("existe apenas nos três tipos oficiais", () => {
    const withPenalty = TASK_TYPES.filter((type) => getRubric(type).selectionPenalty === true);
    expect(withPenalty).toEqual([...PENALTY_TYPES]);
  });

  it.each([...PENALTY_TYPES])("%s explica a penalidade nas ressalvas", (type) => {
    const rubric = getRubric(type);
    expect(rubric.selectionPenalty).toBe(true);
    expect(rubric.caveats.join(" ")).toMatch(/penalidade/i);
  });
});

describe("limites de resposta derivados do formato", () => {
  it("swt exige 5–75 palavras", () => {
    expect(getRubric("swt").inputLimits).toMatchObject({ minWords: 5, maxWords: 75 });
  });

  it("write_essay aponta 200–300 palavras do exam-spec", () => {
    expect(getRubric("write_essay").inputLimits).toMatchObject({ minWords: 200, maxWords: 300 });
  });

  it("sst aponta 50–70 palavras do exam-spec", () => {
    expect(getRubric("sst").inputLimits).toMatchObject({ minWords: 50, maxWords: 70 });
  });

  it("wfd usa a faixa 3–15 e registra que ela vem do PRD, não do exam-spec", () => {
    const limits = getRubric("wfd").inputLimits;
    expect(limits).toMatchObject({ minWords: 3, maxWords: 15 });
    expect(limits.note).toMatch(/PRD/);
  });

  it("tipos sem limite de resposta não inventam faixa de palavras", () => {
    for (const type of TASK_TYPES) {
      if (["swt", "write_essay", "sst", "wfd"].includes(type)) continue;
      expect(getRubric(type).inputLimits.minWords).toBeUndefined();
      expect(getRubric(type).inputLimits.maxWords).toBeUndefined();
    }
  });
});

describe("dimensões cruzadas seguem a matriz do exam-spec", () => {
  it("lst_fib e wfd contribuem para writing", () => {
    for (const type of ["lst_fib", "wfd"] as const) {
      expect(getRubric(type).dimensions.map((dimension) => dimension.id)).toEqual([
        "listening",
        "writing",
      ]);
    }
  });

  it("lst_hcs e lst_hiw contribuem para reading", () => {
    for (const type of ["lst_hcs", "lst_hiw"] as const) {
      expect(getRubric(type).dimensions.map((dimension) => dimension.id)).toEqual([
        "listening",
        "reading",
      ]);
    }
  });

  it("lst_mcq_single é só listening, como no exam-spec", () => {
    expect(getRubric("lst_mcq_single").dimensions.map((dimension) => dimension.id)).toEqual([
      "listening",
    ]);
  });

  it("os 5 tipos de reading têm apenas a dimensão reading", () => {
    for (const type of TASK_TYPES_BY_SECTION.reading) {
      expect(getRubric(type).dimensions.map((dimension) => dimension.id)).toEqual(["reading"]);
    }
  });
});
