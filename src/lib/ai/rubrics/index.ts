/**
 * Registry único das 22 rubricas (Fase 5 — s2-rubricas).
 *
 * `getRubric` é a porta de entrada do juiz (s1/s4) e dos motores (Fase 6):
 * mesmo tipo → mesma rubrica, sem I/O e sem aleatoriedade.
 */

import { TASK_TYPES, type TaskType } from "@/domain";

import { LISTENING_RUBRICS } from "./listening";
import { READING_RUBRICS } from "./reading";
import { SPEAKING_RUBRICS } from "./speaking";
import { WRITING_RUBRICS } from "./writing";
import type { TypeRubric } from "./types";

export * from "./types";
export { RUBRIC_VERSION } from "./shared";
export * from "./exam-derived";
export { SPEAKING_RUBRICS } from "./speaking";
export { WRITING_RUBRICS } from "./writing";
export { READING_RUBRICS } from "./reading";
export { LISTENING_RUBRICS } from "./listening";

const ALL_RUBRICS: readonly TypeRubric[] = [
  ...SPEAKING_RUBRICS,
  ...WRITING_RUBRICS,
  ...READING_RUBRICS,
  ...LISTENING_RUBRICS,
];

const RUBRIC_BY_TYPE = new Map<string, TypeRubric>();
for (const rubric of ALL_RUBRICS) {
  if (RUBRIC_BY_TYPE.has(rubric.type)) {
    throw new Error(`rubrica duplicada para o tipo "${rubric.type}"`);
  }
  RUBRIC_BY_TYPE.set(rubric.type, rubric);
}

for (const type of TASK_TYPES) {
  if (!RUBRIC_BY_TYPE.has(type)) {
    throw new Error(`rubrica ausente para o tipo "${type}"`);
  }
}

/** Rubrica do tipo. Tipo desconhecido é erro de programação, não estado de tela. */
export function getRubric(type: TaskType): TypeRubric {
  const rubric = RUBRIC_BY_TYPE.get(type);
  if (rubric === undefined) {
    throw new Error(
      `Nenhuma rubrica registrada para o tipo "${String(type)}". Tipos válidos: ${TASK_TYPES.join(", ")}.`,
    );
  }
  return rubric;
}

/** Tipos com rubrica, na ordem canônica do domínio. */
export function listRubricTypes(): TaskType[] {
  return TASK_TYPES.filter((type) => RUBRIC_BY_TYPE.has(type));
}

/** Checagem de tipo em runtime (entrada vinda de JSON/UI). */
export function hasRubric(type: string): boolean {
  return RUBRIC_BY_TYPE.has(type);
}
