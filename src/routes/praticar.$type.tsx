/**
 * `/praticar/$type` — shell genérico de prática (Fase 4 — s5-pratica).
 *
 * Esta rota é o esqueleto que vai receber os 22 motores da Fase 6. Hoje ela entrega:
 *
 * - validação do tipo contra `TASK_TYPES`/`exam-spec` (tipo inventado → 404, nunca uma
 *   tela de um tipo que não existe);
 * - `head()` próprio por tipo (título, descrição, og/twitter) derivado do catálogo;
 * - a ficha do formato oficial (seção, tempos, limite, habilidades, notas e a data de
 *   consulta das fontes) — tudo de `exam-spec.ts`;
 * - a contagem de itens vinda do manifesto (nunca digitada);
 * - o cronômetro de DEMONSTRAÇÃO, alimentado por `timerForType` + Ajustes;
 * - um slot honesto para o motor: nada de pergunta fake, campo morto ou "Enviar" que
 *   não envia.
 *
 * SSR-safe: ficha, tempos e contagem derivam de dados estáticos + manifesto; os
 * Ajustes (IndexedDB) só são lidos em `useEffect` dentro de `usePracticeSettings`.
 */

import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  PracticeEngineSlot,
  PracticeTaskHeader,
  PracticeTimerBar,
  TaskSpecCard,
  usePracticeSettings,
} from "@/components/practice";
import { Skeleton } from "@/components/ui/skeleton";
import { loadManifest } from "@/data/loader";
import { isTaskType } from "@/domain";
import { SECTION_LABELS, deriveCatalog } from "@/lib/app/catalogo";
import { examTaskSpecFor, timerForType } from "@/lib/app/practice-timer";

const manifestQuery = queryOptions({
  queryKey: ["bank", "manifest"],
  queryFn: () => loadManifest(),
  staleTime: Infinity,
});

export const Route = createFileRoute("/praticar/$type")({
  // Tipo desconhecido nunca chega ao componente: 404 do root, sem tela inventada.
  beforeLoad: ({ params }) => {
    if (examTaskSpecFor(params.type) === null) throw notFound();
  },
  head: ({ params }) => {
    const spec = examTaskSpecFor(params.type);
    if (spec === null) {
      return {
        meta: [
          { title: "Tipo de tarefa não encontrado — PTE Master Hub" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const section = SECTION_LABELS[spec.section];
    const title = `Praticar ${spec.namePt} — PTE Master Hub`;
    const description = `${spec.namePt} (${spec.name}) — ${section.label} do PTE Academic: formato oficial, tempo de preparação e resposta, limite de conteúdo e habilidades pontuadas.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(manifestQuery),
  pendingComponent: PraticaPendente,
  component: PraticaPage,
});

function PraticaPage() {
  const { type } = Route.useParams();
  const { data: manifest } = useSuspenseQuery(manifestQuery);
  const entries = useMemo(() => deriveCatalog(manifest), [manifest]);
  const entry = entries.find((item) => item.type === type);
  const spec = examTaskSpecFor(type);

  const practiceSettings = usePracticeSettings();
  const timerSpec = useMemo(() => {
    // `exam-spec` tipa o id como string (o catálogo do banco é a autoridade). O guard
    // fecha a fronteira antes de entregar o tipo ao contrato da Fase 6.
    if (spec === null || !isTaskType(spec.id)) return null;
    return timerForType(spec.id, spec, practiceSettings.settings.practice);
  }, [spec, practiceSettings.settings.practice]);

  // `beforeLoad` já garantiu o spec; a entrada do catálogo cobre os 22 tipos do contrato.
  // A guarda existe para que uma futura inconsistência falhe como 404, não como tela vazia.
  if (spec === null || entry === undefined || timerSpec === null) throw notFound();

  return (
    <div className="space-y-6">
      <PracticeTaskHeader spec={spec} entry={entry} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="order-2 space-y-4 lg:order-1">
          <PracticeEngineSlot type={entry.type} namePt={spec.namePt} entry={entry} />
          <PracticeTimerBar spec={timerSpec} settingsStatus={practiceSettings.status} />
        </div>
        <aside className="order-1 lg:order-2" aria-label="Formato do tipo de tarefa">
          <TaskSpecCard spec={spec} entry={entry} />
        </aside>
      </div>
    </div>
  );
}

function PraticaPendente() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-2 space-y-4 lg:order-1">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="order-1 h-80 w-full lg:order-2" />
      </div>
      <p className="sr-only" role="status">
        Carregando o formato e a prática do tipo de tarefa.
      </p>
    </div>
  );
}
