"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Table2,
  X,
} from "lucide-react";
import { isSameMonth, isToday } from "date-fns";

import { Button } from "@/components/ui/button";
import { getMonthMatrix, MONTH_NAMES, toDateKey, WEEKDAYS } from "@/lib/date-utils";
import { fetchDatabases } from "@/lib/database";
import { databaseIcon } from "@/lib/database-icons";
import { cn } from "@/lib/utils";
import { useCalendarStore, type SidebarDatabase } from "@/store/useCalendarStore";

interface CalendarSidebarProps {
  /** Ano exibido no mini-calendário. */
  year: number;
  /** Mês exibido no mini-calendário (0-11). */
  month: number;
  /** Dia selecionado (yyyy-MM-dd) ou null. */
  selectedDate: string | null;
  /** Datas (yyyy-MM-dd) que possuem ao menos um evento — usadas para os marcadores. */
  eventDates: Set<string>;
  /** Seleciona um dia no mini-calendário. */
  onSelectDate: (dateKey: string) => void;
  /** Navega para o mês anterior. */
  onPrevMonth: () => void;
  /** Navega para o próximo mês. */
  onNextMonth: () => void;
  /** Vai para o mês atual. */
  onToday: () => void;
  /** Abre um database existente na tela de database. */
  onOpenDatabase: (id: string) => void;
  /** Cria um novo database e abre a tela de database. */
  onCreateDatabase: () => void;
}

/**
 * Sidebar esquerda da página de calendário (estilo Notion).
 *
 * Contém um mini-calendário do mês atual (navegação entre meses + marcadores de
 * dias com eventos) e um atalho "Adicionar database" que abre um popover listando
 * os databases existentes (com opção de criar um novo). Pode ser minimizada.
 */
