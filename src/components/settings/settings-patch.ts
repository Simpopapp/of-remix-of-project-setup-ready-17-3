/**
 * Montagem de patches de ajustes a partir do formulário (Fase 4 — s4).
 *
 * Por que este módulo é separado da tela: a tela é estado de React e IndexedDB;
 * a regra de "que chaves este formulário escreve" é pura e testável. Isso evita
 * o defeito clássico de uma seção de Ajustes apagar as chaves das outras
 * (PRD central §10: o progresso/configuração nunca se perde por acidente).
 *
 * Contrato: `buildSettingsPatch` devolve SOMENTE as seções presentes no rascunho
 * do formulário. O merge profundo é responsabilidade de `applySettingsPatch` /
 * `updateAppSettings` (`@/lib/app/settings`), que preserva as seções ausentes.
 */

import { isLocalDayKey } from "@/domain";
import {
  DEFAULT_SETTINGS,
  clampSpeechRate,
  type AppSettings,
  type DeepPartialAppSettings,
  type StudiePlusMode,
  type TargetScore,
  type TimerScale,
} from "@/lib/app/settings";

export interface MetaDraft {
  targetScore: TargetScore;
  /** valor cru do `<input type="date">`; `""` significa "sem data" */
  examDate: string | null;
}

export interface PracticeDraft {
  timersEnabled: boolean;
  timerScale: TimerScale;
}

export interface TtsDraft {
  enabled: boolean;
  /** `SpeechSynthesisVoice.voiceURI`; `null` = melhor voz em inglês */
  voiceUri: string | null;
  rate: number;
}

export interface StudiePlusDraft {
  enabled: boolean;
  word: boolean;
  sentence: boolean;
  pronunciation: boolean;
  mode: StudiePlusMode;
}

/**
 * Rascunho parcial do formulário. Cada seção presente vira um patch daquela
 * seção; seções ausentes ficam intocadas no store.
 */
export interface SettingsDraft {
  meta?: MetaDraft;
  practice?: PracticeDraft;
  tts?: TtsDraft;
  studiePlus?: StudiePlusDraft;
}

/**
 * `YYYY-MM-DD` válido ou `null`. A entrada vem de um controle do navegador e
 * é, portanto, dado não confiável: data inexistente, timestamp ou texto viram
 * "sem data" em vez de derrubar a gravação.
 */
export function normalizeExamDateInput(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return isLocalDayKey(trimmed) ? trimmed : null;
}

function normalizeVoiceUri(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Constrói o patch profundo a partir do rascunho. Campos numéricos são
 * normalizados aqui (rate 0.5–2.0) para a UI nunca gravar um valor impossível;
 * a normalização final continua acontecendo no contrato de settings.
 */
export function buildSettingsPatch(draft: SettingsDraft): DeepPartialAppSettings {
  const patch: DeepPartialAppSettings = {};

  if (draft.meta !== undefined) {
    patch.meta = {
      targetScore: draft.meta.targetScore,
      examDate: normalizeExamDateInput(draft.meta.examDate),
    };
  }

  if (draft.practice !== undefined) {
    patch.practice = {
      timersEnabled: draft.practice.timersEnabled,
      timerScale: draft.practice.timerScale,
    };
  }

  if (draft.tts !== undefined) {
    patch.tts = {
      enabled: draft.tts.enabled,
      voiceUri: normalizeVoiceUri(draft.tts.voiceUri),
      rate: clampSpeechRate(draft.tts.rate),
    };
  }

  if (draft.studiePlus !== undefined) {
    patch.studiePlus = {
      enabled: draft.studiePlus.enabled,
      word: draft.studiePlus.word,
      sentence: draft.studiePlus.sentence,
      pronunciation: draft.studiePlus.pronunciation,
      mode: draft.studiePlus.mode,
    };
  }

  return patch;
}

/** Patch que devolve cada seção aos padrões do produto (nunca é vazio). */
export function defaultsPatch(): DeepPartialAppSettings {
  return {
    meta: { ...DEFAULT_SETTINGS.meta },
    practice: { ...DEFAULT_SETTINGS.practice },
    tts: { ...DEFAULT_SETTINGS.tts },
    studiePlus: { ...DEFAULT_SETTINGS.studiePlus },
    aiConsent: { ...DEFAULT_SETTINGS.aiConsent },
  };
}

/** Atalho de leitura para a UI: o pack está ligado? */
export function isStudiePlusActive(settings: AppSettings): boolean {
  return settings.studiePlus.enabled;
}
