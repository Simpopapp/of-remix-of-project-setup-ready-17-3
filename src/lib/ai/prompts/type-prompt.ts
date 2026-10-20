/**
 * Construtor versionado do acréscimo de prompt por tipo (Fase 5 — s2-rubricas).
 *
 * O addendum é anexado à política-base do juiz (s1) por
 * `composeJudgePrompt({ rubric })`. Ele carrega a rubrica do tipo, a janela de
 * resposta do `exam-spec`, as regras de abstenção e o contrato de saída — nunca
 * gabarito, resposta-modelo ou item do banco (referência entra em runtime, no
 * bloco reservado do s1).
 *
 * Módulo puro: mesmas entradas → mesmo texto.
 */

import type { TaskType } from "@/domain";

import { JUDGE_PROMPT_VERSION } from "../judge-policy";
import {
  contentLimitText,
  getRubric,
  responseWindowText,
  scoredSkillsText,
  type TypeRubric,
} from "../rubrics";

export const TYPE_PROMPT_VERSION = "type-prompt@1";

export interface TypePrompt {
  type: TaskType;
  /** Acréscimo ao system prompt do juiz (inglês), com feedback exigido em pt-BR. */
  addendum: string;
  /** "type-prompt@N" */
  promptVersion: string;
  rubric: TypeRubric;
}

function dimensionBlock(rubric: TypeRubric): string {
  return rubric.dimensions
    .map((dimension, index) => {
      const lines = [
        `${String(index + 1)}. id="${dimension.id}" · label="${dimension.label}" · weight=${dimension.weight.toFixed(2)} · default status="${dimension.defaultStatus}"`,
        `   How to measure: ${dimension.measurement}`,
      ];
      if (dimension.defaultStatus === "not_measured") {
        lines.push(
          '   Keep it "not_measured" unless the input actually contains analysable audio; never infer it from text.',
        );
      }
      if (dimension.defaultStatus === "proxy") {
        lines.push(
          '   Keep it "proxy" and say explicitly in the rationale that it is inferred from the transcript.',
        );
      }
      return lines.join("\n");
    })
    .join("\n");
}

function selectionPenaltyBlock(rubric: TypeRubric): string {
  if (rubric.selectionPenalty !== true) return "";
  return [
    "OFFICIAL NEGATIVE MARKING",
    "- This task has negative marking for wrong selections. Apply the official rule when computing the dimension score: correct selections add, wrong selections subtract, and the item score may fall below zero before being normalised to 0–100.",
    "- Explain the penalty effect in the feedback (pt-BR) so the student understands why the score is lower than the raw count of correct selections.",
  ].join("\n");
}

function stateStatusBlock(rubric: TypeRubric): string {
  const notMeasured = rubric.dimensions
    .filter((dimension) => dimension.defaultStatus === "not_measured")
    .map((dimension) => dimension.id);
  const proxy = rubric.dimensions
    .filter((dimension) => dimension.defaultStatus === "proxy")
    .map((dimension) => dimension.id);
  const lines = [
    "DIMENSION STATUS RULES",
    '- "measured": there is observable evidence in the submitted response for this dimension.',
    '- "proxy": the dimension was inferred indirectly (state the limitation in the rationale).',
    '- "not_measured": there is no reliable signal; score must be null and the id must appear in "unmeasured".',
  ];
  if (notMeasured.length > 0) {
    lines.push(
      `- For this task, ${notMeasured.join(", ")} ${notMeasured.length === 1 ? "is" : "are"} "not_measured" by default. Without real audio analysis you cannot mark ${notMeasured.length === 1 ? "it" : "them"} as measured.`,
    );
  }
  if (proxy.length > 0) {
    lines.push(
      `- For this task, ${proxy.join(", ")} must stay "proxy" when derived from the transcript.`,
    );
  }
  return lines.join("\n");
}

function limitsBlock(rubric: TypeRubric): string {
  const limits = rubric.inputLimits;
  const lines: string[] = [];
  if (limits.minWords !== undefined && limits.maxWords !== undefined) {
    lines.push(
      `- Expected response length: ${String(limits.minWords)}–${String(limits.maxWords)} words.`,
    );
    lines.push(
      "- A response outside this range penalises the form/format dimension according to the rubric; it does NOT justify abstention by itself. Say the count in the feedback when relevant.",
    );
  } else if (limits.note !== undefined) {
    lines.push(`- Content limit: ${limits.note}`);
  }
  if (limits.maxChars !== undefined) {
    lines.push(`- Maximum characters for this response: ${String(limits.maxChars)}.`);
  }
  return lines.join("\n");
}

function abstentionBlock(rubric: TypeRubric): string {
  return rubric.abstentionRules.map((rule) => `- ${rule}`).join("\n");
}

