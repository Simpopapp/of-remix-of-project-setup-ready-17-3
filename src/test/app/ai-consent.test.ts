/**
 * Testes do consentimento de avaliação por IA (Fase 5 — s3).
 *
 * O que provamos aqui:
 * 1. `aiConsent` nasce desligado, normaliza entrada inválida e nunca derruba as
 *    outras seções de ajustes.
 * 2. O gate NUNCA chama o serviço de IA sem consentimento (mock com zero chamadas).
 * 3. Resposta vazia também não gasta chamada; falha do serviço vira estado honesto.
 * 4. A seção de Ajustes explica o processamento externo, reflete o estado real e
 *    registra o aceite sem reescrever a data original.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { AiConsentSection } from "@/components/settings/ai-consent-section";
import type { EvaluationResult } from "@/domain";
import {
  EMPTY_RESPONSE_MESSAGE,
  NO_CONSENT_MESSAGE,
  SERVICE_ERROR_MESSAGE,
  canEvaluate,
  hasResponseContent,
  requestEvaluation,
} from "@/lib/app/evaluation-client";
import {
  DEFAULT_SETTINGS,
  applySettingsPatch,
  normalizeAppSettings,
  type AppSettings,
  type DeepPartialAppSettings,
} from "@/lib/app/settings";
import type { EvaluationRequestPayload } from "@/lib/ai/evaluation-io";

/* O wrapper de s1 é mockado: nenhum teste deve chegar a uma chamada de rede. */
const evaluateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/evaluate.functions", () => ({
  evaluateResponseFunction: evaluateMock,
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const ACK_ISO = "2026-10-01T12:00:00.000Z";

const SAMPLE_EVALUATION: EvaluationResult = {
  scale: "attempt_0_100",
  verdict: "scored",
  score: 72,
  confidence: "medium",
  dimensions: [],
  evidence: [],
  feedback: "Boa reprodução do ditado; atenção à pontuação.",
  uncertainty: null,
  unmeasured: [],
  evaluator: { model: "mock-model", promptVersion: "judge@test", rubricVersion: "rubrics@test" },
  scoredAt: "2026-10-20T10:00:00.000Z",
};

const PAYLOAD: EvaluationRequestPayload = {
  type: "wfd",
  questionId: "wfd-001",
  response: { text: "The lecture begins at nine o'clock." },
  mode: "practice",
};

function settingsWithConsent(overrides: Partial<AppSettings["aiConsent"]> = {}): AppSettings {
  return applySettingsPatch(normalizeAppSettings(null), {
    aiConsent: { evaluate: true, acknowledgedAt: ACK_ISO, ...overrides },
  });
}

beforeEach(() => {
  evaluateMock.mockReset();
});

/* ------------------------------------------------------------------ */
/* F5.3.1 — settings.aiConsent                                        */
/* ------------------------------------------------------------------ */

