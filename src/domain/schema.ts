/**
 * Validadores de runtime dos contratos de domínio — sem dependência externa.
 *
 * Por que validação manual (e não zod): estes módulos são consumidos por Fase 2
 * (importador do banco), Fase 3 (storage/migrações), Fase 5 (harness de IA) e Fase 6
 * (motores). Erro de contrato precisa apontar o caminho exato do campo
 * (`envelope.payload.snapshots[3].srsBox`), algo que mensagens de biblioteca não dão
 * com a mesma precisão, e o módulo precisa continuar puro (zero I/O, zero deps).
 *
 * Contrato: cada `parseX` devolve o valor tipado ou lança `DomainValidationError`
 * com `code`, `path` e `detail`. Nunca devolve parcial nem "corrige" em silêncio.
 *
 * Invariantes estruturais aplicados aqui (e provados em `src/test/domain/`):
 * - `Question`: `section` derivada confere com o tipo; `canonicalId` cai para `id`;
 *   `describe_image` exige licença; índices de gabarito dentro da faixa; número de
 *   lacunas `{{n}}` = número de respostas.
 * - `Attempt`: `payload.kind` compatível com `questionType`; `submittedAt >= startedAt`.
 * - `Snapshot`: `nextReviewDay` é chave de dia local (não timestamp); `bestScore >= lastScore`.
 * - `EvaluationResult`: `scored` exige nota, dimensão medida e evidência; abstenção
 *   nunca tem nota.
 * - `BackupEnvelope`: versão futura nunca migra (ver `backup.ts`).
 */

import type { Aggregates, AggregateBucket, SkillAggregate } from "./aggregates";
import {
  ATTEMPT_SCORE_MAX,
  ATTEMPT_SCORE_MIN,
  ESTIMATE_BASES,
  SKILLS,
  SKILL_ESTIMATE_MAX,
  SKILL_ESTIMATE_MIN,
  TRENDS,
  isSkill,
} from "./aggregates";
import type { Attempt, AttemptPayload, AttemptPayloadKind } from "./attempt";
import { ATTEMPT_MODES, PAYLOAD_KINDS, PAYLOAD_KIND_BY_TYPE } from "./attempt";
import { isLocalDayKey } from "./day";
import type { EvaluationDimension, EvaluationResult } from "./evaluation";
import { ATTEMPT_SCORE_SCALE, CONFIDENCES, DIMENSION_STATUSES, VERDICTS } from "./evaluation";
import type { Question, QuestionBase, SourceRef, TaskType } from "./question";
import { PROVENANCES, SECTIONS, SECTION_BY_TYPE, TASK_TYPES, isTaskType } from "./question";
import type { QuestionSnapshot } from "./snapshot";
import { ERROR_CATEGORIES } from "./snapshot";

/* ------------------------------------------------------------------ */
/* Erro e primitivos                                                   */
/* ------------------------------------------------------------------ */

export type ValidationCode =
  | "not_object"
  | "not_array"
  | "missing"
  | "not_string"
  | "empty_string"
  | "not_number"
  | "not_integer"
  | "not_boolean"
  | "invalid_enum"
  | "invalid_literal"
  | "not_iso_timestamp"
  | "not_local_day_key"
  | "out_of_range"
  | "inconsistent"
  | "future_version";

export class DomainValidationError extends Error {
  readonly code: ValidationCode;
  readonly path: string;
  readonly detail: string | undefined;

  constructor(code: ValidationCode, path: string, detail?: string) {
    super(`${path}: ${code}${detail ? ` — ${detail}` : ""}`);
    this.name = "DomainValidationError";
    this.code = code;
    this.path = path;
    this.detail = detail;
  }

  toJSON(): { name: string; code: ValidationCode; path: string; detail: string | undefined } {
    return { name: this.name, code: this.code, path: this.path, detail: this.detail };
  }
}

export function isDomainValidationError(error: unknown): error is DomainValidationError {
  return error instanceof DomainValidationError;
}

export function fail(code: ValidationCode, path: string, detail?: string): never {
  throw new DomainValidationError(code, path, detail);
}

