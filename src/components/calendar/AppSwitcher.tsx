"use client";

import { CalendarDays, LayoutDashboard } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AppView } from "@/store/useCalendarStore";

interface AppSwitcherProps {
  appView: AppView;
  onChangeAppView: (view: AppView) => void;
  /** Classes extras aplicadas ao contêiner (usadas para ocupar a linha). */
  className?: string;
  /**
   * Quando definido, renderiza **apenas** o botão dessa área (em vez dos dois
   * lado a lado). Usado para destacar um único atalho (ex.: Calendário no pé da
   * sidebar).
   */
  only?: AppView;
}

const OPTIONS: { view: AppView; label: string; icon: typeof CalendarDays }[] = [
  { view: "database", label: "Workspace", icon: LayoutDashboard },
  { view: "calendar", label: "Calendário", icon: CalendarDays },
];

/**
 * Alternador entre as áreas do app (Calendário / Workspace) como um "segmented
 * control" de dois botões lado a lado. É exibido no topo da sidebar no desktop
 * e, no Header, nos demais ambientes (navegador/celular).
 *
 * Com `only`, mostra só um botão (ex.: o Calendário isolado no pé da sidebar).
 */
export function AppSwitcher({
  appView,
  onChangeAppView,
  className,
  only,
}: AppSwitcherProps) {
  const options = only ? OPTIONS.filter((o) => o.view === only) : OPTIONS;
  // Com `only` (botão isolado), o rótulo do Calendário continua oculto (só ícone).
  const isSingle = Boolean(only);

  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role={isSingle ? undefined : "tablist"}
      aria-label={isSingle ? undefined : "Área do app"}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = appView === option.view;
        // Botão só-ícone: o Calendário (na barra) ou qualquer botão isolado.
        const iconOnly = option.view === "calendar";
        return (
          <button
            key={option.view}
            type="button"
            role={isSingle ? undefined : "tab"}
            aria-selected={isSingle ? undefined : active}
            aria-current={isSingle && active ? "page" : undefined}
            onClick={() => onChangeAppView(option.view)}
            title={option.label}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              // O botão do Calendário é só ícone: fica estreito. Na barra ainda
              // é empurrado para a direita (alinhado aos ícones de ação abaixo).
              iconOnly && "flex-none px-2",
              !iconOnly && "flex-none",
              !isSingle && iconOnly && "ml-auto",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 flex-none" />
            {iconOnly ? null : <span className="truncate">{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
