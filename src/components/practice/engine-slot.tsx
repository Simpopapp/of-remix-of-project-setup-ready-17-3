/**
 * Slot do motor de prática (Fase 4 — s5-pratica).
 *
 * Este componente é o ponto de encaixe dos 22 motores da Fase 6: mesma posição, mesmas
 * props, mesmo cabeçalho. Até lá ele mostra um estado HONESTO — nenhuma pergunta fake,
 * nenhum campo de resposta desabilitado, nenhum botão "Enviar" que não envia.
 *
 * `data-practice-engine` existe para a Fase 6 substituir o conteúdo sem mexer na rota.
 */

import { Link } from "@tanstack/react-router";
import { ArrowLeft, Library, Wrench } from "lucide-react";

import type { TaskType } from "@/domain/question";
import type { CatalogEntry } from "@/lib/app/catalogo";

export interface PracticeEngineSlotProps {
  type: TaskType;
  namePt: string;
  entry: CatalogEntry;
}

export function PracticeEngineSlot({ type, namePt, entry }: PracticeEngineSlotProps) {
  const hasContent = entry.count > 0;

  return (
    <section
      aria-labelledby="motor-titulo"
      data-practice-engine={type}
      data-practice-engine-state="pending"
      className="rounded-xl border border-dashed border-border bg-muted/20 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="motor-titulo"
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <Wrench className="size-4 text-muted-foreground" aria-hidden="true" />
          Área do motor de prática
        </h2>
        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
          Fase 6
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <p className="text-sm leading-relaxed text-foreground">
          O treino interativo de <span className="font-medium">{namePt}</span> chega com os motores
          de prática (Fase 6).
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Nada é simulado nesta tela: sem motor não há pergunta, gravação, envio nem avaliação. Esta
          página já traz o formato oficial do tipo, a contagem de itens do banco e o cronômetro de
          demonstração.
        </p>

        {hasContent ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Quando o motor chegar, cada item aprovado do banco será praticado aqui com os tempos
            deste tipo e feedback de treino com evidências.
          </p>
        ) : (
          <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-muted-foreground">
            Este tipo ainda não tem itens aprovados no banco: o motor não terá o que praticar até
            que conteúdo verificável seja importado. O motivo fica registrado no catálogo — nenhum
            item é inventado para preencher a lacuna.
          </p>
        )}

        <Link
          to="/catalogo"
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar ao catálogo
        </Link>
      </div>

      <p className="mt-4 flex items-center gap-1.5 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
        <Library className="size-3" aria-hidden="true" />
        Shell de prática — Fase 4. Motores por família entram na Fase 6.
      </p>
    </section>
  );
}
