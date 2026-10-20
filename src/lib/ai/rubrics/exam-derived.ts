/**
 * Derivações do formato oficial para as rubricas (Fase 5 — s2-rubricas).
 *
 * Nenhum tempo ou limite é digitado: tudo sai de `src/data/exam-spec.ts`. O único
 * valor declarado fora dele é a faixa de 3–15 palavras do `wfd`, que o PRD §17
 * fixa e o `exam-spec` descreve apenas como áudio de 3–5 s — a nota do limite
 * registra essa origem, e o relatório do pacote repete a pendência.
 *
 * Módulo puro: zero I/O.
 */

import { EXAM_TASKS, type ExamTaskSpec } from "@/data/exam-spec";
import type { TaskType } from "@/domain";

import type { RubricInputLimits } from "./types";

const SPECS: ReadonlyMap<string, ExamTaskSpec> = new Map(EXAM_TASKS.map((task) => [task.id, task]));

/** Spec oficial do tipo; falhar aqui é inconsistência de dados, não estado de tela. */
export function examSpecForTask(type: TaskType): ExamTaskSpec {
  const spec = SPECS.get(type);
  if (spec === undefined) {
    throw new Error(`exam-spec não define o tipo de tarefa "${type}"`);
  }
  return spec;
}

function preparationText(spec: ExamTaskSpec): string {
  return spec.preparationSeconds === undefined
    ? "no preparation time"
    : `${spec.preparationSeconds} seconds of preparation`;
}

/**
 * Janela de resposta em texto, incluindo o tipo bruto (`until_audio` /
 * `shared_section`) para a rubrica ser explícita sobre o que NÃO é cronometrado.
 */
export function responseWindowText(type: TaskType): string {
  const spec = examSpecForTask(type);
  const preparation = preparationText(spec);
  const response = spec.responseSeconds;
  if (typeof response === "number") {
    return `${preparation}; ${response} seconds of response window.`;
  }
  if (response === "until_audio") {
    return `${preparation}; response window kind "until_audio" (the response window follows the played audio/text; there is no fixed per-item timer).`;
  }
  if (response === "shared_section") {
    return `${preparation}; response window kind "shared_section" (the item uses the shared section time; there is no per-item timer).`;
  }
  return `${preparation}; no response window defined in the exam spec.`;
}

const WORD_RANGE_PATTERN = /(\d+)\s*(?:–|-|to)\s*(\d+)\s*palavras?/;

/**
 * Limites de RESPOSTA escrita. A faixa de palavras só é extraída quando o
 * `contentLimit` descreve a resposta (swt, write_essay, sst); limites de
 * passagem/áudio ficam apenas como nota e nunca como limite de resposta.
 */
export function inputLimitsFor(type: TaskType): RubricInputLimits {
  const spec = examSpecForTask(type);
  const note =
    spec.contentLimit === undefined ? undefined : `Formato oficial: ${spec.contentLimit}.`;

  if (type === "wfd") {
    return {
      minWords: 3,
      maxWords: 15,
      note: [
        note,
        "Faixa de resposta 3–15 palavras (tabela do PRD §17); o exam-spec descreve apenas o áudio de 3–5 s.",
      ]
        .filter((part): part is string => typeof part === "string")
        .join(" "),
    };
  }

  if (type === "swt" || type === "write_essay" || type === "sst") {
    const match =
      spec.contentLimit === undefined ? null : WORD_RANGE_PATTERN.exec(spec.contentLimit);
    const min = Number(match?.[1] ?? "");
    const max = Number(match?.[2] ?? "");
    if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) {
      return {
        minWords: min,
        maxWords: max,
        ...(note === undefined ? {} : { note }),
      };
    }
  }

  return note === undefined ? {} : { note };
}

/** Habilidades pontuadas oficiais do tipo, em texto estável para o prompt. */
export function scoredSkillsText(type: TaskType): string {
  const spec = examSpecForTask(type);
  return spec.scoredSkills.join(", ");
}

/** Limite de conteúdo cru do formato (usado como nota no prompt). */
export function contentLimitText(type: TaskType): string {
  const spec = examSpecForTask(type);
  return spec.contentLimit ?? "sem limite textual explícito no exam-spec";
}
