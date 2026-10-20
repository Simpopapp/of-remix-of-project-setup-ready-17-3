/**
 * Ajustes do aluno — contrato único e tipado (Fase 4, onda 0).
 *
 * Por que este módulo existe: Home, Catálogo, Ajustes, Prática e (futuramente)
 * Sessões/Simulado/Studie Plus consomem os mesmos ajustes. Se cada tela
 * inventasse o seu formato, umas apagariam as chaves das outras. Aqui vive o
 * schema, os defaults e a leitura/gravação normalizada.
 *
 * Regras de honestidade e resiliência (PRD central §4.5, §10):
 * - Nada de `localStorage` cru: a persistência é o store da Fase 3
 *   (`meta/settings`), com a mesma transação e o mesmo envelope de backup.
 * - Valor inválido NUNCA derruba a tela: cai no default daquela chave.
 * - Chaves desconhecidas são preservadas na gravação (outras fases podem
 *   adicionar seções sem que esta apague o que não conhece).
 * - `studiePlus.*` nasce desligado (PRD central §11 — pack opcional).
 * - `aiConsent.evaluate` nasce desligado: sem autorização explícita, nenhuma
 *   resposta é enviada ao serviço de IA (PRD central §4.5).
 * - `examDate` é chave de dia local `YYYY-MM-DD` (nunca timestamp UTC).
 *
 * Este módulo é puro quanto a I/O: só fala com o `ProgressStore` injetado, o
 * que o torna testável com `fake-indexeddb` e utilizável no servidor sem
 * tocar em `window`.
 */

import { isLocalDayKey } from "@/domain";
import type { ProgressStore } from "./storage";

/* ------------------------------------------------------------------ */
/* Opções fechadas                                                    */
/* ------------------------------------------------------------------ */

/** Metas típicas de quem presta o PTE Academic no Brasil (project1 §4). */
export const TARGET_SCORES = [50, 58, 65, 79] as const;
export type TargetScore = (typeof TARGET_SCORES)[number];

/** Multiplicadores de tempo de treino (nunca se aplicam ao simulado). */
export const TIMER_SCALES = [1, 1.5, 2] as const;
export type TimerScale = (typeof TIMER_SCALES)[number];

/** Modo do Studie Plus: IA on-line (padrão) ou pacote local. */
export const STUDIE_PLUS_MODES = ["ai", "offline"] as const;
export type StudiePlusMode = (typeof STUDIE_PLUS_MODES)[number];

/** Limites da velocidade de fala da Web Speech API. */
export const TTS_RATE_MIN = 0.5;
export const TTS_RATE_MAX = 2;
export const TTS_RATE_DEFAULT = 1;

/* ------------------------------------------------------------------ */
/* Schema                                                             */
/* ------------------------------------------------------------------ */

export interface AppSettings {
  /** alvo do aluno: nota pretendida e data da prova (dia local) */
  meta: {
    targetScore: TargetScore;
    /** `YYYY-MM-DD` no fuso do aluno; `null` = ainda não marcou */
    examDate: string | null;
  };
  /** comportamento dos cronômetros de TREINO (o simulado ignora isto) */
  practice: {
    timersEnabled: boolean;
    timerScale: TimerScale;
  };
  /** leitura em voz alta do app (Web Speech API) */
  tts: {
    enabled: boolean;
    /** `SpeechSynthesisVoice.voiceURI`; `null` = voz padrão em inglês */
    voiceUri: string | null;
    /** 0.5–2.0 */
    rate: number;
  };
  /**
   * Pack Studie Plus — desligado por padrão. Os três controles são
   * independentes: tradução de palavra, frase e pronúncia.
   */
  studiePlus: {
    enabled: boolean;
    word: boolean;
    sentence: boolean;
    pronunciation: boolean;
    mode: StudiePlusMode;
  };
  /**
   * Consentimento para enviar respostas ao serviço de IA (Fase 5 — s3).
   * Desligado por padrão (PRD central §4.5): sem consentimento explícito,
   * nenhuma resposta sai do navegador.
   */
  aiConsent: {
    /** autorização explícita para avaliar respostas por IA */
    evaluate: boolean;
    /** ISO-8601 do aceite; `null` = nunca aceitou */
    acknowledgedAt: string | null;
  };
}

