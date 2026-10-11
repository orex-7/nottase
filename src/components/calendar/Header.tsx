"use client";

import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  PlusCircle,
  LogOut,
  User,
  LayoutDashboard,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MONTH_NAMES } from "@/lib/date-utils";
import { format } from "date-fns";
import { endOfWeek, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AppView, CalendarViewMode } from "@/store/useCalendarStore";
import { cn } from "@/lib/utils";

/** Título da semana no formato "10 – 16 de abril de 2026". */
function formatWeekTitle(anchor: Date): string {
  const start = startOfWeek(anchor, { weekStartsOn: 0 });
  const end = endOfWeek(anchor, { weekStartsOn: 0 });
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, "d", { locale: ptBR })} – ${format(end, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
  }
  return `${format(start, "d 'de' MMM", { locale: ptBR })} – ${format(end, "d 'de' MMM 'de' yyyy", { locale: ptBR })}`;
}

interface HeaderProps {
  appView: AppView;
  onChangeAppView: (view: AppView) => void;
  year: number;
  month: number;
  day: number;
  viewMode: CalendarViewMode;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onChangeView: (mode: CalendarViewMode) => void;
  onCreate: () => void;
  userName: string;
  userEmail: string;
}

const VIEW_OPTIONS: { mode: CalendarViewMode; label: string }[] = [
  { mode: "week", label: "Semana" },
  { mode: "month", label: "Mês" },
];

const APP_OPTIONS: { view: AppView; label: string; icon: typeof CalendarDays }[] =
  [
    { view: "calendar", label: "", icon: CalendarDays },
    { view: "database", label: "Workspace", icon: LayoutDashboard },
  ];

export function Header({
  appView,
  onChangeAppView,
  year,
  month,
  day,
  viewMode,
  onPrev,
  onNext,
  onToday,
  onChangeView,
  onCreate,
  userName,
  userEmail,
}: HeaderProps) {
  const anchor = new Date(year, month, day);
  const isCalendar = appView === "calendar";
  const title = isCalendar
    ? viewMode === "week"
      ? formatWeekTitle(anchor)
      : `${MONTH_NAMES[month]} ${year}`
    : "";
  const workspaceOption = APP_OPTIONS.find((o) => o.view === "database")!;
  const calendarOption = APP_OPTIONS.find((o) => o.view === "calendar")!;
  const WorkspaceIcon = workspaceOption.icon;
  const CalendarIcon = calendarOption.icon;
  const appButtonClass = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-foreground",
    );

  return (
    <header className="shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="flex items-center rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => onChangeAppView(calendarOption.view)}
                aria-label="Calendário"
                title="Calendário"
                className={appButtonClass(appView === calendarOption.view)}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => onChangeAppView(workspaceOption.view)}
                className={appButtonClass(appView === workspaceOption.view)}
              >
                <WorkspaceIcon className="h-3.5 w-3.5" />
                {workspaceOption.label}
              </button>
            </div>
          </div>

          {isCalendar ? (
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold">{title}</h1>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {isCalendar ? (
            <>
              <div className="mr-1 flex items-center rounded-md border p-0.5">
                {VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.mode}
                    type="button"
                    onClick={() => onChangeView(option.mode)}
                    className={cn(
                      "rounded px-2 py-1 text-xs font-medium transition-colors",
                      viewMode === option.mode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <Button variant="outline" size="icon" onClick={onPrev} aria-label="Período anterior">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="sm" onClick={onToday}>
                Hoje
              </Button>
              <Button variant="outline" size="icon" onClick={onNext} aria-label="Próximo período">
                <ChevronRight />
              </Button>
              <Button size="sm" onClick={onCreate} className="ml-1">
                <PlusCircle />
                Novo evento
              </Button>
            </>
          ) : null}

          <div className="ml-2 flex items-center gap-2 border-l pl-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                <User className="h-3.5 w-3.5 text-primary" />
              </span>
              <div className="flex flex-col leading-tight">
                <span className="max-w-[140px] truncate text-xs font-medium">
                  {userName}
                </span>
                {userEmail ? (
                  <span className="max-w-[140px] truncate text-[10px] text-muted-foreground">
                    {userEmail}
                  </span>
                ) : null}
              </div>
            </div>
            <form action="/auth/signout" method="post">
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                aria-label="Sair"
                title="Sair"
              >
                <LogOut />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
