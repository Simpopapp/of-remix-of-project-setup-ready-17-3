/**
 * Barrel dos contratos de domínio — importe daqui (`@/domain`), não de arquivos
 * internos, para que a forma pública dos contratos fique num só lugar.
 *
 * Mapa dos contratos e quem consome:
 * - `question`     — Questão (espelho do schema do banco) · Fase 2 (importador/manifesto),
 *                    Fase 4 (catálogo), Fase 5 (harness), Fase 6 (motores), Fase 11 (proveniência).
 * - `attempt`      — Tentativa (log append-only, truncável) · Fase 3 (log), Fase 5/6 (gravação),
 *                    Fase 7 (histórico).
 * - `snapshot`     — Snapshot por questão (fonte das métricas) · Fase 3 (storage), Fase 7 (fila/
 *                    diagnóstico), Fase 8 (agregados), Fase 10 (notas).
 * - `aggregates`   — Agregados deriváveis + estimativa 10–90 rotulada · Fase 8 (medição honesta),
 *                    Fase 9 (relatório pós-simulado).
 * - `evaluation`   — Resultado do avaliador de IA (scored/abstained/needs_review) · Fase 5 (harness),
 *                    Fase 6 (motores), Fase 9 (relatório).
 * - `backup`       — Envelope versionado + migração só-aditiva · Fase 3 (import/export, quarentena),
 *                    Fase 13 (E2E de backup).
 * - `day`          — Chaves de dia local (`YYYY-MM-DD` no fuso do aluno) · Fases 3, 7, 8.
 * - `schema`       — Validadores de runtime (`parseX`) sem dependência externa · todas as fases.
 *
 * Todos os módulos são puros: zero I/O, zero React, zero TanStack, zero rede.
 */

export * from "./aggregates";
export * from "./attempt";
export * from "./backup";
export * from "./day";
export * from "./evaluation";
export * from "./question";
export * from "./schema";
export * from "./snapshot";