/** Patch profundo por seção (nunca substitui a seção inteira). */
export interface DeepPartialAppSettings {
  meta?: Partial<AppSettings["meta"]>;
  practice?: Partial<AppSettings["practice"]>;
  tts?: Partial<AppSettings["tts"]>;
  studiePlus?: Partial<AppSettings["studiePlus"]>;
  aiConsent?: Partial<AppSettings["aiConsent"]>;
}

/** Alias curto usado na interface (mesmo tipo). */
export type AppSettingsPatch = DeepPartialAppSettings;

/** Subconjunto do store necessário para ajustes (facilita testes/fakes). */
export type SettingsStore = Pick<ProgressStore, "getSettings" | "setSettings">;

/* ------------------------------------------------------------------ */
/* Defaults                                                           */
/* ------------------------------------------------------------------ */

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/**
 * Defaults do produto. `50` é a meta inicial mais conservadora entre as metas
 * típicas (50/58/65/79): começar baixo não promete nada que o aluno não pediu.
 * O Studie Plus nasce TODO desligado, inclusive o modo (`ai` é só o padrão
 * quando o aluno liga o pack).
 */
export const DEFAULT_SETTINGS: AppSettings = deepFreeze({
  meta: { targetScore: 50, examDate: null },
  practice: { timersEnabled: true, timerScale: 1 },
  tts: { enabled: true, voiceUri: null, rate: TTS_RATE_DEFAULT },
  studiePlus: {
    enabled: false,
    word: false,
    sentence: false,
    pronunciation: false,
    mode: "ai",
  },
  // Sem consentimento não há envio: o aluno autoriza explicitamente em Ajustes.
  aiConsent: { evaluate: false, acknowledgedAt: null },
});

function cloneDefaults(): AppSettings {
  return {
    meta: { ...DEFAULT_SETTINGS.meta },
    practice: { ...DEFAULT_SETTINGS.practice },
    tts: { ...DEFAULT_SETTINGS.tts },
    studiePlus: { ...DEFAULT_SETTINGS.studiePlus },
    aiConsent: { ...DEFAULT_SETTINGS.aiConsent },
  };
}

/* ------------------------------------------------------------------ */
/* Normalização (nunca lança)                                         */
/* ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickTargetScore(value: unknown): TargetScore {
  if (typeof value === "number" && (TARGET_SCORES as readonly number[]).includes(value)) {
    return value as TargetScore;
  }
  return DEFAULT_SETTINGS.meta.targetScore;
}

function pickTimerScale(value: unknown): TimerScale {
  if (typeof value === "number" && (TIMER_SCALES as readonly number[]).includes(value)) {
    return value as TimerScale;
  }
  return DEFAULT_SETTINGS.practice.timerScale;
}

/** `YYYY-MM-DD` existente no calendário; qualquer outra coisa vira `null`. */
function pickExamDate(value: unknown): string | null {
  return isLocalDayKey(value) ? value : null;
}

function pickVoiceUri(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Arredonda para 2 casas e limita a 0.5–2.0; inválido cai no default. */
export function clampSpeechRate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return TTS_RATE_DEFAULT;
  const clamped = Math.min(TTS_RATE_MAX, Math.max(TTS_RATE_MIN, value));
  return Math.round(clamped * 100) / 100;
}

function pickMode(value: unknown): StudiePlusMode {
  return value === "offline" ? "offline" : "ai";
}

/**
 * Aceite de consentimento: só um instante interpretável por `Date.parse` é
 * preservado; qualquer outra coisa vira `null` (nunca inventamos uma data de
 * aceite que o aluno não deu).
 */
function pickAcknowledgedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (Number.isNaN(Date.parse(value))) return null;
  return value;
}

/**
 * Normaliza qualquer entrada no schema tipado. É a fronteira de confiança:
 * o conteúdo vem de IndexedDB/backup, ou seja, é dado não confiável.
 *
 * - objeto ausente/ inválido → defaults completos;
 * - chave inválida → default daquela chave (as válidas são respeitadas);
 * - nunca lança, nunca devolve `undefined`.
 */
