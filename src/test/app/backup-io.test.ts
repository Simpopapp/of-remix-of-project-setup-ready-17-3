import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  CURRENT_BACKUP_VERSION,
  createEnvelope,
  type Attempt,
  type QuestionSnapshot,
} from "@/domain";
import { BackupIo } from "@/lib/app/backup-io";
import { ProgressStore } from "@/lib/app/storage";
import { clockAt, makeAttempt, makeDb, makeSnapshot, scoredEvaluation } from "./helpers";

const NOW = "2026-01-10T12:00:00";

async function makeLayer(label: string): Promise<{
  harness: Awaited<ReturnType<typeof makeDb>>;
  store: ProgressStore;
  backup: BackupIo;
}> {
  const harness = await makeDb(label);
  const store = new ProgressStore({
    db: harness.db,
    now: clockAt(NOW),
    autoTruncate: false,
  });
  const backup = new BackupIo({ store, now: clockAt(NOW), device: "test-device" });
  return { harness, store, backup };
}

function v1Envelope(
  snapshots: QuestionSnapshot[],
  attemptsTail: Attempt[] = [],
  settings: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    payload: { snapshots, attemptsTail, settings },
  };
}

async function seed(store: ProgressStore): Promise<void> {
  await store.submitAttempt(
    makeAttempt({ attemptId: "a-q1", questionId: "q1", result: scoredEvaluation(60) }),
    { questionType: "wfd", reviewDay: "2026-01-10" },
  );
  await store.submitAttempt(
    makeAttempt({
      attemptId: "a-q2",
      questionId: "q2",
      questionType: "read_mcq_single",
      result: scoredEvaluation(70),
    }),
    { questionType: "read_mcq_single", reviewDay: "2026-01-10" },
  );
  await store.setSettings({ goal: 65, examDate: "2026-06-01" });
}

describe("Backup: exportação (F3.5)", () => {
  it("exporta envelope corrente legível com snapshots, log e ajustes", async () => {
    const { harness, store, backup } = await makeLayer("export");
    try {
      await seed(store);
      const text = await backup.exportJson();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      expect(parsed["format"]).toBe(BACKUP_FORMAT);
      expect(parsed["version"]).toBe(CURRENT_BACKUP_VERSION);
      expect(parsed["device"]).toBe("test-device");
      const payload = parsed["payload"] as {
        snapshots: unknown[];
        attemptsTail: unknown[];
        settings: Record<string, unknown>;
        aggregates: unknown;
      };
      expect(payload.snapshots).toHaveLength(2);
      expect(payload.attemptsTail).toHaveLength(2);
      expect(payload.settings).toEqual({ goal: 65, examDate: "2026-06-01" });
      expect(payload.aggregates).not.toBeNull();
    } finally {
      await harness.close();
    }
  });

  it("limite 0 exporta sem log (backup sem log continua válido)", async () => {
    const { harness, store, backup } = await makeLayer("export-nolog");
    try {
      await seed(store);
      const envelope = await backup.exportEnvelope({ attemptLimit: 0 });
      expect(envelope.payload.attemptsTail).toEqual([]);
      expect(envelope.payload.snapshots).toHaveLength(2);
    } finally {
      await harness.close();
    }
  });
});

