/**
 * Cronômetro de TREINO por tipo de tarefa (Fase 4 — s5-pratica).
 *
 * Por que este módulo existe: cada um dos 22 tipos tem um formato de tempo próprio em
 * `src/data/exam-spec.ts` — preparação opcional, resposta fixa, resposta que acompanha o
 * áudio (`until_audio`) ou tempo compartilhado da seção (`shared_section`). O shell de
 * prática (Fase 4) e os motores reais (Fase 6) não podem reimplementar essa conversão,
 * senão o mesmo tipo ganha tempos diferentes em telas diferentes.
 *
 * Regras de honestidade (PRD central §4.2, §8, §17):
 *
 * 1. **Nenhum número inventado.** Todo tempo vem de `EXAM_TASKS`. Onde a janela não é
 *    fixa (`until_audio`, `shared_section`), `responseMs` é `null` e `responseKind` diz
 *    qual é o comportamento real — a UI nunca exibe "0 s" no lugar de "tempo da seção".
 * 2. **Escala só no treino.** `settings.timerScale` (1×, 1,5×, 2×) multiplica os tempos
 *    desta função. O simulado (Fase 9) é cronometrado pelo blueprint e não usa isto.
 * 3. **Desligado é desligado.** `settings.timersEnabled: false` mantém os tempos
 *    exibidos (para o aluno conhecer o formato) mas marca `adjustable: false` e
 *    `enabled: false`: nada conta correndo.
 * 4. **Sem contagem, sem botão.** Tipos cujo tempo é o da seção (ou que acompanham o
 *    áudio e não têm preparação) não ganham cronômetro artificial: `adjustable` só é
 *    `true` quando existe de fato uma contagem que a escala pode alterar.
 *
 * O módulo é puro: nenhum `window`, `setInterval` ou I/O. A máquina de estados
 * (`initialTimerState`/`startTimer`/`tickTimer`/...) é determinística e testável sem
 * relógio real — o componente só a alimenta com o tempo decorrido.
 */

import { EXAM_TASKS, type ExamTaskSpec, type ResponseWindow } from "@/data/exam-spec";
import { isTaskType, type TaskType } from "@/domain";

import type { AppSettings } from "./settings";

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

/** Como a janela de resposta se comporta — o rótulo honesto vem daqui. */
export type TimerResponseKind = "fixed" | "until_audio" | "shared_section" | "none";

/**
 * Tempos de treino já convertidos para milissegundos e escalados.
 *
 * Os três primeiros campos são o contrato consumido pela Fase 6; `responseKind`,
 * `enabled` e `scale` existem para a UI rotular o que está vendo sem adivinhar
 * (ex.: distinguir "cronômetro desligado nos Ajustes" de "este tipo não tem
 * cronômetro por item").
 */
export interface TimerSpec {
  /** preparação em ms; `null` quando o tipo não tem preparação */
  preparationMs: number | null;
  /** janela de resposta em ms; `null` quando não é fixa (áudio/seção) */
  responseMs: number | null;
  /** a escala de treino pode alterar uma contagem exibida? */
  adjustable: boolean;
  /** comportamento real da janela de resposta no exame */
  responseKind: TimerResponseKind;
  /** espelho de `settings.timersEnabled` no momento do cálculo */
  enabled: boolean;
  /** multiplicador efetivamente aplicado (1, 1.5 ou 2) */
  scale: number;
}

/** Fases da demonstração de tempo do shell (motor real chega na Fase 6). */
export type TimerPhase = "idle" | "preparation" | "response" | "finished" | "unavailable";

export interface TimerState {
  phase: TimerPhase;
  remainingMs: number;
  running: boolean;
}

/* ------------------------------------------------------------------ */
/* Specs do exame                                                     */
/* ------------------------------------------------------------------ */

const TASK_SPECS: ReadonlyMap<string, ExamTaskSpec> = new Map(
  EXAM_TASKS.map((task) => [task.id, task]),
);

/**
 * Spec oficial do tipo. Lança se o tipo do contrato de domínio não estiver no
 * `exam-spec` — é uma inconsistência de dados, não um estado de tela: melhor falhar
 * cedo (teste/desenvolvimento) do que exibir tempo errado ao aluno.
 */
export function findExamTaskSpec(type: TaskType): ExamTaskSpec {
  const spec = TASK_SPECS.get(type);
  if (spec === undefined) {
    throw new Error(`exam-spec não define o tipo de tarefa "${type}"`);
  }
  return spec;
}

/**
 * Versão tolerante para `head()`/SSR com parâmetro cru de URL: tipo desconhecido
 * devolve `null` em vez de lançar (a rota já responde 404).
 */
export function examTaskSpecFor(rawType: string): ExamTaskSpec | null {
  return isTaskType(rawType) ? findExamTaskSpec(rawType) : null;
}

/* ------------------------------------------------------------------ */
/* Conversão de tempos                                                */
/* ------------------------------------------------------------------ */

function responseKindOf(window: ResponseWindow | undefined): TimerResponseKind {
  if (window === undefined) return "none";
  if (typeof window === "number") return "fixed";
  return window;
}

function scaleMs(seconds: number, scale: number): number {
  return Math.round(seconds * 1000 * scale);
}

