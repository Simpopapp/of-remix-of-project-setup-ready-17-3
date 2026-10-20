/**
 * Badge global de revisão (presente em todas as telas).
 *
 * Três estados honestos:
 * - desconhecido (carregando): sem número, só o indicador;
 * - vencido (> 0): contagem real + atalho para a fila em `/sessoes`;
 * - em dia (0): "Em dia" — nunca o dígito "0" solto, que se confunde com falha.
 * Indisponível (SSR/sem IndexedDB) ou erro de leitura: o badge não é exibido.
 */

import { CheckCircle2, Clock } from "lucide-react";

import { useReviewStatus } from "@/hooks/use-review-status";
import { cn } from "@/lib/utils";

import { InternalLink } from "./internal-link";

const CHIP =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors md:h-9";

export function ReviewBadge({ className }: { className?: string }) {
  const { dueCount, loading, error, available } = useReviewStatus();

  if (!available || error) return null;

  if (loading || dueCount === null) {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-label="Verificando a fila de revisão"
        title="Verificando a fila de revisão"
        className={cn(CHIP, "border-border/60 bg-card/50 text-muted-foreground", className)}
      >
        <span
          className="size-1.5 animate-pulse rounded-full bg-muted-foreground"
          aria-hidden="true"
        />
        <span className="hidden sm:inline">Verificando revisões</span>
      </span>
    );
  }

  if (dueCount === 0) {
    return (
      <span
        role="status"
        aria-live="polite"
        title="Nenhuma revisão vencida hoje"
        className={cn(CHIP, "border-border/60 bg-card/50 text-muted-foreground", className)}
      >
        <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
        <span>Em dia</span>
      </span>
    );
  }

  return (
    <InternalLink
      to="/sessoes"
      title="Abrir a fila do dia em Sessões"
      aria-label={`${dueCount} ${dueCount === 1 ? "revisão vencida" : "revisões vencidas"} — abrir sessões`}
      className={cn(
        CHIP,
        "border-primary/40 bg-primary/10 text-primary hover:border-primary/60 hover:bg-primary/15",
        className,
      )}
    >
      <Clock className="size-3.5" aria-hidden="true" />
      <span className="font-semibold tabular-nums">{dueCount}</span>
      <span>{dueCount === 1 ? "revisão" : "revisões"}</span>
    </InternalLink>
  );
}