export function normalizeAppSettings(raw: unknown): AppSettings {
  const record = asRecord(raw);
  if (record === null) return cloneDefaults();

  const meta = asRecord(record["meta"]);
  const practice = asRecord(record["practice"]);
  const tts = asRecord(record["tts"]);
  const studiePlus = asRecord(record["studiePlus"]);
  const aiConsent = asRecord(record["aiConsent"]);

  return {
    meta: {
      targetScore: pickTargetScore(meta?.["targetScore"]),
      examDate: pickExamDate(meta?.["examDate"]),
    },
    practice: {
      timersEnabled: pickBoolean(
        practice?.["timersEnabled"],
        DEFAULT_SETTINGS.practice.timersEnabled,
      ),
      timerScale: pickTimerScale(practice?.["timerScale"]),
    },
    tts: {
      enabled: pickBoolean(tts?.["enabled"], DEFAULT_SETTINGS.tts.enabled),
      voiceUri: pickVoiceUri(tts?.["voiceUri"]),
      rate: clampSpeechRate(tts?.["rate"]),
    },
    studiePlus: {
      enabled: pickBoolean(studiePlus?.["enabled"], DEFAULT_SETTINGS.studiePlus.enabled),
      word: pickBoolean(studiePlus?.["word"], DEFAULT_SETTINGS.studiePlus.word),
      sentence: pickBoolean(studiePlus?.["sentence"], DEFAULT_SETTINGS.studiePlus.sentence),
      pronunciation: pickBoolean(
        studiePlus?.["pronunciation"],
        DEFAULT_SETTINGS.studiePlus.pronunciation,
      ),
      mode: pickMode(studiePlus?.["mode"]),
    },
    aiConsent: {
      evaluate: pickBoolean(aiConsent?.["evaluate"], DEFAULT_SETTINGS.aiConsent.evaluate),
      acknowledgedAt: pickAcknowledgedAt(aiConsent?.["acknowledgedAt"]),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Merge                                                              */
/* ------------------------------------------------------------------ */

/**
 * Merge profundo por seção (puro). Seções ausentes no patch continuam como
 * estão; o resultado é normalizado, então um patch inválido não corrompe o
 * estado — apenas não muda a chave.
 */
export function applySettingsPatch(
  current: AppSettings,
  patch: DeepPartialAppSettings | null | undefined,
): AppSettings {
  const base = normalizeAppSettings(current);
  const patchRecord = asRecord(patch);
  if (patchRecord === null) return base;

  const merged = {
    meta: { ...base.meta, ...(asRecord(patchRecord["meta"]) ?? {}) },
    practice: { ...base.practice, ...(asRecord(patchRecord["practice"]) ?? {}) },
    tts: { ...base.tts, ...(asRecord(patchRecord["tts"]) ?? {}) },
    studiePlus: { ...base.studiePlus, ...(asRecord(patchRecord["studiePlus"]) ?? {}) },
    aiConsent: { ...base.aiConsent, ...(asRecord(patchRecord["aiConsent"]) ?? {}) },
  };
  return normalizeAppSettings(merged);
}

/* ------------------------------------------------------------------ */
/* Leitura e gravação                                                 */
/* ------------------------------------------------------------------ */

/**
 * Lê os ajustes do store e devolve SEMPRE um objeto completo e válido.
 * `getSettings` devolve `{}` quando nunca houve gravação — isso vira defaults.
 */
export async function readAppSettings(store: SettingsStore): Promise<AppSettings> {
  const raw = await store.getSettings();
  return normalizeAppSettings(raw);
}

/**
 * Aplica um patch e grava. Chaves desconhecidas já existentes no store são
 * preservadas; o retorno é o estado resultante (fonte da verdade para a UI).
 */
export async function updateAppSettings(
  store: SettingsStore,
  patch: DeepPartialAppSettings,
): Promise<AppSettings> {
  const raw = await store.getSettings();
  const next = applySettingsPatch(normalizeAppSettings(raw), patch);
  // `...raw` primeiro: o schema tipado manda nas chaves que conhece, e nada
  // que outra fase tenha gravado é apagado por engano.
  await store.setSettings({ ...raw, ...next });
  return next;
}