/**
 * Converte o formato oficial do tipo em tempos de treino.
 *
 * @param type tipo do contrato (`TaskType`)
 * @param spec spec oficial do mesmo tipo (`EXAM_TASKS`)
 * @param settings seção `practice` dos Ajustes
 */
export function timerForType(
  type: TaskType,
  spec: ExamTaskSpec,
  settings: AppSettings["practice"],
): TimerSpec {
  if (spec.id !== type) {
    throw new Error(`timerForType: spec de "${spec.id}" não corresponde ao tipo "${type}"`);
  }

  const scale = settings.timerScale;
  const preparationMs =
    spec.preparationSeconds === undefined ? null : scaleMs(spec.preparationSeconds, scale);
  const responseKind = responseKindOf(spec.responseSeconds);
  const responseMs =
    typeof spec.responseSeconds === "number" ? scaleMs(spec.responseSeconds, scale) : null;
  const hasCountdown = preparationMs !== null || responseMs !== null;

  return {
    preparationMs,
    responseMs,
    // A escala só é "ajustável" quando existe uma contagem que ela altera.
    adjustable: settings.timersEnabled && hasCountdown,
    responseKind,
    enabled: settings.timersEnabled,
    scale,
  };
}

/** `true` quando o tipo tem alguma contagem que pode correr em treino. */
export function hasCountdown(spec: TimerSpec): boolean {
  return spec.preparationMs !== null || spec.responseMs !== null;
}

/* ------------------------------------------------------------------ */
/* Formatação                                                         */
/* ------------------------------------------------------------------ */

/**
 * Duração legível em pt-BR: "45 s", "2 min", "1 min 30 s".
 * Arredonda para o segundo mais próximo (não mostra milissegundos ao aluno).
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds} s`;
}

/** Contagem regressiva: nunca mostra "0 s" antes de zerar (arredonda para cima). */
export function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return formatDuration(0);
  return formatDuration(Math.ceil(ms / 1000) * 1000);
}

/** Fase em que a contagem começa quando o aluno aperta "Iniciar". */
export function startsIn(spec: TimerSpec): "preparation" | "response" | null {
  if (spec.preparationMs !== null) return "preparation";
  if (spec.responseMs !== null) return "response";
  return null;
}

/* ------------------------------------------------------------------ */
/* Máquina de estados do cronômetro                                   */
/* ------------------------------------------------------------------ */

/**
 * Estado inicial: parado na primeira fase disponível. Sem nenhuma contagem
 * (tempo de seção/áudio sem preparação), a fase é `unavailable` — a UI explica
 * o motivo em vez de fingir um cronômetro.
 */
export function initialTimerState(spec: TimerSpec): TimerState {
  if (spec.preparationMs !== null) {
    return { phase: "idle", remainingMs: spec.preparationMs, running: false };
  }
  if (spec.responseMs !== null) {
    return { phase: "idle", remainingMs: spec.responseMs, running: false };
  }
  return { phase: "unavailable", remainingMs: 0, running: false };
}

/** Inicia a contagem (ou retoma uma pausa). Estado terminal permanece terminal. */
export function startTimer(state: TimerState, spec: TimerSpec): TimerState {
  if (state.phase === "preparation" || state.phase === "response") {
    return state.running ? state : { ...state, running: true };
  }
  if (state.phase !== "idle") return state;
  const initial = startsIn(spec);
  if (initial === "preparation" && spec.preparationMs !== null) {
    return { phase: "preparation", remainingMs: spec.preparationMs, running: true };
  }
  if (initial === "response" && spec.responseMs !== null) {
    return { phase: "response", remainingMs: spec.responseMs, running: true };
  }
  return state;
}

/** Pausa sem perder o restante (treino pode ser interrompido). */
export function pauseTimer(state: TimerState): TimerState {
  return state.running ? { ...state, running: false } : state;
}

/** Volta ao estado inicial do tipo (tempos e fase recalculados da spec). */
export function resetTimer(spec: TimerSpec): TimerState {
  return initialTimerState(spec);
}

/**
 * Avança o relógio em `deltaMs`.
 *
 * - Preparação que chega a zero entra automaticamente na resposta (quando há
 *   resposta fixa); sem resposta fixa, encerra.
 * - Resposta que chega a zero encerra (`finished`).
 * - O restante nunca fica negativo.
 */
export function tickTimer(state: TimerState, spec: TimerSpec, deltaMs: number): TimerState {
  if (!state.running || deltaMs <= 0) return state;
  if (state.phase !== "preparation" && state.phase !== "response") return state;

  const remaining = state.remainingMs - deltaMs;
  if (remaining > 0) return { ...state, remainingMs: remaining };

  if (state.phase === "preparation" && spec.responseMs !== null) {
    return { phase: "response", remainingMs: spec.responseMs, running: true };
  }
  return { phase: "finished", remainingMs: 0, running: false };
}

/** Fração decorrida da fase atual (0–1), para a barra de progresso. */
export function timerProgress(state: TimerState, spec: TimerSpec): number {
  if (state.phase === "finished") return 1;
  const total =
    state.phase === "preparation"
      ? spec.preparationMs
      : state.phase === "response"
        ? spec.responseMs
        : null;
  if (total === null || total <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - state.remainingMs / total));
}
