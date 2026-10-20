/**
 * Ajustes de treino para o shell de prática (Fase 4 — s5-pratica).
 *
 * O progresso é 100% local: em SSR não existe IndexedDB, então nenhuma leitura pode
 * acontecer no topo do módulo nem durante o render. Este hook:
 *
 * - começa com `DEFAULT_SETTINGS` (renderiza a ficha e os tempos padrão no servidor);
 * - lê a seção `practice`/`tts` salva DENTRO de `useEffect`;
 * - degrada com honestidade: sem IndexedDB, a tela continua funcionando com os padrões
 *   e o cronômetro avisa que os Ajustes não puderam ser lidos (nunca finge que leu).
 *
 * A leitura é read-only e idempotente — StrictMode pode rodar o efeito duas vezes sem
 * efeito colateral.
 */

import { useEffect, useState } from "react";

import { getProgressLayer, isProgressAvailable } from "@/lib/app/progress-client";
import { DEFAULT_SETTINGS, readAppSettings, type AppSettings } from "@/lib/app/settings";

export type PracticeSettingsStatus = "loading" | "ready" | "unavailable" | "error";

export interface PracticeSettingsState {
  settings: AppSettings;
  status: PracticeSettingsStatus;
}

export function usePracticeSettings(): PracticeSettingsState {
  const [state, setState] = useState<PracticeSettingsState>({
    settings: DEFAULT_SETTINGS,
    status: "loading",
  });

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!isProgressAvailable()) {
        if (active) setState({ settings: DEFAULT_SETTINGS, status: "unavailable" });
        return;
      }
      try {
        const layer = await getProgressLayer();
        const settings = await readAppSettings(layer.store);
        if (active) setState({ settings, status: "ready" });
      } catch {
        if (active) setState({ settings: DEFAULT_SETTINGS, status: "error" });
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  return state;
}