export function CalendarSidebar({
  year,
  month,
  selectedDate,
  eventDates,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  onToday,
  onOpenDatabase,
  onCreateDatabase,
}: CalendarSidebarProps) {
  const monthDate = new Date(year, month, 1);
  const weeks = getMonthMatrix(monthDate);

  /** Estado de minimização da sidebar (persistido em localStorage). */
  const [collapsed, setCollapsed] = useState(false);
  /** Controla a abertura do popover de databases. */
  const [isDbMenuOpen, setIsDbMenuOpen] = useState(false);
  /** Databases carregados sob demanda ao abrir o popover. */
  const [databases, setDatabases] = useState<SidebarDatabase[]>([]);
  const [loadingDbs, setLoadingDbs] = useState(false);

  /** Databases fixados na sidebar (mostrados acima do botão "Adicionar database"). */
  const sidebarDatabases = useCalendarStore((s) => s.sidebarDatabases);
  const addSidebarDatabase = useCalendarStore((s) => s.addSidebarDatabase);
  const removeSidebarDatabase = useCalendarStore((s) => s.removeSidebarDatabase);

  // Restaura a preferência de minimização após a montagem (evita mismatch de hidratação).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem("calendar:sidebarCollapsed") === "1");
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("calendar:sidebarCollapsed", next ? "1" : "0");
      }
      return next;
    });
    setIsDbMenuOpen(false);
  }, []);

  // Carrega a lista de databases ao abrir o popover (sempre fresca).
  useEffect(() => {
    if (!isDbMenuOpen) return;
    let cancelled = false;
    setLoadingDbs(true);
    (async () => {
      try {
        const data = await fetchDatabases();
        if (!cancelled)
          setDatabases(data.map((d) => ({ id: d.id, name: d.name, icon: d.icon })));
      } catch {
        if (!cancelled) setDatabases([]);
      } finally {
        if (!cancelled) setLoadingDbs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDbMenuOpen]);

  // Fecha o popover ao pressionar Esc.
  useEffect(() => {
    if (!isDbMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsDbMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDbMenuOpen]);

  const handlePickDatabase = useCallback(
    (db: SidebarDatabase) => {
      // Fecha o popover e apenas fixa o database na sidebar (acima do botão),
      // sem navegar para a página de database.
      setIsDbMenuOpen(false);
      addSidebarDatabase({ id: db.id, name: db.name, icon: db.icon });
    },
    [addSidebarDatabase],
  );

  const handleCreateDatabase = useCallback(() => {
    setIsDbMenuOpen(false);
    onCreateDatabase();
  }, [onCreateDatabase]);

  // Estado minimizado: rail estreito apenas com os controles essenciais.
  if (collapsed) {
    return (
      <aside className="hidden shrink-0 flex-col items-center gap-2 border-r bg-background/60 p-2 md:flex">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expandir sidebar"
          title="Expandir sidebar"
          className="flex h-[30px] w-[30px] items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setIsDbMenuOpen((v) => !v)}
          aria-label="Adicionar database"
          title="Adicionar database"
          className="flex h-[30px] w-[30px] items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Table2 className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-3 border-r bg-background/60 p-3 md:flex">
      {/* Mini-calendário do mês atual */}
      <section className="rounded-lg border bg-card p-2 shadow-sm">
        <header className="mb-1 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label="Mês anterior"
            title="Mês anterior"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToday}
            title="Ir para o mês atual"
            className="rounded px-1.5 py-0.5 text-sm font-semibold hover:bg-accent"
          >
            {MONTH_NAMES[month]} <span className="text-muted-foreground">{year}</span>
          </button>
          <div className="flex items-center">
            <button
              type="button"
              onClick={onNextMonth}
              aria-label="Próximo mês"
              title="Próximo mês"
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Minimizar sidebar"
              title="Minimizar sidebar"
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase text-muted-foreground">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-0.5">
              {day.slice(0, 1)}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {weeks.flat().map((day) => {
            const dateKey = toDateKey(day);
            const inMonth = isSameMonth(day, monthDate);
            const isSelected = selectedDate === dateKey;
            const today = isToday(day);
            const hasEvents = eventDates.has(dateKey);

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => onSelectDate(dateKey)}
                aria-label={dateKey}
                className={cn(
                  "relative flex h-7 flex-col items-center justify-center rounded text-xs transition-colors",
                  !inMonth && "text-muted-foreground/40",
                  inMonth && !isSelected && !today && "hover:bg-accent",
                  today && !isSelected && "font-semibold text-primary",
                  isSelected && "bg-primary text-primary-foreground",
                )}
              >
                {day.getDate()}
                {hasEvents ? (
                  <span
                    className={cn(
                      "absolute bottom-0.5 h-1 w-1 rounded-full",
                      isSelected ? "bg-primary-foreground" : "bg-primary/70",
                      !inMonth && "opacity-40",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* Databases fixados na sidebar (aparecem acima do botão) */}
      {sidebarDatabases.length > 0 ? (
        <section className="flex flex-col gap-0.5">
          <div className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Databases
          </div>
          <ul className="space-y-0.5">
            {sidebarDatabases.map((db) => (
              <li key={db.id} className="group/db relative">
                <button
                  type="button"
                  onClick={() => onOpenDatabase(db.id)}
                  title={db.name}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 pr-7 text-left text-sm hover:bg-accent"
                >
                  {(() => {
                    const DbIcon = databaseIcon(db.icon);
                    return <DbIcon className="h-3.5 w-3.5 flex-none text-muted-foreground" />;
                  })()}
                  <span className="min-w-0 flex-1 truncate">{db.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeSidebarDatabase(db.id)}
                  aria-label={`Remover ${db.name} da sidebar`}
                  title="Remover da sidebar"
                  className="absolute right-1 top-1/2 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground group-hover/db:flex"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Atalho: adicionar/abrir database (popover com a lista) */}
      <div className="relative">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => setIsDbMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={isDbMenuOpen}
        >
          <Table2 className="h-4 w-4" />
          Adicionar database
          <Plus className="ml-auto h-4 w-4 text-muted-foreground" />
        </Button>

        {isDbMenuOpen ? (
          <>
            {/* Overlay invisível para capturar clique-fora */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsDbMenuOpen(false)}
              role="presentation"
            />
            <div
              role="menu"
              className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border bg-popover p-1 shadow-lg"
            >
              <div className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Seus databases
              </div>

              <div className="max-h-64 overflow-y-auto">
                {loadingDbs ? (
                  <div className="flex items-center justify-center gap-2 px-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando...
                  </div>
                ) : databases.length > 0 ? (
                  <ul className="space-y-0.5">
                    {databases.map((db) => (
                      <li key={db.id}>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => handlePickDatabase(db)}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                          {(() => {
                            const DbIcon = databaseIcon(db.icon);
                            return <DbIcon className="h-3.5 w-3.5 flex-none text-muted-foreground" />;
                          })()}
                          <span className="min-w-0 flex-1 truncate">{db.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                    Você ainda não tem databases.
                  </p>
                )}
              </div>

              <div className="mt-0.5 border-t pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={handleCreateDatabase}
                >
                  <Plus className="h-4 w-4" />
                  Criar novo database
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
