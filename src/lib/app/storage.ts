/**
 * Storage da camada de progresso local (Fase 3, F3.2/F3.3/F3.7).
 *
 * Arquitetura de persistência (PRD central §10):
 * - `QuestionSnapshot` por questão é a fonte das métricas — escrito de forma
 *   independente do log.
 * - `Aggregates` é APENAS cache derivável dos snapshots (nunca do log), então
 *   truncar o log não perde métrica.
 * - O log de tentativas é append-only e truncável por política explícita:
 *   `maxAttempts` entradas submetidas mais recentes + janela de
 *   `retentionDays` dias locais. Tentativas abertas (submetidas = null) nunca
 *   são truncadas — elas são a base de "retomar sessão" (Fase 7).
 * - Toda submissão (snapshot + log + agregados + histórico) roda numa única
 *   transação IndexedDB: crash simulado aborta tudo, nunca deixa estado misto.
 *
 * Duas escalas nunca se misturam aqui: `AggregateBucket.recentWeightedScore`
 * é escala de TENTATIVA (0–100); `SkillAggregate.estimate` fica `null`
 * (`uncalibrated`), porque a calibração 10–90 é da Fase 5/8. Nenhum peso de
 * habilidade é inventado: `bySkill` só existe se um resolvedor for injetado a
 * partir da matriz oficial (`src/data/exam-spec.ts`).
 */

import {
  TASK_TYPES,
  SECTION_BY_TYPE,
  addLocalDays,
  attemptScoreOf,
  compareLocalDayKeys,
  emptyAggregates,
  emptyBucket,
  emptySnapshot,
  isRecord,
  localDayKey,
  localDayKeyOfTimestamp,
  parseAttempt,
  parseSnapshot,
  type AggregateBucket,
  type Aggregates,
  type Attempt,
  type Confidence,
  type ErrorCategory,
  type LocalDayKey,
  type QuestionSnapshot,
  type Section,
  type Skill,
  type SkillAggregate,
  type TaskType,
} from "@/domain";
import { PROGRESS_STORES, getStore, requestResult, type ProgressDatabase } from "./db";
import {
  passedForScore,
  reviewQueue,
  scheduleSrs,
  srsPolicyFor,
  type SrsPolicy,
  type SrsUpdate,
} from "./srs";

/* ------------------------------------------------------------------ */
/* Políticas                                                          */
/* ------------------------------------------------------------------ */

export interface TruncationPolicy {
  /** máximo de tentativas SUBMETIDAS mantidas (as mais recentes) */
  maxAttempts: number;
  /** janela de retenção em dias locais; `0` = só hoje */
  retentionDays: number;
}

/**
 * Política padrão do log. Escolhida para caber com folga em qualquer cota
 * razoável mantendo ~6 meses de histórico curto; os snapshots preservam todas
 * as métricas mesmo que o log seja descartado.
 */
export const DEFAULT_TRUNCATION_POLICY: TruncationPolicy = {
  maxAttempts: 2000,
  retentionDays: 180,
};

/** Resolvedor de pesos tarefa→habilidade (matriz oficial, Fase 8). */
export type SkillWeightResolver = (type: TaskType) => Partial<Record<Skill, number>> | undefined;

export interface AggregateHistoryPoint {
  /** `${series}|${day}` */
  key: string;
  series: string;
  day: LocalDayKey;
  recentWeightedScore: number | null;
  scoredAttempts: number;
}

export const TREND_THRESHOLD = 2.5;
export const RECENT_HALF_LIFE_DAYS = 14;

/* ------------------------------------------------------------------ */
/* Derivação de agregados (pura)                                      */
/* ------------------------------------------------------------------ */

export interface DeriveAggregatesOptions {
  computedAt: string;
  today: LocalDayKey;
  history?: readonly AggregateHistoryPoint[];
  skillWeights?: SkillWeightResolver;
  trendThreshold?: number;
  halfLifeDays?: number;
}

