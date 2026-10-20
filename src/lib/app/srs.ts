/**
 * SRS (repetição espaçada) — agendamento administrativo da Fase 3 (F3.4).
 *
 * O PRD central §9 fixa três regras que este módulo implementa literalmente:
 * 1. A caixa SÓ promove quando a revisão está **vencida** (`nextReviewDay <= hoje`).
 * 2. Um lapso (nota abaixo do limiar do tipo) rebaixa **exatamente uma** caixa.
 * 3. O limiar (intervalos) varia por tipo — `wfd` exige mais intervalo que
 *    `answer_short`; os parâmetros vivem aqui, não em `@/domain`.
 *
 * Datas são chaves de dia local (`YYYY-MM-DD`) via `@/domain` (`addLocalDays`,
 * `diffLocalDays`, `isLocalDayKey`) — nunca `toISOString().slice(0,10)`, porque
 * um passo de 24 h não pode quebrar em horário de verão.
 *
 * Consequência deliberada: acertar 5 vezes em 5 minutos NÃO empurra a revisão
 * para 30 dias. A primeira exposição agenda a caixa 0 (+1 dia); acertos
 * antecipados não promovem nem remarcam — o item continua vencendo na data
 * original.
 *
 * Este é cálculo administrativo explicitamente permitido pelo princípio
 * AI-first (PRD §4.1): não pontua resposta, apenas agenda revisão a partir do
 * resultado do avaliador.
 */

import {
  addLocalDays,
  compareLocalDayKeys,
  isLocalDayKey,
  type LocalDayKey,
  type QuestionSnapshot,
  type TaskType,
} from "@/domain";

export interface SrsPolicy {
  /** intervalos em dias; índice = caixa. Ex.: `[1,2,4,8,16,32]` */
  intervals: readonly number[];
  /** nota mínima (escala de TENTATIVA 0–100) para contar acerto */
  passScore: number;
}

/** Política usada quando o tipo não tem parâmetro específico. */
export const DEFAULT_SRS_POLICY: SrsPolicy = {
  intervals: [1, 2, 4, 8, 16, 32],
  passScore: 60,
};

function policy(intervals: readonly number[], passScore: number): SrsPolicy {
  return { intervals, passScore };
}

/**
 * Limiares por tipo de tarefa. Tipos que dependem de memória literal
 * (`wfd`, `repeat_sentence`) e de produção longa (`write_essay`, `sst`) têm
 * intervalos mais longos; tipos de reconhecimento curto (`answer_short`,
 * MCQs) sobem mais rápido.
 */
export const SRS_POLICY_BY_TYPE: Record<TaskType, SrsPolicy> = {
  // Speaking
  read_aloud: policy([1, 3, 7, 14, 30, 60], 60),
  repeat_sentence: policy([1, 2, 5, 10, 21, 45], 60),
  describe_image: policy([1, 3, 7, 14, 30, 60], 60),
  retell_lecture: policy([1, 3, 7, 14, 30, 60], 60),
  answer_short: policy([1, 2, 4, 7, 14, 30], 50),
  sgd: policy([1, 3, 7, 14, 30, 60], 60),
  rts: policy([1, 2, 5, 10, 21, 45], 60),
  // Writing
  swt: policy([2, 4, 8, 16, 32, 64], 60),
  write_essay: policy([2, 5, 10, 21, 45, 90], 60),
  // Reading
  read_fib_dropdown: policy([1, 2, 4, 8, 16, 32], 60),
  read_mcq_multi: policy([1, 2, 5, 10, 21, 45], 60),
  reorder_paragraphs: policy([1, 3, 7, 14, 30, 60], 60),
  read_fib_drag: policy([1, 2, 4, 8, 16, 32], 60),
  read_mcq_single: policy([1, 2, 4, 8, 16, 32], 60),
  // Listening
  sst: policy([2, 4, 8, 16, 32, 64], 60),
  lst_mcq_multi: policy([1, 2, 5, 10, 21, 45], 60),
  lst_fib: policy([1, 3, 7, 14, 30, 60], 60),
  lst_hcs: policy([1, 2, 5, 10, 21, 45], 60),
  lst_mcq_single: policy([1, 2, 4, 8, 16, 32], 60),
  lst_smw: policy([1, 2, 4, 8, 16, 32], 60),
  lst_hiw: policy([1, 3, 7, 14, 30, 60], 65),
  // `wfd` é o tipo com maior exigência de retenção literal (PRD §9).
  wfd: policy([1, 3, 7, 14, 30, 60, 90], 70),
};

