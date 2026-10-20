/**
 * Rota `/ajustes` — o painel de controle do aluno (Fase 4).
 *
 * Regras que esta página respeita:
 * - todo dado do navegador é lido em `useEffect`/eventos, nunca no render SSR;
 * - falha de armazenamento é explicada e nunca apaga nada por conta própria;
 * - salvar é por seção (`DeepPartialAppSettings`), então uma seção não zera as
 *   outras;
 * - a página só consome `@/lib/app`, `@/lib/speech` e `@/domain` — nenhum
 *   contrato novo é criado aqui.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { BackupSection } from "@/components/settings/backup-section";
import {
  MetaSection,
  PracticeSection,
  PrivacySection,
  StudiePlusSection,
  TtsSection,
  type SpeechVoiceOption,
} from "@/components/settings/settings-sections";
import { StorageSection } from "@/components/settings/storage-section";
import { InlineNote } from "@/components/settings/ui";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProgressLayer } from "@/lib/app";
import { getProgressLayer, isProgressAvailable } from "@/lib/app/progress-client";
import type { QuotaEstimate } from "@/lib/app/media";
import {
  readAppSettings,
  updateAppSettings,
  type AppSettings,
  type DeepPartialAppSettings,
} from "@/lib/app/settings";
import { isSpeechAvailable, listEnglishVoices, onVoicesChanged } from "@/lib/speech";

export const Route = createFileRoute("/ajustes")({
  component: AjustesPage,
  head: () => ({
    meta: [
      { title: "Ajustes — meta, cronômetros, voz e backup | PTE Master Hub" },
      {
        name: "description",
        content:
          "Defina meta e data da prova, cronômetros de treino, voz de leitura e preferências do Studie Plus. Exporte e restaure o progresso com prévia, mesclagem, substituição e desfazer — tudo local.",
      },
      {
        property: "og:title",
        content: "Ajustes — meta, cronômetros, voz e backup | PTE Master Hub",
      },
      {
        property: "og:description",
        content:
          "Painel do aluno: meta e data da prova, timers de treino, voz em inglês, backup com prévia e quarentena, armazenamento local e privacidade.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type LoadState = "loading" | "ready" | "unavailable" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

function AjustesPage() {
  const [layer, setLayer] = useState<ProgressLayer | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [quota, setQuota] = useState<QuotaEstimate | null>(null);
  const [recordingsBytes, setRecordingsBytes] = useState<number | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);
  const [speech, setSpeech] = useState<{ available: boolean; voices: SpeechVoiceOption[] }>({
    available: false,
    voices: [],
  });
  const mountedRef = useRef(true);

  /* Abre a camada de progresso uma única vez (é singleton) e lê os ajustes. */
  useEffect(() => {
    mountedRef.current = true;
    if (!isProgressAvailable()) {
      setLoadState("unavailable");
      return;
    }
    void (async () => {
      try {
        const opened = await getProgressLayer();
        const current = await readAppSettings(opened.store);
        if (!mountedRef.current) return;
        setLayer(opened);
        setSettings(current);
        setLoadState("ready");
      } catch {
        if (mountedRef.current) setLoadState("error");
      }
    })();
    return () => {
      // Nunca fechamos a camada: é singleton e o resto do app continua usando.
      mountedRef.current = false;
    };
  }, []);

  /* Vozes do navegador: disponibilidade pode mudar quando o sistema instala vozes. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const available = isSpeechAvailable();
    const read = (voices: SpeechSynthesisVoice[]): SpeechVoiceOption[] =>
      voices.map((voice) => ({
        voiceUri: voice.voiceURI,
        name: voice.name,
        lang: voice.lang,
        local: voice.localService,
      }));

    if (!available) {
      setSpeech({ available: false, voices: [] });
      return;
    }
    setSpeech({ available: true, voices: read(listEnglishVoices()) });
    return onVoicesChanged((voices) => {
      setSpeech({ available: true, voices: read(voices) });
    });
  }, []);

  /* "Salvo" é discreto e desaparece sozinho. */
  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = setTimeout(() => setSaveState("idle"), 2500);
    return () => clearTimeout(timer);
  }, [saveState]);

  const savePatch = async (patch: DeepPartialAppSettings) => {
    if (layer === null) return;
    setSaveState("saving");
    try {
      const next = await updateAppSettings(layer.store, patch);
      setSettings(next);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      toast.error("Não foi possível salvar os ajustes", {
        description: "O que já estava gravado continua valendo. Tente de novo.",
      });
    }
  };

  const refreshStorage = async () => {
    if (layer === null) return;
    setStorageLoading(true);
    try {
      const [estimate, bytes] = await Promise.all([
        layer.media.estimateQuota(),
        layer.media.totalBytes(),
      ]);
      setQuota(estimate);
      setRecordingsBytes(bytes);
    } catch {
      setQuota(null);
      setRecordingsBytes(null);
    } finally {
      setStorageLoading(false);
    }
  };

  /* Importação/desfazer podem trocar ajustes e quota: relê sem recarregar a página. */
  const handleBackupDataChange = () => {
    if (layer === null) return;
    void (async () => {
      try {
        const current = await readAppSettings(layer.store);
        setSettings(current);
      } catch {
        // mantém os valores já exibidos; nada é apagado
      }
      await refreshStorage();
    })();
  };

  /* Estimativa inicial de armazenamento (após a camada existir). */
  useEffect(() => {
    if (layer === null) return;
    void (async () => {
      try {
        const [estimate, bytes] = await Promise.all([
          layer.media.estimateQuota(),
          layer.media.totalBytes(),
        ]);
        if (!mountedRef.current) return;
        setQuota(estimate);
        setRecordingsBytes(bytes);
      } catch {
        if (mountedRef.current) {
          setQuota(null);
          setRecordingsBytes(null);
        }
      } finally {
        if (mountedRef.current) setStorageLoading(false);
      }
    })();
  }, [layer]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Seu painel</p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Ajustes</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Meta, ritmo de treino, voz e backup do seu progresso. Tudo é gravado neste dispositivo,
          sem conta e sem nuvem de dados do aluno.
        </p>
        <p role="status" aria-live="polite" className="min-h-5 text-xs text-muted-foreground">
          {saveState === "saving"
            ? "Salvando…"
            : saveState === "saved"
              ? "Ajustes salvos neste dispositivo."
              : saveState === "error"
                ? "Não foi possível salvar agora. Os valores anteriores continuam valendo."
                : ""}
        </p>
      </header>

      {loadState === "loading" ? (
        <div className="mt-8 space-y-4" aria-busy="true" aria-label="Carregando ajustes">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : null}

      {loadState === "unavailable" ? (
        <div className="mt-6">
          <InlineNote tone="warning" title="O armazenamento local não está disponível" role="alert">
            <p>
              Este navegador não ofereceu o armazenamento local necessário (IndexedDB) — acontece em
              janelas privadas de alguns navegadores e em modos restritos. Sem ele, o app não
              consegue ler nem gravar sua meta, seus ajustes ou seu progresso.
            </p>
            <p>
              Nada foi apagado. Abra o app em uma janela normal do navegador para ver e editar os
              ajustes.
            </p>
          </InlineNote>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="mt-6">
          <InlineNote tone="danger" title="Não foi possível abrir seus ajustes" role="alert">
            <p>
              O armazenamento local existe, mas não respondeu. Nada foi alterado. Recarregue a
              página e tente de novo; se continuar, exporte um backup em outra sessão antes de fazer
              qualquer mudança.
            </p>
          </InlineNote>
        </div>
      ) : null}

      {loadState === "ready" && settings !== null ? (
        <div className="mt-8 space-y-4 sm:space-y-5">
          <MetaSection settings={settings} onPatch={savePatch} saving={saveState === "saving"} />
          <PracticeSection
            settings={settings}
            onPatch={savePatch}
            saving={saveState === "saving"}
          />
          <TtsSection
            settings={settings}
            onPatch={savePatch}
            saving={saveState === "saving"}
            speechAvailable={speech.available}
            voices={speech.voices}
          />
          <StudiePlusSection
            settings={settings}
            onPatch={savePatch}
            saving={saveState === "saving"}
          />
          <BackupSection layer={layer} onDataChange={handleBackupDataChange} />
          <StorageSection
            quota={quota}
            recordingsBytes={recordingsBytes}
            loading={storageLoading}
            onRefresh={() => void refreshStorage()}
          />
          <PrivacySection />
        </div>
      ) : null}
    </main>
  );
}
