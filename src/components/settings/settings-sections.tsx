/**
 * Seções de ajustes do aluno (Fase 4 — s4).
 *
 * Cada seção grava APENAS as suas chaves (`buildSettingsPatch` com uma seção),
 * então nenhuma delas apaga a configuração das outras. O salvamento é feito
 * pelo contrato da onda 0 (`updateAppSettings`), que normaliza a entrada e
 * preserva chaves desconhecidas de fases futuras.
 *
 * Honestidade que a tela mantém:
 * - `examDate` é dia local (`YYYY-MM-DD`), não timestamp;
 * - timers de treino nunca se aplicam ao simulado (rotulado no texto);
 * - a voz informada é a REALMENTE usada; sem voz em inglês, não fingimos fala;
 * - o Studie Plus nasce desligado e os três recursos são independentes.
 */

import { Headphones, Settings2, ShieldCheck, Sparkles, Target, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { speak } from "@/lib/speech";
import {
  STUDIE_PLUS_MODES,
  TARGET_SCORES,
  TIMER_SCALES,
  TTS_RATE_MAX,
  TTS_RATE_MIN,
  type AppSettings,
  type DeepPartialAppSettings,
  type StudiePlusMode,
  type TargetScore,
  type TimerScale,
} from "@/lib/app/settings";

import { formatDayKey } from "./format";
import { buildSettingsPatch, normalizeExamDateInput } from "./settings-patch";
import {
  FieldRow,
  InlineNote,
  SegmentedControl,
  SettingsSection,
  StatusPill,
  ToggleRow,
} from "./ui";

// Registro da seção de consentimento de IA (Fase 5 — s3). Vive num arquivo
// próprio para não acoplar o consentimento ao formulário de preferências.
export { AiConsentSection } from "./ai-consent-section";
export type { AiConsentSectionProps } from "./ai-consent-section";

export interface SectionProps {
  settings: AppSettings;
  onPatch: (patch: DeepPartialAppSettings) => Promise<void>;
  saving: boolean;
}

/* ------------------------------------------------------------------ */
/* Meta                                                               */
/* ------------------------------------------------------------------ */

export function MetaSection({ settings, onPatch, saving }: SectionProps) {
  const savedDate = settings.meta.examDate;
  const [dateDraft, setDateDraft] = useState(savedDate ?? "");

  // O store é a fonte da verdade (importação de backup pode mudar a data).
  useEffect(() => {
    setDateDraft(savedDate ?? "");
  }, [savedDate]);

  const commitScore = (targetScore: TargetScore) => {
    void onPatch(
      buildSettingsPatch({
        meta: { targetScore, examDate: settings.meta.examDate },
      }),
    );
  };

  const commitDate = (raw: string) => {
    setDateDraft(raw);
    void onPatch(
      buildSettingsPatch({
        meta: {
          targetScore: settings.meta.targetScore,
          examDate: normalizeExamDateInput(raw),
        },
      }),
    );
  };

  return (
    <SettingsSection
      id="meta"
      icon={Target}
      title="Meta e data da prova"
      description="A meta orienta o plano de estudo e a leitura da sua prontidão. O app nunca promete a nota oficial: tudo o que aparece é estimativa de treino."
    >
      <SegmentedControl
        label="Nota alvo no PTE Academic"
        description="Metas típicas de quem presta o exame no Brasil. Você pode mudar quando quiser."
        value={settings.meta.targetScore}
        options={TARGET_SCORES.map((score) => ({ value: score, label: String(score) }))}
        onChange={commitScore}
        disabled={saving}
      />

      <FieldRow
        id="meta-data-prova"
        label="Data da prova"
        description="Opcional. Usamos a data do seu calendário (sem fuso horário) para calcular a contagem regressiva. Deixe em branco se ainda não marcou."
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id="meta-data-prova"
            type="date"
            value={dateDraft}
            onChange={(event) => commitDate(event.target.value)}
            disabled={saving}
            className="min-h-11 sm:max-w-56"
          />
          <p className="text-xs text-muted-foreground" role="status">
            {settings.meta.examDate === null
              ? "Nenhuma data marcada."
              : `Prova marcada para ${formatDayKey(settings.meta.examDate)}.`}
          </p>
        </div>
      </FieldRow>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ */
/* Timers de treino                                                   */
/* ------------------------------------------------------------------ */

export function PracticeSection({ settings, onPatch, saving }: SectionProps) {
  const scaleDisabled = saving || !settings.practice.timersEnabled;

  return (
    <SettingsSection
      id="treino"
      icon={Settings2}
      title="Cronômetros de treino"
      description="Os cronômetros ajudam a criar ritmo de prova. Eles valem somente para treino livre — o simulado usa os tempos do blueprint e ignora estes ajustes."
    >
      <ToggleRow
        id="treino-timers"
        label="Mostrar cronômetro durante o treino"
        description="Quando desligado, a prática fica sem contagem regressiva. O envio e a avaliação continuam iguais."
        checked={settings.practice.timersEnabled}
        onCheckedChange={(checked) => {
          void onPatch(
            buildSettingsPatch({
              practice: { timersEnabled: checked, timerScale: settings.practice.timerScale },
            }),
          );
        }}
        disabled={saving}
      />

      <SegmentedControl
        label="Duração do tempo de treino"
        description="Multiplicador aplicado ao tempo sugerido do tipo de tarefa. Use 2× quando estiver aprendendo o formato e 1× para simular o ritmo real."
        value={settings.practice.timerScale}
        options={TIMER_SCALES.map((scale) => ({
          value: scale,
          label: scale === 1 ? "1× (ritmo da prova)" : `${String(scale).replace(".", ",")}×`,
        }))}
        onChange={(timerScale: TimerScale) => {
          void onPatch(
            buildSettingsPatch({
              practice: { timersEnabled: settings.practice.timersEnabled, timerScale },
            }),
          );
        }}
        disabled={scaleDisabled}
      />

      {settings.practice.timersEnabled ? null : (
        <InlineNote tone="info">
          Cronômetros desligados. A escala continua guardada e volta a valer quando você ligar os
          cronômetros.
        </InlineNote>
      )}
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ */
/* Voz de TTS                                                         */
/* ------------------------------------------------------------------ */

export interface SpeechVoiceOption {
  voiceUri: string;
  name: string;
  lang: string;
  local: boolean;
}

export interface TtsSectionProps extends SectionProps {
  speechAvailable: boolean;
  voices: SpeechVoiceOption[];
}

const EXAMPLE_SENTENCE = "The lecture begins at nine o'clock in the main hall.";

export function TtsSection({
  settings,
  onPatch,
  saving,
  speechAvailable,
  voices,
}: TtsSectionProps) {
  const [spoken, setSpoken] = useState<
    { status: "idle" } | { status: "started"; voiceName: string } | { status: "unavailable" }
  >({ status: "idle" });

  const [rateDraft, setRateDraft] = useState(settings.tts.rate);
  useEffect(() => {
    setRateDraft(settings.tts.rate);
  }, [settings.tts.rate]);

  const commitRate = (value: number) => {
    if (Math.abs(value - settings.tts.rate) < 0.001) return;
    void onPatch(
      buildSettingsPatch({
        tts: {
          enabled: settings.tts.enabled,
          voiceUri: settings.tts.voiceUri,
          rate: value,
        },
      }),
    );
  };

  const selectedVoiceInList =
    settings.tts.voiceUri === null ||
    voices.some((voice) => voice.voiceUri === settings.tts.voiceUri);

  const tryExample = () => {
    const handle = speak(EXAMPLE_SENTENCE, {
      voiceUri: settings.tts.voiceUri,
      rate: rateDraft,
    });
    setSpoken(
      handle.started && handle.voiceName !== null
        ? { status: "started", voiceName: handle.voiceName }
        : { status: "unavailable" },
    );
  };

  return (
    <SettingsSection
      id="voz"
      icon={Volume2}
      title="Voz de leitura"
      description="Usamos a voz do seu navegador (Web Speech API) para ler o inglês do exame. A voz fala sempre o inglês original — nunca uma tradução."
      aside={
        speechAvailable ? (
          <StatusPill tone="success">Disponível</StatusPill>
        ) : (
          <StatusPill tone="warning">Indisponível</StatusPill>
        )
      }
    >
      <ToggleRow
        id="voz-ativa"
        label="Usar leitura em voz alta"
        description="Desligar não impede o treino: apenas deixa de oferecer o botão de ouvir o texto em inglês."
        checked={settings.tts.enabled}
        onCheckedChange={(checked) => {
          void onPatch(
            buildSettingsPatch({
              tts: {
                enabled: checked,
                voiceUri: settings.tts.voiceUri,
                rate: settings.tts.rate,
              },
            }),
          );
          if (!checked) setSpoken({ status: "idle" });
        }}
        disabled={saving}
      />

      {!speechAvailable ? (
        <InlineNote tone="warning" title="Este navegador não oferece voz">
          O serviço de voz do navegador não está disponível aqui (pode ser um navegador restrito ou
          uma aba privada). O app continua funcionando; os botões de ouvir apenas não produzem
          áudio. Não é possível instalar vozes por dentro do app — isso depende do sistema.
        </InlineNote>
      ) : (
        <>
          <FieldRow
            id="voz-selecionada"
            label="Voz em inglês"
            description="Listamos apenas vozes em inglês instaladas neste dispositivo. Vozes marcadas como “offline” funcionam sem internet."
          >
            <select
              id="voz-selecionada"
              value={settings.tts.voiceUri ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                void onPatch(
                  buildSettingsPatch({
                    tts: {
                      enabled: settings.tts.enabled,
                      voiceUri: value.length === 0 ? null : value,
                      rate: settings.tts.rate,
                    },
                  }),
                );
              }}
              disabled={saving || voices.length === 0}
              className="min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-md"
            >
              <option value="">Automática (melhor voz em inglês instalada)</option>
              {!selectedVoiceInList && settings.tts.voiceUri !== null ? (
                <option value={settings.tts.voiceUri}>
                  Voz salva (não instalada agora) — {settings.tts.voiceUri}
                </option>
              ) : null}
              {voices.map((voice) => (
                <option key={voice.voiceUri} value={voice.voiceUri}>
                  {voice.name} — {voice.lang}
                  {voice.local ? " · offline" : ""}
                </option>
              ))}
            </select>
            {voices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma voz em inglês foi encontrada neste navegador. O áudio não será produzido até
                que uma voz esteja instalada no sistema.
              </p>
            ) : null}
          </FieldRow>

          <FieldRow
            id="voz-velocidade"
            label={`Velocidade da fala: ${rateDraft.toFixed(1).replace(".", ",")}×`}
            description="Entre 0,5× e 2×. Para treinar listening, comece em 1× e aumente só quando entender tudo."
          >
            <input
              id="voz-velocidade"
              type="range"
              min={TTS_RATE_MIN}
              max={TTS_RATE_MAX}
              step={0.1}
              value={rateDraft}
              onChange={(event) => setRateDraft(Number(event.target.value))}
              onPointerUp={() => commitRate(rateDraft)}
              onKeyUp={() => commitRate(rateDraft)}
              onBlur={() => commitRate(rateDraft)}
              disabled={saving}
              className="h-11 w-full max-w-sm accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FieldRow>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              onClick={tryExample}
              disabled={saving || !settings.tts.enabled}
              className="min-h-11"
            >
              <Headphones aria-hidden="true" />
              Ouvir exemplo em inglês
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground" role="status">
              {spoken.status === "started"
                ? `Falando com a voz “${spoken.voiceName}”.`
                : spoken.status === "unavailable"
                  ? "Nenhuma voz em inglês pôde falar agora. Nada foi alterado."
                  : "O exemplo é uma frase em inglês, lida com a voz e a velocidade acima."}
            </p>
          </div>
        </>
      )}
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ */
/* Studie Plus                                                        */
/* ------------------------------------------------------------------ */

export function StudiePlusSection({ settings, onPatch, saving }: SectionProps) {
  const pack = settings.studiePlus;

  const commit = (next: Partial<AppSettings["studiePlus"]>) => {
    void onPatch(
      buildSettingsPatch({
        studiePlus: { ...pack, ...next },
      }),
    );
  };

  return (
    <SettingsSection
      id="studie-plus"
      icon={Sparkles}
      title="Studie Plus (apoio ao inglês)"
      description="Pack opcional de apoio ao estudo do inglês: tradução de palavras, tradução de frases e pronúncia. Não interfere na sua resposta, na nota, no banco de questões nem nos seus dados."
      aside={
        pack.enabled ? (
          <StatusPill tone="success">Ligado</StatusPill>
        ) : (
          <StatusPill tone="neutral">Desligado</StatusPill>
        )
      }
    >
      <ToggleRow
        id="studie-plus-ativo"
        label="Ativar o Studie Plus"
        description="Desligado por padrão. Quando ligado, os botões de apoio aparecem somente nos textos elegíveis do treino — e cada recurso abaixo pode ser controlado separadamente."
        checked={pack.enabled}
        onCheckedChange={(enabled) => commit({ enabled })}
        disabled={saving}
      />

      <div className="space-y-4 border-t border-border/50 pt-4">
        <SegmentedControl
          label="Modo de tradução"
          description="IA traduz sob demanda pelo serviço do app. Offline usa o pacote local quando ele estiver disponível neste dispositivo (a geração desse pacote chega em uma fase futura)."
          value={pack.mode}
          options={STUDIE_PLUS_MODES.map((mode) => ({
            value: mode,
            label: mode === "ai" ? "IA (sob demanda)" : "Offline (pacote local)",
          }))}
          onChange={(mode: StudiePlusMode) => commit({ mode })}
          disabled={saving}
        />

        {pack.mode === "offline" ? (
          <InlineNote tone="info">
            Modo offline selecionado. O pacote local ainda não é gerado por esta versão do app; até
            a fase de implantação do pack, a tradução por IA continua sendo a única fonte real de
            resposta. A preferência fica guardada.
          </InlineNote>
        ) : null}

        <div className="space-y-4">
          <ToggleRow
            id="studie-plus-palavra"
            label="Tradução contextual de palavra"
            description="Mostra sentido literal, sentido no contexto, sinônimo comum e a alternativa mais precisa, com o motivo da escolha do autor."
            checked={pack.word}
            onCheckedChange={(word) => commit({ word })}
            disabled={saving || !pack.enabled}
          />
          <ToggleRow
            id="studie-plus-frase"
            label="Tradução e explicação de frase"
            description="Tradução natural para o português e, quando houver, expressões, phrasal verbs, colocações e conectores explicados."
            checked={pack.sentence}
            onCheckedChange={(sentence) => commit({ sentence })}
            disabled={saving || !pack.enabled}
          />
          <ToggleRow
            id="studie-plus-pronuncia"
            label="Pronúncia do inglês original"
            description="Toca o inglês original do texto — nunca “áudio da tradução”. A voz usada é a mesma configurada acima."
            checked={pack.pronunciation}
            onCheckedChange={(pronunciation) => commit({ pronunciation })}
            disabled={saving || !pack.enabled}
          />
        </div>

        {!pack.enabled ? (
          <InlineNote tone="info">
            Os três controles ficam guardados com os valores escolhidos e voltam a valer quando o
            pack for ligado. Os recursos completos do Studie Plus são implementados na Fase 10.
          </InlineNote>
        ) : null}
      </div>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ */
/* Privacidade                                                        */
/* ------------------------------------------------------------------ */

export function PrivacySection() {
  return (
    <SettingsSection
      id="privacidade"
      icon={ShieldCheck}
      title="Privacidade e processamento externo"
      description="O que fica neste dispositivo e o que pode sair dele, em linguagem direta."
    >
      <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Seu progresso é 100% local.</span> Notas,
          tentativas, agenda de revisão, gravações e ajustes ficam no armazenamento deste navegador.
          Não há conta, nuvem nem sincronização de dados do aluno.
        </li>
        <li>
          <span className="font-medium text-foreground">Para onde vão os dados quando há IA.</span>{" "}
          A avaliação por IA e a tradução do Studie Plus são as únicas funções que usam um serviço
          externo. Elas recebem somente o mínimo necessário: a questão, a referência pertinente, a
          sua resposta e o contexto de correção. Nenhuma chave de acesso fica no navegador.
        </li>
        <li>
          <span className="font-medium text-foreground">
            O processamento externo é explicado antes.
          </span>{" "}
          A primeira vez que uma função de IA for usada, o app explica o envio e pede a sua decisão.
          Você pode estudar sem enviar respostas: a prática local e a revisão continuam funcionando.
        </li>
        <li>
          <span className="font-medium text-foreground">Gravações de fala.</span> O áudio é guardado
          no dispositivo para você reouvir e para a avaliação de pronúncia quando ela existir. Ele
          só é enviado ao serviço de IA quando uma avaliação de fala é solicitada.
        </li>
      </ul>
      <InlineNote tone="info" title="Sobre o serviço de voz">
        A leitura em voz alta usa o serviço de voz do próprio navegador, não um serviço do app. Se
        ele não estiver disponível, o app avisa e continua sem áudio — não simulamos pronúncia.
      </InlineNote>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="border-border/70 font-normal">
          Sem conta
        </Badge>
        <Badge variant="outline" className="border-border/70 font-normal">
          Sem nuvem de dados do aluno
        </Badge>
        <Badge variant="outline" className="border-border/70 font-normal">
          Sem chave de IA no navegador
        </Badge>
      </div>
    </SettingsSection>
  );
}