/** Política do tipo (sempre definida para os 22 tipos). */
export function srsPolicyFor(type: TaskType): SrsPolicy {
  return SRS_POLICY_BY_TYPE[type] ?? DEFAULT_SRS_POLICY;
}

/** Maior caixa possível para a política (índice do último intervalo). */
export function maxSrsBox(policyValue: SrsPolicy = DEFAULT_SRS_POLICY): number {
  return Math.max(0, policyValue.intervals.length - 1);
}

function clampBox(box: number, policyValue: SrsPolicy): number {
  if (!Number.isFinite(box)) return 0;
  return Math.min(Math.max(0, Math.trunc(box)), maxSrsBox(policyValue));
}

function intervalForBox(box: number, policyValue: SrsPolicy): number {
  const clamped = clampBox(box, policyValue);
  const interval = policyValue.intervals[clamped];
  if (interval === undefined) return 1;
  return Math.max(1, Math.trunc(interval));
}

/** Data de próxima revisão para uma caixa, ancorada no dia local de hoje. */
export function nextReviewDayFor(
  box: number,
  today: LocalDayKey,
  policyValue: SrsPolicy = DEFAULT_SRS_POLICY,
): LocalDayKey {
  assertLocalDay(today, "today");
  return addLocalDays(today, intervalForBox(box, policyValue));
}

/**
 * Item está vencido? `nextReviewDay === null` significa "nunca agendado"
 * (primeira exposição), não "vencido".
 */
export function isSrsDue(
  snapshot: Pick<QuestionSnapshot, "nextReviewDay">,
  today: LocalDayKey,
): boolean {
  assertLocalDay(today, "today");
  if (snapshot.nextReviewDay === null) return false;
  return compareLocalDayKeys(snapshot.nextReviewDay, today) <= 0;
}

export type SrsUpdateReason = "first_exposure" | "promoted" | "early" | "lapsed" | "unmeasured";

export interface SrsScheduleInput {
  /** tipo da questão — define o limiar */
  type: TaskType;
  /** dia local da revisão (`YYYY-MM-DD`), nunca timestamp */
  today: LocalDayKey;
  /** `true` acerto, `false` lapso, `null` não medido */
  passed: boolean | null;
  /** override opcional (testes/calibração) */
  policy?: SrsPolicy;
}

export interface SrsUpdate {
  srsBox: number;
  nextReviewDay: LocalDayKey | null;
  lastReviewedDay: LocalDayKey | null;
  changed: boolean;
  reason: SrsUpdateReason;
  /** caixa anterior (para evidência/telemetria) */
  previousBox: number;
  /** intervalo aplicado em dias, quando houve agendamento */
  intervalDays: number | null;
}

function assertLocalDay(value: string, field: string): void {
  if (!isLocalDayKey(value)) {
    throw new TypeError(`${field}: esperado YYYY-MM-DD no fuso local, recebeu "${value}"`);
  }
}

/**
 * Calcula o novo agendamento de um snapshot.
 *
 * - `passed === null` (abstenção/necessidade de revisão) → não altera nada:
 *   não houve medição, então não há promoção nem lapso.
 * - `nextReviewDay === null` → primeira exposição: mantém a caixa e agenda o
 *   intervalo da caixa (nunca promove de primeira).
 * - vencido + acerto → promove UMA caixa.
 * - vencido + lapso → rebaixa UMA caixa.
 * - não vencido + acerto → não promove e NÃO remarca (evita "5 acertos em 5
 *   minutos = 30 dias"); apenas registra o dia revisado.
 * - não vencido + lapso → rebaixa UMA caixa e reagenda (falhar cedo não pode
 *   manter o item como se estivesse aprendido).
 */