describe("Backup: prévia sem escrita", () => {
  it("conta novas, compartilhadas, melhoradas e conflitos de tipo", async () => {
    const { harness, store, backup } = await makeLayer("preview");
    try {
      await seed(store);
      const incoming = createEnvelope({
        snapshots: [
          makeSnapshot({ questionId: "q1", bestScore: 90, lastScore: 90 }),
          makeSnapshot({ questionId: "q3", bestScore: 50, lastScore: 50 }),
          // colisão de id com tipo diferente: mantém o snapshot local
          makeSnapshot({ questionId: "q2", questionType: "wfd", bestScore: 99 }),
        ],
        attemptsTail: [],
        settings: { goal: 79 },
      });
      const preview = await backup.inspect(incoming);
      if (!preview.ok) throw new Error(preview.detail);
      expect(preview.snapshotCount).toBe(3);
      expect(preview.sharedQuestionCount).toBe(2);
      expect(preview.newQuestionCount).toBe(1);
      expect(preview.improvedBestScoreCount).toBe(1);
      expect(preview.typeConflictCount).toBe(1);
      expect(preview.settingsKeys).toEqual(["goal"]);
      // Nada foi escrito
      expect(await store.getSnapshots()).toHaveLength(2);
    } finally {
      await harness.close();
    }
  });

  it("JSON ilegível devolve erro estruturado (não lança)", async () => {
    const { harness, backup } = await makeLayer("preview-badjson");
    try {
      const preview = await backup.inspect("{ não é json");
      expect(preview.ok).toBe(false);
      if (preview.ok) throw new Error("deveria falhar");
      expect(preview.reason).toBe("unreadable_json");
      expect(preview.path).toBeNull();
    } finally {
      await harness.close();
    }
  });
});

