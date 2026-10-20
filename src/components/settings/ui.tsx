/**
 * Componentes de interface reutilizados pela tela de Ajustes (Fase 4 — s4).
 *
 * Regras de UX que estes componentes materializam:
 * - pt-BR em toda a interface; conteúdo de exemplo em inglês quando é fala;
 * - alvos de toque ≥ 44 px (`min-h-11`), foco visível e `aria-*` corretos;
 * - apenas tokens semânticos do design system (zero cor hardcoded);
 * - nada de estado global: são componentes de apresentação controlados.
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Seção                                                              */
/* ------------------------------------------------------------------ */

export interface SettingsSectionProps {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
  /** conteúdo opcional à direita do título (ex.: um selo de estado) */
  aside?: ReactNode;
}

export function SettingsSection({
  id,
  title,
  description,
  icon: Icon,
  children,
  aside,
}: SettingsSectionProps) {
  const headingId = `${id}-titulo`;
  const descriptionId = `${id}-descricao`;

  return (
    <section
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      className="rounded-xl border border-border/60 bg-card/40"
    >
      <header className="flex flex-col gap-3 border-b border-border/50 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary"
          >
            <Icon className="size-4.5" />
          </span>
          <div className="space-y-1">
            <h2 id={headingId} className="font-serif text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <p
              id={descriptionId}
              className="max-w-2xl text-sm leading-relaxed text-muted-foreground"
            >
              {description}
            </p>
          </div>
        </div>
        {aside}
      </header>
      <div className="space-y-5 p-4 sm:p-5">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Linha com interruptor                                              */
/* ------------------------------------------------------------------ */

export interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: ToggleRowProps) {
  const descriptionId = `${id}-descricao`;
  return (
    <div className="flex min-h-11 items-start justify-between gap-4">
      <div className="space-y-1">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium leading-snug">
          {label}
        </label>
        <p id={descriptionId} className="max-w-xl text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={descriptionId}
        className="mt-0.5"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controle segmentado (radio)                                        */
/* ------------------------------------------------------------------ */

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  description?: string;
}

export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  description,
}: SegmentedControlProps<T>) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium leading-snug">{label}</p>
      {description === undefined ? null : (
        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex flex-wrap gap-1 rounded-lg border border-border/60 bg-background/40 p-1"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "min-h-11 rounded-md px-3 text-sm font-medium tabular-nums transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Campo e nota                                                       */
/* ------------------------------------------------------------------ */

export function FieldRow({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  children: ReactNode;
}) {
  const descriptionId = `${id}-descricao`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium leading-snug">
        {label}
      </label>
      {description === undefined ? null : (
        <p id={descriptionId} className="max-w-xl text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

export type NoteTone = "info" | "warning" | "success" | "danger";

const NOTE_CLASSES: Record<NoteTone, string> = {
  info: "border-border/60 bg-background/40 text-muted-foreground",
  warning: "border-warning/40 bg-warning/10 text-warning-foreground",
  success: "border-success/40 bg-success/10 text-success-foreground",
  danger: "border-destructive/50 bg-destructive/10 text-destructive",
};

export function InlineNote({
  tone = "info",
  title,
  children,
  role,
}: {
  tone?: NoteTone;
  title?: string;
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      className={cn("rounded-lg border px-3 py-2.5 text-xs leading-relaxed", NOTE_CLASSES[tone])}
    >
      {title === undefined ? null : <p className="mb-1 font-medium">{title}</p>}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/** Rótulo curto de estado (não é botão). */
export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: NoteTone | "neutral";
}) {
  const toneClass =
    tone === "neutral"
      ? "border-border/70 text-muted-foreground"
      : tone === "info"
        ? "border-border/70 text-foreground"
        : tone === "warning"
          ? "border-warning/40 bg-warning/10 text-warning-foreground"
          : tone === "success"
            ? "border-success/40 bg-success/10 text-success-foreground"
            : "border-destructive/50 bg-destructive/10 text-destructive";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        toneClass,
      )}
    >
      {children}
    </span>
  );
}