export function scheduleSrs(
  snapshot: Pick<QuestionSnapshot, "srsBox" | "nextReviewDay" | "lastReviewedDay">,
  input: SrsScheduleInput,
): SrsUpdate {
  assertLocalDay(input.today, "today");
  const policyValue = input.policy ?? srsPolicyFor(input.type);
  const previousBox = clampBox(snapshot.srsBox, policyValue);

  if (input.passed === null) {
    return {
      srsBox: previousBox,
      nextReviewDay: snapshot.nextReviewDay,
      lastReviewedDay: snapshot.lastReviewedDay,
      changed: false,
      reason: "unmeasured",
      previousBox,
      intervalDays: null,
    };
  }

  if (snapshot.nextReviewDay === null) {
    const intervalDays = intervalForBox(previousBox, policyValue);
    return {
      srsBox: previousBox,
      nextReviewDay: addLocalDays(input.today, intervalDays),
      lastReviewedDay: input.today,
      changed: true,
      reason: "first_exposure",
      previousBox,
      intervalDays,
    };
  }

  const due = compareLocalDayKeys(snapshot.nextReviewDay, input.today) <= 0;

  if (due && input.passed) {
    const nextBox = clampBox(previousBox + 1, policyValue);
    const intervalDays = intervalForBox(nextBox, policyValue);
    return {
      srsBox: nextBox,
      nextReviewDay: addLocalDays(input.today, intervalDays),
      lastReviewedDay: input.today,
      changed: true,
      reason: "promoted",
      previousBox,
      intervalDays,
    };
  }

  if (due && !input.passed) {
    const nextBox = clampBox(previousBox - 1, policyValue);
    const intervalDays = intervalForBox(nextBox, policyValue);
    return {
      srsBox: nextBox,
      nextReviewDay: addLocalDays(input.today, intervalDays),
      lastReviewedDay: input.today,
      changed: true,
      reason: "lapsed",
      previousBox,
      intervalDays,
    };
  }

  if (!due && input.passed) {
    return {
      srsBox: previousBox,
      nextReviewDay: snapshot.nextReviewDay,
      lastReviewedDay: input.today,
      changed: true,
      reason: "early",
      previousBox,
      intervalDays: null,
    };
  }

  // !due && !passed → lapso antecipado.
  const nextBox = clampBox(previousBox - 1, policyValue);
  const intervalDays = intervalForBox(nextBox, policyValue);
  return {
    srsBox: nextBox,
    nextReviewDay: addLocalDays(input.today, intervalDays),
    lastReviewedDay: input.today,
    changed: true,
    reason: "lapsed",
    previousBox,
    intervalDays,
  };
}

/** `passed` a partir do resultado do avaliador, respeitando o limiar do tipo. */
export function passedForScore(
  type: TaskType,
  score: number | null,
  policyValue: SrsPolicy = srsPolicyFor(type),
): boolean | null {
  if (score === null) return null;
  return score >= policyValue.passScore;
}

/** Fila de revisão (itens vencidos), ordenada por data e depois por questão. */
export function reviewQueue<T extends Pick<QuestionSnapshot, "questionId" | "nextReviewDay">>(
  snapshots: readonly T[],
  today: LocalDayKey,
): T[] {
  assertLocalDay(today, "today");
  return snapshots
    .filter(
      (snapshot) =>
        snapshot.nextReviewDay !== null && compareLocalDayKeys(snapshot.nextReviewDay, today) <= 0,
    )
    .slice()
    .sort((a, b) => {
      const dayA = a.nextReviewDay ?? "";
      const dayB = b.nextReviewDay ?? "";
      const byDay = compareLocalDayKeys(dayA, dayB);
      return byDay !== 0 ? byDay : a.questionId.localeCompare(b.questionId);
    });
}
