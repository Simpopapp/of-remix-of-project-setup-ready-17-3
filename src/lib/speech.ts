/**
 * Leitura em voz alta do app pela Web Speech API (Fase 4, onda 0).
 *
 * Contratos que importam (PRD central §13 e §18):
 * - O áudio fala SEMPRE o inglês original (`en-*`). Nunca "áudio da tradução"
 *   — isso é regra inviolável do Studie Plus.
 * - A UI precisa informar a voz REALMENTE usada: por isso `speak()` devolve
 *   `voiceName` (ou `null` quando não há voz em inglês).
 * - Sem voz em inglês instalada, não fingimos pronúncia: a função não fala e
 *   devolve `voiceName: null` para a tela explicar ao aluno.
 * - SSR-safe: nada de `window` em escopo de módulo. No servidor o módulo pode
 *   ser importado sem efeito; `isSpeechAvailable()` é `false`.
 *
 * O que este módulo NÃO faz: avaliar pronúncia, transcrever áudio ou tocar
 * mídia do banco. TTS de conteúdo do exame é responsabilidade dos motores.
 */

import { clampSpeechRate, type AppSettings } from "./app/settings";

/** Opções de fala. `rate` é normalizado para 0.5–2.0. */
export interface SpeakOptions {
  /** `SpeechSynthesisVoice.voiceURI`; ausente = melhor voz em inglês */
  voiceUri?: string | null;
  rate?: number;
  /** idioma desejado quando não há voz instalada; padrão `en-GB` */
  lang?: string;
  onEnd?: () => void;
  onError?: (error: SpeechSynthesisErrorEvent | Error) => void;
}

/** Handle de fala: `cancel` interrompe (inclusive o utterance anterior). */
export interface SpeakHandle {
  cancel: () => void;
  /** nome da voz realmente usada; `null` = nenhuma voz em inglês disponível */
  voiceName: string | null;
  /** `false` quando nada foi falado (SSR, sem engine ou texto vazio) */
  started: boolean;
}

export const DEFAULT_SPEECH_LANG = "en-GB";

type SpeechWindow = Window & {
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
};

function speechWindow(): SpeechWindow | null {
  if (typeof window === "undefined") return null;
  return window as SpeechWindow;
}

function engine(): SpeechSynthesis | null {
  const win = speechWindow();
  if (win === null) return null;
  const synth = win.speechSynthesis;
  return synth ?? null;
}

/** Há engine de fala E construtor de utterance neste ambiente? */
export function isSpeechAvailable(): boolean {
  const win = speechWindow();
  if (win === null) return false;
  return win.speechSynthesis !== undefined && win.SpeechSynthesisUtterance !== undefined;
}

function isEnglishVoice(voice: SpeechSynthesisVoice): boolean {
  return voice.lang.toLowerCase().startsWith("en");
}

/**
 * Vozes em inglês instaladas, ordenadas por preferência:
 * inglês do Reino Unido, depois Estados Unidos, depois as demais variantes;
 * dentro do mesmo idioma, vozes locais primeiro (funcionam offline).
 */
export function listEnglishVoices(): SpeechSynthesisVoice[] {
  const synth = engine();
  if (synth === null) return [];
  const rank = (voice: SpeechSynthesisVoice): number => {
    const lang = voice.lang.toLowerCase();
    const langRank = lang.startsWith("en-gb") ? 0 : lang.startsWith("en-us") ? 1 : 2;
    return langRank * 2 + (voice.localService ? 0 : 1);
  };
  return synth
    .getVoices()
    .filter(isEnglishVoice)
    .slice()
    .sort((a, b) => {
      const byRank = rank(a) - rank(b);
      return byRank !== 0 ? byRank : a.name.localeCompare(b.name);
    });
}

/**
 * Assina mudanças na lista de vozes (o navegador carrega as vozes de forma
 * assíncrona). Devolve a função de cancelamento. SSR-safe (no-op).
 */
export function onVoicesChanged(handler: (voices: SpeechSynthesisVoice[]) => void): () => void {
  const synth = engine();
  if (synth === null) return () => {};
  const listener = () => handler(listEnglishVoices());
  synth.addEventListener("voiceschanged", listener);
  return () => synth.removeEventListener("voiceschanged", listener);
}

/** Escolhe a voz: URI exata quando pedida; senão a melhor voz em inglês. */
function pickVoice(synth: SpeechSynthesis, voiceUri: string | null): SpeechSynthesisVoice | null {
  const englishVoices = listEnglishVoices();
  if (voiceUri !== null) {
    const requested = synth.getVoices().find((voice) => voice.voiceURI === voiceUri);
    // Voz pedida que não é inglesa é recusada: o áudio é sempre o original.
    if (requested !== undefined && isEnglishVoice(requested)) return requested;
  }
  return englishVoices[0] ?? null;
}

/**
 * Fala um texto em inglês. Interrompe qualquer fala anterior (nunca duas
 * vozes sobrepostas). Retorna a voz usada para a UI exibir.
 */
export function speak(text: string, options: SpeakOptions = {}): SpeakHandle {
  const synth = engine();
  const win = speechWindow();
  const trimmed = text.trim();
  const Utterance = win?.SpeechSynthesisUtterance;

  if (synth === null || Utterance === undefined || trimmed.length === 0) {
    return { cancel: () => {}, voiceName: null, started: false };
  }

  const voice = pickVoice(synth, options.voiceUri ?? null);
  if (voice === null) {
    // Sem voz em inglês: não inventa pronúncia em outro idioma.
    return { cancel: () => {}, voiceName: null, started: false };
  }

  synth.cancel();

  const utterance = new Utterance(trimmed);
  utterance.voice = voice;
  utterance.lang = voice.lang || options.lang || DEFAULT_SPEECH_LANG;
  utterance.rate = clampSpeechRate(options.rate);
  if (options.onEnd !== undefined) utterance.onend = () => options.onEnd?.();
  if (options.onError !== undefined) {
    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      // Cancelar/interromper é fluxo normal, não erro para o aluno.
      if (event.error === "canceled" || event.error === "interrupted") return;
      options.onError?.(event);
    };
  }

  synth.speak(utterance);

  return {
    cancel: () => {
      synth.cancel();
    },
    voiceName: voice.name,
    started: true,
  };
}

/** Interrompe qualquer fala em andamento (no-op no servidor). */
export function stopSpeaking(): void {
  engine()?.cancel();
}

/** Conveniência para telas: fala usando os ajustes tipados do aluno. */
export function speakWithSettings(
  text: string,
  settings: Pick<AppSettings, "tts">,
  options: Omit<SpeakOptions, "voiceUri" | "rate"> = {},
): SpeakHandle {
  return speak(text, {
    voiceUri: settings.tts.voiceUri,
    rate: settings.tts.rate,
    ...options,
  });
}
