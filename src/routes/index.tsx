/**
 * Home — o hub diário do aluno (Fase 4, pacote s2-home).
 *
 * Responde "o que eu estudo hoje?" sem fingir medição:
 * - plano do dia derivado de fatos locais (fila SRS vencida, seções sem
 *   histórico, meta/data da prova) por `buildDayPlan` — nunca estimativa,
 *   prontidão ou nota prevista (isso é Fase 8);
 * - meta e data da prova lidas dos ajustes tipados da fundação;
 * - contagens do banco derivadas do manifesto (nunca literais digitados);
 * - progresso local lido de `getProgressLayer()` DENTRO de `useEffect` — em SSR
 *   não há IndexedDB e a tela mostra esqueleto/estado honesto em vez de quebrar.
 *
 * Mobile-first: coluna única em 390 px, alvos ≥ 44 px e hierarquia por tokens
 * do design system (nenhuma cor hardcoded).
 */

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock,
  Compass,
  HardDrive,
  Library,
  LineChart,
  ListChecks,
  Play,
  RefreshCw,
  Settings,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { InternalLink } from "@/components/layout/internal-link";
import { useResolvedPath } from "@/components/layout/use-resolved-path";
import { Skeleton } from "@/components/ui/skeleton";
import { loadManifest } from "@/data/loader";
import {
  SECTIONS,
  diffLocalDays,
  isLocalDayKey,
  localDayKey,
  localDayKeyToDate,
  type Section,
} from "@/domain";
import { REVIEW_STATUS_EVENT } from "@/hooks/use-review-status";
import {
  SECTION_DISPLAY_NAMES,
  buildDayPlan,
  practiceBySectionFromSnapshots,
  totalPracticeAttempts,
  type DayPlanItem,
} from "@/lib/app/plano-do-dia";
import { getProgressLayer, isProgressAvailable } from "@/lib/app/progress-client";
import { readAppSettings, type AppSettings } from "@/lib/app/settings";
import { reviewQueue } from "@/lib/app/srs";
import { cn } from "@/lib/utils";
import { EXAM_META } from "@/data/exam-spec";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PTE Master Hub — Seu plano de estudo de hoje" },
      {
        name: "description",
        content:
          "Seu plano do dia para o PTE Academic: fila de revisão, meta, data da prova e atalhos para praticar cada tipo de tarefa. Progresso 100% local.",
      },
      { property: "og:title", content: "PTE Master Hub — Seu plano de estudo de hoje" },
      {
        property: "og:description",
        content:
          "Revise o que venceu, explore o que ainda não praticou e mantenha o ritmo no preparo para o PTE Academic.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

/* ------------------------------------------------------------------ */
/* Dados locais (browser-only)                                        */
/* ------------------------------------------------------------------ */

interface LocalProgress {
  settings: AppSettings;
  /** revisões vencidas hoje (SRS da Fase 3) */
  dueCount: number;
  /** tentativas registradas por seção (0 = sem histórico) */
  practiceBySection: Record<Section, number>;
  /** total de tentativas registradas no aparelho */
  totalAttempts: number;
}

type LocalState =
  | { status: "loading" }
  | { status: "ready"; data: LocalProgress; todayKey: string }
  | { status: "unavailable" }
  | { status: "error" };

/* ------------------------------------------------------------------ */
/* Helpers de apresentação                                            */
/* ------------------------------------------------------------------ */

const SCORE_SCALE = EXAM_META.skillScoreScale;
const SCORE_SCALE_LABEL = `escala ${SCORE_SCALE[0]}–${SCORE_SCALE[1]}`;

/** Formata a chave de dia local sem depender de fuso (âncora no meio-dia). */
function formatExamDate(key: string): string {
  const date = localDayKeyToDate(key);
  if (date === null) return key;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return key;
  }
}

/** Texto curto do prazo; `null` quando falta data válida para comparar. */
function examCountdown(examDate: string, todayKey: string): string | null {
  if (!isLocalDayKey(examDate) || !isLocalDayKey(todayKey)) return null;
  const days = diffLocalDays(todayKey, examDate);
  if (days < 0) return "a data já passou";
  if (days === 0) return "é hoje";
  if (days === 1) return "falta 1 dia";
  return `faltam ${days} dias`;
}

