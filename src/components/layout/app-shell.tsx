/**
 * Shell da aplicação (Fase 4, onda 0).
 *
 * Entrega o "esqueleto" que todas as telas usam:
 * - cabeçalho fixo com marca, navegação principal (desktop) e badge de revisão;
 * - barra inferior de navegação no mobile (alvos ≥ 56 px);
 * - rodapé com as rotas secundárias e o aviso de honestidade de medição.
 *
 * O conteúdo da rota entra como `children` (o `__root.tsx` passa o `<Outlet />`),
 * então nenhuma tela precisa repetir header/footer — e o badge de revisão fica
 * visível em todas elas por construção, não por disciplina.
 *
 * Sem números fixos: o shell não exibe contagens do banco (isso é do catálogo).
 */

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { MAIN_NAV, MOBILE_NAV, SECONDARY_NAV } from "./nav-items";
import { NavLink } from "./nav-link";
import { ReviewBadge } from "./review-badge";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link
            to="/"
            className="group flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg pr-1"
            aria-label="PTE Master Hub — início"
          >
            <span className="flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 font-serif text-[13px] font-semibold tracking-tight text-primary">
              PTE
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-serif text-[15px] font-semibold tracking-tight text-foreground">
                Master Hub
              </span>
              <span className="hidden text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:block">
                Preparo PTE Academic
              </span>
            </span>
          </Link>

          <nav
            aria-label="Navegação principal"
            className="hidden flex-1 items-center justify-center gap-0.5 md:flex"
          >
            {MAIN_NAV.map((item) => (
              <NavLink key={item.path} item={item} variant="desktop" />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <ReviewBadge />
          </div>
        </div>
      </header>

      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-8 sm:px-6">
        {children}
      </main>

      <footer className="border-t border-border/60 bg-card/20">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 pb-28 sm:px-6 md:flex-row md:items-center md:justify-between md:pb-6">
          <nav aria-label="Navegação secundária" className="flex flex-wrap items-center gap-1">
            {SECONDARY_NAV.map((item) => (
              <NavLink key={item.path} item={item} variant="footer" />
            ))}
          </nav>
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
            Seu progresso fica 100% neste dispositivo. As notas exibidas são{" "}
            <span className="text-foreground/80">estimativas de treino</span> — não são a nota
            oficial do PTE Academic.
          </p>
        </div>
      </footer>

      <nav
        aria-label="Navegação principal no celular"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <div className="mx-auto flex w-full max-w-6xl items-stretch px-1">
          {MOBILE_NAV.map((item) => (
            <NavLink key={item.path} item={item} variant="mobile" />
          ))}
        </div>
      </nav>
    </div>
  );
}
