/**
 * Itens da navegação principal (dados, não JSX).
 *
 * Decisões:
 * - "Praticar" não é destino próprio: no PTE Master Hub a prática começa pela
 *   escolha do tipo em `/catalogo` (a rota real é `/praticar/$type`, sem índice).
 *   Um item de menu para `/praticar` seria um link morto.
 * - `priority` marca o que cabe na barra inferior mobile (5 alvos ≥ 44 px).
 *   Os itens secundários (Diagnóstico, Simulado) aparecem no rodapé de
 *   navegação, presente em todas as telas — nenhuma rota fica inalcançável
 *   no celular.
 */

import {
  BookOpen,
  CalendarClock,
  Home,
  LineChart,
  Settings,
  Stethoscope,
  Timer,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  /** caminho desejado (resolvido contra o route tree em tempo de render) */
  path: string;
  label: string;
  /** descrição curta para tooltip/leitor de tela */
  description: string;
  icon: LucideIcon;
  /** aparece na barra inferior mobile */
  priority: boolean;
}

export const MAIN_NAV: readonly NavItem[] = [
  {
    path: "/",
    label: "Início",
    description: "Painel do dia, meta e atalhos",
    icon: Home,
    priority: true,
  },
  {
    path: "/catalogo",
    label: "Catálogo",
    description: "Os tipos de tarefa, contagens e estado do progresso",
    icon: BookOpen,
    priority: true,
  },
  {
    path: "/sessoes",
    label: "Sessões",
    description: "Sessões retomáveis e fila de revisão",
    icon: CalendarClock,
    priority: true,
  },
  {
    path: "/diagnostico",
    label: "Diagnóstico",
    description: "Erros por categoria e treino do ponto fraco",
    icon: Stethoscope,
    priority: false,
  },
  {
    path: "/progresso",
    label: "Progresso",
    description: "Estimativa por habilidade, tendência e relatório",
    icon: LineChart,
    priority: true,
  },
  {
    path: "/simulado",
    label: "Simulado",
    description: "Simulado cronometrado por blueprint",
    icon: Timer,
    priority: false,
  },
  {
    path: "/ajustes",
    label: "Ajustes",
    description: "Meta, data da prova, timers, voz e backup",
    icon: Settings,
    priority: true,
  },
];

/** Itens que aparecem na barra inferior (mobile). */
export const MOBILE_NAV: readonly NavItem[] = MAIN_NAV.filter((item) => item.priority);

/** Itens secundários, listados no rodapé de navegação (todas as telas). */
export const SECONDARY_NAV: readonly NavItem[] = MAIN_NAV.filter((item) => !item.priority);
