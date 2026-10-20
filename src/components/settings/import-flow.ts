/**
 * Máquina de estados da importação de backup (Fase 4 — s4).
 *
 * O fluxo exigido pelo PRD central §6.3/§10 é inviolável:
 *
 *   arquivo → PRÉVIA (nada é escrito) → [mesclar | substituir] → desfazer
 *
 * Regras que o código garante:
 * - Um arquivo só é aplicado depois de uma prévia bem-sucedida; a prévia é
 *   refeita pelo serviço no momento do import (defesa em profundidade).
 * - Arquivo inválido, corrompido ou de versão futura vai para a QUARENTENA
 *   somente leitura e o estado local permanece intacto. Nunca "consertamos"
 *   nem sobrescrevemos o arquivo recebido.
 * - Toda importação bem-sucedida guarda o estado anterior (undo) na mesma
 *   transação; a tela só oferece "Desfazer" quando o serviço confirma o slot.
 *
 * O módulo é puro: recebe um `BackupService` injetado (`BackupIo` real em
 * produção, fake nos testes) e devolve o próximo estado. Nenhum React, nenhum
 * download, nenhuma leitura de arquivo — isso fica na tela.
 */

import type { BackupIo, BackupPreview, QuarantineSummary } from "@/lib/app/backup-io";

/** Subconjunto do serviço da Fase 3 que a tela usa. */
export type BackupService = Pick<BackupIo, "inspect" | "import" | "undo">;

export type ImportStrategy = "merge" | "replace";

export type ImportFlowState =
  | { phase: "empty" }
  | {
      phase: "preview";
      fileName: string;
      size: number;
      raw: string;
      preview: BackupPreview;
    }
  | {
      phase: "quarantined";
      fileName: string;
      size: number;
      record: QuarantineSummary;
    }
  | {
      phase: "imported";
      fileName: string;
      preview: BackupPreview;
      strategy: ImportStrategy;
      snapshotCount: number;
      attemptCount: number;
      /** `true` quando o store confirmou o slot de desfazer */
      undoAvailable: boolean;
    }
  | { phase: "undone"; createdAt: string }
  | { phase: "failed"; fileName: string | null; message: string };