function seriesKey(series: string, day: LocalDayKey): string {
  return `${series}|${day}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function timeOf(iso: string | null): number | null {
  if (iso === null) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

function latestSubmission(snapshots: readonly QuestionSnapshot[]): QuestionSnapshot | null {
  let latest: QuestionSnapshot | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const snapshot of snapshots) {
    const at = timeOf(snapshot.lastSubmittedAt);
    if (at === null) continue;
    if (at > latestTime) {
      latestTime = at;
      latest = snapshot;
    }
  }
  return latest;
}

function confidenceFor(scoredAttempts: number, questionCount: number): Confidence {
  // Heurística de volume do cache de storage; a Fase 8 pode refinar com
  // calibração. Nunca é apresentada como "confiança da estimativa 10–90".
  if (scoredAttempts >= 20 && questionCount >= 8) return "high";
  if (scoredAttempts >= 6 && questionCount >= 3) return "medium";
  return "low";
}

function recentWeightedScoreOf(
  scoredSnapshots: readonly QuestionSnapshot[],
  computedAtMs: number,
  halfLifeDays: number,
): number | null {
  let weighted = 0;
  let totalWeight = 0;
  for (const snapshot of scoredSnapshots) {
    if (snapshot.lastScore === null) continue;
    const submittedAt = timeOf(snapshot.lastSubmittedAt);
    const ageDays =
      submittedAt === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, (computedAtMs - submittedAt) / 86_400_000);
    // Item sem data de envio ainda conta, mas com peso mínimo.
    const weight = Number.isFinite(ageDays) ? Math.pow(0.5, ageDays / halfLifeDays) : 0.01;
    weighted += snapshot.lastScore * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return round1(weighted / totalWeight);
}

function previousHistoryPoint(
  history: readonly AggregateHistoryPoint[],
  series: string,
  today: LocalDayKey,
): AggregateHistoryPoint | null {
  let best: AggregateHistoryPoint | null = null;
  for (const point of history) {
    if (point.series !== series) continue;
    if (compareLocalDayKeys(point.day, today) >= 0) continue;
    if (best === null || compareLocalDayKeys(point.day, best.day) > 0) best = point;
  }
  return best;
}

function trendOf(
  current: number | null,
  history: readonly AggregateHistoryPoint[],
  series: string,
  today: LocalDayKey,
  threshold: number,
): AggregateBucket["trend"] {
  if (current === null) return null;
  const previous = previousHistoryPoint(history, series, today);
  if (previous === null || previous.recentWeightedScore === null) return null;
  const delta = current - previous.recentWeightedScore;
  if (delta >= threshold) return "improving";
  if (delta <= -threshold) return "declining";
  return "stable";
}

function bucketOf(
  snapshots: readonly QuestionSnapshot[],
  options: Required<Pick<DeriveAggregatesOptions, "trendThreshold" | "halfLifeDays">> & {
    computedAtMs: number;
    today: LocalDayKey;
    history: readonly AggregateHistoryPoint[];
    series: string;
  },
): AggregateBucket {
  const active = snapshots.filter((snapshot) => snapshot.attempts > 0);
  if (active.length === 0) return emptyBucket();

  const scored = active.filter((snapshot) => snapshot.lastScore !== null);
  const canonicalIds = new Set(active.map((snapshot) => snapshot.canonicalId));

  let attempts = 0;
  let scoredAttempts = 0;
  let bestScore: number | null = null;
  for (const snapshot of active) {
    attempts += snapshot.attempts;
    scoredAttempts += snapshot.scoredAttempts;
    if (snapshot.bestScore !== null) {
      bestScore = bestScore === null ? snapshot.bestScore : Math.max(bestScore, snapshot.bestScore);
    }
  }

  const latest = latestSubmission(active);
  const recentWeightedScore = recentWeightedScoreOf(
    scored,
    options.computedAtMs,
    options.halfLifeDays,
  );

  return {
    attempts,
    scoredAttempts,
    questionCount: canonicalIds.size,
    lastScore: latest?.lastScore ?? null,
    bestScore,
    recentWeightedScore,
    trend: trendOf(
      recentWeightedScore,
      options.history,
      options.series,
      options.today,
      options.trendThreshold,
    ),
    confidence: confidenceFor(scoredAttempts, canonicalIds.size),
    lastActivityAt: latest?.lastSubmittedAt ?? null,
  };
}

/**
 * Deriva `Aggregates` dos snapshots (nunca do log). Pura e testável.
 *
 * `bySkill` só é preenchido com `skillWeights`; sem a matriz oficial o campo
 * fica vazio — melhor vazio do que peso inventado.
 */
export function deriveAggregates(
  snapshots: readonly QuestionSnapshot[],
  options: DeriveAggregatesOptions,
): Aggregates {
  const computedAtMs = Date.parse(options.computedAt);
  if (Number.isNaN(computedAtMs)) {
    throw new TypeError(`deriveAggregates: computedAt inválido (${options.computedAt})`);
  }
  const halfLifeDays = options.halfLifeDays ?? RECENT_HALF_LIFE_DAYS;
  if (!(halfLifeDays > 0)) {
    throw new TypeError("deriveAggregates: halfLifeDays precisa ser > 0");
  }
  const trendThreshold = options.trendThreshold ?? TREND_THRESHOLD;
  const history = options.history ?? [];
  const common = {
    computedAtMs,
    today: options.today,
    history,
    trendThreshold,
    halfLifeDays,
  };

  const byType: Aggregates["byType"] = {};
  for (const type of TASK_TYPES) {
    const group = snapshots.filter((snapshot) => snapshot.questionType === type);
    if (group.length === 0) continue;
    byType[type] = bucketOf(group, { ...common, series: `type:${type}` });
  }

  const bySection: Aggregates["bySection"] = {};
  const sections: Section[] = ["speaking", "writing", "reading", "listening"];
  for (const section of sections) {
    const group = snapshots.filter(
      (snapshot) => SECTION_BY_TYPE[snapshot.questionType] === section,
    );
    if (group.length === 0) continue;
    bySection[section] = bucketOf(group, { ...common, series: `section:${section}` });
  }

  const bySkill: Aggregates["bySkill"] = {};
  if (options.skillWeights) {
    const resolver = options.skillWeights;
    const perSkill = new Map<Skill, QuestionSnapshot[]>();
    for (const snapshot of snapshots) {
      const weights = resolver(snapshot.questionType);
      if (!weights) continue;
      for (const [skill, weight] of Object.entries(weights) as [Skill, number][]) {
        if (!(weight > 0)) continue;
        const group = perSkill.get(skill) ?? [];
        group.push(snapshot);
        perSkill.set(skill, group);
      }
    }
    for (const [skill, group] of perSkill) {
      const bucket = bucketOf(group, { ...common, series: `skill:${skill}` });
      const aggregate: SkillAggregate = {
        ...bucket,
        skill,
        // Estimativa 10–90 é da Fase 8 e exige calibração; nunca inventamos.
        estimate: null,
        estimateBasis: bucket.attempts > 0 ? "uncalibrated" : "insufficient",
      };
      bySkill[skill] = aggregate;
    }
  }

  const overall = bucketOf(snapshots, { ...common, series: "overall" });

  return {
    version: 1,
    computedAt: options.computedAt,
    totalAttempts: overall.attempts,
    totalQuestions: overall.questionCount,
    overall,
    byType,
    bySection,
    bySkill,
  };
}

/** Pontos de histórico a gravar para permitir tendência sem depender do log. */
export function historyPointsOf(aggregates: Aggregates, day: LocalDayKey): AggregateHistoryPoint[] {
  const points: AggregateHistoryPoint[] = [
    {
      key: seriesKey("overall", day),
      series: "overall",
      day,
      recentWeightedScore: aggregates.overall.recentWeightedScore,
      scoredAttempts: aggregates.overall.scoredAttempts,
    },
  ];
  for (const [type, bucket] of Object.entries(aggregates.byType) as [TaskType, AggregateBucket][]) {
    points.push({
      key: seriesKey(`type:${type}`, day),
      series: `type:${type}`,
      day,
      recentWeightedScore: bucket.recentWeightedScore,
      scoredAttempts: bucket.scoredAttempts,
    });
  }
  for (const [section, bucket] of Object.entries(aggregates.bySection) as [
    Section,
    AggregateBucket,
  ][]) {
    points.push({
      key: seriesKey(`section:${section}`, day),
      series: `section:${section}`,
      day,
      recentWeightedScore: bucket.recentWeightedScore,
      scoredAttempts: bucket.scoredAttempts,
    });
  }
  for (const [skill, aggregate] of Object.entries(aggregates.bySkill) as [
    Skill,
    SkillAggregate,
  ][]) {
    points.push({
      key: seriesKey(`skill:${skill}`, day),
      series: `skill:${skill}`,
      day,
      recentWeightedScore: aggregate.recentWeightedScore,
      scoredAttempts: aggregate.scoredAttempts,
    });
  }
  return points;
}

/* ------------------------------------------------------------------ */
/* Erros e resultados                                                 */
/* ------------------------------------------------------------------ */

export type ProgressStoreErrorCode =
  | "attempt_not_submitted"
  | "missing_question_type"
  | "question_type_mismatch"
  | "duplicate_attempt"
  | "snapshot_not_found"
  | "invalid_settings"
  | "invalid_import";

export class ProgressStoreError extends Error {
  readonly code: ProgressStoreErrorCode;
  readonly detail: string | undefined;

  constructor(code: ProgressStoreErrorCode, detail?: string) {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "ProgressStoreError";
    this.code = code;
    this.detail = detail;
  }
}

export interface SubmitAttemptOptions {
  /** usado quando a tentativa não carrega `questionType` */
  questionType?: TaskType;
  /** identidade estatística (quase-duplicatas); default = `questionId` */
  canonicalId?: string;
  /** categorias de erro observadas pelo avaliador (diagnóstico da Fase 7) */
  errorCategories?: readonly ErrorCategory[];
  /** dia local da revisão; default = dia local de `submittedAt` */
  reviewDay?: LocalDayKey;
}

export interface SubmitAttemptResult {
  attempt: Attempt;
  snapshot: QuestionSnapshot;
  aggregates: Aggregates;
  srs: SrsUpdate;
  truncatedAttempts: number;
}

export interface ImportStateInput {
  snapshots: readonly QuestionSnapshot[];
  attemptsTail: readonly Attempt[];
  settings: Record<string, unknown>;
  strategy: "merge" | "replace";
  /** default = agora */
  computedAt?: string;
  /** default = true */
  saveUndo?: boolean;
}

export interface ImportStateResult {
  snapshots: QuestionSnapshot[];
  aggregates: Aggregates;
  snapshotCount: number;
  attemptCount: number;
  undoId: string | null;
}

export type UndoImportResult =
  { restored: true; createdAt: string } | { restored: false; reason: "no_undo" };

interface UndoRecord {
  id: string;
  createdAt: string;
  snapshots: QuestionSnapshot[];
  attempts: Attempt[];
  settings: Record<string, unknown>;
  aggregates: Aggregates | null;
  history: AggregateHistoryPoint[];
}

const UNDO_ID = "last-import";

/* ------------------------------------------------------------------ */
/* Store                                                              */
/* ------------------------------------------------------------------ */

export interface ProgressStoreOptions {
  db: ProgressDatabase;
  /** relógio injetável (testes determinísticos) */
  now?: () => Date;
  truncation?: Partial<TruncationPolicy>;
  srsPolicy?: (type: TaskType) => SrsPolicy;
  /** injeção para teste de crash/atomicidade */
  derive?: typeof deriveAggregates;
  /** default = true */
  autoTruncate?: boolean;
  skillWeights?: SkillWeightResolver;
}

export class ProgressStore {
  /** exposto para a camada de backup (mesma conexão, transações atômicas) */
  readonly db: ProgressDatabase;
  private readonly clock: () => Date;
  private readonly truncation: TruncationPolicy;
  private readonly srsPolicy: (type: TaskType) => SrsPolicy;
  private readonly derive: typeof deriveAggregates;
  private readonly autoTruncate: boolean;
  private readonly skillWeights: SkillWeightResolver | undefined;

  constructor(options: ProgressStoreOptions) {
    this.db = options.db;
    this.clock = options.now ?? (() => new Date());
    this.truncation = { ...DEFAULT_TRUNCATION_POLICY, ...options.truncation };
    this.srsPolicy = options.srsPolicy ?? srsPolicyFor;
    this.derive = options.derive ?? deriveAggregates;
    this.autoTruncate = options.autoTruncate ?? true;
    this.skillWeights = options.skillWeights;
  }

  private nowDate(): Date {
    return this.clock();
  }

  private nowIso(): string {
    return this.nowDate().toISOString();
  }

  private today(): LocalDayKey {
    return localDayKey(this.nowDate());
  }

  private async readAllSnapshots(tx: IDBTransaction): Promise<QuestionSnapshot[]> {
    const store = getStore(tx, PROGRESS_STORES.snapshots);
    return (await requestResult(store.getAll())) as QuestionSnapshot[];
  }

  private async readHistory(tx: IDBTransaction): Promise<AggregateHistoryPoint[]> {
    const store = getStore(tx, PROGRESS_STORES.aggregateHistory);
    return (await requestResult(store.getAll())) as AggregateHistoryPoint[];
  }

  private async putAggregatesAndHistory(
    tx: IDBTransaction,
    aggregates: Aggregates,
    today: LocalDayKey,
    replaceHistory: boolean,
  ): Promise<void> {
    const aggregatesStore = getStore(tx, PROGRESS_STORES.aggregates);
    await requestResult(aggregatesStore.put({ id: "current", value: aggregates }));
    const historyStore = getStore(tx, PROGRESS_STORES.aggregateHistory);
    if (replaceHistory) await requestResult(historyStore.clear());
    for (const point of historyPointsOf(aggregates, today)) {
      await requestResult(historyStore.put(point));
    }
  }

  /* ---------------------------- leituras ---------------------------- */

  async getSnapshots(): Promise<QuestionSnapshot[]> {
    return this.db.read(PROGRESS_STORES.snapshots, async (store) => {
      const rows = (await requestResult(store.getAll())) as QuestionSnapshot[];
      return rows;
    });
  }

  async getSnapshot(questionId: string): Promise<QuestionSnapshot | null> {
    return this.db.read(PROGRESS_STORES.snapshots, async (store) => {
      const row = (await requestResult(store.get(questionId))) as QuestionSnapshot | undefined;
      return row ?? null;
    });
  }

  async getAttemptLog(): Promise<Attempt[]> {
    return this.db.read(PROGRESS_STORES.attempts, async (store) => {
      return (await requestResult(store.getAll())) as Attempt[];
    });
  }

  async listOpenAttempts(): Promise<Attempt[]> {
    const log = await this.getAttemptLog();
    return log.filter((attempt) => attempt.submittedAt === null);
  }

  async getAggregates(): Promise<Aggregates> {
    const stored = await this.db.read(PROGRESS_STORES.aggregates, async (store) => {
      const row = (await requestResult(store.get("current"))) as
        { id: string; value: Aggregates } | undefined;
      return row?.value ?? null;
    });
    return stored ?? emptyAggregates(this.nowIso());
  }

  async getHistory(): Promise<AggregateHistoryPoint[]> {
    return this.db.read(PROGRESS_STORES.aggregateHistory, async (store) => {
      return (await requestResult(store.getAll())) as AggregateHistoryPoint[];
    });
  }

  async getSettings(): Promise<Record<string, unknown>> {
    const value = await this.db.read(PROGRESS_STORES.meta, async (store) => {
      const row = (await requestResult(store.get("settings"))) as
        { key: string; value: unknown } | undefined;
      return row?.value;
    });
    return isRecord(value) ? value : {};
  }

  /** Fila de revisão vencida (Fase 7 consome; aqui é consulta). */
  async getDueSnapshots(today: LocalDayKey = this.today()): Promise<QuestionSnapshot[]> {
    const snapshots = await this.getSnapshots();
    return reviewQueue(snapshots, today);
  }

  /* ---------------------------- escritas ---------------------------- */

  async setSettings(settings: Record<string, unknown>): Promise<void> {
    if (!isRecord(settings)) {
      throw new ProgressStoreError("invalid_settings", "ajustes precisam ser um objeto");
    }
    await this.db.transaction([PROGRESS_STORES.meta], "readwrite", async (tx) => {
      const store = getStore(tx, PROGRESS_STORES.meta);
      await requestResult(store.put({ key: "settings", value: settings }));
    });
  }

  /**
   * Registra uma tentativa ainda aberta (rascunho de sessão). Não toca em
   * snapshot/agregados: nada foi submetido, nada foi medido.
   */
  async recordOpenAttempt(attemptInput: Attempt): Promise<Attempt> {
    const attempt = parseAttempt(attemptInput);
    if (attempt.submittedAt !== null) {
      throw new ProgressStoreError(
        "attempt_not_submitted",
        "use submitAttempt() para tentativas já submetidas",
      );
    }
    await this.db.transaction([PROGRESS_STORES.attempts], "readwrite", async (tx) => {
      const store = getStore(tx, PROGRESS_STORES.attempts);
      const existing = (await requestResult(store.get(attempt.attemptId))) as Attempt | undefined;
      if (existing !== undefined && existing.submittedAt !== null) {
        throw new ProgressStoreError("duplicate_attempt", attempt.attemptId);
      }
      // Rascunho já registrado (reload no meio da sessão) é atualizado, nunca
      // duplicado: o attemptId é a identidade da tentativa.
      await requestResult(store.put(attempt));
    });
    return attempt;
  }

  /**
   * Submete uma tentativa: grava snapshot + log + agregados + histórico numa
   * única transação. Se qualquer etapa falhar, nada é persistido.
   */
  async submitAttempt(
    attemptInput: Attempt,
    options: SubmitAttemptOptions = {},
  ): Promise<SubmitAttemptResult> {
    const attempt = parseAttempt(attemptInput);
    if (attempt.submittedAt === null) {
      throw new ProgressStoreError("attempt_not_submitted", attempt.attemptId);
    }
    const questionType = attempt.questionType ?? options.questionType;
    if (questionType === undefined) {
      throw new ProgressStoreError(
        "missing_question_type",
        `tentativa ${attempt.attemptId} sem questionType`,
      );
    }
    const reviewDay = options.reviewDay ?? localDayKeyOfTimestamp(attempt.submittedAt);
    if (reviewDay === null) {
      throw new ProgressStoreError(
        "attempt_not_submitted",
        `submittedAt inválido em ${attempt.attemptId}`,
      );
    }
    const policy = this.srsPolicy(questionType);
    const nowIso = this.nowIso();
    const today = localDayKey(new Date(nowIso));
    const persistedAttempt: Attempt =
      attempt.questionType === undefined ? { ...attempt, questionType } : attempt;
    const errorCategories = options.errorCategories ?? [];

    return this.db.transaction(
      [
        PROGRESS_STORES.snapshots,
        PROGRESS_STORES.attempts,
        PROGRESS_STORES.aggregates,
        PROGRESS_STORES.aggregateHistory,
      ],
      "readwrite",
      async (tx) => {
        const snapshotStore = getStore(tx, PROGRESS_STORES.snapshots);
        const attemptStore = getStore(tx, PROGRESS_STORES.attempts);

        const existing = (await requestResult(snapshotStore.get(attempt.questionId))) as
          QuestionSnapshot | undefined;
        if (existing !== undefined && existing.questionType !== questionType) {
          throw new ProgressStoreError(
            "question_type_mismatch",
            `${attempt.questionId}: snapshot é ${existing.questionType}, tentativa é ${questionType}`,
          );
        }
        const duplicate = (await requestResult(attemptStore.get(attempt.attemptId))) as
          Attempt | undefined;
        if (duplicate !== undefined && duplicate.submittedAt !== null) {
          // Reenvio da MESMA tentativa já fechada é erro; nunca sobrescreve
          // histórico (reexecução de avaliação é uma tentativa NOVA).
          throw new ProgressStoreError("duplicate_attempt", attempt.attemptId);
        }

        const score = attempt.result === undefined ? null : attemptScoreOf(attempt.result);
        const passed =
          attempt.result === undefined ? null : passedForScore(questionType, score, policy);

        const base =
          existing ??
          emptySnapshot({
            questionId: attempt.questionId,
            questionType,
            canonicalId: options.canonicalId ?? attempt.questionId,
            now: nowIso,
          });

        const srs = scheduleSrs(base, {
          type: questionType,
          today: reviewDay,
          passed,
          policy,
        });

        const errorCounts: QuestionSnapshot["errorCounts"] = { ...base.errorCounts };
        for (const category of errorCategories) {
          errorCounts[category] = (errorCounts[category] ?? 0) + 1;
        }

        const nextScore = score;
        const bestScore =
          nextScore === null ? base.bestScore : Math.max(base.bestScore ?? nextScore, nextScore);

        const nextSnapshot: QuestionSnapshot = {
          ...base,
          questionType,
          canonicalId: existing?.canonicalId ?? options.canonicalId ?? attempt.questionId,
          attempts: base.attempts + 1,
          scoredAttempts: base.scoredAttempts + (nextScore === null ? 0 : 1),
          lastScore: nextScore ?? base.lastScore,
          bestScore,
          lastSubmittedAt: attempt.submittedAt,
          srsBox: srs.srsBox,
          nextReviewDay: srs.nextReviewDay,
          lastReviewedDay: srs.lastReviewedDay,
          errorCounts,
          updatedAt: nowIso,
        };

        await requestResult(snapshotStore.put(nextSnapshot));
        await requestResult(attemptStore.put(persistedAttempt));

        const all = await this.readAllSnapshots(tx);
        const snapshots = all.map((snapshot) =>
          snapshot.questionId === nextSnapshot.questionId ? nextSnapshot : snapshot,
        );
        if (!snapshots.some((snapshot) => snapshot.questionId === nextSnapshot.questionId)) {
          snapshots.push(nextSnapshot);
        }

        const history = await this.readHistory(tx);
        const aggregates = this.derive(snapshots, {
          computedAt: nowIso,
          today,
          history,
          ...(this.skillWeights ? { skillWeights: this.skillWeights } : {}),
        });
        await this.putAggregatesAndHistory(tx, aggregates, today, false);

        const truncatedAttempts = this.autoTruncate
          ? await this.truncateInTx(tx, this.nowDate())
          : 0;

        return {
          attempt: persistedAttempt,
          snapshot: nextSnapshot,
          aggregates,
          srs,
          truncatedAttempts,
        };
      },
    );
  }

  /** Atualiza favorito/nota privada sem tocar em métricas. */
  async updateSnapshotMeta(
    questionId: string,
    patch: { favorite?: boolean; privateNote?: string | null },
  ): Promise<QuestionSnapshot> {
    const nowIso = this.nowIso();
    return this.db.transaction([PROGRESS_STORES.snapshots], "readwrite", async (tx) => {
      const store = getStore(tx, PROGRESS_STORES.snapshots);
      const existing = (await requestResult(store.get(questionId))) as QuestionSnapshot | undefined;
      if (existing === undefined) {
        throw new ProgressStoreError("snapshot_not_found", questionId);
      }
      const next: QuestionSnapshot = {
        ...existing,
        favorite: patch.favorite ?? existing.favorite,
        privateNote: patch.privateNote === undefined ? existing.privateNote : patch.privateNote,
        updatedAt: nowIso,
      };
      await requestResult(store.put(next));
      return next;
    });
  }

  /** Recalcula o cache de agregados a partir dos snapshots. */
  async recomputeAggregates(): Promise<Aggregates> {
    const nowIso = this.nowIso();
    const today = localDayKey(new Date(nowIso));
    return this.db.transaction(
      [PROGRESS_STORES.snapshots, PROGRESS_STORES.aggregates, PROGRESS_STORES.aggregateHistory],
      "readwrite",
      async (tx) => {
        const snapshots = await this.readAllSnapshots(tx);
        const history = await this.readHistory(tx);
        const aggregates = this.derive(snapshots, {
          computedAt: nowIso,
          today,
          history,
          ...(this.skillWeights ? { skillWeights: this.skillWeights } : {}),
        });
        await this.putAggregatesAndHistory(tx, aggregates, today, false);
        return aggregates;
      },
    );
  }

  /**
   * Trunca o log conforme a política. Retorna quantas tentativas submetidas
   * foram removidas. Snapshots/agregados não são tocados.
   */
  async truncateAttemptLog(now: Date = this.nowDate()): Promise<number> {
    return this.db.transaction([PROGRESS_STORES.attempts], "readwrite", (tx) =>
      this.truncateInTx(tx, now),
    );
  }

  private async truncateInTx(tx: IDBTransaction, now: Date): Promise<number> {
    const store = getStore(tx, PROGRESS_STORES.attempts);
    const all = (await requestResult(store.getAll())) as Attempt[];
    const open = all.filter((attempt) => attempt.submittedAt === null);
    const submitted = all.filter(
      (attempt): attempt is Attempt & { submittedAt: string } => attempt.submittedAt !== null,
    );

    const cutoffDay = addLocalDays(localDayKey(now), -this.truncation.retentionDays);
    const withinWindow = submitted.filter((attempt) => {
      const day = localDayKeyOfTimestamp(attempt.submittedAt);
      if (day === null) return false;
      return compareLocalDayKeys(day, cutoffDay) >= 0;
    });

    withinWindow.sort((a, b) => {
      const byTime = Date.parse(b.submittedAt) - Date.parse(a.submittedAt);
      return byTime !== 0 ? byTime : a.attemptId.localeCompare(b.attemptId);
    });
    const kept = withinWindow.slice(0, Math.max(0, this.truncation.maxAttempts));
    const keepIds = new Set<string>(open.map((attempt) => attempt.attemptId));
    for (const attempt of kept) keepIds.add(attempt.attemptId);

    let removed = 0;
    for (const attempt of all) {
      if (keepIds.has(attempt.attemptId)) continue;
      await requestResult(store.delete(attempt.attemptId));
      removed += 1;
    }
    return removed;
  }

  /* ------------------------ importar / desfazer ---------------------- */

  /**
   * Aplica um payload de backup já validado (`@/domain`), atomicamente.
   *
   * - `replace`: snapshots/agregados/ajustes passam a ser os do backup; o log
   *   continua append-only (tentativas existentes não são apagadas, apenas
   *   unidas por `attemptId`).
   * - `merge`: combina snapshots por `questionId` sem perder progresso (ver
   *   `mergeSnapshot`); ajustes do backup vencem as chaves que ele traz.
   * - O estado imediatamente anterior é gravado em `undo/last-import` na MESMA
   *   transação — desfazer nunca depende de memória do processo.
   */
  async importState(input: ImportStateInput): Promise<ImportStateResult> {
    const nowIso = input.computedAt ?? this.nowIso();
    const today = localDayKey(new Date(nowIso));
    const incomingSnapshots = input.snapshots.map((snapshot, index) =>
      parseSnapshot(snapshot, `import.snapshots[${index}]`),
    );
    const seen = new Set<string>();
    for (const snapshot of incomingSnapshots) {
      if (seen.has(snapshot.questionId)) {
        throw new ProgressStoreError(
          "invalid_import",
          `snapshot duplicado: ${snapshot.questionId}`,
        );
      }
      seen.add(snapshot.questionId);
    }
    const incomingAttempts = input.attemptsTail.map((attempt, index) =>
      parseAttempt(attempt, `import.attemptsTail[${index}]`),
    );
    if (!isRecord(input.settings)) {
      throw new ProgressStoreError("invalid_import", "settings precisa ser um objeto");
    }
    const saveUndo = input.saveUndo ?? true;

    return this.db.transaction(
      [
        PROGRESS_STORES.snapshots,
        PROGRESS_STORES.attempts,
        PROGRESS_STORES.aggregates,
        PROGRESS_STORES.aggregateHistory,
        PROGRESS_STORES.meta,
        PROGRESS_STORES.undo,
      ],
      "readwrite",
      async (tx) => {
        const snapshotStore = getStore(tx, PROGRESS_STORES.snapshots);
        const attemptStore = getStore(tx, PROGRESS_STORES.attempts);
        const aggregateStore = getStore(tx, PROGRESS_STORES.aggregates);
        const historyStore = getStore(tx, PROGRESS_STORES.aggregateHistory);
        const metaStore = getStore(tx, PROGRESS_STORES.meta);
        const undoStore = getStore(tx, PROGRESS_STORES.undo);

        const existingSnapshots = (await requestResult(
          snapshotStore.getAll(),
        )) as QuestionSnapshot[];
        const existingAttempts = (await requestResult(attemptStore.getAll())) as Attempt[];
        const existingHistory = (await requestResult(
          historyStore.getAll(),
        )) as AggregateHistoryPoint[];
        const existingAggregatesRow = (await requestResult(aggregateStore.get("current"))) as
          { id: string; value: Aggregates } | undefined;
        const existingSettingsRow = (await requestResult(metaStore.get("settings"))) as
          { key: string; value: unknown } | undefined;
        const rawSettings = existingSettingsRow?.value;
        const existingSettings: Record<string, unknown> = isRecord(rawSettings) ? rawSettings : {};

        let undoId: string | null = null;
        if (saveUndo) {
          const undo: UndoRecord = {
            id: UNDO_ID,
            createdAt: nowIso,
            snapshots: existingSnapshots,
            attempts: existingAttempts,
            settings: existingSettings,
            aggregates: existingAggregatesRow?.value ?? null,
            history: existingHistory,
          };
          await requestResult(undoStore.put(undo));
          undoId = UNDO_ID;
        }

        const mergedSnapshots =
          input.strategy === "replace"
            ? [...incomingSnapshots]
            : mergeSnapshotLists(existingSnapshots, incomingSnapshots);

        await requestResult(snapshotStore.clear());
        for (const snapshot of mergedSnapshots) {
          await requestResult(snapshotStore.put(snapshot));
        }

        // Log append-only: nunca apagamos tentativas existentes na importação.
        const existingAttemptIds = new Set(existingAttempts.map((attempt) => attempt.attemptId));
        for (const attempt of incomingAttempts) {
          if (existingAttemptIds.has(attempt.attemptId)) continue;
          await requestResult(attemptStore.put(attempt));
          existingAttemptIds.add(attempt.attemptId);
        }

        const settings =
          input.strategy === "replace"
            ? { ...input.settings }
            : { ...existingSettings, ...input.settings };
        await requestResult(metaStore.put({ key: "settings", value: settings }));

        const history = input.strategy === "replace" ? [] : existingHistory;
        const aggregates = this.derive(mergedSnapshots, {
          computedAt: nowIso,
          today,
          history,
          ...(this.skillWeights ? { skillWeights: this.skillWeights } : {}),
        });
        await this.putAggregatesAndHistory(tx, aggregates, today, input.strategy === "replace");

        if (this.autoTruncate) await this.truncateInTx(tx, new Date(nowIso));

        const attemptCount = (await requestResult(attemptStore.count())) as number;
        return {
          snapshots: mergedSnapshots,
          aggregates,
          snapshotCount: mergedSnapshots.length,
          attemptCount,
          undoId,
        };
      },
    );
  }

  /** Desfaz a última importação (se o slot de undo existir). */
  async undoLastImport(): Promise<UndoImportResult> {
    return this.db.transaction(
      [
        PROGRESS_STORES.snapshots,
        PROGRESS_STORES.attempts,
        PROGRESS_STORES.aggregates,
        PROGRESS_STORES.aggregateHistory,
        PROGRESS_STORES.meta,
        PROGRESS_STORES.undo,
      ],
      "readwrite",
      async (tx) => {
        const undoStore = getStore(tx, PROGRESS_STORES.undo);
        const record = (await requestResult(undoStore.get(UNDO_ID))) as UndoRecord | undefined;
        if (record === undefined) return { restored: false, reason: "no_undo" } as const;

        const snapshotStore = getStore(tx, PROGRESS_STORES.snapshots);
        const attemptStore = getStore(tx, PROGRESS_STORES.attempts);
        const aggregateStore = getStore(tx, PROGRESS_STORES.aggregates);
        const historyStore = getStore(tx, PROGRESS_STORES.aggregateHistory);
        const metaStore = getStore(tx, PROGRESS_STORES.meta);

        await requestResult(snapshotStore.clear());
        for (const snapshot of record.snapshots) {
          await requestResult(snapshotStore.put(snapshot));
        }
        await requestResult(attemptStore.clear());
        for (const attempt of record.attempts) {
          await requestResult(attemptStore.put(attempt));
        }
        await requestResult(aggregateStore.clear());
        if (record.aggregates !== null) {
          await requestResult(aggregateStore.put({ id: "current", value: record.aggregates }));
        }
        await requestResult(historyStore.clear());
        for (const point of record.history) {
          await requestResult(historyStore.put(point));
        }
        if (Object.keys(record.settings).length > 0) {
          await requestResult(metaStore.put({ key: "settings", value: record.settings }));
        } else {
          await requestResult(metaStore.delete("settings"));
        }
        await requestResult(undoStore.delete(UNDO_ID));

        return { restored: true, createdAt: record.createdAt } as const;
      },
    );
  }
}

/** Fábrica padrão (o app inteiro compartilha uma instância). */
export function createProgressStore(options: ProgressStoreOptions): ProgressStore {
  return new ProgressStore(options);
}

/* ------------------------------------------------------------------ */
/* Mesclagem de snapshots (sem perda de progresso)                    */
/* ------------------------------------------------------------------ */

function timeOrNull(iso: string | null): number | null {
  return timeOf(iso);
}

function laterIso(a: string | null, b: string | null): string | null {
  const at = timeOrNull(a);
  const bt = timeOrNull(b);
  if (at === null) return bt === null ? null : b;
  if (bt === null) return a;
  return bt >= at ? b : a;
}

function earlierIso(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

/**
 * Combina dois snapshots da mesma questão.
 *
 * Regras conservadoras (nunca perder progresso, nunca inflar métrica):
 * - contadores usam `max` (o mesmo envio pode estar nos dois backups);
 * - melhor nota é o máximo; última nota vem do envio mais recente;
 * - SRS fica com a MAIOR caixa (progresso) e a MENOR data de revisão (não
 *   atrasa revisão);
 * - erros por categoria usam `max` por categoria;
 * - favorito é OR; nota privada vem do snapshot mais recente que tiver uma;
 * - tipo divergente: mantém o snapshot existente (proteção contra colisão de id).
 */
export function mergeSnapshot(
  existing: QuestionSnapshot,
  incoming: QuestionSnapshot,
): QuestionSnapshot {
  if (existing.questionType !== incoming.questionType) return existing;

  const existingTime = timeOrNull(existing.lastSubmittedAt) ?? Number.NEGATIVE_INFINITY;
  const incomingTime = timeOrNull(incoming.lastSubmittedAt) ?? Number.NEGATIVE_INFINITY;
  const latest = incomingTime >= existingTime ? incoming : existing;
  const other = latest === incoming ? existing : incoming;

  const errorCounts: QuestionSnapshot["errorCounts"] = { ...existing.errorCounts };
  for (const [category, count] of Object.entries(incoming.errorCounts) as [
    ErrorCategory,
    number | undefined,
  ][]) {
    if (count === undefined) continue;
    errorCounts[category] = Math.max(errorCounts[category] ?? 0, count);
  }

  const bestCandidates = [existing.bestScore, incoming.bestScore].filter(
    (value): value is number => value !== null,
  );
  const bestScore = bestCandidates.length === 0 ? null : Math.max(...bestCandidates);

  const reviewDays = [existing.nextReviewDay, incoming.nextReviewDay].filter(
    (day): day is LocalDayKey => day !== null,
  );
  const nextReviewDay =
    reviewDays.length === 0
      ? null
      : reviewDays.reduce((earliest, day) =>
          compareLocalDayKeys(day, earliest) < 0 ? day : earliest,
        );
  const lastReviewedCandidates = [existing.lastReviewedDay, incoming.lastReviewedDay].filter(
    (day): day is LocalDayKey => day !== null,
  );
  const lastReviewedDay =
    lastReviewedCandidates.length === 0
      ? null
      : lastReviewedCandidates.reduce((latestDay, day) =>
          compareLocalDayKeys(day, latestDay) > 0 ? day : latestDay,
        );

  return {
    ...latest,
    canonicalId: latest.canonicalId,
    attempts: Math.max(existing.attempts, incoming.attempts),
    scoredAttempts: Math.max(existing.scoredAttempts, incoming.scoredAttempts),
    lastScore: latest.lastScore ?? other.lastScore,
    bestScore,
    lastSubmittedAt: laterIso(existing.lastSubmittedAt, incoming.lastSubmittedAt),
    srsBox: Math.max(existing.srsBox, incoming.srsBox),
    nextReviewDay,
    lastReviewedDay,
    errorCounts,
    favorite: existing.favorite || incoming.favorite,
    privateNote: latest.privateNote ?? other.privateNote,
    firstSeenAt: earlierIso(existing.firstSeenAt, incoming.firstSeenAt),
    updatedAt: laterIso(existing.updatedAt, incoming.updatedAt) ?? latest.updatedAt,
  };
}

/** Mescla listas por `questionId` (incoming sobre existing). */
export function mergeSnapshotLists(
  existing: readonly QuestionSnapshot[],
  incoming: readonly QuestionSnapshot[],
): QuestionSnapshot[] {
  const byId = new Map<string, QuestionSnapshot>();
  for (const snapshot of existing) byId.set(snapshot.questionId, snapshot);
  for (const snapshot of incoming) {
    const current = byId.get(snapshot.questionId);
    byId.set(
      snapshot.questionId,
      current === undefined ? snapshot : mergeSnapshot(current, snapshot),
    );
  }
  return [...byId.values()];
}
