/**
 * Testes do cronômetro de treino por tipo (F4.4.1 — s5-pratica).
 *
 * O que este arquivo prova:
 *
 * 1. Todo tipo do contrato (`TASK_TYPES`) tem spec no `exam-spec`, com seção coerente —
 *    o shell de prática não pode receber um tipo sem formato oficial.
 * 2. A conversão usa os tempos REAIS de `EXAM_TASKS` (não constantes digitadas): os
 *    casos cobertos são os quatro formatos que existem — preparação + resposta fixa,
 *    resposta fixa sem preparação, `until_audio` e `shared_section`.
 * 3. `shared_section`/`until_audio` produzem `responseMs: null` e um `responseKind`
 *    honesto — nunca um número inventado (ex.: "0 s").
 * 4. A escala de treino (1×/1,5×/2×) multiplica preparação e resposta.
 * 5. `timersEnabled: false` desliga a contagem (`adjustable: false`, `enabled: false`)
 *    sem apagar os tempos exibidos.
 * 6. A máquina de estados é determinística: preparação → resposta → fim, pausa não
 *    perde tempo, reiniciar volta ao começo e tipo sem contagem fica `unavailable`.
 * 7. A formatação pt-BR é estável e legível.
 * 8. O contrato da rota `/praticar/$type`: `head()` por tipo e 404 para slug inventado
 *    (`beforeLoad`), sem depender de servidor de preview.
 *
 * Nenhum número do banco de questões é usado: aqui só existem tempos do formato oficial.
 */

import { describe, expect, it } from "vitest";

import { EXAM_TASKS } from "@/data/exam-spec";
import { Route } from "@/routes/praticar.$type";
import { SECTION_BY_TYPE, TASK_TYPES, type TaskType } from "@/domain";
import type { AppSettings } from "@/lib/app/settings";
import {
  examTaskSpecFor,
  findExamTaskSpec,
  formatCountdown,
  formatDuration,
  hasCountdown,
  initialTimerState,
  pauseTimer,
  resetTimer,
  startTimer,
  startsIn,
  tickTimer,
  timerForType,
  timerProgress,
  type TimerSpec,
} from "@/lib/app/practice-timer";

const BASE_PRACTICE: AppSettings["practice"] = { timersEnabled: true, timerScale: 1 };

function timer(type: TaskType, practice: AppSettings["practice"] = BASE_PRACTICE): TimerSpec {
  return timerForType(type, findExamTaskSpec(type), practice);
}

/* ------------------------------------------------------------------ */
/* Contrato com o exam-spec                                           */
/* ------------------------------------------------------------------ */

describe("exam-spec — todo tipo do domínio tem formato oficial", () => {
  it("cobre exatamente os 22 tipos do contrato, sem sobra nem falta", () => {
    expect(new Set(EXAM_TASKS.map((task) => task.id))).toEqual(new Set(TASK_TYPES));
    expect(EXAM_TASKS).toHaveLength(TASK_TYPES.length);
  });

  it.each(TASK_TYPES)("tipo %s tem spec com a seção correta do domínio", (type) => {
    const spec = findExamTaskSpec(type);
    expect(spec.id).toBe(type);
    expect(spec.section).toBe(SECTION_BY_TYPE[type]);
    expect(spec.name.length).toBeGreaterThan(0);
    expect(spec.namePt.length).toBeGreaterThan(0);
  });

  it("a versão tolerante devolve null para tipo inválido (URL crua)", () => {
    expect(examTaskSpecFor("nao_existe")).toBeNull();
    expect(examTaskSpecFor("")).toBeNull();
    expect(examTaskSpecFor("read_aloud")?.id).toBe("read_aloud");
  });
});

/* ------------------------------------------------------------------ */
/* Conversão dos quatro formatos reais                                */
/* ------------------------------------------------------------------ */

