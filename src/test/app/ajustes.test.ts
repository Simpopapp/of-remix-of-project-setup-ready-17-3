/**
 * Testes da tela/pilha de Ajustes (Fase 4 — s4).
 *
 * Cobertura exigida pelo pacote:
 * - `buildSettingsPatch`: um formulário escreve só a sua seção (merge profundo
 *   preserva as demais), normaliza data e velocidade;
 * - máquina de estados da importação: arquivo → prévia → (mesclar|substituir) →
 *   desfazer; inválido → quarentena SEM `importState` no estado local;
 * - integração real com `BackupIo` + `fake-indexeddb`: exportar → inspecionar →
 *   mesclar → desfazer, e corrupção não apaga nada;
 * - `Studie Plus` desligado por padrão e de volta ao desligar via defaults.
 *
 * O arquivo é `.ts` de propósito: nada aqui renderiza JSX. A tela é fina e a
 * lógica testável mora nos módulos puros de `src/components/settings/`.
 */

import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";

import {
  applyBackupImport,
  describeInspection,
  inspectBackupFile,
  inspectionHighlights,
  undoBackupImport,
  type BackupService,
} from "@/components/settings/import-flow";
import {
  backupFileName,
  formatBytes,
  formatDayKey,
  formatPercent,
  levelFromEstimate,
} from "@/components/settings/format";
import {
  buildSettingsPatch,
  defaultsPatch,
  isStudiePlusActive,
  normalizeExamDateInput,
} from "@/components/settings/settings-patch";
import { emptyAggregates } from "@/domain";
import { openProgressLayer, type ProgressLayer } from "@/lib/app";
import type { BackupInspection, BackupPreview, QuarantineSummary } from "@/lib/app/backup-io";
import {
  DEFAULT_SETTINGS,
  applySettingsPatch,
  normalizeAppSettings,
  type AppSettings,
} from "@/lib/app/settings";

import { clockAt, makeAttempt, scoredEvaluation, uniqueDbName } from "./helpers";

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

function previewFixture(overrides: Partial<BackupPreview> = {}): BackupPreview {
  return {
    ok: true,
    version: 2,
    currentVersion: 2,
    migrated: false,
    createdAt: "2026-10-01T10:00:00.000Z",
    device: "dispositivo de teste",
    snapshotCount: 3,
    attemptCount: 2,
    scoredSnapshotCount: 2,
    settingsKeys: ["meta", "studiePlus"],
    newQuestionCount: 2,
    sharedQuestionCount: 1,
    improvedBestScoreCount: 0,
    typeConflictCount: 0,
    ...overrides,
  };
}

const quarantineFixture: QuarantineSummary = {
  id: "q-1760000000000-1-abc",
  createdAt: "2026-10-05T10:00:00.000Z",
  reason: "unreadable_json",
  detail: "JSON inválido",
  future: false,
  size: 42,
};

type ImportOutcome = Awaited<ReturnType<BackupService["import"]>>;

function importedOutcome(undoId: string | null): ImportOutcome {
  return {
    status: "imported",
    preview: previewFixture(),
    result: {
      snapshots: [],
      aggregates: emptyAggregates("2026-10-05T10:00:00.000Z"),
      snapshotCount: 4,
      attemptCount: 2,
      undoId,
    },
  };
}

interface FakeService {
  service: BackupService;
  inspect: ReturnType<typeof vi.fn>;
  import: ReturnType<typeof vi.fn>;
  undo: ReturnType<typeof vi.fn>;
}

function fakeService(
  overrides: {
    inspection?: BackupInspection;
    outcome?: ImportOutcome;
    undoResult?: Awaited<ReturnType<BackupService["undo"]>>;
  } = {},
): FakeService {
  const inspection = overrides.inspection ?? previewFixture();
  const outcome = overrides.outcome ?? importedOutcome("undo-1");
  const undoResult = overrides.undoResult ?? {
    restored: true,
    createdAt: "2026-10-05T09:00:00.000Z",
  };

  const inspect = vi.fn(async (_raw: unknown): Promise<BackupInspection> => inspection);
  const importFn = vi.fn(
    async (
      _raw: unknown,
      _options: { strategy: "merge" | "replace"; saveUndo?: boolean },
    ): Promise<ImportOutcome> => outcome,
  );
  const undoFn = vi.fn(async (): Promise<Awaited<ReturnType<BackupService["undo"]>>> => undoResult);

  return {
    service: { inspect, import: importFn, undo: undoFn },
    inspect,
    import: importFn,
    undo: undoFn,
  };
}

async function openedLayer(label: string, iso: string): Promise<ProgressLayer> {
  return openProgressLayer({
    dbName: uniqueDbName(label),
    indexedDB: new IDBFactory(),
    now: clockAt(iso),
  });
}

