/**
 * Fixtures mínimas e válidas dos contratos de domínio.
 *
 * Existem para que os testes provem o contrato (parse ok / erro com path) sem
 * depender do banco real — que só entra na Fase 2. Nenhum texto aqui é conteúdo
 * de produto: são amostras sintéticas, marcadas como tal.
 */

import type {
  Aggregates,
  Attempt,
  EvaluationResult,
  QuestionData,
  QuestionSnapshot,
  RawQuestion,
  TaskType,
} from "@/domain";
import { emptyAggregates, emptySnapshot } from "@/domain";

/** Um `data` válido por tipo — cobre os 22 tipos do formato vigente. */
export const VALID_DATA_BY_TYPE: Record<TaskType, QuestionData> = {
  read_aloud: { text: "The quick brown fox jumps over the lazy dog." },
  repeat_sentence: { transcript: "Students should review their notes every day." },
  describe_image: {
    image: "/di/sample-chart.png",
    alt: "Bar chart comparing rainfall in three cities.",
    facts: ["Rainfall rises from January to March."],
    keywords: ["rainfall", "increase", "cities"],
  },
  retell_lecture: {
    transcript: "The lecture explains how bees communicate through movement.",
    keywords: ["bees", "communication", "movement"],
    sample: "The speaker described how bees use movement to communicate.",
  },
  answer_short: { question: "What do bees make?", answers: ["honey"] },
  sgd: {
    turns: [
      { speaker: "A", text: "I think the library should open later." },
      { speaker: "B", text: "That would help students who work." },
    ],
    keywords: ["library", "hours", "students"],
  },
  rts: { scenario: "You missed a tutorial. Ask your tutor for the notes." },
  swt: {
    text: "Cities are investing in public transport to reduce congestion.",
    keywords: ["cities", "transport", "congestion"],
    sample: "Cities invest in public transport to reduce congestion.",
  },
  write_essay: {
    prompt: "Discuss whether remote work benefits employees.",
    sample: "Remote work offers flexibility but can blur boundaries.",
  },
  read_fib_dropdown: {
    passage: "The {{1}} rises in the east and the {{2}} follows it.",
    blanks: [
      { options: ["sun", "moon"], answer: 0 },
      { options: ["cloud", "moon"], answer: 1 },
    ],
  },
  read_mcq_multi: {
    passage: "Recycling reduces landfill waste and saves energy.",
    question: "Which benefits are mentioned?",
    options: ["Less landfill waste", "Lower energy use", "Higher prices"],
    answer: [0, 1],
  },
  reorder_paragraphs: {
    paragraphs: [
      "First, the water is heated.",
      "Then it turns into steam.",
      "Finally, the steam drives a turbine.",
    ],
  },
  read_fib_drag: {
    passage: "The {{1}} rises in the east and the {{2}} follows it.",
    bank: ["sun", "moon", "star"],
    answers: [0, 1],
  },
  read_mcq_single: {
    passage: "Recycling reduces landfill waste.",
    question: "What does recycling reduce?",
    options: ["Landfill waste", "Energy prices"],
    answer: 0,
  },
  sst: {
    transcript: "The speaker discussed the water cycle and its stages.",
    keywords: ["water", "cycle", "stages"],
    sample: "The lecture described the stages of the water cycle.",
  },
  lst_mcq_multi: {
    transcript: "The museum opens at nine and closes at six on weekdays.",
    question: "Which times are mentioned?",
    options: ["Nine", "Six", "Noon"],
    answer: [0, 1],
  },
  lst_fib: {
    template: "The {{1}} is {{2}} today.",
    answers: ["sky", "clear"],
  },
  lst_hcs: {
    transcript: "The researchers found that the soil recovered quickly.",
    options: ["Soil recovered quickly.", "Soil never recovered."],
    answer: 0,
  },
  lst_mcq_single: {
    transcript: "The train departs from platform four.",
    question: "Which platform?",
    options: ["Four", "Five"],
    answer: 0,
  },
  lst_smw: {
    transcript: "The main advantage of the new method is",
    options: ["its lower cost", "its slower speed"],
    answer: 0,
  },
  lst_hiw: {
    spoken: "The cat sat on the mat",
    shown: "The cat sit on the mat",
  },
  wfd: { sentence: "The library closes at six." },
};

/** Questão crua válida (forma do banco: sem `section`/`canonicalId`). */
export function rawQuestion(type: TaskType, overrides: Record<string, unknown> = {}): RawQuestion {
  const source =
    type === "describe_image"
      ? {
          id: "src-test",
          domain: "example.org",
          url: "https://example.org/item",
          license: "CC BY 4.0",
          attribution: "Example Author",
        }
      : { id: "src-test", domain: "example.org", url: "https://example.org/item" };

  return {
    id: `q-${type}-1`,
    type,
    topic: "synthetic-fixture",
    source,
    provenance: "verificada",
    evidenceSummary: "fixture sintética de teste",
    data: VALID_DATA_BY_TYPE[type],
    ...overrides,
  } as RawQuestion;
}

export const NOW = "2026-01-15T12:00:00.000Z";
export const LATER = "2026-01-15T12:05:00.000Z";

export function validAttempt(overrides: Record<string, unknown> = {}): Attempt {
  return {
    attemptId: "att-1",
    questionId: "q-wfd-1",
    questionType: "wfd",
    mode: "practice",
    startedAt: NOW,
    submittedAt: LATER,
    payload: { kind: "text", text: "The library closes at six." },
    ...overrides,
  } as Attempt;
}

export function validSnapshot(overrides: Record<string, unknown> = {}): QuestionSnapshot {
  return {
    ...emptySnapshot({ questionId: "q-wfd-1", questionType: "wfd", now: NOW }),
    ...overrides,
  } as QuestionSnapshot;
}

export function validAggregates(overrides: Partial<Aggregates> = {}): Aggregates {
  return { ...emptyAggregates(NOW), ...overrides };
}

export function validEvaluation(overrides: Record<string, unknown> = {}): EvaluationResult {
  return {
    verdict: "scored",
    scale: "attempt_0_100",
    score: 82,
    confidence: "high",
    dimensions: [
      {
        id: "content",
        label: "Conteúdo",
        status: "measured",
        score: 85,
        rationale: "Todas as palavras-chave foram reproduzidas.",
      },
    ],
    evidence: [
      {
        observation: "A resposta contém a frase completa do áudio.",
        dimensionId: "content",
        quote: "The library closes at six.",
      },
    ],
    feedback: "Boa reprodução; atenção à pontuação final.",
    uncertainty: null,
    unmeasured: [],
    evaluator: { model: "test-model", promptVersion: "p1", rubricVersion: "r1" },
    scoredAt: LATER,
    ...overrides,
  } as EvaluationResult;
}