describe("timerForType — formatos reais do exame", () => {
  it("preparação + resposta fixa (describe_image: 25 s / 40 s)", () => {
    const spec = timer("describe_image");
    expect(spec.preparationMs).toBe(25_000);
    expect(spec.responseMs).toBe(40_000);
    expect(spec.responseKind).toBe("fixed");
    expect(spec.adjustable).toBe(true);
    expect(spec.enabled).toBe(true);
    expect(spec.scale).toBe(1);
    expect(startsIn(spec)).toBe("preparation");
  });

  it("resposta fixa sem preparação (repeat_sentence: 15 s)", () => {
    const spec = timer("repeat_sentence");
    expect(spec.preparationMs).toBeNull();
    expect(spec.responseMs).toBe(15_000);
    expect(spec.responseKind).toBe("fixed");
    expect(startsIn(spec)).toBe("response");
  });

  it("until_audio — a resposta acompanha o áudio, sem número falso", () => {
    const spec = timer("read_aloud");
    expect(spec.preparationMs).toBe(30_000);
    expect(spec.responseMs).toBeNull();
    expect(spec.responseKind).toBe("until_audio");
    // Existe contagem (preparação), então a escala continua ajustável.
    expect(spec.adjustable).toBe(true);
    expect(hasCountdown(spec)).toBe(true);
  });

  it("shared_section — tempo da seção, sem cronômetro por item", () => {
    for (const type of ["read_fib_dropdown", "wfd"] as const) {
      const spec = timer(type);
      expect(spec.preparationMs).toBeNull();
      expect(spec.responseMs).toBeNull();
      expect(spec.responseKind).toBe("shared_section");
      // Sem contagem, não há o que ajustar: nada de botão de cronômetro vazio.
      expect(spec.adjustable).toBe(false);
      expect(hasCountdown(spec)).toBe(false);
      expect(initialTimerState(spec).phase).toBe("unavailable");
    }
  });

  it("resposta longa de escrita é convertida (swt: 10 min, write_essay: 20 min)", () => {
    expect(timer("swt").responseMs).toBe(600_000);
    expect(timer("write_essay").responseMs).toBe(1_200_000);
  });

  it("todos os 22 tipos produzem tempos finitos e não negativos", () => {
    for (const type of TASK_TYPES) {
      const spec = timer(type);
      for (const value of [spec.preparationMs, spec.responseMs]) {
        if (value === null) continue;
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("rejeita spec de outro tipo (não exibe o tempo errado)", () => {
    expect(() => timerForType("wfd", findExamTaskSpec("read_aloud"), BASE_PRACTICE)).toThrow(
      /não corresponde/,
    );
  });
});

/* ------------------------------------------------------------------ */
/* Escala de treino                                                   */
/* ------------------------------------------------------------------ */

describe("timerForType — escala de treino", () => {
  it("1,5× multiplica preparação e resposta", () => {
    const spec = timer("describe_image", { timersEnabled: true, timerScale: 1.5 });
    expect(spec.preparationMs).toBe(37_500);
    expect(spec.responseMs).toBe(60_000);
    expect(spec.scale).toBe(1.5);
  });

  it("2× dobra os tempos e não inventa tempo para janelas não fixas", () => {
    const fixed = timer("repeat_sentence", { timersEnabled: true, timerScale: 2 });
    expect(fixed.responseMs).toBe(30_000);

    const shared = timer("wfd", { timersEnabled: true, timerScale: 2 });
    expect(shared.preparationMs).toBeNull();
    expect(shared.responseMs).toBeNull();
    expect(shared.responseKind).toBe("shared_section");
  });

  it("1× mantém o tempo oficial do tipo", () => {
    expect(timer("describe_image").responseMs).toBe(40_000);
  });
});

/* ------------------------------------------------------------------ */
/* Cronômetro desligado                                               */
/* ------------------------------------------------------------------ */

describe("timerForType — cronômetro desligado nos Ajustes", () => {
  it("mantém os tempos exibidos mas não deixa nada correr", () => {
    const spec = timer("describe_image", { timersEnabled: false, timerScale: 1 });
    expect(spec.enabled).toBe(false);
    expect(spec.adjustable).toBe(false);
    // O aluno ainda vê o formato real do tipo.
    expect(spec.preparationMs).toBe(25_000);
    expect(spec.responseMs).toBe(40_000);
  });

  it("um tipo sem contagem continua sem contagem", () => {
    const spec = timer("lst_fib", { timersEnabled: false, timerScale: 1 });
    expect(spec.enabled).toBe(false);
    expect(spec.adjustable).toBe(false);
    expect(spec.responseKind).toBe("shared_section");
  });
});

/* ------------------------------------------------------------------ */
/* Máquina de estados                                                 */
/* ------------------------------------------------------------------ */

describe("máquina de estados do cronômetro", () => {
  const describeImage = timer("describe_image");

  it("começa parado na preparação com o tempo cheio", () => {
    expect(initialTimerState(describeImage)).toEqual({
      phase: "idle",
      remainingMs: 25_000,
      running: false,
    });
  });

  it("preparação zera e entra automaticamente na resposta", () => {
    let state = startTimer(initialTimerState(describeImage), describeImage);
    expect(state).toEqual({ phase: "preparation", remainingMs: 25_000, running: true });

    state = tickTimer(state, describeImage, 25_000);
    expect(state).toEqual({ phase: "response", remainingMs: 40_000, running: true });

    state = tickTimer(state, describeImage, 40_000);
    expect(state).toEqual({ phase: "finished", remainingMs: 0, running: false });
  });

  it("o restante nunca fica negativo", () => {
    let state = startTimer(initialTimerState(describeImage), describeImage);
    state = tickTimer(state, describeImage, 999_000);
    expect(state.remainingMs).toBeGreaterThanOrEqual(0);
    expect(state.phase).not.toBe("preparation");
  });

  it("pausa não perde tempo e retomar continua de onde parou", () => {
    let state = startTimer(initialTimerState(describeImage), describeImage);
    state = tickTimer(state, describeImage, 10_000);
    state = pauseTimer(state);
    expect(state.running).toBe(false);
    expect(state.remainingMs).toBe(15_000);

    // Tempo parado não desconta.
    expect(tickTimer(state, describeImage, 5_000).remainingMs).toBe(15_000);

    state = startTimer(state, describeImage);
    expect(state.running).toBe(true);
    expect(state.phase).toBe("preparation");
    state = tickTimer(state, describeImage, 15_000);
    expect(state.phase).toBe("response");
  });

  it("preparação sem resposta fixa encerra ao zerar (nada de fase fantasma)", () => {
    const readAloud = timer("read_aloud");
    let state = startTimer(initialTimerState(readAloud), readAloud);
    expect(state.phase).toBe("preparation");
    state = tickTimer(state, readAloud, 30_000);
    expect(state).toEqual({ phase: "finished", remainingMs: 0, running: false });
  });

  it("reiniciar volta à primeira fase com o tempo cheio", () => {
    let state = startTimer(initialTimerState(describeImage), describeImage);
    state = tickTimer(state, describeImage, 30_000);
    const reset = resetTimer(describeImage);
    expect(reset).toEqual({ phase: "idle", remainingMs: 25_000, running: false });
  });

  it("tipo sem contagem fica indisponível e não inicia", () => {
    const wfd = timer("wfd");
    const state = initialTimerState(wfd);
    expect(state.phase).toBe("unavailable");
    expect(startTimer(state, wfd)).toEqual(state);
  });

  it("progresso vai de 0 a 1 na fase corrente", () => {
    let state = startTimer(initialTimerState(describeImage), describeImage);
    expect(timerProgress(state, describeImage)).toBe(0);
    state = tickTimer(state, describeImage, 12_500);
    expect(timerProgress(state, describeImage)).toBeCloseTo(0.5, 5);
    state = tickTimer(state, describeImage, 12_500);
    // Já entrou na resposta: progresso da resposta recomeça em 0.
    expect(state.phase).toBe("response");
    expect(timerProgress(state, describeImage)).toBe(0);
    expect(
      timerProgress({ phase: "finished", remainingMs: 0, running: false }, describeImage),
    ).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Formatação                                                         */
/* ------------------------------------------------------------------ */

describe("formatação de duração", () => {
  it("segundos, minutos exatos e minutos + segundos", () => {
    expect(formatDuration(0)).toBe("0 s");
    expect(formatDuration(15_000)).toBe("15 s");
    expect(formatDuration(60_000)).toBe("1 min");
    expect(formatDuration(90_000)).toBe("1 min 30 s");
    expect(formatDuration(600_000)).toBe("10 min");
    expect(formatDuration(1_200_000)).toBe("20 min");
  });

  it("contagem regressiva arredonda para cima (não zera antes do fim)", () => {
    expect(formatCountdown(1)).toBe("1 s");
    expect(formatCountdown(900)).toBe("1 s");
    expect(formatCountdown(0)).toBe("0 s");
    expect(formatCountdown(-10)).toBe("0 s");
  });
});

/* ------------------------------------------------------------------ */
/* Contrato da rota /praticar/$type                                   */
/* ------------------------------------------------------------------ */

type RouteHead = (arg: { params: { type: string } }) => {
  meta: Array<Record<string, string>>;
};
type RouteBeforeLoad = (arg: { params: { type: string } }) => unknown;

const routeHead = Route.options.head as unknown as RouteHead;
const routeBeforeLoad = Route.options.beforeLoad as unknown as RouteBeforeLoad;

describe("rota /praticar/$type — head e validação do parâmetro", () => {
  it("head válido descreve o tipo e a seção, sem noindex", () => {
    const result = routeHead({ params: { type: "wfd" } });
    const title = result.meta.find((meta) => "title" in meta)?.["title"];
    const description =
      result.meta.find((meta) => meta["name"] === "description")?.["content"] ?? "";

    expect(title).toContain(findExamTaskSpec("wfd").namePt);
    expect(description).toContain("Listening");
    expect(result.meta.some((meta) => meta["name"] === "robots")).toBe(false);
  });

  it("head de tipo inventado é noindex (não anuncia página que não existe)", () => {
    const result = routeHead({ params: { type: "nao_existe" } });
    expect(result.meta.find((meta) => meta["name"] === "robots")?.["content"]).toBe("noindex");
  });

  it("beforeLoad aceita os 22 tipos e rejeita slug inventado ou vazio", () => {
    for (const type of TASK_TYPES) {
      expect(() => routeBeforeLoad({ params: { type } })).not.toThrow();
    }
    expect(() => routeBeforeLoad({ params: { type: "nao_existe" } })).toThrow();
    expect(() => routeBeforeLoad({ params: { type: "" } })).toThrow();
  });
});