/* ------------------------------------------------------------------ */
/* Patch de ajustes                                                   */
/* ------------------------------------------------------------------ */

describe("buildSettingsPatch", () => {
  const current: AppSettings = normalizeAppSettings({
    ...DEFAULT_SETTINGS,
    meta: { targetScore: 79, examDate: "2026-11-20" },
    tts: { enabled: true, voiceUri: "voz-salva", rate: 1.5 },
    studiePlus: {
      enabled: true,
      word: true,
      sentence: true,
      pronunciation: true,
      mode: "offline",
    },
  });

  it("escreve apenas a seção do formulário e preserva as outras", () => {
    const patch = buildSettingsPatch({
      meta: { targetScore: 65, examDate: "2026-12-01" },
    });

    expect(Object.keys(patch)).toEqual(["meta"]);
    expect(patch.tts).toBeUndefined();
    expect(patch.practice).toBeUndefined();
    expect(patch.studiePlus).toBeUndefined();

    const next = applySettingsPatch(current, patch);
    expect(next.meta).toEqual({ targetScore: 65, examDate: "2026-12-01" });
    expect(next.tts).toEqual(current.tts);
    expect(next.practice).toEqual(current.practice);
    expect(next.studiePlus).toEqual(current.studiePlus);
  });

  it("normaliza velocidade para 0,5–2 e voz em branco para automática", () => {
    const patch = buildSettingsPatch({
      tts: { enabled: true, voiceUri: "   ", rate: 9 },
    });
    expect(patch.tts).toEqual({ enabled: true, voiceUri: null, rate: 2 });

    const slow = buildSettingsPatch({
      tts: { enabled: false, voiceUri: "  voz  ", rate: 0.1 },
    });
    expect(slow.tts).toEqual({ enabled: false, voiceUri: "voz", rate: 0.5 });
  });

  it("aceita data local válida e transforma entrada inválida em 'sem data'", () => {
    expect(normalizeExamDateInput("2026-12-01")).toBe("2026-12-01");
    expect(normalizeExamDateInput("")).toBeNull();
    expect(normalizeExamDateInput(null)).toBeNull();
    expect(normalizeExamDateInput("2026-02-31")).toBeNull();
    expect(normalizeExamDateInput("01/12/2026")).toBeNull();
  });

  it("volta aos padrões do produto com o Studie Plus desligado", () => {
    const reset = applySettingsPatch(current, defaultsPatch());

    expect(reset.meta).toEqual(DEFAULT_SETTINGS.meta);
    expect(reset.practice).toEqual(DEFAULT_SETTINGS.practice);
    expect(reset.tts).toEqual(DEFAULT_SETTINGS.tts);
    expect(reset.studiePlus).toEqual(DEFAULT_SETTINGS.studiePlus);
    expect(reset.studiePlus.enabled).toBe(false);
    expect(isStudiePlusActive(reset)).toBe(false);
  });

  it("o pack nasce desligado quando não há nada gravado", () => {
    const fresh = normalizeAppSettings(null);
    expect(fresh.studiePlus.enabled).toBe(false);
    expect(fresh.studiePlus.word).toBe(false);
    expect(fresh.studiePlus.sentence).toBe(false);
    expect(fresh.studiePlus.pronunciation).toBe(false);
    expect(isStudiePlusActive(fresh)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Máquina de estados da importação                                   */
/* ------------------------------------------------------------------ */

describe("máquina de estados da importação", () => {
  const file = { fileName: "backup.json", size: 120, raw: '{"qualquer":"coisa"}' };

  it("arquivo válido gera prévia e NÃO aplica nada", async () => {
    const fake = fakeService();
    const state = await inspectBackupFile(fake.service, file);

    expect(state.phase).toBe("preview");
    expect(fake.inspect).toHaveBeenCalledTimes(1);
    expect(fake.import).not.toHaveBeenCalled();
    if (state.phase === "preview") {
      expect(state.fileName).toBe("backup.json");
      expect(state.preview.snapshotCount).toBe(3);
      expect(state.raw).toBe(file.raw);
    }
  });

  it("arquivo inválido vai para a quarentena sem importar estado", async () => {
    const fake = fakeService({
      inspection: {
        ok: false,
        reason: "future_version",
        detail: "versão 999",
        path: "version",
        future: true,
      },
      outcome: { status: "quarantined", record: quarantineFixture },
    });

    const state = await inspectBackupFile(fake.service, file);

    expect(state.phase).toBe("quarantined");
    // A única chamada de `import` é a que grava o cru na quarentena, sem undo.
    expect(fake.import).toHaveBeenCalledTimes(1);
    expect(fake.import).toHaveBeenCalledWith(file.raw, { strategy: "merge", saveUndo: false });
    if (state.phase === "quarantined") {
      expect(state.record.id).toBe(quarantineFixture.id);
    }
  });

  it("arquivo vazio falha sem tocar no serviço", async () => {
    const fake = fakeService();
    const state = await inspectBackupFile(fake.service, { ...file, raw: "   \n " });

    expect(state.phase).toBe("failed");
    expect(fake.inspect).not.toHaveBeenCalled();
    expect(fake.import).not.toHaveBeenCalled();
  });

  it("não importa sem uma prévia válida", async () => {
    const fake = fakeService();
    const state = await applyBackupImport(fake.service, { phase: "empty" }, "merge");

    expect(state.phase).toBe("failed");
    expect(fake.import).not.toHaveBeenCalled();
  });

  it("mescla a partir da prévia e expõe desfazer quando o store confirma o slot", async () => {
    const fake = fakeService();
    const preview = await inspectBackupFile(fake.service, file);
    const merged = await applyBackupImport(fake.service, preview, "merge");

    expect(merged.phase).toBe("imported");
    expect(fake.import).toHaveBeenCalledWith(file.raw, { strategy: "merge", saveUndo: true });
    if (merged.phase === "imported") {
      expect(merged.strategy).toBe("merge");
      expect(merged.snapshotCount).toBe(4);
      expect(merged.attemptCount).toBe(2);
      expect(merged.undoAvailable).toBe(true);
    }
  });

  it("informa quando não existe slot de desfazer", async () => {
    const fake = fakeService({ outcome: importedOutcome(null) });
    const preview = await inspectBackupFile(fake.service, file);
    const replaced = await applyBackupImport(fake.service, preview, "replace");

    expect(replaced.phase).toBe("imported");
    if (replaced.phase === "imported") {
      expect(replaced.undoAvailable).toBe(false);
      expect(replaced.strategy).toBe("replace");
    }
  });

  it("desfaz a importação e explica quando não há o que desfazer", async () => {
    const ok = await undoBackupImport(fakeService().service);
    expect(ok.phase).toBe("undone");
    if (ok.phase === "undone") expect(ok.createdAt).toBe("2026-10-05T09:00:00.000Z");

    const none = await undoBackupImport(
      fakeService({ undoResult: { restored: false, reason: "no_undo" } }).service,
    );
    expect(none.phase).toBe("failed");
    if (none.phase === "failed") expect(none.message).toContain("Não há importação recente");
  });

  it("falha do serviço vira mensagem honesta, nunca sucesso", async () => {
    const explode = vi.fn(async (): Promise<BackupInspection> => {
      throw new Error("IndexedDB indisponível");
    });
    const state = await inspectBackupFile(
      { inspect: explode, import: vi.fn(), undo: vi.fn() } as unknown as BackupService,
      file,
    );

    expect(state.phase).toBe("failed");
    if (state.phase === "failed") {
      expect(state.message).toContain("IndexedDB indisponível");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Integração real: BackupIo + IndexedDB                              */
/* ------------------------------------------------------------------ */

describe("backup real (BackupIo + fake-indexeddb)", () => {
  it("exporta, mostra prévia, mescla preservando o local e desfaz", async () => {
    const source = await openedLayer("ajustes-origem", "2026-10-01T10:00:00.000Z");
    await source.store.setSettings({
      meta: { targetScore: 65, examDate: "2026-12-01" },
      studiePlus: { enabled: true, word: true, sentence: false, pronunciation: false, mode: "ai" },
    });
    await source.store.submitAttempt(
      makeAttempt({
        attemptId: "a-origem",
        questionId: "q-wfd-1",
        result: scoredEvaluation(72),
      }),
    );
    const json = await source.backup.exportJson();
    source.close();

    const target = await openedLayer("ajustes-destino", "2026-10-05T10:00:00.000Z");
    await target.store.submitAttempt(
      makeAttempt({
        attemptId: "a-destino",
        questionId: "q-other",
        result: scoredEvaluation(50),
      }),
    );

    const inspection = await target.backup.inspect(json);
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) throw new Error("backup exportado deveria ser válido");
    expect(inspection.snapshotCount).toBe(1);
    expect(inspection.newQuestionCount).toBe(1);

    const flow = await inspectBackupFile(target.backup, {
      fileName: "backup.json",
      size: json.length,
      raw: json,
    });
    expect(flow.phase).toBe("preview");

    const imported = await applyBackupImport(target.backup, flow, "merge");
    expect(imported.phase).toBe("imported");
    if (imported.phase !== "imported") throw new Error("importação deveria concluir");
    expect(imported.snapshotCount).toBe(2);
    expect(imported.undoAvailable).toBe(true);

    const mergedSnapshots = await target.store.getSnapshots();
    expect(mergedSnapshots.map((snapshot) => snapshot.questionId).sort()).toEqual([
      "q-other",
      "q-wfd-1",
    ]);

    const stored = await target.store.getSettings();
    expect((stored["meta"] as { targetScore?: number } | undefined)?.targetScore).toBe(65);

    const undone = await undoBackupImport(target.backup);
    expect(undone.phase).toBe("undone");

    const restored = await target.store.getSnapshots();
    expect(restored.map((snapshot) => snapshot.questionId)).toEqual(["q-other"]);
    target.close();
  });

  it("JSON ilegível vai para a quarentena e não altera o progresso", async () => {
    const layer = await openedLayer("ajustes-corrompido", "2026-10-05T10:00:00.000Z");
    await layer.store.submitAttempt(
      makeAttempt({ attemptId: "a-1", questionId: "q-1", result: scoredEvaluation(80) }),
    );
    const before = await layer.store.getSnapshots();

    const state = await inspectBackupFile(layer.backup, {
      fileName: "quebrado.json",
      size: 9,
      raw: "{não é json",
    });

    expect(state.phase).toBe("quarantined");
    expect(await layer.store.getSnapshots()).toEqual(before);

    const records = await layer.backup.listQuarantine();
    expect(records).toHaveLength(1);
    expect(records[0]?.reason).toBe("unreadable_json");
    expect(records[0]?.future).toBe(false);

    const raw = await layer.backup.exportQuarantine();
    expect(raw).toHaveLength(1);
    expect(raw[0]?.payload).toBe("{não é json");
    layer.close();
  });

  it("backup de versão futura fica em quarentena como somente leitura", async () => {
    const layer = await openedLayer("ajustes-futuro", "2026-10-05T10:00:00.000Z");
    const future = JSON.stringify({
      format: "pte-master-hub-backup",
      version: 999,
      createdAt: "2027-01-01T00:00:00.000Z",
      payload: { snapshots: [], attemptsTail: [], settings: {} },
    });

    const state = await inspectBackupFile(layer.backup, {
      fileName: "futuro.json",
      size: future.length,
      raw: future,
    });

    expect(state.phase).toBe("quarantined");
    if (state.phase === "quarantined") {
      expect(state.record.reason).toBe("future_version");
      expect(state.record.future).toBe(true);
    }
    expect(await layer.store.getSnapshots()).toEqual([]);
    expect(await layer.backup.undo()).toEqual({ restored: false, reason: "no_undo" });
    layer.close();
  });
});

/* ------------------------------------------------------------------ */
/* Textos e formatos da prévia                                        */
/* ------------------------------------------------------------------ */

describe("resumo da prévia e formatos", () => {
  it("resume a prévia sem prometer restauração perfeita", () => {
    const text = describeInspection(previewFixture());
    expect(text).toContain("3 questões registradas");
    expect(text).toContain("2 com nota");
    expect(text).toContain("2 tentativas no histórico");
    expect(text).toContain("2 seções de ajustes");
  });

  it("destaca migração, questões novas, mescladas e conflitos", () => {
    const notes = inspectionHighlights(
      previewFixture({
        migrated: true,
        version: 1,
        newQuestionCount: 2,
        sharedQuestionCount: 1,
        improvedBestScoreCount: 1,
        typeConflictCount: 1,
      }),
    );
    const joined = notes.join(" ");
    expect(joined).toContain("versão 1");
    expect(joined).toContain("2 questões novas");
    expect(joined).toContain("já existe");
    expect(joined).toContain("melhor nota");
    expect(joined).toContain("tipo diferente");
  });

  it("não inventa observações quando o backup é idêntico", () => {
    expect(
      inspectionHighlights(previewFixture({ newQuestionCount: 0, sharedQuestionCount: 0 })),
    ).toEqual([]);
  });

  it("formata bytes, porcentagem e nome de arquivo", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatPercent(0.804)).toBe("80%");
    expect(formatPercent(Number.NaN)).toBe("—");
    expect(backupFileName("pte-master-hub-backup", "2026-10-20")).toBe(
      "pte-master-hub-backup-2026-10-20.json",
    );
    expect(backupFileName("x", "20/10/2026")).toBe("x-sem-data.json");
    expect(formatDayKey("2026-12-01")).toContain("2026");
    expect(levelFromEstimate(null)).toBe("unknown");
    expect(levelFromEstimate({ usage: 50, quota: 100, available: 50, ratio: 0.5 })).toBe("ok");
    expect(levelFromEstimate({ usage: 80, quota: 100, available: 20, ratio: 0.8 })).toBe("warn");
    expect(levelFromEstimate({ usage: 95, quota: 100, available: 5, ratio: 0.95 })).toBe(
      "critical",
    );
  });
});
