/**
 * Helpers dos testes da camada de progresso (Fase 3).
 *
 * Cada teste monta um `IDBFactory` próprio (`fake-indexeddb`) para isolamento
 * total: nada vaza entre testes, nem entre arquivos.
 */

import { IDBFactory } from "fake-indexeddb";
import type {
  Attempt,
  AttemptPayload,
  EvaluationResult,
  QuestionSnapshot,
  TaskType,
} from "@/domain";
import { deleteProgressDb, openProgressDb, type ProgressDatabase } from "@/lib/app/db";

let dbCounter = 0;

export function uniqueDbName(label: string): string {
  dbCounter += 1;
  return `pte-test-${label.replace(/[^a-z0-9-]/gi, "-")}-${dbCounter}`;
}

export interface DbHarness {
  db: ProgressDatabase;
  factory: IDBFactory;
  name: string;
  /** fecha e reabre o mesmo banco (simula reload da página) */
  reopen: () => Promise<ProgressDatabase>;
  close: () => Promise<void>;
}

export async function makeDb(label = "db"): Promise<DbHarness> {
  const factory = new IDBFactory();
  const name = uniqueDbName(label);
  let current = await openProgressDb({ name, indexedDB: factory });
  return {
    get db() {
      return current;
    },
    factory,
    name,
    reopen: async () => {
      current.close();
      current = await openProgressDb({ name, indexedDB: factory });
      return current;
    },
    close: async () => {
      current.close();
      await deleteProgressDb({ name, indexedDB: factory });
    },
  };
}

/** Relógio fixo: `() => new Date(iso)`. */
export function clockAt(iso: string): () => Date {
  return () => new Date(iso);
}

export function scoredEvaluation(
  score: number,
  scoredAt = "2026-01-10T12:00:00.000Z",
): EvaluationResult {
  return {
    scale: "attempt_0_100",
    verdict: "scored",
    score,
    confidence: "high",
    dimensions: [{ id: "content", label: "Conteúdo", status: "measured", score }],
    evidence: [{ observation: "Resposta coincide com o ditado esperado.", dimensionId: "content" }],
    feedback: "Boa retenção; revise as palavras finais.",
    uncertainty: null,
    unmeasured: [],
    evaluator: { model: "test-model", promptVersion: "p1", rubricVersion: "r1" },
    scoredAt,
  };
}

export function abstainedEvaluation(scoredAt = "2026-01-10T12:00:00.000Z"): EvaluationResult {
  return {
    scale: "attempt_0_100",
    verdict: "abstained",
    score: null,
    confidence: "low",
    dimensions: [{ id: "content", label: "Conteúdo", status: "not_measured", score: null }],
    evidence: [],
    feedback: "Áudio inaudível; nada foi pontuado.",
    uncertainty: "Sem sinal de áudio suficiente.",
    unmeasured: ["content"],
    evaluator: { model: "test-model", promptVersion: "p1", rubricVersion: "r1" },
    scoredAt,
    abstentionReason: "áudio inaudível",
  };
}

function payloadFor(type: TaskType, text = "the quick brown fox"): AttemptPayload {
  switch (type) {
    case "wfd":
    case "swt":
    case "write_essay":
    case "sst":
      return { kind: "text", text };
    case "read_mcq_multi":
    case "read_mcq_single":
    case "lst_mcq_multi":
    case "lst_hcs":
    case "lst_mcq_single":
    case "lst_smw":
      return { kind: "choice", selected: [0] };
    case "read_fib_dropdown":
    case "read_fib_drag":
    case "lst_fib":
      return { kind: "blanks", values: ["word"] };
    case "reorder_paragraphs":
      return { kind: "order", order: [0, 1, 2] };
    case "lst_hiw":
      return { kind: "highlights", words: [0] };
    default:
      return { kind: "spoken", durationMs: 1200, audioRef: null, transcriptSource: "none" };
  }
}

export interface AttemptOptions {
  attemptId?: string;
  questionId?: string;
  questionType?: TaskType;
  startedAt?: string;
  submittedAt?: string | null;
  result?: EvaluationResult;
  mode?: Attempt["mode"];
}

export function makeAttempt(options: AttemptOptions = {}): Attempt {
  const type = options.questionType ?? "wfd";
  const attempt: Attempt = {
    attemptId: options.attemptId ?? `attempt-${Math.random().toString(36).slice(2, 10)}`,
    questionId: options.questionId ?? "q-1",
    questionType: type,
    mode: options.mode ?? "practice",
    startedAt: options.startedAt ?? "2026-01-10T11:59:00.000Z",
    submittedAt:
      options.submittedAt === undefined ? "2026-01-10T12:00:00.000Z" : options.submittedAt,
    payload: payloadFor(type),
  };
  if (options.result !== undefined) attempt.result = options.result;
  return attempt;
}

export function makeSnapshot(overrides: Partial<QuestionSnapshot> = {}): QuestionSnapshot {
  return {
    questionId: "q-1",
    questionType: "wfd",
    canonicalId: "q-1",
    attempts: 1,
    scoredAttempts: 1,
    lastScore: 60,
    bestScore: 60,
    lastSubmittedAt: "2026-01-10T12:00:00.000Z",
    srsBox: 0,
    nextReviewDay: null,
    lastReviewedDay: null,
    errorCounts: {},
    favorite: false,
    privateNote: null,
    firstSeenAt: "2026-01-10T12:00:00.000Z",
    updatedAt: "2026-01-10T12:00:00.000Z",
    ...overrides,
  };
}
