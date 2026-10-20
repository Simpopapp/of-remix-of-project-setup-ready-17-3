import { describe, expect, it } from "vitest";

import {
  EXAM_META,
  EXAM_SOURCES,
  EXAM_TASKS,
  EXAM_TASK_ORDER,
  FULL_MOCK_BLUEPRINT,
  MINI_MOCK_ID,
  MINI_MOCK_NOTE,
  PERSONAL_INTRODUCTION,
} from "@/data/exam-spec";

const EXPECTED_IDS = [
  "read_aloud",
  "repeat_sentence",
  "describe_image",
  "retell_lecture",
  "answer_short",
  "sgd",
  "rts",
  "swt",
  "write_essay",
  "read_fib_dropdown",
  "read_mcq_multi",
  "reorder_paragraphs",
  "read_fib_drag",
  "read_mcq_single",
  "sst",
  "lst_mcq_multi",
  "lst_fib",
  "lst_hcs",
  "lst_mcq_single",
  "lst_smw",
  "lst_hiw",
  "wfd",
] as const;

const VALID_SKILLS = ["speaking", "writing", "reading", "listening"] as const;
const VALID_SECTIONS = ["speaking", "writing", "reading", "listening"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const examSpecModules = import.meta.glob("../data/exam-spec.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});
const examSpecSource = String(Object.values(examSpecModules)[0] ?? "");

const taskById = (id: string) => {
  const task = EXAM_TASKS.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`Tipo ausente na spec: ${id}`);
  return task;
};

const asRange = (value: number | [number, number]): [number, number] =>
  typeof value === "number" ? [value, value] : value;

describe("exam-spec — catálogo dos 22 tipos", () => {
  it("contém exatamente os 22 ids do banco, na ordem oficial", () => {
    expect(EXAM_TASKS).toHaveLength(22);
    expect(EXAM_TASKS.map((task) => task.id)).toEqual([...EXPECTED_IDS]);
    expect(EXAM_TASK_ORDER).toEqual([...EXPECTED_IDS]);
  });

  it("não repete ids nem nomes", () => {
    const ids = EXAM_TASKS.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = EXAM_TASKS.map((task) => task.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("distribui os tipos por seção conforme o formato (7/2/5/8)", () => {
    const countBySection = (section: string) =>
      EXAM_TASKS.filter((task) => task.section === section).length;
    expect(countBySection("speaking")).toBe(7);
    expect(countBySection("writing")).toBe(2);
    expect(countBySection("reading")).toBe(5);
    expect(countBySection("listening")).toBe(8);
  });

  it("preenche nome oficial, nome em pt-BR, seção válida e limite de conteúdo", () => {
    for (const task of EXAM_TASKS) {
      expect(task.name.length, task.id).toBeGreaterThan(0);
      expect(task.namePt.length, task.id).toBeGreaterThan(0);
      expect(VALID_SECTIONS).toContain(task.section);
      expect(task.contentLimit, task.id).toBeTruthy();
    }
  });

  it("usa número ou faixa válida em scoredTasksInExam", () => {
    for (const task of EXAM_TASKS) {
      const [min, max] = asRange(task.scoredTasksInExam);
      expect(Number.isInteger(min), task.id).toBe(true);
      expect(Number.isInteger(max), task.id).toBe(true);
      expect(min, task.id).toBeGreaterThanOrEqual(1);
      expect(max, task.id).toBeGreaterThanOrEqual(min);
    }
  });
});

describe("exam-spec — matriz tarefa×habilidade", () => {
  it("preenche scoredSkills com habilidades válidas e sem duplicatas", () => {
    for (const task of EXAM_TASKS) {
      expect(task.scoredSkills.length, task.id).toBeGreaterThan(0);
      expect(new Set(task.scoredSkills).size, task.id).toBe(task.scoredSkills.length);
      for (const skill of task.scoredSkills) {
        expect(VALID_SKILLS).toContain(skill);
      }
    }
  });

  it("toda tarefa de Reading pontua Reading e toda tarefa de Listening pontua Listening", () => {
    for (const task of EXAM_TASKS.filter((candidate) => candidate.section === "reading")) {
      expect(task.scoredSkills, task.id).toContain("reading");
    }
    for (const task of EXAM_TASKS.filter((candidate) => candidate.section === "listening")) {
      expect(task.scoredSkills, task.id).toContain("listening");
    }
  });

  it("Answer Short Question é a única tarefa de Speaking que não pontua Speaking (fonte oficial)", () => {
    const speakingTasks = EXAM_TASKS.filter((task) => task.section === "speaking");
    const withoutSpeaking = speakingTasks.filter((task) => !task.scoredSkills.includes("speaking"));
    expect(withoutSpeaking.map((task) => task.id)).toEqual(["answer_short"]);
    expect(taskById("answer_short").scoredSkills).toEqual(["listening"]);
  });

  it("codifica a matriz oficial dos tipos que pontuam mais de uma habilidade", () => {
    expect(taskById("repeat_sentence").scoredSkills).toEqual(["listening", "speaking"]);
    expect(taskById("retell_lecture").scoredSkills).toEqual(["listening", "speaking"]);
    expect(taskById("sgd").scoredSkills).toEqual(["listening", "speaking"]);
    expect(taskById("swt").scoredSkills).toEqual(["reading", "writing"]);
    expect(taskById("sst").scoredSkills).toEqual(["listening", "writing"]);
    expect(taskById("lst_fib").scoredSkills).toEqual(["listening", "writing"]);
    expect(taskById("wfd").scoredSkills).toEqual(["listening", "writing"]);
    expect(taskById("lst_hcs").scoredSkills).toEqual(["listening", "reading"]);
    expect(taskById("lst_hiw").scoredSkills).toEqual(["listening", "reading"]);
  });

  it("codifica a matriz oficial dos tipos de habilidade única", () => {
    expect(taskById("describe_image").scoredSkills).toEqual(["speaking"]);
    expect(taskById("rts").scoredSkills).toEqual(["speaking"]);
    expect(taskById("write_essay").scoredSkills).toEqual(["writing"]);
    expect(taskById("read_mcq_single").scoredSkills).toEqual(["reading"]);
    expect(taskById("lst_mcq_multi").scoredSkills).toEqual(["listening"]);
  });

  it("declara aproximação onde as fontes oficiais divergem (Read Aloud)", () => {
    const readAloud = taskById("read_aloud");
    expect(readAloud.weightsApproximation).toBe(true);
    expect(readAloud.scoredSkills).toEqual(["speaking", "reading"]);
    expect(readAloud.notes).toMatch(/diverg/i);
    expect(readAloud.notes).toMatch(/Score Guide/i);
  });
});

describe("exam-spec — tempos e limites por tipo", () => {
  it("não atribui preparação a tarefas sem preparação", () => {
    for (const id of ["repeat_sentence", "answer_short"]) {
      expect(taskById(id).preparationSeconds, id).toBeUndefined();
    }
    for (const task of EXAM_TASKS.filter((candidate) =>
      ["reading", "writing", "listening"].includes(candidate.section),
    )) {
      expect(task.preparationSeconds, task.id).toBeUndefined();
    }
  });

  it("registra os tempos de preparação oficiais das tarefas de fala", () => {
    expect(taskById("read_aloud").preparationSeconds).toBe(30);
    expect(taskById("describe_image").preparationSeconds).toBe(25);
    expect(taskById("retell_lecture").preparationSeconds).toBe(10);
    expect(taskById("sgd").preparationSeconds).toBe(10);
    expect(taskById("rts").preparationSeconds).toBe(10);
  });

  it("registra as janelas de resposta oficiais", () => {
    expect(taskById("repeat_sentence").responseSeconds).toBe(15);
    expect(taskById("describe_image").responseSeconds).toBe(40);
    expect(taskById("retell_lecture").responseSeconds).toBe(40);
    expect(taskById("answer_short").responseSeconds).toBe(10);
    expect(taskById("sgd").responseSeconds).toBe(120);
    expect(taskById("rts").responseSeconds).toBe(40);
    expect(taskById("swt").responseSeconds).toBe(600);
    expect(taskById("write_essay").responseSeconds).toBe(1200);
    expect(taskById("sst").responseSeconds).toBe(600);
    expect(taskById("read_aloud").responseSeconds).toBe("until_audio");
  });

  it("usa tempo compartilhado da seção em Reading e Listening, exceto o resumo cronometrado", () => {
    for (const task of EXAM_TASKS.filter((candidate) =>
      ["reading", "listening"].includes(candidate.section),
    )) {
      if (task.id === "sst") {
        expect(task.responseSeconds, task.id).toBe(600);
      } else {
        expect(task.responseSeconds, task.id).toBe("shared_section");
      }
    }
  });

  it("registra os limites de conteúdo que corrigem a base de trabalho anterior", () => {
    expect(taskById("read_fib_dropdown").contentLimit).toContain("200");
    expect(taskById("read_mcq_multi").contentLimit).toContain("350");
    expect(taskById("reorder_paragraphs").contentLimit).toContain("110");
    expect(taskById("read_fib_drag").contentLimit).toContain("80");
    expect(taskById("lst_mcq_multi").contentLimit).toContain("80–120");
    expect(taskById("wfd").contentLimit).toContain("3–5");
    expect(taskById("swt").contentLimit).toContain("5–75");
    expect(taskById("write_essay").contentLimit).toContain("200–300");
    expect(taskById("sst").contentLimit).toContain("50–70");
  });
});

describe("exam-spec — metadados do formato", () => {
  it("declara vigência, total de tipos, faixa de questões e escala", () => {
    expect(EXAM_META.formatEffectiveFrom).toBe("2025-08-07");
    expect(EXAM_META.scoredTaskTypeCount).toBe(EXAM_TASKS.length);
    expect(EXAM_META.totalScoredQuestions).toEqual([65, 75]);
    expect(EXAM_META.overallScoreScale).toEqual([10, 90]);
    expect(EXAM_META.skillScoreScale).toEqual([10, 90]);
  });

  it("lista as três partes na ordem oficial com duração e nº de tipos", () => {
    expect(EXAM_META.sections.map((section) => section.id)).toEqual(["part-1", "part-2", "part-3"]);
    expect(EXAM_META.sections.map((section) => section.minutes)).toEqual([
      [76, 84],
      [23, 30],
      [31, 39],
    ]);
    expect(EXAM_META.sections.map((section) => section.questionTypes)).toEqual([9, 5, 8]);
  });

  it("registra os 7 tipos com revisão humana de Content", () => {
    expect(EXAM_META.humanReviewedTypes).toHaveLength(7);
    for (const id of EXAM_META.humanReviewedTypes) {
      expect(EXPECTED_IDS).toContain(id);
    }
  });

  it("mantém o Personal Introduction fora dos 22 tipos e não pontuado", () => {
    expect(PERSONAL_INTRODUCTION.scored).toBe(false);
    expect(PERSONAL_INTRODUCTION.preparationSeconds).toBe(25);
    expect(PERSONAL_INTRODUCTION.responseSeconds).toBe(30);
    expect(EXAM_TASKS.map((task) => task.id)).not.toContain(PERSONAL_INTRODUCTION.id);
  });
});

describe("exam-spec — blueprint do simulado", () => {
  it("cobre os 22 tipos exatamente uma vez, na ordem oficial", () => {
    const blueprintTypes = FULL_MOCK_BLUEPRINT.sections.flatMap((section) =>
      section.tasks.map((task) => task.type),
    );
    expect(blueprintTypes).toEqual([...EXPECTED_IDS]);
    expect(new Set(blueprintTypes).size).toBe(22);
  });

  it("usa contagens dentro das faixas oficiais e soma 65 questões", () => {
    let total = 0;
    for (const section of FULL_MOCK_BLUEPRINT.sections) {
      for (const blueprintTask of section.tasks) {
        const spec = taskById(blueprintTask.type);
        const [min, max] = asRange(spec.scoredTasksInExam);
        expect(blueprintTask.count, blueprintTask.type).toBeGreaterThanOrEqual(min);
        expect(blueprintTask.count, blueprintTask.type).toBeLessThanOrEqual(max);
        total += blueprintTask.count;
      }
    }
    expect(total).toBe(65);
    expect(FULL_MOCK_BLUEPRINT.questionCount).toBe(65);
    expect(FULL_MOCK_BLUEPRINT.questionCountRange).toEqual([65, 75]);
  });

  it("soma as durações das três partes no total declarado", () => {
    const minutes = FULL_MOCK_BLUEPRINT.sections.reduce((sum, section) => sum + section.minutes, 0);
    expect(minutes).toBe(FULL_MOCK_BLUEPRINT.totalMinutes);
    expect(FULL_MOCK_BLUEPRINT.totalMinutes).toBe(130);
  });

  it("é declarado como aproximação, com fonte, data e omissões", () => {
    expect(FULL_MOCK_BLUEPRINT.id).toBe("full-mock");
    expect(FULL_MOCK_BLUEPRINT.confirmed).toBe(false);
    expect(FULL_MOCK_BLUEPRINT.sourceUrl.startsWith("https://")).toBe(true);
    expect(FULL_MOCK_BLUEPRINT.consultedAt).toMatch(ISO_DATE);
    expect(FULL_MOCK_BLUEPRINT.notes).toMatch(/aproxima/i);
    expect(FULL_MOCK_BLUEPRINT.omissions?.length).toBeGreaterThan(0);
  });

  it("reserva o mini-simulado como produto distinto do exame completo", () => {
    expect(MINI_MOCK_ID).toBe("mini-mock");
    expect(MINI_MOCK_NOTE).toMatch(/não corresponde ao blueprint oficial/i);
  });
});

describe("exam-spec — rastreabilidade das fontes", () => {
  it("tem pelo menos 8 fontes, todas https, com data ISO e status válido", () => {
    expect(EXAM_SOURCES.length).toBeGreaterThanOrEqual(8);
    for (const source of EXAM_SOURCES) {
      expect(source.claim.length, source.sourceUrl).toBeGreaterThan(0);
      expect(source.sourceUrl.startsWith("https://"), source.sourceUrl).toBe(true);
      expect(() => new URL(source.sourceUrl)).not.toThrow();
      expect(source.consultedAt).toMatch(ISO_DATE);
      expect(Number.isNaN(Date.parse(source.consultedAt))).toBe(false);
      expect(["confirmed", "approximation"]).toContain(source.status);
    }
  });

  it("cobre as páginas oficiais de formato e os dois Score Guides", () => {
    const urls = EXAM_SOURCES.map((source) => source.sourceUrl);
    expect(urls.some((url) => url.includes("pearsonpte.com/pte-updates-2025"))).toBe(true);
    expect(urls.some((url) => url.includes("test-format/speaking-writing"))).toBe(true);
    expect(urls.some((url) => url.includes("test-format/reading"))).toBe(true);
    expect(urls.some((url) => url.includes("test-format/listening"))).toBe(true);
    expect(urls.some((url) => url.includes("PTE-Academic-Test-Taker-Score-Guide.pdf"))).toBe(true);
    expect(urls.some((url) => url.includes("Score-Guide-Institution-PTE-Academic"))).toBe(true);
  });

  it("marca como aproximação a divergência do Read Aloud", () => {
    const approximation = EXAM_SOURCES.filter((source) => source.status === "approximation");
    expect(approximation.length).toBeGreaterThan(0);
    expect(approximation.some((source) => /Read Aloud/i.test(source.claim))).toBe(true);
  });

  it("não contém contagem do banco de questões nem importações", () => {
    expect(examSpecSource).not.toMatch(/\b2823\b/);
    expect(examSpecSource).not.toMatch(/2\.823/);
    expect(examSpecSource).not.toMatch(/MANIFEST\.json/);
    expect(examSpecSource).not.toMatch(/^\s*import\b/m);
  });
});
