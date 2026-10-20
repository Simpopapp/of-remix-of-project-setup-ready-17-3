/**
 * Barra de cronômetro do shell de prática (Fase 4 — s5-pratica).
 *
 * O que ela é hoje: uma DEMONSTRAÇÃO honesta do tempo do tipo, usando exatamente o
 * `TimerSpec` calculado por `timerForType` a partir de `exam-spec.ts` + Ajustes.
 * O que ela não é: um cronômetro de avaliação. Sem motor (Fase 6), não há resposta
 * para submeter — e o rótulo diz isso, em vez de fingir uma tentativa.
 *
 * Regras:
 * - `until_audio`/`shared_section` não geram contagem artificial: a tela explica o
 *   comportamento real do exame (áudio/seção) em vez de mostrar "0 s".
 * - `timersEnabled: false` mostra os tempos do formato, sem nada correndo.
 * - A escala de treino (1×/1,5×/2×) vem dos Ajustes; o link para Ajustes só aparece se
 *   a rota já estiver registrada (esta onda) — nunca um link morto.
 * - `aria-live` anuncia início de preparação, início de resposta e fim; o relógio em si
 *   não é anunciado a cada tique.
 */

import { Link } from "@tanstack/react-router";
import { Pause, Play, RotateCcw, Settings2, Timer, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useResolvedPath } from "@/components/layout/use-resolved-path";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatCountdown,
  formatDuration,
  hasCountdown,
  initialTimerState,
  pauseTimer,
  resetTimer,
  startTimer,
  startsIn,
  tickTimer,
  timerProgress,
  type TimerSpec,
  type TimerState,
} from "@/lib/app/practice-timer";
import { cn } from "@/lib/utils";
import type { PracticeSettingsStatus } from "./use-practice-settings";

export interface PracticeTimerBarProps {
  spec: TimerSpec;
  settingsStatus: PracticeSettingsStatus;
}

