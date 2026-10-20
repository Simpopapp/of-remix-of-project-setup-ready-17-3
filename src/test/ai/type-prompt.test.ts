/**
 * Construtor de prompt por tipo — conteúdo, honestidade e antivazamento.
 * Fase 5, pacote s2-rubricas.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { TASK_TYPES, type Question } from "@/domain";
import { loadQuestionsByType } from "@/data/loader";
import { getRubric, listRubricTypes } from "@/lib/ai/rubrics";
import {
  TYPE_PROMPT_VERSION,
  buildTypePrompt,
  evaluationRubricFor,
  rubricAndPromptFor,
} from "@/lib/ai/prompts";

function bankSamples(
  questions: readonly Question[],
  pick: (question: Question) => string | undefined,
): string[] {
  const samples: string[] = [];
  for (const question of questions.slice(0, 3)) {
    const text = pick(question)?.replace(/\s+/g, " ").trim();
    if (text !== undefined && text.length >= 40) samples.push(text.slice(0, 60));
  }
  return samples;
}

function wfdText(question: Question): string | undefined {
  return question.type === "wfd" ? question.data.sentence : undefined;
}

function readAloudText(question: Question): string | undefined {
  return question.type === "read_aloud" ? question.data.text : undefined;
}

describe("buildTypePrompt", () => {
  it("cobre exatamente os tipos do registry", () => {
    expect(TASK_TYPES.map((type) => buildTypePrompt(type).type)).toEqual(listRubricTypes());
  });

  it("versiona o prompt no formato type-prompt@N", () => {
    for (const type of TASK_TYPES) {
      const prompt = buildTypePrompt(type);
      expect(prompt.promptVersion).toBe(TYPE_PROMPT_VERSION);
      expect(prompt.promptVersion).toMatch(/^type-prompt@\d+$/);
      expect(prompt.rubric).toBe(getRubric(type));
    }
  });

  it("é determinístico: mesmas entradas → mesmo texto", () => {
    for (const type of TASK_TYPES) {
      expect(buildTypePrompt(type).addendum).toBe(buildTypePrompt(type).addendum);
    }
  });

  it.each([...TASK_TYPES])("%s inclui todas as dimensões, pesos e regras de abstenção", (type) => {
    const prompt = buildTypePrompt(type);
    const addendum = prompt.addendum;

    for (const dimension of prompt.rubric.dimensions) {
      expect(addendum).toContain(`id="${dimension.id}"`);
      expect(addendum).toContain(`label="${dimension.label}"`);
      expect(addendum).toContain(`weight=${dimension.weight.toFixed(2)}`);
      expect(addendum).toContain(dimension.measurement);
    }

    for (const rule of prompt.rubric.abstentionRules) {
      expect(addendum).toContain(rule);
    }

    expect(addendum).toContain("pt-BR");
    expect(addendum).toContain("0–100");
    expect(addendum).toContain("unmeasured");
    expect(addendum).toContain("evidence");
    expect(addendum).toMatch(/Return ONLY a single JSON object/);
    expect(addendum).toContain(prompt.rubric.rubricVersion);
  });

  it.each([...TASK_TYPES])("%s não contém texto fora do contrato de referência", (type) => {
    const addendum = buildTypePrompt(type).addendum;
    expect(addendum.toLowerCase()).not.toContain("resposta-modelo:");
    expect(addendum).not.toContain("GABARITO:");
    expect(addendum).toContain("reserved reference");
  });
});

describe("janela de resposta derivada do exam-spec", () => {
  it("wfd é shared_section e o prompt diz que não há timer por item", () => {
    const addendum = buildTypePrompt("wfd").addendum;
    expect(addendum).toContain("shared_section");
    expect(addendum.toLowerCase()).toContain("no per-item timer");
  });

  it("read_aloud é until_audio e o prompt explica a janela", () => {
    const addendum = buildTypePrompt("read_aloud").addendum;
    expect(addendum).toContain("until_audio");
    expect(addendum.toLowerCase()).toContain("played audio");
  });

  it("tipos com janela numérica exibem segundos de resposta", () => {
    const addendum = buildTypePrompt("swt").addendum;
    expect(addendum).toContain("seconds of response window");
  });
});

describe("honestidade no prompt", () => {
  it("reforça pronúncia não medida sem áudio em todos os tipos", () => {
    for (const type of TASK_TYPES) {
      expect(buildTypePrompt(type).addendum).toMatch(/never inferred from spelling or transcript/i);
    }
  });

  it("answer_short não cria dimensões de fala", () => {
    const addendum = buildTypePrompt("answer_short").addendum;
    expect(addendum).not.toContain('id="pronunciation"');
    expect(addendum).not.toContain('id="oral_fluency"');
    expect(addendum).toContain("A single-word answer is valid");
  });

  it("só os três tipos oficiais trazem a regra de marcação negativa", () => {
    for (const type of TASK_TYPES) {
      const addendum = buildTypePrompt(type).addendum;
      if (type === "read_mcq_multi" || type === "lst_mcq_multi" || type === "lst_hiw") {
        expect(addendum).toContain("OFFICIAL NEGATIVE MARKING");
        expect(addendum).toMatch(/subtract/i);
      } else {
        expect(addendum).not.toContain("OFFICIAL NEGATIVE MARKING");
      }
    }
  });

  it("swt e write_essay avisam que estouro de limite penaliza forma, não abstém", () => {
    for (const type of ["swt", "write_essay"] as const) {
      expect(buildTypePrompt(type).addendum).toMatch(/does NOT justify abstention/i);
    }
  });
});

describe("antivazamento contra itens reais do banco", () => {
  let wfdSamples: string[] = [];
  let readAloudSamples: string[] = [];

  beforeAll(async () => {
    const [wfd, readAloud] = await Promise.all([
      loadQuestionsByType("wfd"),
      loadQuestionsByType("read_aloud"),
    ]);
    wfdSamples = bankSamples(wfd, wfdText);
    readAloudSamples = bankSamples(readAloud, readAloudText);
  });

  it("carrega amostras reais dos dois tipos", () => {
    expect(wfdSamples.length).toBeGreaterThan(0);
    expect(readAloudSamples.length).toBeGreaterThan(0);
  });

  it("nenhum addendum contém trecho de transcrição/texto do banco", () => {
    const samples = [...wfdSamples, ...readAloudSamples];
    for (const type of TASK_TYPES) {
      const addendum = buildTypePrompt(type).addendum;
      for (const sample of samples) {
        expect(addendum).not.toContain(sample);
      }
    }
  });
});

describe("adaptador para o handler de s1", () => {
  it("evaluationRubricFor devolve addendum e versão da rubrica", () => {
    const view = evaluationRubricFor("wfd");
    expect(view.version).toBe(getRubric("wfd").rubricVersion);
    expect(view.text).toBe(buildTypePrompt("wfd").addendum);
  });

  it("rubricAndPromptFor devolve a mesma rubrica do registry", () => {
    const pair = rubricAndPromptFor("describe_image");
    expect(pair.rubric).toBe(getRubric("describe_image"));
    expect(pair.prompt.type).toBe("describe_image");
  });
});