describe("Backup: importação", () => {
  it("mesclar preserva progresso local e combina snapshots", async () => {
    const { harness, store, backup } = await makeLayer("merge");
    try {
      await seed(store);
      const incoming = createEnvelope({
        snapshots: [
          makeSnapshot({
            questionId: "q1",
            attempts: 3,
            scoredAttempts: 3,
            bestScore: 85,
            lastScore: 85,
            favorite: true,
          }),
          makeSnapshot({ questionId: "q9", bestScore: 40, lastScore: 40 }),
        ],
        attemptsTail: [
          makeAttempt({ attemptId: "incoming-a", questionId: "q9", result: scoredEvaluation(40) }),
        ],
        settings: { goal: 79 },
      });
      const result = await backup.import(incoming, { strategy: "merge" });
      if (result.status !== "imported") throw new Error(result.record.detail);

      const snapshots = await store.getSnapshots();
      expect(snapshots).toHaveLength(3);
      const q1 = snapshots.find((snapshot) => snapshot.questionId === "q1");
      expect(q1?.attempts).toBe(3);
      expect(q1?.bestScore).toBe(85);
      expect(q1?.favorite).toBe(true);
      expect(snapshots.some((snapshot) => snapshot.questionId === "q9")).toBe(true);
      expect(await store.getSettings()).toEqual({
        goal: 79,
        examDate: "2026-06-01",
      });
      expect(
        (await store.getAttemptLog()).some((attempt) => attempt.attemptId === "incoming-a"),
      ).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it("substituir troca snapshots/ajustes mas nunca apaga o log local", async () => {
    const { harness, store, backup } = await makeLayer("replace");
    try {
      await seed(store);
      const incoming = createEnvelope({
        snapshots: [makeSnapshot({ questionId: "q1", bestScore: 95, lastScore: 95 })],
        attemptsTail: [],
        settings: { goal: 50 },
      });
      const result = await backup.import(incoming, { strategy: "replace" });
      if (result.status !== "imported") throw new Error(result.record.detail);

      const snapshots = await store.getSnapshots();
      expect(snapshots.map((snapshot) => snapshot.questionId)).toEqual(["q1"]);
      expect(await store.getSettings()).toEqual({ goal: 50 });
      // log append-only: tentativas locais continuam
      expect(await store.getAttemptLog()).toHaveLength(2);
    } finally {
      await harness.close();
    }
  });

  it("desfazer restaura o estado anterior à importação", async () => {
    const { harness, store, backup } = await makeLayer("undo");
    try {
      await seed(store);
      const before = await store.getSnapshots();
      const incoming = createEnvelope({
        snapshots: [makeSnapshot({ questionId: "q1", bestScore: 95, lastScore: 95 })],
        attemptsTail: [],
        settings: { goal: 50 },
      });
      const imported = await backup.import(incoming, { strategy: "replace" });
      if (imported.status !== "imported") throw new Error(imported.record.detail);
      expect(await store.getSnapshots()).toHaveLength(1);

      const undone = await backup.undo();
      expect(undone.restored).toBe(true);
      expect(await store.getSnapshots()).toHaveLength(before.length);
      expect(await store.getSettings()).toEqual({ goal: 65, examDate: "2026-06-01" });

      const again = await backup.undo();
      expect(again).toEqual({ restored: false, reason: "no_undo" });
    } finally {
      await harness.close();
    }
  });

  it("envelope v1 é migrado de forma aditiva (aggregates default null)", async () => {
    const { harness, store, backup } = await makeLayer("v1");
    try {
      const snapshot = makeSnapshot({ questionId: "q-v1", bestScore: 70 });
      const raw = v1Envelope([snapshot], [], { goal: 58, custom: { a: 1 } });
      const preview = await backup.inspect(raw);
      if (!preview.ok) throw new Error(preview.detail);
      expect(preview.version).toBe(1);
      expect(preview.migrated).toBe(true);

      const result = await backup.import(raw, { strategy: "merge" });
      if (result.status !== "imported") throw new Error(result.record.detail);
      expect((await store.getSnapshots()).map((row) => row.questionId)).toEqual(["q-v1"]);
      expect(await store.getSettings()).toEqual({ goal: 58, custom: { a: 1 } });
    } finally {
      await harness.close();
    }
  });
});

describe("Backup: quarentena somente leitura", () => {
  it("payload corrompido vai para quarentena e não altera o estado", async () => {
    const { harness, store, backup } = await makeLayer("quarantine-corrupt");
    try {
      await seed(store);
      const before = await store.getSnapshots();
      const raw = {
        format: BACKUP_FORMAT,
        version: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
        payload: {
          snapshots: [{ ...makeSnapshot(), attempts: -1 }],
          attemptsTail: [],
          settings: {},
          aggregates: null,
        },
      };
      const result = await backup.import(raw, { strategy: "merge" });
      expect(result.status).toBe("quarantined");
      if (result.status !== "quarantined") throw new Error("deveria ir para quarentena");
      expect(result.record.reason).toBe("corrupt_payload");

      expect(await store.getSnapshots()).toEqual(before);
      const list = await backup.listQuarantine();
      expect(list).toHaveLength(1);
      const full = await backup.readQuarantine(list[0]!.id);
      expect(full?.payload).toContain("snapshots");
      expect(full?.size).toBeGreaterThan(0);
    } finally {
      await harness.close();
    }
  });

  it("versão futura nunca é migrada: quarentena marcada future", async () => {
    const { harness, store, backup } = await makeLayer("quarantine-future");
    try {
      const raw = {
        format: BACKUP_FORMAT,
        version: CURRENT_BACKUP_VERSION + 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        payload: { snapshots: [], attemptsTail: [], settings: {} },
      };
      const result = await backup.import(JSON.stringify(raw), { strategy: "merge" });
      expect(result.status).toBe("quarantined");
      if (result.status !== "quarantined") throw new Error("deveria ir para quarentena");
      expect(result.record.future).toBe(true);
      expect(await store.getSnapshots()).toEqual([]);
      const list = await backup.listQuarantine();
      expect(list[0]?.future).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it("duas importações inválidas no mesmo instante geram registros distintos (nunca sobrescreve)", async () => {
    const { harness, backup } = await makeLayer("quarantine-add");
    try {
      const first = await backup.import("lixo-1", { strategy: "merge" });
      const second = await backup.import("lixo-2", { strategy: "merge" });
      expect(first.status).toBe("quarantined");
      expect(second.status).toBe("quarantined");
      if (first.status !== "quarantined" || second.status !== "quarantined") {
        throw new Error("deveria ir para quarentena");
      }
      expect(first.record.id).not.toBe(second.record.id);
      const list = await backup.listQuarantine();
      expect(list).toHaveLength(2);
      const payloads = await Promise.all(
        list.map(async (row) => (await backup.readQuarantine(row.id))?.payload),
      );
      expect(payloads.sort()).toEqual(["lixo-1", "lixo-2"]);
    } finally {
      await harness.close();
    }
  });
});
