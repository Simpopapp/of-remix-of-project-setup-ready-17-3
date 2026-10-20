/**
 * Badge global da fila de revisão (Fase 4, onda 0).
 *
 * Contrato (PRD central §9): o contador de revisões vencidas é visível em TODAS
 * as telas. A fonte é o SRS da Fase 3 (`store.getDueSnapshots(diaLocal)`), nunca
 * uma contagem paralela.
 *
 * Regras de honestidade:
 * - Enquanto o número é desconhecido, `dueCount` é `null` — a UI não mostra "0"
 *   falso (era exatamente esse o defeito que o PRD proíbe).
 * - Sem IndexedDB/SSR o badge some (`available: false`), sem quebrar a página.
 * - Falha de leitura vira `error: true` e o badge é ocultado — nunca um número
 *   inventado.
 *
 * Atualização: recarrega ao voltar o foco, ao reabrir a aba e quando qualquer
 * parte do app chamar `notifyReviewStatusChanged()` (ex.: após enviar uma
 * tentativa ou importar um backup).
 */

import { useCallback, useEffect, useState } from "react";

import { localDayKey } from "@/domain";
import { getProgressLayer, isProgressAvailable } from "@/lib/app/progress-client";

/** Evento global de "o progresso mudou, revalide a fila". */
export const REVIEW_STATUS_EVENT = "pte:review-status-changed";

/** Dispara a revalidação do badge (e de qualquer outra tela inscrita). */
export function notifyReviewStatusChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REVIEW_STATUS_EVENT));
}

export interface ReviewStatus {
  /** revisões vencidas; `null` = ainda desconhecido */
  dueCount: number | null;
  loading: boolean;
  error: boolean;
  /** `false` em SSR/sem IndexedDB — o badge não deve aparecer */
  available: boolean;
  /** força uma nova leitura agora */
  refresh: () => void;
}

interface ReviewState {
  dueCount: number | null;
  loading: boolean;
  error: boolean;
  available: boolean;
}

const INITIAL_STATE: ReviewState = {
  dueCount: null,
  loading: true,
  error: false,
  available: false,
};

export function useReviewStatus(): ReviewStatus {
  const [state, setState] = useState<ReviewState>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!isProgressAvailable()) {
        if (active) {
          setState({ dueCount: null, loading: false, error: false, available: false });
        }
        return;
      }

      if (active) {
        setState((previous) => ({ ...previous, loading: true, available: true }));
      }

      try {
        const layer = await getProgressLayer();
        const due = await layer.store.getDueSnapshots(localDayKey());
        if (!active) return;
        setState({
          dueCount: due.length,
          loading: false,
          error: false,
          available: true,
        });
      } catch {
        if (!active) return;
        setState({ dueCount: null, loading: false, error: true, available: true });
      }
    };

    void load();

    const onFocus = () => {
      void load();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener(REVIEW_STATUS_EVENT, onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(REVIEW_STATUS_EVENT, onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshToken]);

  return { ...state, refresh };
}
