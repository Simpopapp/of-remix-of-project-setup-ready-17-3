/**
 * Estado honesto de área ainda não construída (rotas-placeholder da Fase 4).
 *
 * Regra do PRD §18: nunca simular funcionalidade inexistente. A tela diz o que
 * a área vai entregar, em qual fase, e oferece um caminho de volta — sem botão
 * que finge funcionar, sem número inventado.
 */

import { Construction, ArrowLeft, Clock } from "lucide-react";

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { InternalLink } from "./internal-link";

export interface ComingSoonProps {
  /** ex.: "Sessões" */
  title: string;
  /** uma frase sobre o que esta área será */
  description: string;
  /** fase do roadmap que entrega a área (ex.: "Fase 7") */
  phase: string;
  /** o que a área vai conter, em itens curtos */
  bullets?: readonly string[];
  /** nota extra (ex.: dependência de outra fase) */
  footnote?: ReactNode;
  /** atalho opcional para uma área que já existe */
  nextHref?: string;
  nextLabel?: string;
}

export function ComingSoon({
  title,
  description,
  phase,
  bullets = [],
  footnote,
  nextHref,
  nextLabel,
}: ComingSoonProps) {
  return (
    <section className="mx-auto w-full max-w-2xl py-6">
      <div className="rounded-2xl border border-border/70 bg-card/40 p-6 sm:p-8">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <Construction className="size-4 text-primary" aria-hidden="true" />
          <span>Em construção</span>
        </div>

        <h1 className="mt-4 font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description}
        </p>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          <span>Chega na {phase}</span>
        </div>

        {bullets.length > 0 ? (
          <ul className="mt-6 space-y-2.5 border-t border-border/60 pt-5 text-sm text-muted-foreground">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2.5">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60"
                  aria-hidden="true"
                />
                <span className="leading-relaxed">{bullet}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {footnote !== undefined ? (
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground/90">{footnote}</p>
        ) : null}

        <div className="mt-7 flex flex-wrap gap-2">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar ao início
          </Link>
          {nextHref !== undefined && nextLabel !== undefined ? (
            <InternalLink
              to={nextHref}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {nextLabel}
            </InternalLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}