const KIND_META: Record<DayPlanItem["kind"], { icon: LucideIcon; label: string; tone: string }> = {
  review: { icon: Clock, label: "Revisão", tone: "border-primary/35 bg-primary/10 text-primary" },
  practice: { icon: Play, label: "Prática", tone: "border-info/35 bg-info/10 text-info" },
  explore: {
    icon: Compass,
    label: "Explorar",
    tone: "border-success/35 bg-success/10 text-success",
  },
};

interface Shortcut {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const SHORTCUTS: readonly Shortcut[] = [
  {
    href: "/catalogo",
    label: "Catálogo e prática",
    description: "Escolha o tipo de tarefa para treinar",
    icon: BookOpen,
  },
  {
    href: "/sessoes",
    label: "Fila de revisão",
    description: "Retome sessões e o que venceu hoje",
    icon: ListChecks,
  },
  {
    href: "/progresso",
    label: "Progresso",
    description: "Cobertura, tendência e relatório",
    icon: LineChart,
  },
  {
    href: "/ajustes",
    label: "Ajustes",
    description: "Meta, data, timers, voz e backup",
    icon: Settings,
  },
];

/* ------------------------------------------------------------------ */
/* Subcomponentes                                                     */
/* ------------------------------------------------------------------ */

function InlineDestination({ href, children }: { href: string; children: ReactNode }) {
  const resolved = useResolvedPath(href);
  if (resolved === null) {
    return <span className="text-xs text-muted-foreground">Disponível em breve</span>;
  }
  return (
    <InternalLink
      to={resolved}
      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ChevronRight className="size-4" aria-hidden="true" />
    </InternalLink>
  );
}

/** Selo honesto para destino cuja rota ainda não foi entregue nesta onda. */
function ComingSoonChip() {
  return (
    <span className="rounded-full border border-dashed border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
      Em breve
    </span>
  );
}

function PlanRow({ item }: { item: DayPlanItem }) {
  const resolved = useResolvedPath(item.href);
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const unavailable = resolved === null;

  const body = (
    <>
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border",
          meta.tone,
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-foreground">{item.title}</span>
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {meta.label}
          </span>
          {unavailable && <ComingSoonChip />}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {item.description}
        </span>
      </span>
    </>
  );

  if (unavailable) {
    return (
      <div
        aria-disabled="true"
        className="flex min-h-16 items-start gap-3 rounded-xl border border-dashed border-border/60 bg-card/20 p-4 opacity-70"
      >
        {body}
      </div>
    );
  }

  return (
    <InternalLink
      to={resolved}
      className="group flex min-h-16 items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/40 hover:bg-card/70"
    >
      {body}
      <ChevronRight
        className="mt-1 size-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden="true"
      />
    </InternalLink>
  );
}

function ShortcutCard({ shortcut }: { shortcut: Shortcut }) {
  const resolved = useResolvedPath(shortcut.href);
  const Icon = shortcut.icon;
  const unavailable = resolved === null;

  const body = (
    <>
      <span className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-secondary/60 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-foreground">{shortcut.label}</span>
          {unavailable && <ComingSoonChip />}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {shortcut.description}
        </span>
      </span>
    </>
  );

  if (unavailable) {
    return (
      <div
        aria-disabled="true"
        className="flex min-h-24 items-start gap-3 rounded-xl border border-dashed border-border/60 bg-card/20 p-4 opacity-70"
      >
        {body}
      </div>
    );
  }

  return (
    <InternalLink
      to={resolved}
      className="flex min-h-24 items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/40 hover:bg-card/70"
    >
      {body}
      <ChevronRight className="size-4 self-center text-muted-foreground" aria-hidden="true" />
    </InternalLink>
  );
}

function CardHeading({
  id,
  icon: Icon,
  children,
}: {
  id: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon className="size-4 text-primary" aria-hidden="true" />
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                             */
/* ------------------------------------------------------------------ */

function HomePage() {
  const [state, setState] = useState<LocalState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  // Saudação por hora local. Nasce neutra ("Olá") para o SSR e a hidratação
  // produzirem o MESMO HTML; só depois de montar é que a hora do dispositivo
  // entra — nunca um `new Date()` no render.
  const [greeting, setGreeting] = useState("Olá");
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite");
  }, []);

  const manifest = useQuery({
    queryKey: ["bank", "manifest"],
    queryFn: () => loadManifest(),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!isProgressAvailable()) {
        if (active) setState({ status: "unavailable" });
        return;
      }

      // Revalidação em segundo plano: mantém o plano atual em vez de piscar
      // esqueleto a cada foco de janela.
      setState((previous) => (previous.status === "ready" ? previous : { status: "loading" }));

      try {
        const layer = await getProgressLayer();
        const [snapshots, settings] = await Promise.all([
          layer.store.getSnapshots(),
          readAppSettings(layer.store),
        ]);
        if (!active) return;

        const todayKey = localDayKey();
        const practiceBySection = practiceBySectionFromSnapshots(snapshots);

        setState({
          status: "ready",
          todayKey,
          data: {
            settings,
            dueCount: reviewQueue(snapshots, todayKey).length,
            practiceBySection,
            totalAttempts: totalPracticeAttempts(practiceBySection),
          },
        });
      } catch {
        if (active) setState({ status: "error" });
      }
    };

    void load();

    const revalidate = () => {
      void load();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };

    window.addEventListener("focus", revalidate);
    window.addEventListener(REVIEW_STATUS_EVENT, revalidate);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener("focus", revalidate);
      window.removeEventListener(REVIEW_STATUS_EVENT, revalidate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [reloadToken]);

  const ready = state.status === "ready" ? state : null;
  const plan =
    ready === null
      ? []
      : buildDayPlan({
          settings: ready.data.settings,
          dueCount: ready.data.dueCount,
          practiceBySection: ready.data.practiceBySection,
          todayKey: ready.todayKey,
        });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
          {greeting} · PTE Academic · preparo diário
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Seu plano de hoje
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Um passo de cada vez: revise o que venceu, conheça o que ainda não praticou e mantenha o
          ritmo. O plano usa apenas o seu progresso local — nada aqui é nota oficial.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        {/* Plano do dia */}
        <section
          aria-labelledby="plano-do-dia"
          className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/30 p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <CardHeading id="plano-do-dia" icon={Play}>
              Plano do dia
            </CardHeading>
            <span className="text-xs text-muted-foreground">Atualiza com o seu progresso</span>
          </div>

          <div aria-live="polite" className="flex flex-col gap-3">
            {state.status === "loading" && (
              <div className="flex flex-col gap-3" aria-busy="true">
                <span className="sr-only">Montando o plano do dia</span>
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            )}

            {state.status === "unavailable" && (
              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <p className="text-sm font-medium text-foreground">
                  O progresso local não está disponível neste navegador
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Sem IndexedDB o app não consegue ler a fila de revisão nem o histórico. Você ainda
                  pode estudar pelo catálogo; o progresso não será gravado neste ambiente.
                </p>
                <div className="mt-2">
                  <InlineDestination href="/catalogo">Ver catálogo</InlineDestination>
                </div>
              </div>
            )}

            {state.status === "error" && (
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                  Não foi possível ler o progresso local agora
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Nada foi apagado. Tente novamente; se continuar, recarregue a página.
                </p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border/70 bg-secondary/60 px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Tentar novamente
                </button>
              </div>
            )}

            {ready !== null &&
              plan.map((item) => (
                <PlanRow key={`${item.kind}-${item.href}-${item.title}`} item={item} />
              ))}
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            O plano considera a fila de revisão vencida, as seções ainda sem histórico e a sua meta.
            Nenhuma previsão de nota é feita aqui.
          </p>
        </section>

        {/* Coluna lateral */}
        <div className="flex flex-col gap-6">
          <section
            aria-labelledby="sua-meta"
            className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/30 p-5 sm:p-6"
          >
            <CardHeading id="sua-meta" icon={Target}>
              Sua meta
            </CardHeading>

            {state.status === "loading" && (
              <div className="flex flex-col gap-3" aria-busy="true">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-4 w-full" />
              </div>
            )}

            {(state.status === "unavailable" || state.status === "error") && (
              <div className="text-xs leading-relaxed text-muted-foreground">
                A meta e a data da prova ficam guardadas neste dispositivo e não puderam ser lidas
                agora.
                <div className="mt-1">
                  <InlineDestination href="/ajustes">Abrir Ajustes</InlineDestination>
                </div>
              </div>
            )}

            {ready !== null && (
              <>
                <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                  <span className="font-serif text-4xl font-semibold leading-none text-foreground tabular-nums">
                    {ready.data.settings.meta.targetScore}
                  </span>
                  <span className="pb-1 text-xs text-muted-foreground">
                    nota alvo ({SCORE_SCALE_LABEL})
                  </span>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <CalendarDays className="size-3.5 text-primary" aria-hidden="true" />
                    Data da prova
                  </p>

                  {ready.data.settings.meta.examDate === null ? (
                    <>
                      <p className="mt-1 text-sm text-foreground">Ainda não definida</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Com a data marcada, o prazo entra no planejamento.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-sm text-foreground">
                        {formatExamDate(ready.data.settings.meta.examDate)}
                      </p>
                      {(() => {
                        const countdown = examCountdown(
                          ready.data.settings.meta.examDate,
                          ready.todayKey,
                        );
                        if (countdown === null) return null;
                        const past = countdown === "a data já passou";
                        return (
                          <p
                            className={cn(
                              "mt-1 flex items-center gap-1.5 text-xs",
                              past ? "text-warning" : "text-muted-foreground",
                            )}
                          >
                            {past && <AlertTriangle className="size-3.5" aria-hidden="true" />}
                            {countdown}
                          </p>
                        );
                      })()}
                    </>
                  )}

                  <div className="mt-1">
                    <InlineDestination href="/ajustes">
                      {ready.data.settings.meta.examDate === null
                        ? "Definir em Ajustes"
                        : "Editar em Ajustes"}
                    </InlineDestination>
                  </div>
                </div>
              </>
            )}

            <p className="text-xs leading-relaxed text-muted-foreground">
              A meta orienta o plano de estudo. Ela não é uma previsão de nota.
            </p>
          </section>

          <section
            aria-labelledby="progresso-local"
            className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/30 p-5 sm:p-6"
          >
            <CardHeading id="progresso-local" icon={HardDrive}>
              Neste dispositivo
            </CardHeading>

            {state.status === "loading" && (
              <div className="flex flex-col gap-3" aria-busy="true">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}

            {(state.status === "unavailable" || state.status === "error") && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {state.status === "unavailable"
                  ? "Este navegador não permite armazenamento local (IndexedDB). Você pode estudar, mas o progresso não será salvo."
                  : "Não foi possível ler as contagens locais. Nada foi apagado — tente novamente em instantes."}
              </p>
            )}

            {ready !== null && (
              <>
                <dl className="flex flex-col gap-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Revisões vencidas</dt>
                    <dd className="font-medium tabular-nums text-foreground">
                      {ready.data.dueCount === 0 ? "Em dia" : ready.data.dueCount}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Tentativas registradas</dt>
                    <dd className="font-medium tabular-nums text-foreground">
                      {ready.data.totalAttempts}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Seções com histórico</dt>
                    <dd className="font-medium tabular-nums text-foreground">
                      {
                        SECTIONS.filter((section) => ready.data.practiceBySection[section] > 0)
                          .length
                      }{" "}
                      de {SECTIONS.length}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Estimativa por habilidade ({SCORE_SCALE_LABEL}): ainda não disponível.
                  </span>
                  <InlineDestination href="/progresso">Ver Progresso</InlineDestination>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {/* Atalhos */}
      <section aria-labelledby="atalhos" className="flex flex-col gap-4">
        <CardHeading id="atalhos" icon={Compass}>
          Atalhos
        </CardHeading>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SHORTCUTS.map((shortcut) => (
            <ShortcutCard key={shortcut.href} shortcut={shortcut} />
          ))}
        </div>
      </section>

      {/* Banco */}
      <section
        aria-labelledby="banco"
        className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/20 p-5 sm:p-6"
      >
        <CardHeading id="banco" icon={Library}>
          Banco de questões
        </CardHeading>

        {manifest.isPending && <Skeleton className="h-4 w-64" />}

        {manifest.isError && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Não foi possível ler o manifesto do banco agora. O catálogo continua disponível.
          </p>
        )}

        {manifest.data !== undefined && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">
              {manifest.data.totals.questions}
            </span>{" "}
            questões em{" "}
            <span className="font-medium text-foreground tabular-nums">
              {manifest.data.totals.types}
            </span>{" "}
            tipos de tarefa, com proveniência por item no catálogo. Contagens derivadas do manifesto
            do banco.
          </p>
        )}

        <div>
          <InlineDestination href="/catalogo">Abrir catálogo</InlineDestination>
        </div>
      </section>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {SECTIONS.map((section) => SECTION_DISPLAY_NAMES[section]).join(" · ")} — os quatro domínios
        do PTE Academic. As notas do app são estimativas de treino, nunca a nota oficial.
      </p>
    </div>
  );
}