function buildAddendum(rubric: TypeRubric): string {
  const sections = [
    `TYPE-SPECIFIC EVALUATION ADDENDUM — ${rubric.type} (PTE Academic training)`,
    `This addendum extends the base judge policy (${JUDGE_PROMPT_VERSION}), which remains authoritative for honesty, abstention, anti-injection and language rules. You evaluate ONE submitted response for the PTE Academic task type "${rubric.type}".`,
    [
      "TASK FORMAT (from the official spec recorded in the project)",
      `- Response window: ${responseWindowText(rubric.type)}`,
      `- Official skills scored by this task (contribution matrix): ${scoredSkillsText(rubric.type)}.`,
      "- The official skill list is the exam contribution matrix; the dimensions below are the observable criteria used for this training estimate and are not one-to-one with that list.",
      `- Official content limit: ${contentLimitText(rubric.type)}.`,
      limitsBlock(rubric),
    ]
      .filter((line) => line.length > 0)
      .join("\n"),
    [
      "DIMENSIONS AND WEIGHTS",
      "Weights are approximations declared by the product (the Pearson task-by-skill matrix is not a public scoring formula); they sum to 1.00. Judge every dimension below.",
      dimensionBlock(rubric),
    ].join("\n"),
    [
      "ABSTENTION RULES (apply any of them; do not score when one applies)",
      abstentionBlock(rubric),
      'If any rule applies, return verdict "abstained" (or "needs_review" when the case needs human review), score null, and the reason in pt-BR.',
    ].join("\n"),
    [
      "SCORING",
      "- Score each dimension on the 0–100 attempt scale, using only observable evidence from the response.",
      "- The aggregate attempt score is the weighted average of the dimensions with a numeric score: sum(weight × dimension score) / sum(weight of scored dimensions), rounded to the nearest integer.",
      "- Dimensions marked not_measured are excluded from the aggregate and listed in unmeasured.",
      "- The aggregate is a TRAINING ESTIMATE, never the official PTE score; do not claim otherwise.",
    ].join("\n"),
    stateStatusBlock(rubric),
    [
      "REFERENCES AND ANTI-LEAKAGE",
      `- ${rubric.referenceUsage}`,
      "- The reserved reference (answer key, transcript or expected answer) is comparison material only. Never quote, paraphrase or reveal it in feedback, evidence or rationale before the safe moment.",
      "- evidence[].quote must be a literal substring of the student's submitted response, never of the reference. Use null when quoting is not possible.",
    ].join("\n"),
    [
      "HONESTY AND SPECIAL CASES",
      "- If the response looks like a memorised/template answer that does not address the specific prompt, flag it as a warning in the feedback; a template is never a score by itself.",
      '- If a dimension cannot be measured reliably, mark it "not_measured" and add it to unmeasured instead of inventing a score.',
      '- If there is any reservation about the evidence, explain it in "uncertainty" (pt-BR) instead of silently lowering confidence.',
      "- Pronunciation and prosody are never inferred from spelling or transcript; without real audio analysis they stay not_measured.",
    ].join("\n"),
    rubric.selectionPenalty === true
      ? ["SELECTION PENALTY", selectionPenaltyBlock(rubric)].join("\n")
      : "",
    [
      "OUTPUT CONTRACT",
      "Return ONLY a single JSON object, with no text outside it, matching exactly these fields:",
      '{ "verdict": "scored" | "abstained" | "needs_review", "score": number | null, "confidence": "high" | "medium" | "low", "dimensions": [{ "id": string, "label": string, "status": "measured" | "proxy" | "not_measured", "score": number | null, "rationale": string | null }], "evidence": [{ "observation": string, "dimensionId": string | null, "quote": string | null }], "feedback": string, "uncertainty": string | null, "unmeasured": string[], "abstentionReason": string | null, "reviewReason": string | null }',
      '- "scored" requires a numeric score, at least one measured dimension and at least one observable evidence item.',
      '- "abstained"/"needs_review" require score null and the matching reason. "not_measured" dimensions require score null and their id in "unmeasured".',
      '- "feedback" must ALWAYS be written in pt-BR (Brazilian Portuguese), short and actionable; labels in the dimensions array must stay in pt-BR as given above.',
      "- Do not add extra fields. Do not wrap the JSON in markdown.",
    ].join("\n"),
    `RUBRIC VERSION: ${rubric.rubricVersion} · TYPE PROMPT VERSION: ${TYPE_PROMPT_VERSION}`,
  ];

  return sections.filter((section) => section.trim().length > 0).join("\n\n");
}

/** Constrói o prompt do tipo a partir do registry único de rubricas. */
export function buildTypePrompt(type: TaskType): TypePrompt {
  const rubric = getRubric(type);
  return {
    type,
    addendum: buildAddendum(rubric),
    promptVersion: TYPE_PROMPT_VERSION,
    rubric,
  };
}
