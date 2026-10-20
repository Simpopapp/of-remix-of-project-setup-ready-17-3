/**
 * Seção "Avaliação por IA" em Ajustes (Fase 5 — s3).
 *
 * Por que esta seção existe: a avaliação por IA é a única operação que envia a
 * resposta do aluno para fora do dispositivo. O PRD central §4.5 exige que o
 * processamento externo seja explicado ANTES do primeiro uso e que o aluno possa
 * estudar sem enviar respostas. Aqui a decisão é explícita, desligada por
 * padrão, e registrada com data de aceite.
 *
 * Regras que esta tela respeita:
 * - consentimento nunca é implícito nem escondido: o interruptor é a única porta;
 * - recusar depois de aceitar não apaga o histórico do aceite (`acknowledgedAt`
 *   é preservado) e um segundo aceite NÃO sobrescreve a data original;
 * - nenhum texto promete nota oficial: a nota é estimativa de treino;
 * - apenas tokens do tema, alvos de toque ≥ 44 px e coluna única no mobile;
 * - a seção não conhece IndexedDB: recebe `settings` e grava via `onPatch`.
 */

import { Bot } from "lucide-react";

import type { AppSettings, DeepPartialAppSettings } from "@/lib/app/settings";

import { InlineNote, SettingsSection, StatusPill, ToggleRow } from "./ui";

export interface AiConsentSectionProps {
  settings: AppSettings;
  onPatch: (patch: DeepPartialAppSettings) => Promise<void>;
  saving: boolean;
}

/** Data do aceite em formato local curto; entrada inválida vira texto neutro. */
function formatAcknowledgedAt(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function AiConsentSection({ settings, onPatch, saving }: AiConsentSectionProps) {
  const consent = settings.aiConsent;
  const granted = consent.evaluate;
  const acknowledgedLabel =
    consent.acknowledgedAt === null ? null : formatAcknowledgedAt(consent.acknowledgedAt);

  /**
   * Ligar registra a data do aceite; se já houve um aceite anterior (mesmo que
   * depois revogado), a data original é mantida — o histórico não é reescrito.
   * Desligar mantém `acknowledgedAt` e só retira a autorização.
   */
  const handleToggle = (enabled: boolean) => {
    const acknowledgedAt = enabled
      ? (consent.acknowledgedAt ?? new Date().toISOString())
      : consent.acknowledgedAt;
    void onPatch({ aiConsent: { evaluate: enabled, acknowledgedAt } });
  };

  return (
    <SettingsSection
      id="avaliacao-ia"
      icon={Bot}
      title="Avaliação por IA"
      description="As respostas abertas são avaliadas por um serviço de IA externo. Você decide se quer enviar respostas — e pode estudar sem enviar nenhuma."
      aside={
        granted ? (
          <StatusPill tone="success">Autorizada</StatusPill>
        ) : (
          <StatusPill tone="neutral">Não autorizada</StatusPill>
        )
      }
    >
      <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">O que é enviado.</span> A questão, a sua
          resposta e a referência mínima para avaliar (gabarito, transcrição ou trecho de apoio).
          Nada além disso é transmitido.
        </li>
        <li>
          <span className="font-medium text-foreground">Quem processa.</span> O conteúdo é
          processado por um serviço de IA externo, que devolve nota de treino, evidências
          observáveis e feedback. Nenhuma chave de acesso fica no seu navegador.
        </li>
        <li>
          <span className="font-medium text-foreground">O que fica aqui.</span> Seu progresso,
          tentativas, notas privadas, gravações e ajustes continuam salvos somente neste
          dispositivo. Não há conta nem nuvem de dados do aluno.
        </li>
        <li>
          <span className="font-medium text-foreground">Sem envio, você continua estudando.</span>{" "}
          Praticar, revisar, consultar o banco de questões e acompanhar o progresso não dependem de
          IA.
        </li>
        <li>
          <span className="font-medium text-foreground">O que a nota significa.</span> É uma
          estimativa de treino na escala 0–100 da tarefa, com confiança e limitações declaradas. Não
          é a nota oficial do PTE nem uma reprodução do avaliador da Pearson.
        </li>
      </ul>

      <ToggleRow
        id="avaliacao-ia-consentimento"
        label="Autorizar o envio de respostas para avaliação por IA"
        description="Desligado por padrão. Enquanto estiver desligado, nenhuma resposta sai deste navegador para o serviço de IA."
        checked={granted}
        onCheckedChange={handleToggle}
        disabled={saving}
      />

      <p role="status" aria-live="polite" className="text-xs leading-relaxed text-muted-foreground">
        {granted
          ? acknowledgedLabel === null
            ? "Consentimento registrado neste dispositivo."
            : `Consentimento registrado em ${acknowledgedLabel}. Você pode revogar quando quiser.`
          : "Nenhuma resposta será enviada enquanto esta opção estiver desligada."}
      </p>

      {granted ? null : (
        <InlineNote tone="info" title="Como funciona sem consentimento">
          O envio para avaliação por IA fica bloqueado. Você pode treinar o formato, revisar
          questões, usar o banco e acompanhar o progresso localmente; ao ligar esta opção, as
          próximas respostas poderão ser avaliadas.
        </InlineNote>
      )}
    </SettingsSection>
  );
}