export interface BackupFileInput {
  fileName: string;
  size: number;
  raw: string;
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

const EMPTY_MESSAGE =
  "O arquivo está vazio. Escolha o JSON exportado pelo próprio app em “Exportar backup”.";

/**
 * Lê o conteúdo já lido do disco (texto) e produz a prévia.
 *
 * `inspect` valida e migra em memória, sem escrever. Quando o arquivo é
 * inválido, pedimos ao serviço que o guarde na quarentena (`import` com
 * `saveUndo: false`). Esse caminho NÃO chama `importState`: nada do estado local
 * é tocado — é o que o teste de integração prova.
 */
export async function inspectBackupFile(
  service: BackupService,
  input: BackupFileInput,
): Promise<ImportFlowState> {
  const raw = input.raw;
  if (raw.trim().length === 0) {
    return { phase: "failed", fileName: input.fileName, message: EMPTY_MESSAGE };
  }

  try {
    const inspection = await service.inspect(raw);
    if (inspection.ok) {
      return {
        phase: "preview",
        fileName: input.fileName,
        size: input.size,
        raw,
        preview: inspection,
      };
    }

    // Inválido nunca é aplicado: vai para a quarentena e o estado local fica.
    const outcome = await service.import(raw, { strategy: "merge", saveUndo: false });
    if (outcome.status === "quarantined") {
      return {
        phase: "quarantined",
        fileName: input.fileName,
        size: input.size,
        record: outcome.record,
      };
    }
    return {
      phase: "failed",
      fileName: input.fileName,
      message:
        "O app recusou este arquivo, mas não conseguiu registrá-lo na quarentena. Nada foi alterado.",
    };
  } catch (error) {
    return {
      phase: "failed",
      fileName: input.fileName,
      message: messageOf(error, "Não foi possível ler o arquivo de backup. Nada foi alterado."),
    };
  }
}

/**
 * Aplica a importação a partir de um estado de PRÉVIA. Sem prévia, nada é
 * aplicado (retorna `failed`). O serviço revalida o arquivo antes de escrever.
 */
export async function applyBackupImport(
  service: BackupService,
  state: ImportFlowState,
  strategy: ImportStrategy,
): Promise<ImportFlowState> {
  if (state.phase !== "preview") {
    return {
      phase: "failed",
      fileName: null,
      message: "Escolha e confira um backup antes de importar.",
    };
  }

  try {
    const outcome = await service.import(state.raw, { strategy, saveUndo: true });
    if (outcome.status === "quarantined") {
      return {
        phase: "quarantined",
        fileName: state.fileName,
        size: state.size,
        record: outcome.record,
      };
    }
    return {
      phase: "imported",
      fileName: state.fileName,
      preview: outcome.preview,
      strategy,
      snapshotCount: outcome.result.snapshotCount,
      attemptCount: outcome.result.attemptCount,
      undoAvailable: outcome.result.undoId !== null,
    };
  } catch (error) {
    return {
      phase: "failed",
      fileName: state.fileName,
      message: messageOf(
        error,
        "A importação não foi concluída. Seus dados anteriores continuam neste dispositivo.",
      ),
    };
  }
}

/** Desfaz a última importação (restaura snapshots, agregados e ajustes). */
export async function undoBackupImport(service: BackupService): Promise<ImportFlowState> {
  try {
    const result = await service.undo();
    if (result.restored) {
      return { phase: "undone", createdAt: result.createdAt ?? "" };
    }
    return {
      phase: "failed",
      fileName: null,
      message: "Não há importação recente para desfazer neste dispositivo.",
    };
  } catch (error) {
    return {
      phase: "failed",
      fileName: null,
      message: messageOf(error, "Não foi possível desfazer a importação."),
    };
  }
}

/** Texto-resumo da prévia (curto, honesto e sem promessa de "restauração perfeita"). */
export function describeInspection(preview: BackupPreview): string {
  const parts: string[] = [];
  parts.push(
    `Backup com ${preview.snapshotCount} ${preview.snapshotCount === 1 ? "questão registrada" : "questões registradas"}`,
  );
  parts.push(`${preview.scoredSnapshotCount} com nota`);
  parts.push(
    `${preview.attemptCount} ${preview.attemptCount === 1 ? "tentativa no histórico" : "tentativas no histórico"}`,
  );
  parts.push(
    `${preview.settingsKeys.length} ${preview.settingsKeys.length === 1 ? "seção de ajustes" : "seções de ajustes"}`,
  );
  return parts.join(" · ");
}

/**
 * Observações da prévia que o aluno precisa ver ANTES de decidir. Lista vazia =
 * não há nada digno de nota (backup vazio ou idêntico).
 */
export function inspectionHighlights(preview: BackupPreview): string[] {
  const notes: string[] = [];
  if (preview.migrated) {
    notes.push(
      `Arquivo da versão ${preview.version}; será convertido para a versão ${preview.currentVersion} sem remover dados.`,
    );
  }
  if (preview.newQuestionCount > 0) {
    notes.push(
      `${preview.newQuestionCount} ${preview.newQuestionCount === 1 ? "questão nova será adicionada" : "questões novas serão adicionadas"}.`,
    );
  }
  if (preview.sharedQuestionCount > 0) {
    notes.push(
      `${preview.sharedQuestionCount} ${preview.sharedQuestionCount === 1 ? "questão já existe" : "questões já existem"} e ${preview.sharedQuestionCount === 1 ? "será mesclada" : "serão mescladas"}.`,
    );
  }
  if (preview.improvedBestScoreCount > 0) {
    notes.push(
      `${preview.improvedBestScoreCount} ${preview.improvedBestScoreCount === 1 ? "melhor nota seria aumentada" : "melhores notas seriam aumentadas"}.`,
    );
  }
  if (preview.typeConflictCount > 0) {
    notes.push(
      `${preview.typeConflictCount} ${preview.typeConflictCount === 1 ? "questão tem tipo diferente" : "questões têm tipo diferente"} do registrado aqui; o registro local é mantido.`,
    );
  }
  return notes;
}