describe("settings — aiConsent (F5.3.1)", () => {
  it("nasce desligado e sem data de aceite", () => {
    expect(DEFAULT_SETTINGS.aiConsent).toEqual({ evaluate: false, acknowledgedAt: null });
    expect(Object.isFrozen(DEFAULT_SETTINGS.aiConsent)).toBe(true);
    expect(normalizeAppSettings(undefined).aiConsent).toEqual(DEFAULT_SETTINGS.aiConsent);
  });

  it("normaliza entrada inválida sem lançar", () => {
    for (const raw of [null, 42, "consent", [], true]) {
      expect(normalizeAppSettings({ aiConsent: raw }).aiConsent).toEqual(
        DEFAULT_SETTINGS.aiConsent,
      );
    }
    expect(
      normalizeAppSettings({ aiConsent: { evaluate: "sim", acknowledgedAt: 42 } }).aiConsent,
    ).toEqual({ evaluate: false, acknowledgedAt: null });
  });

  it("aceita apenas timestamp interpretável e booleano real", () => {
    expect(
      normalizeAppSettings({ aiConsent: { evaluate: true, acknowledgedAt: ACK_ISO } }).aiConsent,
    ).toEqual({ evaluate: true, acknowledgedAt: ACK_ISO });

    expect(
      normalizeAppSettings({ aiConsent: { evaluate: true, acknowledgedAt: "não é data" } })
        .aiConsent,
    ).toEqual({ evaluate: true, acknowledgedAt: null });
  });

  it("patch muda somente a seção de consentimento", () => {
    const current = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      meta: { targetScore: 79, examDate: "2026-12-15" },
      studiePlus: { ...DEFAULT_SETTINGS.studiePlus, enabled: true },
    });

    const next = applySettingsPatch(current, {
      aiConsent: { evaluate: true, acknowledgedAt: ACK_ISO },
    });

    expect(next.aiConsent).toEqual({ evaluate: true, acknowledgedAt: ACK_ISO });
    expect(next.meta).toEqual(current.meta);
    expect(next.tts).toEqual(current.tts);
    expect(next.practice).toEqual(current.practice);
    expect(next.studiePlus).toEqual(current.studiePlus);
  });

  it("patch nulo da seção é ignorado (não zera o consentimento já dado)", () => {
    const current = settingsWithConsent();
    const next = applySettingsPatch(current, {
      aiConsent: null as unknown as Partial<AppSettings["aiConsent"]>,
    });
    expect(next.aiConsent).toEqual(current.aiConsent);
  });
});

/* ------------------------------------------------------------------ */
/* F5.3.2 — gate e porta de avaliação                                 */
/* ------------------------------------------------------------------ */

describe("evaluation-client — gate (F5.3.2)", () => {
  it("sem consentimento devolve no_consent e não chama o serviço", async () => {
    expect(canEvaluate(DEFAULT_SETTINGS, true)).toEqual({
      ok: false,
      reason: "no_consent",
      message: NO_CONSENT_MESSAGE,
    });

    const outcome = await requestEvaluation(DEFAULT_SETTINGS, PAYLOAD);

    expect(outcome).toEqual({
      ok: false,
      reason: "no_consent",
      message: NO_CONSENT_MESSAGE,
    });
    expect(evaluateMock).not.toHaveBeenCalled();
  });

  it("com consentimento e resposta vazia devolve empty_response sem chamada", async () => {
    const settings = settingsWithConsent();

    expect(canEvaluate(settings, false)).toEqual({
      ok: false,
      reason: "empty_response",
      message: EMPTY_RESPONSE_MESSAGE,
    });

    const blank = await requestEvaluation(settings, {
      ...PAYLOAD,
      response: { text: "   \n\t " },
    });
    expect(blank).toEqual({
      ok: false,
      reason: "empty_response",
      message: EMPTY_RESPONSE_MESSAGE,
    });

    const missing = await requestEvaluation(settings, { ...PAYLOAD, response: {} });
    expect(missing.ok).toBe(false);
    expect(evaluateMock).not.toHaveBeenCalled();
  });

  it("reconhece transcrição como resposta real", () => {
    expect(hasResponseContent({ text: "hello" })).toBe(true);
    expect(hasResponseContent({ transcript: "hello" })).toBe(true);
    expect(hasResponseContent({ text: "", transcript: "  " })).toBe(false);
    expect(hasResponseContent({})).toBe(false);
  });

  it("com consentimento chama o wrapper e propaga a avaliação", async () => {
    evaluateMock.mockResolvedValue({ evaluation: SAMPLE_EVALUATION });
    const settings = settingsWithConsent();

    const outcome = await requestEvaluation(settings, PAYLOAD);

    expect(evaluateMock).toHaveBeenCalledTimes(1);
    expect(evaluateMock).toHaveBeenCalledWith({ data: { ...PAYLOAD, consent: true } });
    expect(outcome).toEqual({ ok: true, evaluation: SAMPLE_EVALUATION });

    // Envelope mínimo: o sinal de consentimento viaja, mas nenhum dado de
    // settings/progresso cruza a fronteira com a avaliação.
    const sent = evaluateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(Object.keys(sent.data).sort()).toEqual([
      "consent",
      "mode",
      "questionId",
      "response",
      "type",
    ]);
    expect(sent.data["consent"]).toBe(true);
    expect(sent.data).not.toHaveProperty("aiConsent");
    expect(sent.data).not.toHaveProperty("meta");
  });

  it("falha do wrapper vira estado honesto, nunca nota", async () => {
    evaluateMock.mockRejectedValue(new Error("gateway indisponível"));

    const outcome = await requestEvaluation(settingsWithConsent(), PAYLOAD);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("service_error");
    expect(outcome.message).toBe(SERVICE_ERROR_MESSAGE);
    expect(outcome).not.toHaveProperty("evaluation");
  });
});