/** Constrói o caminho legível de um erro (`a.b[3].c`). */
export function joinPath(base: string, key: string | number): string {
  if (typeof key === "number") return `${base}[${key}]`;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${base}.${key}`
    : `${base}[${JSON.stringify(key)}]`;
}

function describeValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") {
    return JSON.stringify(value.length > 60 ? `${value.slice(0, 60)}…` : value);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `array(${value.length})`;
  return typeof value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value))
    fail("not_object", path, `esperado objeto, recebeu ${describeValue(value)}`);
  return value;
}

export function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value))
    fail("not_array", path, `esperado array, recebeu ${describeValue(value)}`);
  return value;
}

export interface StringExpectation {
  /** default `true`; use `false` apenas onde vazio é significativo (ex.: resposta em branco) */
  nonEmpty?: boolean;
}

export function expectString(
  value: unknown,
  path: string,
  expectation: StringExpectation = {},
): string {
  if (value === undefined) {
    fail("missing", path, "campo obrigatório ausente");
  }
  if (typeof value !== "string") {
    fail("not_string", path, `esperado string, recebeu ${describeValue(value)}`);
  }
  if ((expectation.nonEmpty ?? true) && value.trim().length === 0) {
    fail("empty_string", path, "string vazia não é aceita");
  }
  return value;
}

export interface NumberExpectation {
  min?: number;
  max?: number;
  integer?: boolean;
}

export function expectNumber(
  value: unknown,
  path: string,
  expectation: NumberExpectation = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("not_number", path, `esperado número finito, recebeu ${describeValue(value)}`);
  }
  if (expectation.integer && !Number.isInteger(value)) {
    fail("not_integer", path, `esperado inteiro, recebeu ${String(value)}`);
  }
  if (expectation.min !== undefined && value < expectation.min) {
    fail("out_of_range", path, `mínimo ${String(expectation.min)}, recebeu ${String(value)}`);
  }
  if (expectation.max !== undefined && value > expectation.max) {
    fail("out_of_range", path, `máximo ${String(expectation.max)}, recebeu ${String(value)}`);
  }
  return value;
}

export function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    fail("not_boolean", path, `esperado booleano, recebeu ${describeValue(value)}`);
  }
  return value;
}

export function expectEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  label: string,
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail(
      "invalid_enum",
      path,
      `${label}: esperado ${allowed.join(" | ")}, recebeu ${describeValue(value)}`,
    );
  }
  return value as T;
}

export function expectLiteral<T extends string | number>(
  value: unknown,
  literal: T,
  path: string,
): T {
  if (value !== literal) {
    fail(
      "invalid_literal",
      path,
      `esperado ${JSON.stringify(literal)}, recebeu ${describeValue(value)}`,
    );
  }
  return literal;
}

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Instante ISO-8601 completo. Forma canônica do produto: `new Date().toISOString()`
 * (UTC com `Z`). Aceita offset explícito porque é um instante inequívoco.
 */
export function expectIsoTimestamp(value: unknown, path: string): string {
  if (typeof value !== "string") {
    fail("not_iso_timestamp", path, `esperado string ISO-8601, recebeu ${describeValue(value)}`);
  }
  if (!ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    fail("not_iso_timestamp", path, `valor inválido: ${describeValue(value)}`);
  }
  return value;
}

export function expectLocalDayKey(value: unknown, path: string): string {
  if (!isLocalDayKey(value)) {
    fail(
      "not_local_day_key",
      path,
      `esperado YYYY-MM-DD no fuso local, recebeu ${describeValue(value)}`,
    );
  }
  return value;
}

export function expectStringArray(
  value: unknown,
  path: string,
  expectation: { nonEmpty?: boolean } = {},
): string[] {
  const items = expectArray(value, path);
  if (expectation.nonEmpty && items.length === 0) {
    fail("empty_string", path, "lista vazia não é aceita");
  }
  return items.map((item, index) => expectString(item, joinPath(path, index)));
}

export function expectNumberArray(
  value: unknown,
  path: string,
  expectation: NumberExpectation & { nonEmpty?: boolean } = {},
): number[] {
  const items = expectArray(value, path);
  if (expectation.nonEmpty && items.length === 0) {
    fail("out_of_range", path, "lista vazia não é aceita");
  }
  return items.map((item, index) => expectNumber(item, joinPath(path, index), expectation));
}

function readOptional(
  record: Record<string, unknown>,
  key: string,
  path: string,
  parse: (value: unknown, path: string) => unknown,
): unknown {
  if (!hasOwn(record, key) || record[key] === undefined) return undefined;
  return parse(record[key], joinPath(path, key));
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined {
  // O banco grava `null` em campos textuais opcionais; `null` equivale a ausente.
  if (!hasOwn(record, key) || record[key] === undefined || record[key] === null) return undefined;
  return expectString(record[key], joinPath(path, key));
}

function readOptionalNullable<T>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  parse: (value: unknown, path: string) => T,
): T | null | undefined {
  if (!hasOwn(record, key) || record[key] === undefined) return undefined;
  const raw = record[key];
  if (raw === null) return null;
  return parse(raw, joinPath(path, key));
}

/* ------------------------------------------------------------------ */
/* Question                                                           */
/* ------------------------------------------------------------------ */

export function parseSourceRef(raw: unknown, path = "source"): SourceRef {
  const record = expectRecord(raw, path);
  const source: SourceRef = {
    id: expectString(record["id"], joinPath(path, "id")),
    domain: expectString(record["domain"], joinPath(path, "domain")),
  };
  const url = readOptionalString(record, "url", path);
  if (url !== undefined) source.url = url;
  const license = readOptionalString(record, "license", path);
  if (license !== undefined) source.license = license;
  const attribution = readOptionalString(record, "attribution", path);
  if (attribution !== undefined) source.attribution = attribution;
  return source;
}

function expectOptionIndex(value: unknown, optionsLength: number, path: string): number {
  return expectNumber(value, path, { integer: true, min: 0, max: optionsLength - 1 });
}

function expectOptionIndexes(
  value: unknown,
  optionsLength: number,
  path: string,
  nonEmpty: boolean,
): number[] {
  const indexes = expectNumberArray(value, path, {
    integer: true,
    min: 0,
    max: optionsLength - 1,
    nonEmpty,
  });
  const unique = new Set(indexes);
  if (unique.size !== indexes.length) {
    fail("inconsistent", path, "índices de gabarito repetidos");
  }
  return indexes;
}

function countPlaceholders(text: string): number {
  return (text.match(/\{\{\d+\}\}/g) ?? []).length;
}

function expectPlaceholderCount(text: string, expected: number, path: string): void {
  const found = countPlaceholders(text);
  if (found !== expected) {
    fail(
      "inconsistent",
      path,
      `texto tem ${String(found)} lacuna(s) {{n}} mas há ${String(expected)} resposta(s)`,
    );
  }
}

/** Valida o `data` de um tipo específico. Exportado para o importador (Fase 2). */
export function parseQuestionData(raw: unknown, type: TaskType, path = "data"): unknown {
  const data = expectRecord(raw, path);
  switch (type) {
    case "read_aloud":
      return { text: expectString(data["text"], joinPath(path, "text")) };
    case "repeat_sentence":
      return { transcript: expectString(data["transcript"], joinPath(path, "transcript")) };
    case "describe_image":
      return {
        image: expectString(data["image"], joinPath(path, "image")),
        alt: expectString(data["alt"], joinPath(path, "alt")),
        facts: expectStringArray(data["facts"], joinPath(path, "facts"), { nonEmpty: true }),
        keywords: expectStringArray(data["keywords"], joinPath(path, "keywords"), {
          nonEmpty: true,
        }),
      };
    case "retell_lecture":
    case "sst":
      return {
        transcript: expectString(data["transcript"], joinPath(path, "transcript")),
        keywords: expectStringArray(data["keywords"], joinPath(path, "keywords"), {
          nonEmpty: true,
        }),
        sample: expectString(data["sample"], joinPath(path, "sample")),
      };
    case "answer_short":
      return {
        question: expectString(data["question"], joinPath(path, "question")),
        answers: expectStringArray(data["answers"], joinPath(path, "answers"), { nonEmpty: true }),
      };
    case "sgd": {
      const turns = expectArray(data["turns"], joinPath(path, "turns")).map((turn, index) => {
        const at = joinPath(joinPath(path, "turns"), index);
        const record = expectRecord(turn, at);
        return {
          speaker: expectString(record["speaker"], joinPath(at, "speaker")),
          text: expectString(record["text"], joinPath(at, "text")),
        };
      });
      if (turns.length === 0) fail("not_array", joinPath(path, "turns"), "lista vazia");
      return {
        turns,
        keywords: expectStringArray(data["keywords"], joinPath(path, "keywords"), {
          nonEmpty: true,
        }),
      };
    }
    case "rts":
      return { scenario: expectString(data["scenario"], joinPath(path, "scenario")) };
    case "swt":
      return {
        text: expectString(data["text"], joinPath(path, "text")),
        keywords: expectStringArray(data["keywords"], joinPath(path, "keywords"), {
          nonEmpty: true,
        }),
        sample: expectString(data["sample"], joinPath(path, "sample")),
      };
    case "write_essay": {
      const parsed: { prompt: string; sample?: string } = {
        prompt: expectString(data["prompt"], joinPath(path, "prompt")),
      };
      const sample = readOptionalString(data, "sample", path);
      if (sample !== undefined) parsed.sample = sample;
      return parsed;
    }
    case "read_fib_dropdown": {
      const passage = expectString(data["passage"], joinPath(path, "passage"));
      const blanksPath = joinPath(path, "blanks");
      const blanks = expectArray(data["blanks"], blanksPath).map((blank, index) => {
        const at = joinPath(blanksPath, index);
        const record = expectRecord(blank, at);
        const options = expectStringArray(record["options"], joinPath(at, "options"), {
          nonEmpty: true,
        });
        return {
          options,
          answer: expectOptionIndex(record["answer"], options.length, joinPath(at, "answer")),
        };
      });
      if (blanks.length === 0) fail("not_array", blanksPath, "lista vazia");
      expectPlaceholderCount(passage, blanks.length, joinPath(path, "passage"));
      return { passage, blanks };
    }
    case "read_fib_drag": {
      const passage = expectString(data["passage"], joinPath(path, "passage"));
      const bank = expectStringArray(data["bank"], joinPath(path, "bank"), { nonEmpty: true });
      const answers = expectNumberArray(data["answers"], joinPath(path, "answers"), {
        integer: true,
        min: 0,
        max: bank.length - 1,
        nonEmpty: true,
      });
      expectPlaceholderCount(passage, answers.length, joinPath(path, "passage"));
      return { passage, bank, answers };
    }
    case "read_mcq_single":
    case "lst_mcq_single": {
      const options = expectStringArray(data["options"], joinPath(path, "options"), {
        nonEmpty: true,
      });
      const parsed: Record<string, unknown> = {
        // O banco usa "" quando o enunciado é a instrução padrão do tipo
        // (a pergunta real está no áudio/passagem) — vazio é legítimo aqui.
        question: expectString(data["question"], joinPath(path, "question"), {
          nonEmpty: false,
        }),
        options,
        answer: expectOptionIndex(data["answer"], options.length, joinPath(path, "answer")),
      };
      if (type === "read_mcq_single") {
        parsed["passage"] = expectString(data["passage"], joinPath(path, "passage"));
      } else {
        parsed["transcript"] = expectString(data["transcript"], joinPath(path, "transcript"));
      }
      return parsed;
    }
    case "read_mcq_multi":
    case "lst_mcq_multi": {
      const options = expectStringArray(data["options"], joinPath(path, "options"), {
        nonEmpty: true,
      });
      const parsed: Record<string, unknown> = {
        // O banco usa "" quando o enunciado é a instrução padrão do tipo
        // (a pergunta real está no áudio/passagem) — vazio é legítimo aqui.
        question: expectString(data["question"], joinPath(path, "question"), {
          nonEmpty: false,
        }),
        options,
        answer: expectOptionIndexes(data["answer"], options.length, joinPath(path, "answer"), true),
      };
      if (type === "read_mcq_multi") {
        parsed["passage"] = expectString(data["passage"], joinPath(path, "passage"));
      } else {
        parsed["transcript"] = expectString(data["transcript"], joinPath(path, "transcript"));
      }
      return parsed;
    }
    case "reorder_paragraphs": {
      const paragraphs = expectStringArray(data["paragraphs"], joinPath(path, "paragraphs"), {
        nonEmpty: true,
      });
      if (paragraphs.length < 2) {
        fail("out_of_range", joinPath(path, "paragraphs"), "reordenação exige ao menos 2 blocos");
      }
      return { paragraphs };
    }
    case "lst_fib": {
      const template = expectString(data["template"], joinPath(path, "template"));
      const answers = expectStringArray(data["answers"], joinPath(path, "answers"), {
        nonEmpty: true,
      });
      expectPlaceholderCount(template, answers.length, joinPath(path, "template"));
      return { template, answers };
    }
    case "lst_hcs":
    case "lst_smw": {
      const options = expectStringArray(data["options"], joinPath(path, "options"), {
        nonEmpty: true,
      });
      return {
        transcript: expectString(data["transcript"], joinPath(path, "transcript")),
        options,
        answer: expectOptionIndex(data["answer"], options.length, joinPath(path, "answer")),
      };
    }
    case "lst_hiw": {
      const spoken = expectString(data["spoken"], joinPath(path, "spoken"));
      const shown = expectString(data["shown"], joinPath(path, "shown"));
      const spokenWords = spoken.trim().split(/\s+/);
      const shownWords = shown.trim().split(/\s+/);
      if (spokenWords.length !== shownWords.length) {
        fail(
          "inconsistent",
          joinPath(path, "shown"),
          `spoken tem ${String(spokenWords.length)} palavras, shown tem ${String(shownWords.length)}`,
        );
      }
      const differences = spokenWords.filter((word, index) => word !== shownWords[index]).length;
      if (differences === 0) {
        fail("inconsistent", path, "lst_hiw sem nenhuma palavra divergente entre spoken e shown");
      }
      return { spoken, shown };
    }
    case "wfd":
      return { sentence: expectString(data["sentence"], joinPath(path, "sentence")) };
    default:
      return fail("invalid_enum", joinPath(path, "type"), `tipo desconhecido: ${String(type)}`);
  }
}

/**
 * Valida uma questão no formato do banco e devolve a forma de aplicação, com
 * `section` e `canonicalId` derivados (nunca gravados no JSON do pacote).
 */
export function parseQuestion(raw: unknown, path = "question"): Question {
  const record = expectRecord(raw, path);
  const id = expectString(record["id"], joinPath(path, "id"));
  const type = expectEnum(record["type"], TASK_TYPES, joinPath(path, "type"), "TaskType");
  const provenance = expectEnum(
    record["provenance"],
    PROVENANCES,
    joinPath(path, "provenance"),
    "Provenance",
  );
  const source = parseSourceRef(record["source"], joinPath(path, "source"));

  if (type === "describe_image" && source.license === undefined) {
    fail(
      "missing",
      joinPath(joinPath(path, "source"), "license"),
      "describe_image exige licença da imagem no manifesto de origem",
    );
  }

  const derivedSection = SECTION_BY_TYPE[type];
  if (hasOwn(record, "section") && record["section"] !== undefined) {
    const declared = expectEnum(record["section"], SECTIONS, joinPath(path, "section"), "Section");
    if (declared !== derivedSection) {
      fail(
        "inconsistent",
        joinPath(path, "section"),
        `tipo ${type} pertence a ${derivedSection}, não a ${declared}`,
      );
    }
  }

  const canonicalId =
    hasOwn(record, "canonicalId") && record["canonicalId"] !== undefined
      ? expectString(record["canonicalId"], joinPath(path, "canonicalId"))
      : id;

  const base: QuestionBase = {
    id,
    type,
    section: derivedSection,
    canonicalId,
    source,
    provenance,
  };
  const topic = readOptionalString(record, "topic", path);
  if (topic !== undefined) base.topic = topic;
  const evidenceSummary = readOptionalString(record, "evidenceSummary", path);
  if (evidenceSummary !== undefined) base.evidenceSummary = evidenceSummary;

  const data = parseQuestionData(record["data"], type, joinPath(path, "data"));
  return { ...base, type, data } as Question;
}

/** Valida uma lista de questões e rejeita `id` repetido. */
export function parseQuestions(raw: unknown, path = "questions"): Question[] {
  const items = expectArray(raw, path);
  const seen = new Set<string>();
  return items.map((item, index) => {
    const at = joinPath(path, index);
    const question = parseQuestion(item, at);
    if (seen.has(question.id)) {
      fail("inconsistent", joinPath(at, "id"), `id repetido: ${question.id}`);
    }
    seen.add(question.id);
    return question;
  });
}

/* ------------------------------------------------------------------ */
/* Attempt                                                            */
/* ------------------------------------------------------------------ */

const TRANSCRIPT_SOURCES = ["browser_stt", "manual", "none"] as const;

export function parseAttemptPayload(raw: unknown, path = "payload"): AttemptPayload {
  const record = expectRecord(raw, path);
  const kind = expectEnum(
    record["kind"],
    PAYLOAD_KINDS,
    joinPath(path, "kind"),
    "AttemptPayloadKind",
  );
  switch (kind) {
    case "text":
      return {
        kind,
        text: expectString(record["text"], joinPath(path, "text"), { nonEmpty: false }),
      };
    case "choice":
      return {
        kind,
        selected: expectNumberArray(record["selected"], joinPath(path, "selected"), {
          integer: true,
          min: 0,
        }),
      };
    case "blanks": {
      const values = expectArray(record["values"], joinPath(path, "values")).map((value, index) => {
        const at = joinPath(joinPath(path, "values"), index);
        if (typeof value === "string") return value;
        if (typeof value === "number") {
          return expectNumber(value, at, { integer: true, min: 0 });
        }
        return fail(
          "not_string",
          at,
          `esperado string ou índice inteiro, recebeu ${describeValue(value)}`,
        );
      });
      return { kind, values };
    }
    case "order":
      return {
        kind,
        order: expectNumberArray(record["order"], joinPath(path, "order"), {
          integer: true,
          min: 0,
        }),
      };
    case "highlights":
      return {
        kind,
        words: expectNumberArray(record["words"], joinPath(path, "words"), {
          integer: true,
          min: 0,
        }),
      };
    case "spoken": {
      const audioRef = readOptionalNullable(record, "audioRef", path, (value, at) =>
        expectString(value, at),
      );
      return {
        kind,
        durationMs: expectNumber(record["durationMs"], joinPath(path, "durationMs"), {
          min: 0,
        }),
        audioRef: audioRef ?? null,
        transcriptSource: expectEnum(
          record["transcriptSource"],
          TRANSCRIPT_SOURCES,
          joinPath(path, "transcriptSource"),
          "TranscriptSource",
        ),
      };
    }
    case "none":
      return { kind };
    default:
      return fail("invalid_enum", joinPath(path, "kind"), `kind desconhecido: ${String(kind)}`);
  }
}

export function parseAttempt(raw: unknown, path = "attempt"): Attempt {
  const record = expectRecord(raw, path);
  const questionType =
    hasOwn(record, "questionType") && record["questionType"] !== undefined
      ? expectEnum(record["questionType"], TASK_TYPES, joinPath(path, "questionType"), "TaskType")
      : undefined;

  const payload = parseAttemptPayload(record["payload"], joinPath(path, "payload"));
  if (questionType !== undefined) {
    const expected: AttemptPayloadKind = PAYLOAD_KIND_BY_TYPE[questionType];
    if (payload.kind !== expected) {
      fail(
        "inconsistent",
        joinPath(joinPath(path, "payload"), "kind"),
        `tipo ${questionType} espera payload "${expected}", recebeu "${payload.kind}"`,
      );
    }
  }

  const startedAt = expectIsoTimestamp(record["startedAt"], joinPath(path, "startedAt"));
  const submittedAtRaw = record["submittedAt"];
  const submittedAt =
    submittedAtRaw === null || submittedAtRaw === undefined
      ? null
      : expectIsoTimestamp(submittedAtRaw, joinPath(path, "submittedAt"));

  if (submittedAt !== null && Date.parse(submittedAt) < Date.parse(startedAt)) {
    fail("inconsistent", joinPath(path, "submittedAt"), "submittedAt é anterior a startedAt");
  }

  const attempt: Attempt = {
    attemptId: expectString(record["attemptId"], joinPath(path, "attemptId")),
    questionId: expectString(record["questionId"], joinPath(path, "questionId")),
    mode: expectEnum(record["mode"], ATTEMPT_MODES, joinPath(path, "mode"), "AttemptMode"),
    startedAt,
    submittedAt,
    payload,
  };
  if (questionType !== undefined) attempt.questionType = questionType;

  if (hasOwn(record, "result") && record["result"] !== undefined) {
    attempt.result = parseEvaluationResult(record["result"], joinPath(path, "result"));
  }
  const sessionId = readOptionalNullable(record, "sessionId", path, (value, at) =>
    expectString(value, at),
  );
  if (sessionId !== undefined) attempt.sessionId = sessionId;
  const mockRunId = readOptionalNullable(record, "mockRunId", path, (value, at) =>
    expectString(value, at),
  );
  if (mockRunId !== undefined) attempt.mockRunId = mockRunId;

  return attempt;
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                           */
/* ------------------------------------------------------------------ */

export function parseSnapshot(raw: unknown, path = "snapshot"): QuestionSnapshot {
  const record = expectRecord(raw, path);
  const attempts = expectNumber(record["attempts"], joinPath(path, "attempts"), {
    integer: true,
    min: 0,
  });
  const scoredAttempts = expectNumber(record["scoredAttempts"], joinPath(path, "scoredAttempts"), {
    integer: true,
    min: 0,
  });
  if (scoredAttempts > attempts) {
    fail(
      "inconsistent",
      joinPath(path, "scoredAttempts"),
      `scoredAttempts (${String(scoredAttempts)}) > attempts (${String(attempts)})`,
    );
  }

  const lastScore =
    readOptionalNullable(record, "lastScore", path, (value, at) =>
      expectNumber(value, at, { min: ATTEMPT_SCORE_MIN, max: ATTEMPT_SCORE_MAX }),
    ) ?? null;
  const bestScore =
    readOptionalNullable(record, "bestScore", path, (value, at) =>
      expectNumber(value, at, { min: ATTEMPT_SCORE_MIN, max: ATTEMPT_SCORE_MAX }),
    ) ?? null;
  if (lastScore !== null && bestScore !== null && bestScore < lastScore) {
    fail(
      "inconsistent",
      joinPath(path, "bestScore"),
      `bestScore (${String(bestScore)}) < lastScore (${String(lastScore)})`,
    );
  }

  const errorCountsRaw = hasOwn(record, "errorCounts") ? record["errorCounts"] : {};
  const errorCountsRecord = expectRecord(errorCountsRaw, joinPath(path, "errorCounts"));
  const errorCounts: QuestionSnapshot["errorCounts"] = {};
  for (const key of Object.keys(errorCountsRecord)) {
    if (!(ERROR_CATEGORIES as readonly string[]).includes(key)) {
      fail(
        "invalid_enum",
        joinPath(joinPath(path, "errorCounts"), key),
        `categoria de erro desconhecida: ${key}`,
      );
    }
    errorCounts[key as (typeof ERROR_CATEGORIES)[number]] = expectNumber(
      errorCountsRecord[key],
      joinPath(joinPath(path, "errorCounts"), key),
      { integer: true, min: 0 },
    );
  }

  const firstSeenAt = expectIsoTimestamp(record["firstSeenAt"], joinPath(path, "firstSeenAt"));
  const updatedAt = expectIsoTimestamp(record["updatedAt"], joinPath(path, "updatedAt"));
  if (Date.parse(updatedAt) < Date.parse(firstSeenAt)) {
    fail("inconsistent", joinPath(path, "updatedAt"), "updatedAt é anterior a firstSeenAt");
  }

  return {
    questionId: expectString(record["questionId"], joinPath(path, "questionId")),
    questionType: expectEnum(
      record["questionType"],
      TASK_TYPES,
      joinPath(path, "questionType"),
      "TaskType",
    ),
    canonicalId: expectString(record["canonicalId"], joinPath(path, "canonicalId")),
    attempts,
    scoredAttempts,
    lastScore,
    bestScore,
    lastSubmittedAt:
      readOptionalNullable(record, "lastSubmittedAt", path, (value, at) =>
        expectIsoTimestamp(value, at),
      ) ?? null,
    srsBox: expectNumber(record["srsBox"], joinPath(path, "srsBox"), { integer: true, min: 0 }),
    nextReviewDay:
      readOptionalNullable(record, "nextReviewDay", path, (value, at) =>
        expectLocalDayKey(value, at),
      ) ?? null,
    lastReviewedDay:
      readOptionalNullable(record, "lastReviewedDay", path, (value, at) =>
        expectLocalDayKey(value, at),
      ) ?? null,
    errorCounts,
    favorite: expectBoolean(record["favorite"], joinPath(path, "favorite")),
    privateNote:
      readOptionalNullable(record, "privateNote", path, (value, at) =>
        expectString(value, at, { nonEmpty: false }),
      ) ?? null,
    firstSeenAt,
    updatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                         */
/* ------------------------------------------------------------------ */

function parseAggregateBucket(raw: unknown, path: string): AggregateBucket {
  const record = expectRecord(raw, path);
  const attempts = expectNumber(record["attempts"], joinPath(path, "attempts"), {
    integer: true,
    min: 0,
  });
  const scoredAttempts = expectNumber(record["scoredAttempts"], joinPath(path, "scoredAttempts"), {
    integer: true,
    min: 0,
  });
  if (scoredAttempts > attempts) {
    fail("inconsistent", joinPath(path, "scoredAttempts"), "scoredAttempts > attempts");
  }
  const tentativeScore = (key: string): number | null =>
    readOptionalNullable(record, key, path, (value, at) =>
      expectNumber(value, at, { min: ATTEMPT_SCORE_MIN, max: ATTEMPT_SCORE_MAX }),
    ) ?? null;

  const trendRaw = record["trend"];
  const trend =
    trendRaw === null ? null : expectEnum(trendRaw, TRENDS, joinPath(path, "trend"), "Trend");

  return {
    attempts,
    scoredAttempts,
    questionCount: expectNumber(record["questionCount"], joinPath(path, "questionCount"), {
      integer: true,
      min: 0,
    }),
    lastScore: tentativeScore("lastScore"),
    bestScore: tentativeScore("bestScore"),
    recentWeightedScore: tentativeScore("recentWeightedScore"),
    trend,
    confidence: expectEnum(
      record["confidence"],
      CONFIDENCES,
      joinPath(path, "confidence"),
      "Confidence",
    ),
    lastActivityAt:
      readOptionalNullable(record, "lastActivityAt", path, (value, at) =>
        expectIsoTimestamp(value, at),
      ) ?? null,
  };
}

function parseSkillAggregate(raw: unknown, skill: string, path: string): SkillAggregate {
  if (!isSkill(skill)) fail("invalid_enum", path, `habilidade desconhecida: ${skill}`);
  const bucket = parseAggregateBucket(raw, path);
  const record = expectRecord(raw, path);
  const estimate =
    readOptionalNullable(record, "estimate", path, (value, at) =>
      expectNumber(value, at, { min: SKILL_ESTIMATE_MIN, max: SKILL_ESTIMATE_MAX }),
    ) ?? null;
  const estimateBasis = expectEnum(
    record["estimateBasis"],
    ESTIMATE_BASES,
    joinPath(path, "estimateBasis"),
    "EstimateBasis",
  );
  if (estimate !== null && estimateBasis !== "calibrated") {
    fail(
      "inconsistent",
      joinPath(path, "estimateBasis"),
      `estimativa 10–90 exigida com base "calibrated"; recebeu "${estimateBasis}"`,
    );
  }
  if (estimate === null && estimateBasis === "calibrated") {
    fail("inconsistent", joinPath(path, "estimate"), 'estimateBasis "calibrated" sem estimativa');
  }
  return { ...bucket, skill, estimate, estimateBasis };
}

export function parseAggregates(raw: unknown, path = "aggregates"): Aggregates {
  const record = expectRecord(raw, path);
  expectLiteral(record["version"], 1, joinPath(path, "version"));

  const byTypeRaw = expectRecord(record["byType"] ?? {}, joinPath(path, "byType"));
  const byType: Aggregates["byType"] = {};
  for (const key of Object.keys(byTypeRaw)) {
    if (!isTaskType(key)) {
      fail("invalid_enum", joinPath(joinPath(path, "byType"), key), `tipo desconhecido: ${key}`);
    }
    byType[key] = parseAggregateBucket(byTypeRaw[key], joinPath(joinPath(path, "byType"), key));
  }

  const bySectionRaw = expectRecord(record["bySection"] ?? {}, joinPath(path, "bySection"));
  const bySection: Aggregates["bySection"] = {};
  for (const key of Object.keys(bySectionRaw)) {
    if (!(SECTIONS as readonly string[]).includes(key)) {
      fail(
        "invalid_enum",
        joinPath(joinPath(path, "bySection"), key),
        `seção desconhecida: ${key}`,
      );
    }
    bySection[key as (typeof SECTIONS)[number]] = parseAggregateBucket(
      bySectionRaw[key],
      joinPath(joinPath(path, "bySection"), key),
    );
  }

  const bySkillRaw = expectRecord(record["bySkill"] ?? {}, joinPath(path, "bySkill"));
  const bySkill: Aggregates["bySkill"] = {};
  for (const key of Object.keys(bySkillRaw)) {
    if (!(SKILLS as readonly string[]).includes(key)) {
      fail(
        "invalid_enum",
        joinPath(joinPath(path, "bySkill"), key),
        `habilidade desconhecida: ${key}`,
      );
    }
    bySkill[key as (typeof SKILLS)[number]] = parseSkillAggregate(
      bySkillRaw[key],
      key,
      joinPath(joinPath(path, "bySkill"), key),
    );
  }

  return {
    version: 1,
    computedAt: expectIsoTimestamp(record["computedAt"], joinPath(path, "computedAt")),
    totalAttempts: expectNumber(record["totalAttempts"], joinPath(path, "totalAttempts"), {
      integer: true,
      min: 0,
    }),
    totalQuestions: expectNumber(record["totalQuestions"], joinPath(path, "totalQuestions"), {
      integer: true,
      min: 0,
    }),
    overall: parseAggregateBucket(record["overall"], joinPath(path, "overall")),
    byType,
    bySection,
    bySkill,
  };
}

/* ------------------------------------------------------------------ */
/* EvaluationResult                                                   */
/* ------------------------------------------------------------------ */

function parseDimension(raw: unknown, path: string): EvaluationDimension {
  const record = expectRecord(raw, path);
  const status = expectEnum(
    record["status"],
    DIMENSION_STATUSES,
    joinPath(path, "status"),
    "DimensionStatus",
  );
  const score =
    readOptionalNullable(record, "score", path, (value, at) =>
      expectNumber(value, at, { min: ATTEMPT_SCORE_MIN, max: ATTEMPT_SCORE_MAX }),
    ) ?? null;

  if (status === "not_measured" && score !== null) {
    fail(
      "inconsistent",
      joinPath(path, "score"),
      'dimensão não avaliada não pode ter nota (pronúncia sem áudio é "não avaliada")',
    );
  }
  if (status !== "not_measured" && score === null) {
    fail("inconsistent", joinPath(path, "score"), `dimensão com status "${status}" exige nota`);
  }

  const dimension: EvaluationDimension = {
    id: expectString(record["id"], joinPath(path, "id")),
    label: expectString(record["label"], joinPath(path, "label")),
    status,
    score,
  };
  const rationale = readOptionalString(record, "rationale", path);
  if (rationale !== undefined) dimension.rationale = rationale;
  return dimension;
}

/** Valida o resultado de um avaliador de IA. */
export function parseEvaluationResult(raw: unknown, path = "result"): EvaluationResult {
  const record = expectRecord(raw, path);
  expectLiteral(record["scale"], ATTEMPT_SCORE_SCALE, joinPath(path, "scale"));
  const verdict = expectEnum(record["verdict"], VERDICTS, joinPath(path, "verdict"), "Verdict");
  const confidence = expectEnum(
    record["confidence"],
    CONFIDENCES,
    joinPath(path, "confidence"),
    "Confidence",
  );

  const dimensionsPath = joinPath(path, "dimensions");
  const dimensions = expectArray(record["dimensions"], dimensionsPath).map((dimension, index) =>
    parseDimension(dimension, joinPath(dimensionsPath, index)),
  );

  const evidencePath = joinPath(path, "evidence");
  const evidence = expectArray(record["evidence"], evidencePath).map((item, index) => {
    const at = joinPath(evidencePath, index);
    const evidenceRecord = expectRecord(item, at);
    const parsed: EvaluationResult["evidence"][number] = {
      observation: expectString(evidenceRecord["observation"], joinPath(at, "observation")),
    };
    const dimensionId = readOptionalString(evidenceRecord, "dimensionId", at);
    if (dimensionId !== undefined) parsed.dimensionId = dimensionId;
    const quote = readOptionalString(evidenceRecord, "quote", at);
    if (quote !== undefined) parsed.quote = quote;
    return parsed;
  });

  const evaluatorPath = joinPath(path, "evaluator");
  const evaluatorRecord = expectRecord(record["evaluator"], evaluatorPath);
  const evaluator = {
    model: expectString(evaluatorRecord["model"], joinPath(evaluatorPath, "model")),
    promptVersion: expectString(
      evaluatorRecord["promptVersion"],
      joinPath(evaluatorPath, "promptVersion"),
    ),
    rubricVersion: expectString(
      evaluatorRecord["rubricVersion"],
      joinPath(evaluatorPath, "rubricVersion"),
    ),
  };

  const base = {
    scale: ATTEMPT_SCORE_SCALE,
    confidence,
    dimensions,
    evidence,
    feedback: expectString(record["feedback"], joinPath(path, "feedback")),
    uncertainty:
      readOptionalNullable(record, "uncertainty", path, (value, at) =>
        expectString(value, at, { nonEmpty: false }),
      ) ?? null,
    unmeasured: expectStringArray(record["unmeasured"] ?? [], joinPath(path, "unmeasured")),
    evaluator,
    scoredAt: expectIsoTimestamp(record["scoredAt"], joinPath(path, "scoredAt")),
  } as const;

  // Só `not_measured` é ausência de medição. Um `proxy` FOI medido
  // (aproximadamente) e é rotulado como tal — não pertence a `unmeasured`.
  const unmeasuredDimensions = dimensions.filter(
    (dimension) => dimension.status === "not_measured",
  );
  if (unmeasuredDimensions.length > 0 && base.unmeasured.length === 0) {
    fail(
      "inconsistent",
      joinPath(path, "unmeasured"),
      `dimensões não medidas (${unmeasuredDimensions.map((d) => d.id).join(", ")}) precisam constar em unmeasured`,
    );
  }

  if (verdict === "scored") {
    const score = expectNumber(record["score"], joinPath(path, "score"), {
      min: ATTEMPT_SCORE_MIN,
      max: ATTEMPT_SCORE_MAX,
    });
    if (dimensions.length === 0) {
      fail("inconsistent", dimensionsPath, "avaliação com nota exige ao menos uma dimensão");
    }
    if (!dimensions.some((dimension) => dimension.status === "measured")) {
      fail(
        "inconsistent",
        dimensionsPath,
        "avaliação com nota exige ao menos uma dimensão realmente medida",
      );
    }
    if (evidence.length === 0) {
      fail(
        "inconsistent",
        evidencePath,
        "avaliação com nota exige ao menos uma evidência observável",
      );
    }
    return { ...base, verdict, score };
  }

  if (record["score"] !== null && record["score"] !== undefined) {
    fail(
      "inconsistent",
      joinPath(path, "score"),
      `verdict "${verdict}" exige score null (abstenção nunca vira nota)`,
    );
  }

  if (verdict === "abstained") {
    return {
      ...base,
      verdict,
      score: null,
      abstentionReason: expectString(
        record["abstentionReason"],
        joinPath(path, "abstentionReason"),
      ),
    };
  }

  return {
    ...base,
    verdict: "needs_review",
    score: null,
    reviewReason: expectString(record["reviewReason"], joinPath(path, "reviewReason")),
  };
}
