import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createEnvelope } from "@/domain";
import { BackupIo } from "@/lib/app/backup-io";
import { PROGRESS_STORES, getStore, requestResult, type ProgressDatabase } from "@/lib/app/db";
import { openProgressLayer } from "@/lib/app/index";
import { ProgressStore } from "@/lib/app/storage";
import {
  abstainedEvaluation,
  clockAt,
  makeAttempt,
  makeDb,
  makeSnapshot,
  scoredEvaluation,
  uniqueDbName,
} from "./helpers";

const NOW = "2026-01-10T12:00:00";

function makeStore(db: ProgressDatabase): ProgressStore {
  return new ProgressStore({ db, now: clockAt(NOW), autoTruncate: false });
}

describe("Testes de perda (F3.7 / PRD §10)", () => {
  it("reload no meio da sessão preserva rascunho, snapshots e ajustes", async () => {
    const harness = await makeDb("loss-reload");
    try {
      const store = makeStore(harness.db);
      await store.setSettings({ goal: 65 });
      await store.submitAttempt(
        makeAttempt({ attemptId: "done-1", questionId: "q-done", result: scoredEvaluation(70) }),
        { questionType: "wfd", reviewDay: "2026-01-10" },
      );
      await store.recordOpenAttempt(
        makeAttempt({ attemptId: "draft-1", questionId: "q-open", submittedAt: null }),
      );

      const reopened = await harness.reopen();
      const store2 = makeStore(reopened);

      expect(await store2.getSettings()).toEqual({ goal: 65 });
      expect((await store2.getSnapshots()).map((row) => row.questionId)).toEqual(["q-done"]);
      expect((await store2.listOpenAttempts()).map((row) => row.attemptId)).toEqual(["draft-1"]);

      // Retomar e enviar a tentativa aberta funciona depois do reload.
      await store2.submitAttempt(
        makeAttempt({ attemptId: "draft-1", questionId: "q-open", result: scoredEvaluation(55) }),
        { questionType: "wfd", reviewDay: "2026-01-10" },
      );
      expect(await store2.listOpenAttempts()).toEqual([]);
      expect((await store2.getSnapshots()).length).toBe(2);
    } finally {
      await harness.close();
    }
  });

  it("crash no meio da submissão não deixa estado parcial (atomicidade)", async () => {
    const harness = await makeDb("loss-crash");
    try {
      const crashing = new ProgressStore({
        db: harness.db,
        now: clockAt(NOW),
        autoTruncate: false,
        derive: () => {
          throw new Error("crash simulado durante a agregação");
        },
      });
      await expect(
        crashing.submitAttempt(
          makeAttempt({ questionId: "q-crash", result: scoredEvaluation(80) }),
          { questionType: "wfd", reviewDay: "2026-01-10" },
        ),
      ).rejects.toThrow("crash simulado");

      const clean = makeStore(harness.db);
      expect(await clean.getSnapshots()).toEqual([]);
      expect(await clean.getAttemptLog()).toEqual([]);
      expect(await clean.getHistory()).toEqual([]);
      const aggregates = await clean.getAggregates();
      expect(aggregates.totalAttempts).toBe(0);
      expect(aggregates.totalQuestions).toBe(0);
    } finally {
      await harness.close();
    }
  });

  it("registro inválido no log truncável não derruba snapshots nem agregados", async () => {
    const harness = await makeDb("loss-corrupt-log");
    try {
      const store = makeStore(harness.db);
      await store.submitAttempt(makeAttempt({ questionId: "q1", result: scoredEvaluation(75) }), {
        questionType: "wfd",
        reviewDay: "2026-01-10",
      });
      // Corrupção externa plausível: escrita manual com formato antigo/quebrado.
      await harness.db.transaction([PROGRESS_STORES.attempts], "readwrite", async (tx) => {
        await requestResult(
          getStore(tx, PROGRESS_STORES.attempts).put({ attemptId: "legacy", foo: "bar" }),
        );
      });

      // Métricas vêm dos snapshots/cache — não do log.
      expect((await store.getSnapshots()).length).toBe(1);
      const aggregates = await store.getAggregates();
      expect(aggregates.totalAttempts).toBe(1);
      expect(aggregates.byType.wfd?.attempts).toBe(1);

      // Exportar a cauda tolera o registro quebrado (ordena por id como fallback).
      const backup = new BackupIo({ store, now: clockAt(NOW) });
      const envelope = await backup.exportEnvelope({ attemptLimit: 10 });
      // O registro ilegível é descartado do arquivo; o backup nunca falha por
      // causa do log truncável e os snapshots seguem íntegros.
      expect(envelope.payload.attemptsTail).toHaveLength(1);
      expect(envelope.payload.attemptsTail[0]?.attemptId).not.toBe("legacy");
      expect(envelope.payload.snapshots).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it("importar o mesmo backup duas vezes não duplica snapshots nem tentativas", async () => {
    const harness = await makeDb("loss-double-import");
    try {
      const store = makeStore(harness.db);
      const backup = new BackupIo({ store, now: clockAt(NOW) });
      await store.submitAttempt(
        makeAttempt({ attemptId: "a1", questionId: "q1", result: scoredEvaluation(60) }),
        { questionType: "wfd", reviewDay: "2026-01-10" },
      );
      const incoming = createEnvelope({
        snapshots: [
          makeSnapshot({
            questionId: "q1",
            attempts: 2,
            scoredAttempts: 2,
            bestScore: 90,
            lastScore: 90,
          }),
        ],
        attemptsTail: [
          makeAttempt({ attemptId: "a2", questionId: "q1", result: scoredEvaluation(90) }),
        ],
        settings: { goal: 65 },
      });

      const first = await backup.import(incoming, { strategy: "merge" });
      const second = await backup.import(incoming, { strategy: "merge" });
      expect(first.status).toBe("imported");
      expect(second.status).toBe("imported");

      const snapshots = await store.getSnapshots();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]?.attempts).toBe(2);
      expect(snapshots[0]?.bestScore).toBe(90);
      const log = await store.getAttemptLog();
      expect(log.map((attempt) => attempt.attemptId).sort()).toEqual(["a1", "a2"]);
    } finally {
      await harness.close();
    }
  });

  it("backup inválido não sobrescreve nada e fica em quarentena legível", async () => {
    const harness = await makeDb("loss-quarantine");
    try {
      const store = makeStore(harness.db);
      const backup = new BackupIo({ store, now: clockAt(NOW) });
      await store.submitAttempt(makeAttempt({ questionId: "q1", result: scoredEvaluation(75) }), {
        questionType: "wfd",
        reviewDay: "2026-01-10",
      });
      await store.setSettings({ goal: 79 });
      const before = {
        snapshots: await store.getSnapshots(),
        settings: await store.getSettings(),
        log: await store.getAttemptLog(),
      };

      const result = await backup.import('{"format":"pte-master-hub-backup","version":2}', {
        strategy: "replace",
      });
      expect(result.status).toBe("quarantined");

      expect(await store.getSnapshots()).toEqual(before.snapshots);
      expect(await store.getSettings()).toEqual(before.settings);
      expect(await store.getAttemptLog()).toEqual(before.log);
      const records = await backup.exportQuarantine();
      expect(records).toHaveLength(1);
      expect(records[0]?.payload).toContain('"version":2');
    } finally {
      await harness.close();
    }
  });

  it("truncar todo o log e recarregar mantém a métrica derivada dos snapshots", async () => {
    const harness = await makeDb("loss-truncate-reload");
    try {
      const store = makeStore(harness.db);
      const truncating = new ProgressStore({
        db: harness.db,
        now: clockAt(NOW),
        autoTruncate: false,
        truncation: { maxAttempts: 0, retentionDays: 3650 },
      });
      for (let i = 0; i < 4; i += 1) {
        await store.submitAttempt(
          makeAttempt({
            attemptId: `x-${i}`,
            questionId: `q-${i}`,
            result: scoredEvaluation(60 + i),
          }),
          { questionType: "read_mcq_single", reviewDay: "2026-01-10" },
        );
      }
      expect(await truncating.truncateAttemptLog(new Date(NOW))).toBe(4);

      const reopened = await harness.reopen();
      const after = makeStore(reopened);
      expect(await after.getAttemptLog()).toEqual([]);
      const aggregates = await after.getAggregates();
      expect(aggregates.totalAttempts).toBe(4);
      expect(aggregates.totalQuestions).toBe(4);
      expect((await after.getSnapshots()).length).toBe(4);
    } finally {
      await harness.close();
    }
  });

  it("openProgressLayer compartilha a conexão entre store, backup e mídia", async () => {
    const factory = new IDBFactory();
    const name = uniqueDbName("layer");
    const layer = await openProgressLayer({
      dbName: name,
      indexedDB: factory,
      now: clockAt(NOW),
      autoTruncate: false,
      quotaEstimator: async () => null,
    });
    try {
      await layer.store.submitAttempt(
        makeAttempt({ questionId: "q1", result: scoredEvaluation(65) }),
        { questionType: "wfd", reviewDay: "2026-01-10" },
      );
      const envelope = await layer.backup.exportEnvelope();
      expect(envelope.payload.snapshots).toHaveLength(1);
      const saved = await layer.media.saveRecording({
        blob: new Uint8Array([1, 2]).buffer,
        questionId: "q1",
      });
      expect(saved.ok).toBe(true);
      expect(layer.db).toBe(layer.store.db);
    } finally {
      layer.close();
    }
  });

  it("abstenção não cria nota nem revisão (nada medido, nada agendado)", async () => {
    const harness = await makeDb("loss-abstention");
    try {
      const store = makeStore(harness.db);
      const result = await store.submitAttempt(
        makeAttempt({ questionId: "q-abstain", result: abstainedEvaluation() }),
        { questionType: "read_aloud", reviewDay: "2026-01-10" },
      );
      expect(result.snapshot.lastScore).toBeNull();
      expect(result.snapshot.bestScore).toBeNull();
      expect(result.snapshot.nextReviewDay).toBeNull();
      expect(result.srs.changed).toBe(false);
      expect(result.aggregates.overall.lastScore).toBeNull();
    } finally {
      await harness.close();
    }
  });
});
