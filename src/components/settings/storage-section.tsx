/**
 * Armazenamento do dispositivo (Fase 4 — s4).
 *
 * O aluno precisa saber, em linguagem clara, quanto espaço o app ocupa e qual o
 * risco de uma gravação falhar. Nada aqui bloqueia o estudo: quota desconhecida
 * vira aviso honesto, nunca um erro fatal.
 */

import { HardDrive, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { QuotaEstimate } from "@/lib/app/media";

import {
  formatBytes,
  formatPercent,
  levelFromEstimate,
  quotaLevelAdvice,
  quotaLevelLabel,
} from "./format";
import { InlineNote, SettingsSection, StatusPill } from "./ui";

export interface StorageSectionProps {
  quota: QuotaEstimate | null;
  /** bytes ocupados por gravações de áudio (0 quando ainda não há nenhuma) */
  recordingsBytes: number | null;
  loading: boolean;
  onRefresh: () => void;
}

export function StorageSection({
  quota,
  recordingsBytes,
  loading,
  onRefresh,
}: StorageSectionProps) {
  const level = levelFromEstimate(quota);
  const percent = quota === null ? 0 : Math.min(100, Math.round(quota.ratio * 100));

  return (
    <SettingsSection
      id="armazenamento"
      icon={HardDrive}
      title="Armazenamento neste dispositivo"
      description="O progresso, os ajustes e as gravações de fala ficam no armazenamento do seu navegador. Este painel só informa — nada é apagado por aqui."
      aside={
        <StatusPill tone={level === "ok" ? "success" : level === "unknown" ? "neutral" : "warning"}>
          {quotaLevelLabel(level)}
        </StatusPill>
      }
    >
      {quota === null ? (
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Consultando o espaço disponível…"
            : "Este navegador não informa o espaço disponível. Isso não impede o estudo; a gravação pode falhar se o armazenamento estiver cheio."}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="tabular-nums">
              {formatBytes(quota.usage)} de {formatBytes(quota.quota)} usados
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatPercent(quota.ratio)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Uso do armazenamento local"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {formatBytes(quota.available)} ainda disponíveis neste navegador.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          className="min-h-11"
        >
          <RefreshCw aria-hidden="true" className={loading ? "animate-spin" : undefined} />
          {loading ? "Atualizando…" : "Atualizar informação"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Gravações de áudio:{" "}
          {recordingsBytes === null ? "não medidas" : formatBytes(recordingsBytes)}
        </p>
      </div>

      {level === "warn" ? (
        <InlineNote tone="warning" title="Espaço ficando apertado">
          {quotaLevelAdvice(level)} Exporte um backup do progresso antes de gravar novas respostas.
        </InlineNote>
      ) : null}

      {level === "critical" ? (
        <InlineNote tone="danger" title="Risco de a próxima gravação falhar">
          {quotaLevelAdvice(level)} Exporte um backup agora. As gravações de áudio são o que ocupa
          mais espaço; o texto do progresso é pequeno.
        </InlineNote>
      ) : null}

      {level === "ok" ? <InlineNote tone="info">{quotaLevelAdvice(level)}</InlineNote> : null}
    </SettingsSection>
  );
}
