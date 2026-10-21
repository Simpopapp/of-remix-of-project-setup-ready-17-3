/**
 * Testes da segurança de requisição da avaliação por IA (Fase 5 — s8).
 *
 * Cobre o que a auditoria s5 apontou (G5/G7):
 * 1. Sem `consent === true` o servidor abstém e NUNCA carrega o avaliador.
 * 2. O sinal de consentimento não vaza para o payload de domínio e chaves
 *    desconhecidas (settings/progresso) são rejeitadas.
 * 3. Limite por instância: janela padrão de 10/min, concorrência 2, expiração
 *    testável por relógio injetado.
 * 4. Lease liberado em sucesso, erro do avaliador e falha ao importar o avaliador.
 * 5. Toda recusa é abstenção com `score: null` — nunca nota substituta.
 */

import { describe, expect, it, vi } from "vitest";

import { ATTEMPT_SCORE_SCALE, type EvaluationResult } from "@/domain";
import {
  INVALID_INPUT_REASON,
  type EvaluationRequestPayload,
  type EvaluationResponse,
} from "@/lib/ai/evaluation-io";
import { parseEvaluationEnvelope, withEvaluationConsent } from "@/lib/ai/request-safety";
import {
  BUSY_REASON,
  CONSENT_REQUIRED_REASON,
  EVALUATION_RATE_LIMIT,
  RATE_LIMITED_REASON,
  createEvaluationLimiter,
  createGuardedEvaluation,
  evaluateGuarded,
  type EvaluateResponseFn,
  type EvaluationLimiterOptions,
} from "@/lib/ai/request-safety.server";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const PAYLOAD: EvaluationRequestPayload = {
  type: "wfd",
  questionId: "wfd-001",
  response: { text: "The lecture begins at nine o'clock." },
  mode: "practice",
};

const ENVELOPE = withEvaluationConsent(PAYLOAD);

const SCORED: EvaluationResult = {
  scale: ATTEMPT_SCORE_SCALE,
  verdict: "scored",
  score: 74,
  confidence: "medium",
  dimensions: [
    {
      id: "content",
      label: "Conteúdo",
      status: "measured",
      score: 74,
      rationale: "A frase foi reproduzida com pequenas omissões.",
    },
  ],
  evidence: [{ observation: "O aluno reproduz a frase quase inteira." }],
  feedback: "Boa reprodução; atenção à pontuação final.",
  uncertainty: null,
  unmeasured: [],
  evaluator: { model: "fake", promptVersion: "judge@test", rubricVersion: "wfd@test" },
  scoredAt: "2026-10-21T00:00:00.000Z",
};

const OK_RESPONSE: EvaluationResponse = { evaluation: SCORED };

function expectAbstained(response: EvaluationResponse, reason: string): void {
  const evaluation = response.evaluation;
  expect(evaluation.verdict).toBe("abstained");
  expect(evaluation.score).toBeNull();
  if (evaluation.verdict !== "abstained") throw new Error("esperava abstenção");
  expect(evaluation.abstentionReason).toBe(reason);
  expect(evaluation.feedback.length).toBeGreaterThan(0);
}

interface HarnessOptions {
  maxRequests?: number;
  windowMs?: number;
  maxConcurrent?: number;
}

