/**
 * API pública de prompts por tipo (Fase 5 — s2-rubricas).
 *
 * `buildTypePrompt` é o construtor; `evaluationRubricFor` é o adaptador para a
 * dependência `rubricFor` do handler de s1 (`EvaluationRubric { text, version }`).
 */

import type { TaskType } from "@/domain";

import { getRubric, listRubricTypes, type TypeRubric } from "../rubrics";
import { TYPE_PROMPT_VERSION, buildTypePrompt, type TypePrompt } from "./type-prompt";

export { TYPE_PROMPT_VERSION, buildTypePrompt } from "./type-prompt";
export type { TypePrompt } from "./type-prompt";

/** Forma consumida por `EvaluationHandlerDependencies.rubricFor` (s1). */
export interface EvaluationRubricView {
  text: string;
  version: string;
}

/**
 * Rubrica pronta para `composeJudgePrompt`: texto = addendum do tipo,
 * versão = `rubric@N`. O addendum já inclui a versão do type-prompt, porque a
 * identidade de `EvaluationResult` registra apenas `JUDGE_PROMPT_VERSION`.
 */
export function evaluationRubricFor(type: TaskType): EvaluationRubricView {
  const prompt = buildTypePrompt(type);
  return { text: prompt.addendum, version: prompt.rubric.rubricVersion };
}

/** Açúcar para o harness: rubrica + prompt em uma chamada. */
export function rubricAndPromptFor(type: TaskType): { rubric: TypeRubric; prompt: TypePrompt } {
  return { rubric: getRubric(type), prompt: buildTypePrompt(type) };
}

/** Reexport para quem só precisa listar os tipos cobertos. */
export { listRubricTypes };
