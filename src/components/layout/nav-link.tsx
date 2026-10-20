/**
 * Item de navegação com três variantes (desktop, mobile, rodapé).
 *
 * Honestidade de estado: se a rota do item ainda não existe (outra onda), o item
 * é renderizado como `span` desabilitado com "em breve" — nunca um link que
 * leva a 404 e nunca um `<a href>` que furaria o router.
 *
 * Alvos: desktop ≥ 40 px de altura, mobile ≥ 56 px (regra de 44 px do PRD §18).
 */

import { useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { InternalLink } from "./internal-link";
import type { NavItem } from "./nav-items";
import { isPathActive, useResolvedPath } from "./use-resolved-path";

export type NavVariant = "desktop" | "mobile" | "footer";

export interface NavLinkProps {
  item: NavItem;
  variant?: NavVariant;
  className?: string;
}

const BASE: Record<NavVariant, string> = {
  desktop:
    "inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors",
  mobile:
    "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors",
  footer: "inline-flex min-h-9 items-center rounded-md px-2 text-sm transition-colors",
};

const ACTIVE: Record<NavVariant, string> = {
  desktop: "bg-primary/10 text-primary",
  mobile: "text-primary",
  footer: "text-primary",
};

const IDLE: Record<NavVariant, string> = {
  desktop: "text-muted-foreground hover:bg-accent hover:text-foreground",
  mobile: "text-muted-foreground hover:text-foreground",
  footer: "text-muted-foreground hover:text-foreground",
};

const DISABLED: Record<NavVariant, string> = {
  desktop: "cursor-not-allowed text-muted-foreground/40",
  mobile: "cursor-not-allowed text-muted-foreground/40",
  footer: "cursor-not-allowed text-muted-foreground/40",
};

export function NavLink({ item, variant = "desktop", className }: NavLinkProps) {
  const href = useResolvedPath(item.path);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const Icon = item.icon;
  const active = href !== null && isPathActive(pathname, href);
  const iconSize = variant === "mobile" ? "size-5" : "size-4";

  if (href === null) {
    return (
      <span
        aria-disabled="true"
        title={`${item.label} — em breve`}
        className={cn(BASE[variant], DISABLED[variant], className)}
      >
        <Icon className={iconSize} aria-hidden="true" />
        <span className="truncate">{item.label}</span>
        <span className="sr-only"> (em breve)</span>
      </span>
    );
  }

  return (
    <InternalLink
      to={href}
      title={item.description}
      aria-label={item.label}
      className={cn(BASE[variant], active ? ACTIVE[variant] : IDLE[variant], className)}
    >
      <Icon className={iconSize} aria-hidden="true" />
      <span
        className={cn(
          "truncate",
          // No cabeçalho entre md e lg só o ícone cabe; o rótulo volta em lg.
          variant === "desktop" && "hidden lg:inline",
        )}
      >
        {item.label}
      </span>
    </InternalLink>
  );
}