function harness(options: HarnessOptions = {}) {
  let now = 1_700_000_000_000;
  const nowMs = () => now;

  const evaluate = vi.fn<EvaluateResponseFn>();
  evaluate.mockResolvedValue(OK_RESPONSE);

  const loadEvaluator = vi.fn<() => Promise<EvaluateResponseFn>>(async () => evaluate);

  const limiterOptions: EvaluationLimiterOptions = {
    nowMs,
    ...(options.maxRequests === undefined ? {} : { maxRequests: options.maxRequests }),
    ...(options.windowMs === undefined ? {} : { windowMs: options.windowMs }),
    ...(options.maxConcurrent === undefined ? {} : { maxConcurrent: options.maxConcurrent }),
  };
  const limiter = createEvaluationLimiter(limiterOptions);
  const guarded = createGuardedEvaluation({ limiter, loadEvaluator, nowMs });

  return {
    guarded,
    evaluate,
    loadEvaluator,
    limiter,
    advance(ms: number) {
      now += ms;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Envelope puro                                                       */
/* ------------------------------------------------------------------ */

describe("envelope de consentimento — contrato puro", () => {
  it("marca consent: true sem mutar o payload de domínio", () => {
    const payload: EvaluationRequestPayload = { ...PAYLOAD };
    const envelope = withEvaluationConsent(payload);

    expect(envelope).toEqual({ ...PAYLOAD, consent: true });
    expect(envelope).not.toBe(payload);
    expect(payload).not.toHaveProperty("consent");
  });

  it("rejeita consentimento ausente, falso ou não booleano (sem coerção)", () => {
    const variants: unknown[] = [
      { ...PAYLOAD },
      { ...PAYLOAD, consent: false },
      { ...PAYLOAD, consent: "true" },
      { ...PAYLOAD, consent: 1 },
      { ...PAYLOAD, consent: null },
    ];

    for (const raw of variants) {
      expect(parseEvaluationEnvelope(raw)).toEqual({
        ok: false,
        reason: "consent_required",
      });
    }
  });

  it("aceita envelope válido e remove a chave consent do payload devolvido", () => {
    const parsed = parseEvaluationEnvelope(ENVELOPE);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toEqual(PAYLOAD);
    expect(parsed.data).not.toHaveProperty("consent");
  });

  it("rejeita payload inválido e chaves extras mesmo com consent: true", () => {
    const variants: unknown[] = [
      { ...PAYLOAD, consent: true, extra: "settings" },
      { ...PAYLOAD, consent: true, meta: { targetScore: 79 } },
      { ...PAYLOAD, consent: true, type: "nao_existe" },
      { ...PAYLOAD, consent: true, response: { text: "x", extra: 1 } },
      { ...PAYLOAD, consent: true, questionId: "id com espaço" },
    ];

    for (const raw of variants) {
      expect(parseEvaluationEnvelope(raw)).toEqual({
        ok: false,
        reason: "invalid_payload",
      });
    }
  });
});

/* ------------------------------------------------------------------ */
/* G7 — consentimento validado no servidor                             */
/* ------------------------------------------------------------------ */

describe("guarda server-side — consentimento (G7)", () => {
  it("sem consentimento abstém sem carregar o avaliador nem consumir cota", async () => {
    const h = harness();
    const semConsentimento: unknown[] = [
      { ...PAYLOAD },
      { ...PAYLOAD, consent: false },
      { ...PAYLOAD, consent: "true" },
      { ...PAYLOAD, consent: 1 },
    ];

    for (const raw of semConsentimento) {
      expectAbstained(await h.guarded(raw), CONSENT_REQUIRED_REASON);
    }

    expect(h.loadEvaluator).not.toHaveBeenCalled();
    expect(h.evaluate).not.toHaveBeenCalled();
    expect(h.limiter.snapshot().usedInWindow).toBe(0);
    expect(h.limiter.snapshot().inFlight).toBe(0);
  });

  it("corpo que não é objeto abstém por entrada inválida sem custo", async () => {
    const h = harness();

    for (const raw of [null, undefined, "payload", 42, []]) {
      expectAbstained(await h.guarded(raw), INVALID_INPUT_REASON);
    }

    expect(h.loadEvaluator).not.toHaveBeenCalled();
    expect(h.evaluate).not.toHaveBeenCalled();
    expect(h.limiter.snapshot().usedInWindow).toBe(0);
  });

  it("payload inválido com consentimento abstém sem chamar o avaliador", async () => {
    const h = harness();

    const outcome = await h.guarded({ ...PAYLOAD, consent: true, aiConsent: { evaluate: true } });

    expectAbstained(outcome, INVALID_INPUT_REASON);
    expect(h.loadEvaluator).not.toHaveBeenCalled();
    expect(h.evaluate).not.toHaveBeenCalled();
    expect(h.limiter.snapshot().usedInWindow).toBe(0);
  });

  it("a composição padrão do endpoint recusa sem consentimento sem importar o avaliador", async () => {
    expectAbstained(await evaluateGuarded({ ...PAYLOAD }), CONSENT_REQUIRED_REASON);
    expectAbstained(await evaluateGuarded(null), INVALID_INPUT_REASON);
  });

  it("com consentimento chama o avaliador UMA vez com o payload sem o campo consent", async () => {
    const h = harness();

    const outcome = await h.guarded(ENVELOPE);

    expect(outcome).toEqual(OK_RESPONSE);
    expect(h.loadEvaluator).toHaveBeenCalledTimes(1);
    expect(h.evaluate).toHaveBeenCalledTimes(1);

    const sent = h.evaluate.mock.calls[0]?.[0];
    expect(sent).toEqual(PAYLOAD);
    expect(sent).not.toHaveProperty("consent");
    expect(Object.keys(sent ?? {}).sort()).toEqual(["mode", "questionId", "response", "type"]);

    expect(h.limiter.snapshot().inFlight).toBe(0);
    expect(h.limiter.snapshot().usedInWindow).toBe(1);
  });

  it("devolve DTO mínimo — só evaluation, sem consent/settings/payload extra", async () => {
    const h = harness();

    const outcome = await h.guarded(ENVELOPE);

    expect(Object.keys(outcome)).toEqual(["evaluation"]);
    expect(outcome).not.toHaveProperty("consent");
    expect(outcome).not.toHaveProperty("settings");
    expect(outcome).not.toHaveProperty("payload");
  });
});

/* ------------------------------------------------------------------ */
/* G5 — limite por instância e concorrência                            */
/* ------------------------------------------------------------------ */

describe("limiter — política padrão", () => {
  it("aplica 10/min e 2 simultâneas, congelado contra mutação acidental", () => {
    expect(EVALUATION_RATE_LIMIT).toEqual({
      maxRequests: 10,
      windowMs: 60_000,
      maxConcurrent: 2,
    });
    expect(Object.isFrozen(EVALUATION_RATE_LIMIT)).toBe(true);
  });

  it("snapshot observável não guarda payload, resposta nem referência", async () => {
    const h = harness();
    await h.guarded(ENVELOPE);

    expect(Object.keys(h.limiter.snapshot()).sort()).toEqual([
      "inFlight",
      "usedInWindow",
      "windowResetAt",
    ]);
  });
});

describe("limiter — janela e concorrência", () => {
  it("bloqueia acima do limite concreto e libera após a janela expirar", async () => {
    const h = harness({ maxRequests: 3, windowMs: 1_000, maxConcurrent: 5 });

    for (let index = 0; index < 3; index += 1) {
      expect((await h.guarded(ENVELOPE)).evaluation.verdict).toBe("scored");
    }

    expectAbstained(await h.guarded(ENVELOPE), RATE_LIMITED_REASON);
    expect(h.evaluate).toHaveBeenCalledTimes(3);
    expect(h.limiter.snapshot().usedInWindow).toBe(3);

    h.advance(999);
    expectAbstained(await h.guarded(ENVELOPE), RATE_LIMITED_REASON);
    expect(h.evaluate).toHaveBeenCalledTimes(3);

    h.advance(1);
    expect((await h.guarded(ENVELOPE)).evaluation.verdict).toBe("scored");
    expect(h.evaluate).toHaveBeenCalledTimes(4);
    expect(h.limiter.snapshot().usedInWindow).toBe(1);
  });

  it("recusa por concorrência sem carregar o avaliador e libera ao terminar", async () => {
    const h = harness({ maxConcurrent: 1, maxRequests: 10 });

    let resolveFirst: ((value: EvaluationResponse) => void) | undefined;
    const pending = new Promise<EvaluationResponse>((resolve) => {
      resolveFirst = resolve;
    });
    h.evaluate.mockReturnValueOnce(pending);

    const first = h.guarded(ENVELOPE);
    expect(h.limiter.snapshot().inFlight).toBe(1);

    expectAbstained(await h.guarded(ENVELOPE), BUSY_REASON);
    expect(h.loadEvaluator).toHaveBeenCalledTimes(1);
    expect(h.evaluate).toHaveBeenCalledTimes(1);

    resolveFirst?.(OK_RESPONSE);
    expect((await first).evaluation.verdict).toBe("scored");
    expect(h.limiter.snapshot().inFlight).toBe(0);

    expect((await h.guarded(ENVELOPE)).evaluation.verdict).toBe("scored");
    expect(h.evaluate).toHaveBeenCalledTimes(2);
  });

  it("libera o lease quando o avaliador lança e a próxima chamada funciona", async () => {
    const h = harness({ maxConcurrent: 1 });

    h.evaluate.mockRejectedValueOnce(new Error("gateway caiu"));

    await expect(h.guarded(ENVELOPE)).rejects.toThrow("gateway caiu");
    expect(h.limiter.snapshot().inFlight).toBe(0);

    expect((await h.guarded(ENVELOPE)).evaluation.verdict).toBe("scored");
    expect(h.evaluate).toHaveBeenCalledTimes(2);
  });

  it("libera o lease quando o import do avaliador falha", async () => {
    const h = harness();

    h.loadEvaluator.mockRejectedValueOnce(new Error("import falhou"));

    await expect(h.guarded(ENVELOPE)).rejects.toThrow("import falhou");
    expect(h.limiter.snapshot().inFlight).toBe(0);

    expect((await h.guarded(ENVELOPE)).evaluation.verdict).toBe("scored");
    expect(h.loadEvaluator).toHaveBeenCalledTimes(2);
  });

  it("release é idempotente — nunca deixa contador negativo", () => {
    const limiter = createEvaluationLimiter({ maxConcurrent: 1 });
    const lease = limiter.acquire();

    expect(lease.ok).toBe(true);
    if (!lease.ok) return;

    lease.release();
    lease.release();

    expect(limiter.snapshot().inFlight).toBe(0);

    const next = limiter.acquire();
    expect(next.ok).toBe(true);
    if (next.ok) next.release();
  });
});
