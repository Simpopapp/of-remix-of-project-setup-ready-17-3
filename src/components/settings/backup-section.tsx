/**
 * Backup e restauração (Fase 4 — s4), consumindo o serviço da Fase 3.
 *
 * Fluxo inviolável (PRD central §6.3/§10):
 *   exportar → escolher arquivo → PRÉVIA obrigatória → mesclar | substituir → desfazer
 *
 * Garantias que a tela exibe e não esconde:
 * - nada é aplicado antes da prévia;
 * - arquivo inválido/corrompido/de versão futura vai para a quarentena somente
 *   leitura e o estado local permanece intacto;
 * - "Desfazer" só aparece quando o store confirmou o slot da última importação;
 * - exportar não inclui gravações de áudio (o envelope é snapshot + log +
 *   agregados + ajustes) — isso é dito ao aluno, não omitido.
 */

import { ArchiveRestore, Download, FileJson, RotateCcw, TriangleAlert, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { localDayKey } from "@/domain";
import type { ProgressLayer } from "@/lib/app";
import type { QuarantineSummary } from "@/lib/app/backup-io";

import { downloadTextFile } from "./download";
import { backupFileName, describeQuarantineReason, formatBytes, formatDateTime } from "./format";
import {
  applyBackupImport,
  describeInspection,
  inspectionHighlights,
  inspectBackupFile,
  undoBackupImport,
  type ImportFlowState,
  type ImportStrategy,
} from "./import-flow";
import { InlineNote, SettingsSection, StatusPill } from "./ui";

export interface BackupSectionProps {
  layer: ProgressLayer | null;
  /** chamado quando a importação/desfazer pode ter mudado ajustes ou quota */
  onDataChange?: () => void;
}

type Busy = "export" | "inspect" | "import" | "undo" | "quarantine" | null;

export function BackupSection({ layer, onDataChange }: BackupSectionProps) {
  const [flow, setFlow] = useState<ImportFlowState>({ phase: "empty" });
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [quarantine, setQuarantine] = useState<QuarantineSummary[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshQuarantine = useCallback(async () => {
    if (layer === null) return;
    try {
      setQuarantine(await layer.backup.listQuarantine());
    } catch {
      // A lista é informativa; falhar aqui não pode derrubar a tela.
      setQuarantine([]);
    }
  }, [layer]);

  useEffect(() => {
    void refreshQuarantine();
  }, [refreshQuarantine]);

  const handleExport = async () => {
    if (layer === null) return;
    setBusy("export");
    setNotice(null);
    try {
      const json = await layer.backup.exportJson();
      const ok = downloadTextFile(backupFileName("pte-master-hub-backup", localDayKey()), json);
      setNotice(
        ok
          ? "Backup exportado. Guarde o arquivo JSON em um lugar seguro."
          : "O navegador não permitiu iniciar o download. Nada foi alterado — tente novamente em outra aba.",
      );
    } catch {
      setNotice("Não foi possível gerar o backup agora. Nada foi alterado.");
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Permite escolher o mesmo arquivo de novo depois de corrigir algo.
    event.target.value = "";
    if (file === undefined || layer === null) return;

    setConfirmReplace(false);
    setNotice(null);
    setBusy("inspect");
    try {
      const raw = await file.text();
      const next = await inspectBackupFile(layer.backup, {
        fileName: file.name,
        size: file.size,
        raw,
      });
      setFlow(next);
      if (next.phase === "quarantined") await refreshQuarantine();
    } catch {
      setFlow({
        phase: "failed",
        fileName: file.name,
        message:
          "Não foi possível ler o arquivo escolhido. Verifique se ele é o JSON exportado por este app.",
      });
    } finally {
      setBusy(null);
    }
  };

  const runImport = async (strategy: ImportStrategy) => {
    if (layer === null) return;
    setBusy("import");
    setConfirmReplace(false);
    setNotice(null);
    const next = await applyBackupImport(layer.backup, flow, strategy);
    setFlow(next);
    if (next.phase === "quarantined") {
      await refreshQuarantine();
    } else if (next.phase === "imported") {
      onDataChange?.();
    }
    setBusy(null);
  };

  const runUndo = async () => {
    if (layer === null) return;
    setBusy("undo");
    setNotice(null);
    const next = await undoBackupImport(layer.backup);
    setFlow(next);
    if (next.phase === "undone") onDataChange?.();
    setBusy(null);
  };

  const exportQuarantine = async () => {
    if (layer === null) return;
    setBusy("quarantine");
    setNotice(null);
    try {
      const records = await layer.backup.exportQuarantine();
      const text = `${JSON.stringify(
        {
          format: "pte-master-hub-quarantine",
          exportedAt: new Date().toISOString(),
          records,
        },
        null,
        2,
      )}\n`;
      const ok = downloadTextFile(backupFileName("pte-master-hub-quarentena", localDayKey()), text);
      setNotice(
        ok
          ? "Registros da quarentena exportados. Nada foi apagado do dispositivo."
          : "O navegador não permitiu iniciar o download dos registros da quarentena.",
      );
    } catch {
      setNotice("Não foi possível exportar a quarentena agora. Nada foi apagado.");
    } finally {
      setBusy(null);
    }
  };

  const openFilePicker = () => {
    setConfirmReplace(false);
    fileInputRef.current?.click();
  };

  return (
    <SettingsSection
      id="backup"
      icon={ArchiveRestore}
      title="Backup e restauração"
      description="Exporte o progresso para um arquivo JSON legível e restaure quando quiser. A restauração sempre mostra uma prévia antes de escrever qualquer coisa."
      aside={<StatusPill tone="neutral">100% local</StatusPill>}
    >
      {/* Exportar */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Exportar backup</h3>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              O arquivo inclui os registros por questão, os agregados, os ajustes e até as últimas
              500 tentativas do histórico. As gravações de áudio ficam neste dispositivo e não
              entram no JSON.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void handleExport()}
            disabled={layer === null || busy !== null}
            className="min-h-11 shrink-0"
          >
            <Download aria-hidden="true" />
            {busy === "export" ? "Gerando…" : "Exportar backup"}
          </Button>
        </div>
      </div>

      {/* Importar */}
      <div className="space-y-3 border-t border-border/50 pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Restaurar de um arquivo</h3>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              Escolha o JSON exportado pelo app. Você verá o que o arquivo contém e os conflitos
              antes de decidir entre mesclar e substituir.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => void handleFile(event)}
              aria-label="Escolher arquivo de backup"
            />
            <Button
              type="button"
              variant="outline"
              onClick={openFilePicker}
              disabled={layer === null || busy !== null}
              className="min-h-11"
            >
              <Upload aria-hidden="true" />
              {busy === "inspect" ? "Lendo…" : "Escolher arquivo"}
            </Button>
          </div>
        </div>

        {flow.phase === "preview" ? (
          <div className="space-y-3 rounded-lg border border-border/70 bg-background/40 p-4">
            <div className="flex items-start gap-2">
              <FileJson className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 space-y-1">
                <p className="break-all text-sm font-medium">{flow.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(flow.size)} · {describeInspection(flow.preview)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Criado em {formatDateTime(flow.preview.createdAt)}
                  {flow.preview.device === null ? "" : ` · ${flow.preview.device}`}
                </p>
              </div>
            </div>

            {inspectionHighlights(flow.preview).length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
                {inspectionHighlights(flow.preview).map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                O arquivo não traz nada novo em relação ao que já está neste dispositivo.
              </p>
            )}

            <InlineNote tone="info" title="O que acontece com o histórico de tentativas">
              As tentativas do arquivo são acrescentadas ao histórico e nunca apagam as que já
              existem. O log é truncável e não é a fonte das métricas — os registros por questão
              continuam sendo a fonte.
            </InlineNote>

            {confirmReplace ? (
              <InlineNote tone="warning" title="Substituir é diferente de mesclar">
                <p>
                  Substituir troca os registros, os agregados e os ajustes deste dispositivo pelos
                  do arquivo. Você poderá desfazer uma vez, logo após a importação.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void runImport("replace")}
                    disabled={busy !== null}
                    className="min-h-11"
                  >
                    Confirmar substituição
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmReplace(false)}
                    disabled={busy !== null}
                    className="min-h-11"
                  >
                    Cancelar
                  </Button>
                </div>
              </InlineNote>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void runImport("merge")}
                  disabled={busy !== null}
                  className="min-h-11"
                >
                  {busy === "import" ? "Mesclando…" : "Mesclar com o que já existe"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmReplace(true)}
                  disabled={busy !== null}
                  className="min-h-11"
                >
                  Substituir…
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {flow.phase === "imported" ? (
          <InlineNote tone="success" title="Importação concluída" role="status">
            <p>
              {flow.strategy === "merge" ? "Mesclado" : "Substituído"} com {flow.snapshotCount}{" "}
              {flow.snapshotCount === 1 ? "registro de questão" : "registros de questão"} e{" "}
              {flow.attemptCount} {flow.attemptCount === 1 ? "tentativa" : "tentativas"} no
              histórico.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {flow.undoAvailable ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void runUndo()}
                  disabled={busy !== null}
                  className="min-h-11"
                >
                  <RotateCcw aria-hidden="true" />
                  {busy === "undo" ? "Desfazendo…" : "Desfazer importação"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={openFilePicker}
                disabled={busy !== null}
                className="min-h-11"
              >
                Importar outro arquivo
              </Button>
            </div>
            {!flow.undoAvailable ? (
              <p className="text-xs">
                O estado anterior não foi guardado nesta importação, então não há como desfazer.
              </p>
            ) : null}
          </InlineNote>
        ) : null}

        {flow.phase === "undone" ? (
          <InlineNote tone="success" title="Importação desfeita" role="status">
            <p>
              Os dados anteriores voltaram.
              {flow.createdAt.length > 0
                ? ` Estado restaurado de ${formatDateTime(flow.createdAt)}.`
                : ""}
            </p>
          </InlineNote>
        ) : null}

        {flow.phase === "quarantined" ? (
          <InlineNote tone="warning" title="Arquivo em quarentena — nada foi alterado" role="alert">
            <p>{describeQuarantineReason(flow.record.reason)}</p>
            <p>
              Registro {flow.record.id} · {formatDateTime(flow.record.createdAt)} ·{" "}
              {formatBytes(flow.record.size)}
              {flow.record.future ? " · versão futura" : ""}
            </p>
            <p>
              O arquivo foi guardado exatamente como chegou. Ele não é aplicado nem apagado: fica
              somente leitura para auditoria.
            </p>
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void exportQuarantine()}
                disabled={busy !== null}
                className="min-h-11"
              >
                <Download aria-hidden="true" />
                Exportar registros da quarentena
              </Button>
            </div>
          </InlineNote>
        ) : null}

        {flow.phase === "failed" ? (
          <InlineNote tone="danger" title="Não foi possível importar" role="alert">
            <p>{flow.message}</p>
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={openFilePicker}
                disabled={busy !== null}
                className="min-h-11"
              >
                Escolher outro arquivo
              </Button>
            </div>
          </InlineNote>
        ) : null}

        {notice === null ? null : (
          <p className="text-xs leading-relaxed text-muted-foreground" role="status">
            {notice}
          </p>
        )}
      </div>

      {/* Quarentena */}
      <div className="space-y-2 border-t border-border/50 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              Quarentena
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                {quarantine.length} {quarantine.length === 1 ? "registro" : "registros"}
              </span>
            </h3>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              Arquivos ilegíveis, corrompidos ou de uma versão mais nova do app ficam guardados aqui
              em modo somente leitura. Nada é apagado automaticamente.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void exportQuarantine()}
            disabled={layer === null || busy !== null || quarantine.length === 0}
            className="min-h-11"
          >
            <Download aria-hidden="true" />
            Exportar registros
          </Button>
        </div>

        {quarantine.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum arquivo em quarentena neste dispositivo.
          </p>
        ) : (
          <ul className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60">
            {quarantine.map((record) => (
              <li key={record.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="break-all text-xs text-muted-foreground">
                    {formatDateTime(record.createdAt)} · {formatBytes(record.size)}
                  </p>
                  <p className="text-xs leading-relaxed">
                    {describeQuarantineReason(record.reason)}
                  </p>
                </div>
                {record.future ? <StatusPill tone="warning">Versão futura</StatusPill> : null}
              </li>
            ))}
          </ul>
        )}

        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            Se um arquivo em quarentena veio de uma versão mais nova do app, atualize o app antes de
            tentar de novo. Não editamos nem “consertamos” o arquivo recebido.
          </span>
        </p>
      </div>
    </SettingsSection>
  );
}
