/**
 * Link interno que resolve o caminho contra o route tree em runtime.
 *
 * Existe um único cast (`Link` → componente de `to: string`) porque a rota de
 * destino chega em outra onda e ainda não está no union type gerado. O cast é
 * seguro no ponto de uso: o `href` só é passado depois de
 * `useResolvedPath()` confirmar que a rota está registrada — nunca navegamos
 * para um caminho inventado.
 */

import { Link } from "@tanstack/react-router";
import type { ComponentType, MouseEvent, ReactNode } from "react";

import { useResolvedPath } from "./use-resolved-path";

export interface InternalLinkProps {
  /** caminho desejado; resolvido para a rota registrada (com/sem barra final) */
  to: string;
  className?: string;
  children?: ReactNode;
  title?: string;
  "aria-label"?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

interface DynamicLinkProps {
  to: string;
  className?: string;
  children?: ReactNode;
  title?: string;
  "aria-label"?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

const DynamicLink = Link as unknown as ComponentType<DynamicLinkProps>;

/**
 * Renderiza um `Link` do router se o destino existir; caso contrário, `null`.
 * Para um item de menu com estado "em breve", use `NavLink` (não este).
 */
export function InternalLink({ to, ...rest }: InternalLinkProps) {
  const resolved = useResolvedPath(to);
  if (resolved === null) return null;
  return <DynamicLink to={resolved} {...rest} />;
}
