/**
 * Download de arquivos gerados localmente (Fase 4 — s4).
 *
 * Nada aqui usa rede: o JSON vem do IndexedDB do próprio aluno e é entregue via
 * `Blob` + link temporário. Em SSR/ambiente sem `document`, a função devolve
 * `false` e a tela explica que o download não pôde ser iniciado — nunca finge
 * que exportou.
 */

export function downloadTextFile(
  fileName: string,
  text: string,
  mimeType = "application/json;charset=utf-8",
): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  if (typeof URL.createObjectURL !== "function") return false;

  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revogar depois do clique: o navegador já capturou o conteúdo.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
