/**
 * Contrato de questão (`src/domain/question.ts` + `parseQuestion`).
 *
 * Prova que o parser espelha o schema do banco: um item válido por tipo passa,
 * e cada violação estrutural vira `DomainValidationError` com o caminho exato.
 */

import { describe, expect, it } from "vitest";

import {
  DomainValidationError,
  ORAL_RESPONSE_TYPES,
  SECTIONS,
  SECTION_BY_TYPE,
  TASK_TYPES,
  isQuestionOfType,
  parseQuestion,
  parseQuestions,
  parseQuestionData,
  sectionOf,
  type TaskType,
} from "@/domain";
import { VALID_DATA_BY_TYPE, rawQuestion } from "./fixtures";

function expectFailure(run: () => unknown, path: string, code?: string): DomainValidationError {
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
  return failure;
}

describe("catálogo de tipos", () => {
  it("tem exatamente os 22 tipos e cada um pertence a uma seção", () => {
    expect(TASK_TYPES).toHaveLength(22);
    for (const type of TASK_TYPES) {
      expect(SECTIONS).toContain(SECTION_BY_TYPE[type]);
      expect(sectionOf(type)).toBe(SECTION_BY_TYPE[type]);
    }
  });

  it("os 7 tipos orais são os de resposta falada", () => {
    expect(ORAL_RESPONSE_TYPES).toHaveLength(7);
    expect(ORAL_RESPONSE_TYPES).toContain("read_aloud");
    expect(ORAL_RESPONSE_TYPES).not.toContain("wfd");
  });
});

describe("parseQuestion — casos válidos", () => {
  it.each(TASK_TYPES)("aceita um item válido de %s", (type) => {
    const question = parseQuestion(rawQuestion(type));

    expect(question.type).toBe(type);
    expect(question.section).toBe(SECTION_BY_TYPE[type]);
    // `canonicalId` derivado de `id` quando o banco não traz um.
    expect(question.canonicalId).toBe(question.id);
    expect(question.data).toEqual(VALID_DATA_BY_TYPE[type]);
    expect(question.provenance).toBe("verificada");
    expect(question.source.domain).toBe("example.org");
  });

  it("preserva canonicalId explícito (quase-duplicata não divide métrica)", () => {
    const question = parseQuestion(rawQuestion("wfd", { canonicalId: "canon-wfd-1" }));
    expect(question.canonicalId).toBe("canon-wfd-1");
  });

  it("aceita section declarada quando confere com o tipo", () => {
    const question = parseQuestion(rawQuestion("wfd", { section: "listening" }));
    expect(question.section).toBe("listening");
  });

  it("mantém campos opcionais ausentes quando o banco não os traz", () => {
    const raw = rawQuestion("wfd") as unknown as Record<string, unknown>;
    delete raw["topic"];
    delete raw["evidenceSummary"];
    const question = parseQuestion(raw);
    expect(question).not.toHaveProperty("topic");
    expect(question).not.toHaveProperty("evidenceSummary");
  });

  it("refina o tipo com isQuestionOfType", () => {
    const question = parseQuestion(rawQuestion("wfd"));
    expect(isQuestionOfType(question, "wfd")).toBe(true);
    expect(isQuestionOfType(question, "sst")).toBe(false);
  });
});

describe("parseQuestion — erros com caminho", () => {
  it("provenance inválida", () => {
    expectFailure(
      () => parseQuestion(rawQuestion("wfd", { provenance: "oficial" })),
      "question.provenance",
      "invalid_enum",
    );
  });

  it("tipo desconhecido", () => {
    expectFailure(
      () => parseQuestion(rawQuestion("wfd", { type: "listening_mcq" })),
      "question.type",
      "invalid_enum",
    );
  });

  it("data incompatível com o tipo aponta o campo que falta", () => {
    expectFailure(
      () => parseQuestion(rawQuestion("read_aloud", { data: { sentence: "..." } })),
      "question.data.text",
      "missing",
    );
  });

  it("describe_image sem licença da imagem no source", () => {
    expectFailure(
      () =>
        parseQuestion(
          rawQuestion("describe_image", {
            source: { id: "src-test", domain: "example.org", url: "https://example.org/x" },
          }),
        ),
      "question.source.license",
      "missing",
    );
  });

  it("section declarada em desacordo com o tipo", () => {
    expectFailure(
      () => parseQuestion(rawQuestion("wfd", { section: "reading" })),
      "question.section",
      "inconsistent",
    );
  });

  it("índice de gabarito fora da faixa de opções", () => {
    expectFailure(
      () =>
        parseQuestion(
          rawQuestion("read_mcq_single", {
            data: {
              passage: "Recycling reduces landfill waste.",
              question: "What does recycling reduce?",
              options: ["Landfill waste", "Energy prices"],
              answer: 5,
            },
          }),
        ),
      "question.data.answer",
      "out_of_range",
    );
  });

  it("número de lacunas {{n}} divergente do número de respostas", () => {
    expectFailure(
      () =>
        parseQuestion(
          rawQuestion("lst_fib", {
            data: { template: "The {{1}} is clear today.", answers: ["sky", "clear"] },
          }),
        ),
      "question.data.template",
      "inconsistent",
    );
  });

  it("lst_hiw sem nenhuma palavra divergente", () => {
    expectFailure(
      () =>
        parseQuestion(
          rawQuestion("lst_hiw", {
            data: { spoken: "The cat sat on the mat", shown: "The cat sat on the mat" },
          }),
        ),
      "question.data",
      "inconsistent",
    );
  });

  it("lst_hiw com contagem de palavras divergente", () => {
    expectFailure(
      () =>
        parseQuestion(
          rawQuestion("lst_hiw", {
            data: { spoken: "The cat sat on the mat", shown: "The cat sit down mat" },
          }),
        ),
      "question.data.shown",
      "inconsistent",
    );
  });

  it("id repetido em lista", () => {
    const list = [rawQuestion("wfd"), rawQuestion("wfd")];
    expectFailure(() => parseQuestions(list), "questions[1].id", "inconsistent");
  });

  it("parseQuestionData recusa tipo fora do catálogo", () => {
    expectFailure(
      () => parseQuestionData({ sentence: "..." }, "unknown_type" as TaskType),
      "data.type",
      "invalid_enum",
    );
  });
});
