/**
 * Testes do contrato de ajustes (F4.0.1).
 *
 * O que provamos aqui:
 * 1. O pack Studie Plus nasce DESLIGADO (regra inviolável do PRD §11).
 * 2. Leitura de store vazio devolve defaults completos (nunca `undefined`).
 * 3. Patch é merge profundo por seção — não apaga irmãos.
 * 4. Valor inválido cai no default (ou no limite) sem lançar.
 * 5. Round-trip real via `fake-indexeddb`: grava, fecha, reabre e lê igual.
 * 6. Chaves desconhecidas de outras fases são preservadas na gravação.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  TARGET_SCORES,
  TTS_RATE_MAX,
  TTS_RATE_MIN,
  applySettingsPatch,
  clampSpeechRate,
  normalizeAppSettings,
  readAppSettings,
  updateAppSettings,
  type AppSettings,
} from "@/lib/app/settings";
import type { ProgressDatabase } from "@/lib/app/db";
import { ProgressStore } from "@/lib/app/storage";

import { makeDb } from "./helpers";

function storeFor(db: ProgressDatabase): ProgressStore {
  return new ProgressStore({ db });
}

describe("settings — defaults (F4.0.1)", () => {
  it("nasce com o Studie Plus inteiramente desligado", () => {
    expect(DEFAULT_SETTINGS.studiePlus.enabled).toBe(false);
    expect(DEFAULT_SETTINGS.studiePlus.word).toBe(false);
    expect(DEFAULT_SETTINGS.studiePlus.sentence).toBe(false);
    expect(DEFAULT_SETTINGS.studiePlus.pronunciation).toBe(false);
    // O modo é só uma preferência para quando o aluno ligar o pack.
    expect(DEFAULT_SETTINGS.studiePlus.mode).toBe("ai");
  });

  it("traz meta, treino e TTS com valores conservadores", () => {
    expect(DEFAULT_SETTINGS.meta).toEqual({ targetScore: 50, examDate: null });
    expect(DEFAULT_SETTINGS.practice).toEqual({ timersEnabled: true, timerScale: 1 });
    expect(DEFAULT_SETTINGS.tts.enabled).toBe(true);
    expect(DEFAULT_SETTINGS.tts.voiceUri).toBeNull();
    expect(DEFAULT_SETTINGS.tts.rate).toBe(1);
  });

  it("os defaults são somente leitura (ninguém muta o singleton por acidente)", () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.studiePlus)).toBe(true);
  });
});

describe("settings — normalização (entrada não confiável)", () => {
  it("objeto ausente ou lixo devolve defaults completos", () => {
    for (const raw of [null, undefined, 42, "settings", [], true]) {
      const normalized = normalizeAppSettings(raw);
      expect(normalized).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("aceita as metas típicas e rejeita nota fora da lista", () => {
    for (const score of TARGET_SCORES) {
      expect(normalizeAppSettings({ meta: { targetScore: score } }).meta.targetScore).toBe(score);
    }
    expect(normalizeAppSettings({ meta: { targetScore: 63 } }).meta.targetScore).toBe(50);
    expect(normalizeAppSettings({ meta: { targetScore: "65" } }).meta.targetScore).toBe(50);
  });

  it("examDate só aceita dia local de calendário existente", () => {
    expect(normalizeAppSettings({ meta: { examDate: "2026-11-20" } }).meta.examDate).toBe(
      "2026-11-20",
    );
    expect(normalizeAppSettings({ meta: { examDate: "2026-02-30" } }).meta.examDate).toBeNull();
    expect(
      normalizeAppSettings({ meta: { examDate: "2026-11-20T10:00:00.000Z" } }).meta.examDate,
    ).toBeNull();
  });

  it("escala de timer inválida cai em 1 (o simulado ignora o ajuste de qualquer forma)", () => {
    expect(normalizeAppSettings({ practice: { timerScale: 1.5 } }).practice.timerScale).toBe(1.5);
    expect(normalizeAppSettings({ practice: { timerScale: 3 } }).practice.timerScale).toBe(1);
    expect(normalizeAppSettings({ practice: { timerScale: "2" } }).practice.timerScale).toBe(1);
  });

  it("rate é limitada a 0.5–2.0 e arredondada, sem lançar", () => {
    expect(clampSpeechRate(0.1)).toBe(TTS_RATE_MIN);
    expect(clampSpeechRate(9)).toBe(TTS_RATE_MAX);
    expect(clampSpeechRate(0.876)).toBe(0.88);
    expect(clampSpeechRate("rápido")).toBe(1);
    expect(clampSpeechRate(Number.NaN)).toBe(1);
    expect(normalizeAppSettings({ tts: { rate: 9 } }).tts.rate).toBe(TTS_RATE_MAX);
  });

  it("modo do Studie Plus só aceita ai/offline", () => {
    expect(normalizeAppSettings({ studiePlus: { mode: "offline" } }).studiePlus.mode).toBe(
      "offline",
    );
    expect(normalizeAppSettings({ studiePlus: { mode: "cloud" } }).studiePlus.mode).toBe("ai");
  });

  it("chave inválida não contamina as válidas do mesmo objeto", () => {
    const normalized = normalizeAppSettings({
      meta: { targetScore: 65, examDate: "ontem" },
      tts: { enabled: false, rate: 99 },
    });
    expect(normalized.meta).toEqual({ targetScore: 65, examDate: null });
    expect(normalized.tts.enabled).toBe(false);
    expect(normalized.tts.rate).toBe(TTS_RATE_MAX);
  });
});

describe("settings — merge profundo", () => {
  it("patch de uma seção preserva as demais", () => {
    const current: AppSettings = {
      ...DEFAULT_SETTINGS,
      meta: { targetScore: 65, examDate: "2026-11-20" },
      tts: { enabled: true, voiceUri: "Google UK English Female", rate: 0.9 },
    };
    const next = applySettingsPatch(current, { tts: { rate: 1.25 } });

    expect(next.tts.rate).toBe(1.25);
    expect(next.tts.voiceUri).toBe("Google UK English Female");
    expect(next.meta).toEqual(current.meta);
    expect(next.studiePlus).toEqual(current.studiePlus);
  });

  it("patch nulo/inválido devolve o estado atual normalizado", () => {
    const current: AppSettings = {
      ...DEFAULT_SETTINGS,
      meta: { targetScore: 79, examDate: "2027-01-15" },
    };
    expect(applySettingsPatch(current, null)).toEqual(current);
    expect(applySettingsPatch(current, undefined)).toEqual(current);
  });
});

describe("settings — persistência (fake-indexeddb)", () => {
  it("store vazio devolve defaults completos", async () => {
    const harness = await makeDb("settings-empty");
    try {
      const store = storeFor(harness.db);
      expect(await readAppSettings(store)).toEqual(DEFAULT_SETTINGS);
    } finally {
      await harness.close();
    }
  });

  it("grava, fecha, reabre e lê os mesmos ajustes", async () => {
    const harness = await makeDb("settings-roundtrip");
    try {
      const patch = {
        meta: { targetScore: 65 as const, examDate: "2026-11-20" },
        practice: { timersEnabled: false, timerScale: 1.5 as const },
        tts: { voiceUri: "Google UK English Female", rate: 0.85 },
        studiePlus: {
          enabled: true,
          word: true,
          sentence: false,
          pronunciation: true,
          mode: "offline" as const,
        },
      };
      const written = await updateAppSettings(storeFor(harness.db), patch);
      expect(written.meta.targetScore).toBe(65);
      expect(written.studiePlus.enabled).toBe(true);
      expect(written.studiePlus.mode).toBe("offline");

      // Simula reload: nova conexão para o MESMO banco.
      const reopened = await harness.reopen();
      expect(await readAppSettings(storeFor(reopened))).toEqual(written);
    } finally {
      await harness.close();
    }
  });

  it("update é merge: segundo patch não apaga o primeiro", async () => {
    const harness = await makeDb("settings-merge");
    try {
      const store = storeFor(harness.db);
      await updateAppSettings(store, {
        meta: { targetScore: 79, examDate: "2027-01-15" },
        tts: { voiceUri: "Daniel", rate: 0.75 },
      });
      const after = await updateAppSettings(store, { tts: { rate: 1.5 } });

      expect(after.meta).toEqual({ targetScore: 79, examDate: "2027-01-15" });
      expect(after.tts.voiceUri).toBe("Daniel");
      expect(after.tts.rate).toBe(1.5);
      expect(after.studiePlus.enabled).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it("valor inválido cai no default e não derruba a leitura", async () => {
    const harness = await makeDb("settings-invalid");
    try {
      const store = storeFor(harness.db);
      const result = await updateAppSettings(store, {
        meta: { targetScore: 99 as unknown as 65, examDate: "2026-02-30" },
        practice: { timerScale: 7 as unknown as 1 },
      });

      expect(result.meta).toEqual({ targetScore: 50, examDate: null });
      expect(result.practice.timerScale).toBe(1);
      // O que foi efetivamente gravado também é válido.
      expect(await readAppSettings(store)).toEqual(result);
    } finally {
      await harness.close();
    }
  });

  it("preserva chaves desconhecidas gravadas por outras fases", async () => {
    const harness = await makeDb("settings-unknown-keys");
    try {
      const store = storeFor(harness.db);
      // Gravamos uma chave que este módulo não conhece (outra fase pode criá-la).
      await store.setSettings({ futureFlag: true });

      const after = await updateAppSettings(store, { meta: { targetScore: 58 } });
      expect(after.meta.targetScore).toBe(58);

      const stored = await store.getSettings();
      expect(stored["futureFlag"]).toBe(true);
      expect(stored["meta"]).toEqual({ targetScore: 58, examDate: null });
    } finally {
      await harness.close();
    }
  });
});