/* ------------------------------------------------------------------ */
/* F5.3.3 — seção de Ajustes                                          */
/* ------------------------------------------------------------------ */

type OnPatch = (patch: DeepPartialAppSettings) => Promise<void>;

function renderSection(
  settings: AppSettings,
  overrides: { saving?: boolean } = {},
): { onPatch: Mock<OnPatch>; region: HTMLElement } {
  const onPatch = vi.fn<OnPatch>(async () => undefined);
  render(createElement(AiConsentSection, { settings, onPatch, saving: overrides.saving ?? false }));
  return { onPatch, region: screen.getByRole("region", { name: "Avaliação por IA" }) };
}

describe("AiConsentSection — explicação e controle (F5.3.3)", () => {
  it("explica o processamento externo em pt-BR antes do uso", () => {
    const { region } = renderSection(normalizeAppSettings(null));
    const text = region.textContent ?? "";

    expect(text).toContain("processado por um serviço de IA externo");
    expect(text).toContain("A questão, a sua resposta e a referência mínima para avaliar");
    expect(text).toContain("somente neste dispositivo");
    expect(text).toContain("Sem envio, você continua estudando");
    expect(text).toContain("estimativa de treino");
    expect(text).toContain("Não é a nota oficial do PTE");
  });

  it("interruptor desligado reflete o padrão e não há data inventada", () => {
    const { region } = renderSection(normalizeAppSettings(null));
    const toggle = screen.getByRole("switch", {
      name: /Autorizar o envio de respostas/i,
    });

    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(region.textContent).toContain("Nenhuma resposta será enviada");
    expect(region.textContent).not.toContain("Consentimento registrado");
  });

  it("aceitar grava data ISO de aceite", () => {
    const { onPatch } = renderSection(normalizeAppSettings(null));
    fireEvent.click(screen.getByRole("switch", { name: /Autorizar o envio/i }));

    expect(onPatch).toHaveBeenCalledTimes(1);
    const patch = onPatch.mock.calls[0]?.[0] as {
      aiConsent: { evaluate: boolean; acknowledgedAt: string };
    };
    expect(patch.aiConsent.evaluate).toBe(true);
    expect(Number.isNaN(Date.parse(patch.aiConsent.acknowledgedAt))).toBe(false);
  });

  it("segundo aceite não sobrescreve a data original", () => {
    // Cenário: aceitou, revogou e está aceitando de novo.
    const { onPatch } = renderSection(
      settingsWithConsent({ evaluate: false, acknowledgedAt: ACK_ISO }),
    );
    fireEvent.click(screen.getByRole("switch", { name: /Autorizar o envio/i }));

    expect(onPatch).toHaveBeenCalledWith({
      aiConsent: { evaluate: true, acknowledgedAt: ACK_ISO },
    });
  });

  it("recusar desliga a autorização e preserva o histórico do aceite", () => {
    const { onPatch } = renderSection(settingsWithConsent());

    expect(screen.getByRole("switch", { name: /Autorizar o envio/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.click(screen.getByRole("switch", { name: /Autorizar o envio/i }));

    expect(onPatch).toHaveBeenCalledWith({
      aiConsent: { evaluate: false, acknowledgedAt: ACK_ISO },
    });
  });

  it("mantém o controle desabilitado enquanto salva", () => {
    renderSection(normalizeAppSettings(null), { saving: true });
    expect(screen.getByRole("switch", { name: /Autorizar o envio/i })).toBeDisabled();
  });
});
