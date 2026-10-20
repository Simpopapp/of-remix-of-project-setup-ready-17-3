/**
 * Contrato de tentativa (`Attempt`) — registro append-only do log.
 *
 * Regras:
 * - O log é truncável (PRD §6.2): nada aqui é fonte única de métrica; métricas vivem
 *   em `QuestionSnapshot`/`Aggregates`. Truncar `attempts-tail` não pode perder nota.
 * - Reavaliação NÃO reescreve tentativa: grava uma nova tentativa com o mesmo
 *   `questionId`, com `evaluator.{model,promptVersion,rubricVersion}` distinto.
 * - `payload` é tipado por `kind` e o `kind` é fixado pelo tipo de tarefa
 *   (`PAYLOAD_KIND_BY_TYPE`), para que um motor não grave payload incompatível.
 *
 * Consumidores: Fase 3 (log/truncagem), Fase 5 (harness recebe a resposta),
 * Fase 6 (motores gravam a tentativa), Fase 7 (histórico).
 * Módulo puro: zero I/O.
 */

import type { EvaluationResult } from "./evaluation";
import type { TaskType } from "./question";
import { isTaskType } from "./question";

export const ATTEMPT_MODES = ["practice", "session", "mock"] as const;
/** `mock` = simulado; `session` = sessão/plano; `practice` = treino avulso. */
export type AttemptMode = (typeof ATTEMPT_MODES)[number];

export const PAYLOAD_KINDS = [
  "text",
  "choice",
  "blanks",
  "order",
  "highlights",
  "spoken",
  "none",
] as const;
export type AttemptPayloadKind = (typeof PAYLOAD_KINDS)[number];

/** Resposta escrita/ditada (`swt`, `write_essay`, `sst`, `wfd`). */
export interface TextPayload {
  kind: "text";
  text: string;
}
/** Seleção por índice de opção (`read_mcq_*`, `lst_mcq_*`, `lst_hcs`, `lst_smw`). */
export interface ChoicePayload {
  kind: "choice";
  /** índices escolhidos (um para single, vários para multi) */
  selected: number[];
}
/**
 * Lacunas: índice da opção em `read_fib_dropdown`/`read_fib_drag`;
 * texto digitado em `lst_fib`.
 */
export interface BlanksPayload {
  kind: "blanks";
  values: (string | number)[];
}
/** Reordenação: `order[position] = índice do parágrafo original` (`reorder_paragraphs`). */
export interface OrderPayload {
  kind: "order";
  order: number[];
}
/** Palavras marcadas como incorretas em `lst_hiw` (índices em `shown`). */
export interface HighlightsPayload {
  kind: "highlights";
  words: number[];
}
/**
 * Resposta oral. O sinal é áudio gravado localmente (`audioRef`, opcional);
 * `transcriptSource` declara de onde veio qualquer transcrição — nunca equivale a
 * "pronúncia medida".
 */
export interface SpokenPayload {
  kind: "spoken";
  durationMs: number;
  /** referência local ao blob/IndexedDB; `null` quando o aluno não permitiu gravar */
  audioRef: string | null;
  transcriptSource: "browser_stt" | "manual" | "none";
}
/** Tentativa sem resposta (tempo esgotado sem submissão de conteúdo). */
export interface NoAnswerPayload {
  kind: "none";
}

export type AttemptPayload =
  | TextPayload
  | ChoicePayload
  | BlanksPayload
  | OrderPayload
  | HighlightsPayload
  | SpokenPayload
  | NoAnswerPayload;

/** Tipo de payload obrigatório por tipo de tarefa. */
export const PAYLOAD_KIND_BY_TYPE: Record<TaskType, AttemptPayloadKind> = {
  read_aloud: "spoken",
  repeat_sentence: "spoken",
  describe_image: "spoken",
  retell_lecture: "spoken",
  answer_short: "spoken",
  sgd: "spoken",
  rts: "spoken",
  swt: "text",
  write_essay: "text",
  read_fib_dropdown: "blanks",
  read_mcq_multi: "choice",
  reorder_paragraphs: "order",
  read_fib_drag: "blanks",
  read_mcq_single: "choice",
  sst: "text",
  lst_mcq_multi: "choice",
  lst_fib: "blanks",
  lst_hcs: "choice",
  lst_mcq_single: "choice",
  lst_smw: "choice",
  lst_hiw: "highlights",
  wfd: "text",
};

/**
 * Registro de tentativa.
 *
 * `questionType` é opcional (o banco já é indexado por tipo); quando presente,
 * `parseAttempt` valida que o `payload.kind` corresponde ao tipo.
 */
export interface Attempt {
  attemptId: string;
  questionId: string;
  questionType?: TaskType;
  mode: AttemptMode;
  /** instante ISO-8601 (UTC) do início */
  startedAt: string;
  /** instante ISO-8601 (UTC) do envio; `null` enquanto a tentativa está aberta */
  submittedAt: string | null;
  payload: AttemptPayload;
  /** resultado da IA; ausente enquanto não avaliado (nunca preenchido por regra determinística) */
  result?: EvaluationResult;
  /** sessão de origem, quando houver (Fase 7) */
  sessionId?: string | null;
  /** simulado de origem, quando houver (Fase 9) */
  mockRunId?: string | null;
}

export function isAttemptMode(value: unknown): value is AttemptMode {
  return typeof value === "string" && (ATTEMPT_MODES as readonly string[]).includes(value);
}

export function isPayloadKind(value: unknown): value is AttemptPayloadKind {
  return typeof value === "string" && (PAYLOAD_KINDS as readonly string[]).includes(value);
}

/** Tipo de payload esperado por um tipo de tarefa. */
export function expectedPayloadKind(type: TaskType): AttemptPayloadKind {
  return PAYLOAD_KIND_BY_TYPE[type];
}

/** A tentativa foi submetida (tem resposta avaliável)? */
export function isSubmitted(attempt: Attempt): boolean {
  return attempt.submittedAt !== null;
}

/** Tentativa já avaliada? */
export function isEvaluated(attempt: Attempt): boolean {
  return attempt.result !== undefined;
}

/** Revalida que `questionType` (quando informado) é um tipo conhecido. */
export function isAttemptTypeCompatible(attempt: Attempt): boolean {
  if (attempt.questionType === undefined) return true;
  if (!isTaskType(attempt.questionType)) return false;
  return PAYLOAD_KIND_BY_TYPE[attempt.questionType] === attempt.payload.kind;
}