export function PracticeTimerBar({ spec, settingsStatus }: PracticeTimerBarProps) {
  const [state, setState] = useState<TimerState>(() => initialTimerState(spec));
  const [announcement, setAnnouncement] = useState("");
  const lastTickRef = useRef<number | null>(null);
  const ajustesPath = useResolvedPath("/ajustes");

  // Ajustes chegam depois da hidratação: quando o TimerSpec muda (escala/liga-desliga),
  // o relógio volta ao começo em vez de continuar com um tempo antigo.
  useEffect(() => {
    setState(initialTimerState(spec));
    setAnnouncement("");
  }, [spec]);

  useEffect(() => {
    if (!state.running) {
      lastTickRef.current = null;
      return;
    }
    lastTickRef.current = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const previous = lastTickRef.current ?? now;
      lastTickRef.current = now;
      setState((current) => tickTimer(current, spec, now - previous));
    }, 250);
    return () => {
      window.clearInterval(id);
      lastTickRef.current = null;
    };
  }, [state.running, spec]);

  useEffect(() => {
    if (state.phase === "preparation") setAnnouncement("Preparação iniciada.");
    else if (state.phase === "response") setAnnouncement("Tempo de resposta iniciado.");
    else if (state.phase === "finished") {
      setAnnouncement("Tempo encerrado. Você pode reiniciar a demonstração.");
    }
  }, [state.phase]);

  const counting = spec.enabled && hasCountdown(spec);
  const initial = startsIn(spec);
  const phaseLabel =
    state.phase === "preparation"
      ? "Preparação"
      : state.phase === "response"
        ? "Tempo de resposta"
        : state.phase === "finished"
          ? "Encerrado"
          : state.phase === "unavailable"
            ? "Sem contagem"
            : initial === "preparation"
              ? "Preparação"
              : "Tempo de resposta";

  const progress = timerProgress(state, spec);
  const paused = !state.running && (state.phase === "preparation" || state.phase === "response");

  const handleStart = () => {
    setState((current) =>
      current.phase === "finished" ? startTimer(resetTimer(spec), spec) : startTimer(current, spec),
    );
  };
  const handlePause = () => setState((current) => pauseTimer(current));
  const handleReset = () => {
    setState(resetTimer(spec));
    setAnnouncement("Cronômetro reiniciado.");
  };

  return (
    <section
      aria-labelledby="cronometro-titulo"
      className="rounded-xl border border-border/60 bg-card/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="cronometro-titulo"
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <Timer className="size-4 text-primary" aria-hidden="true" />
          Cronômetro de treino
        </h2>
        <Badge variant="outline" className="border-border/70 text-muted-foreground">
          Demonstração
        </Badge>
      </div>

      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Demonstração do tempo deste tipo no exame. A contagem será usada pelo motor de prática
        quando ele chegar (Fase 6) — nada aqui é uma tentativa avaliada.
      </p>

      {!spec.enabled ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            O cronômetro está desligado nos Ajustes de treino: os tempos do formato continuam
            visíveis, mas nada conta.
          </p>
          <StaticTimes spec={spec} />
          {ajustesPath !== null ? (
            <Link
              to={ajustesPath}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Settings2 className="size-4" aria-hidden="true" />
              Ajustar cronômetro
            </Link>
          ) : null}
        </div>
      ) : !counting ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {spec.responseKind === "shared_section"
              ? "Este tipo não tem cronômetro por item: o tempo é o compartilhado da seção do exame."
              : "A janela de resposta acompanha o áudio do item e não há preparação — portanto não existe uma contagem para demonstrar."}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {phaseLabel}
              </p>
              <p
                role="timer"
                aria-live="off"
                className="font-serif text-4xl font-semibold tabular-nums tracking-tight text-foreground"
              >
                {formatCountdown(state.remainingMs)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {state.phase === "finished"
                  ? "Tempo encerrado."
                  : paused
                    ? "Pausado — o tempo restante não corre."
                    : state.phase === "preparation"
                      ? "Prepare a resposta."
                      : "Responda dentro da janela."}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {state.running ? (
                <Button type="button" variant="outline" className="min-h-11" onClick={handlePause}>
                  <Pause className="size-4" aria-hidden="true" />
                  Pausar
                </Button>
              ) : (
                <Button type="button" className="min-h-11" onClick={handleStart}>
                  <Play className="size-4" aria-hidden="true" />
                  {paused ? "Retomar" : state.phase === "finished" ? "Reiniciar" : "Iniciar"}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={handleReset}
                aria-label="Reiniciar o cronômetro"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Zerar
              </Button>
            </div>
          </div>

          <div
            role="progressbar"
            aria-label={`Progresso da fase: ${phaseLabel}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-[width] duration-200 ease-linear",
                state.phase === "finished" && "bg-primary/70",
              )}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
        <span className="tabular-nums">
          Preparação:{" "}
          <span className="text-foreground/80">
            {spec.preparationMs === null ? "sem preparação" : formatDuration(spec.preparationMs)}
          </span>
        </span>
        <span className="tabular-nums">
          Resposta:{" "}
          <span className="text-foreground/80">
            {spec.responseMs === null
              ? spec.responseKind === "shared_section"
                ? "tempo da seção"
                : spec.responseKind === "until_audio"
                  ? "acompanha o áudio"
                  : "sem janela fixa"
              : formatDuration(spec.responseMs)}
          </span>
        </span>
        {spec.scale !== 1 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-foreground/80">
              Escala {String(spec.scale).replace(".", ",")}×
            </span>
            {ajustesPath !== null ? (
              <Link
                to={ajustesPath}
                className="inline-flex min-h-9 items-center rounded-sm px-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ajustar
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>

      {settingsStatus === "unavailable" || settingsStatus === "error" ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            Não foi possível ler os Ajustes neste navegador; usando o padrão de treino (1×). O
            progresso continua 100% local quando o armazenamento estiver disponível.
          </span>
        </p>
      ) : null}
    </section>
  );
}

function StaticTimes({ spec }: { spec: TimerSpec }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
      <div>
        <dt className="uppercase tracking-[0.12em]">Preparação</dt>
        <dd className="mt-0.5 text-sm tabular-nums text-foreground">
          {spec.preparationMs === null ? "Sem preparação" : formatDuration(spec.preparationMs)}
        </dd>
      </div>
      <div>
        <dt className="uppercase tracking-[0.12em]">Resposta</dt>
        <dd className="mt-0.5 text-sm tabular-nums text-foreground">
          {spec.responseMs === null
            ? spec.responseKind === "shared_section"
              ? "Tempo da seção"
              : spec.responseKind === "until_audio"
                ? "Acompanha o áudio"
                : "Sem janela fixa"
            : formatDuration(spec.responseMs)}
        </dd>
      </div>
    </dl>
  );
}
