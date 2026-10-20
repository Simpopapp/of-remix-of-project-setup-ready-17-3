/**
 * Resolve se um caminho de navegação existe no route tree ATUAL.
 *
 * Por que isso existe: a navegação da Fase 4 aponta para rotas que chegam em
 * ondas diferentes (Catálogo, Ajustes, Prática). Em vez de espalhar links
 * quebrados ou `<a href>` (proibido para rotas internas), o menu pergunta ao
 * router o que já está registrado: rota ausente vira item honesto "em breve",
 * rota presente vira `Link` tipado em runtime. Assim nenhum pacote precisa
 * editar o layout para "ligar" o próprio item.
 *
 * O route tree é estático (gerado no build), então o resultado é o mesmo no
 * servidor e no cliente — sem mismatch de hidratação.
 */

import { useRouter } from "@tanstack/react-router";

type RouteLike = { fullPath?: unknown } | undefined;

/**
 * Caminho registrado para `path`, tentando também a variante com barra final
 * (`/sessoes` ↔ `/sessoes/`), que é como rotas de diretório aparecem no tree.
 */
export function resolveRegisteredPath(routesByPath: unknown, path: string): string | null {
  if (typeof routesByPath !== "object" || routesByPath === null) return null;
  const routes = routesByPath as Record<string, RouteLike>;
  const candidates = path === "/" ? ["/"] : [path, `${path}/`];
  for (const candidate of candidates) {
    const route = routes[candidate];
    if (route === undefined) continue;
    const fullPath = route.fullPath;
    return typeof fullPath === "string" && fullPath.length > 0 ? fullPath : candidate;
  }
  return null;
}

/** Versão React: caminho registrado agora, ou `null` (rota ainda não existe). */
export function useResolvedPath(path: string): string | null {
  const router = useRouter();
  return resolveRegisteredPath(router.routesByPath, path);
}

/** Normaliza para comparação (barra final não muda a rota). */
export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

/** `true` quando `pathname` é a rota ou uma rota filha dela. */
export function isPathActive(pathname: string, href: string): boolean {
  const current = normalizePathname(pathname);
  const target = normalizePathname(href);
  if (current === target) return true;
  if (target === "/") return false;
  return current.startsWith(`${target}/`);
}
