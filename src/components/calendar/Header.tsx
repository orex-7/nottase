"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
  /** Foto do usuário (provedor OAuth); `null` = usar o ícone padrão. */
  userAvatar: string | null;
}

/**
 * Imagem da marca (wordmark "Nottase"): substitua o arquivo `public/logo.png`
 * pela sua imagem. O tamanho intrínseco abaixo (2172×724 ≈ 3:1) é usado só para
 * o Next calcular a proporção — se trocar por uma imagem de proporção diferente,
 * atualize `LOGO_WIDTH`/`LOGO_HEIGHT`. Para outro nome/formato, troque o caminho
 * (ex.: `/logo.svg`) e, no caso de SVG, adicione `unoptimized` na `<Image>` (o
 * otimizador do Next não processa SVG por padrão).
 */
const LOGO_SRC = "/logo.png";
const LOGO_WIDTH = 2172;
const LOGO_HEIGHT = 724;

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
  userAvatar,
}: HeaderProps) {
  /** Menu do usuário (avatar) aberto. */
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  /** Popover "Conta" (foto/nome/e-mail) aberto, dentro do menu. */
  const [accountOpen, setAccountOpen] = useState(false);

  // Fecha o menu ao clicar fora ou com Esc (Esc fecha primeiro o "Conta").
  useEffect(() => {
    if (!userMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("[data-user-menu-trigger]") ||
        target?.closest("[data-user-menu]")
      ) {
        return;
      }
      setUserMenuOpen(false);
      setAccountOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (accountOpen) setAccountOpen(false);
      else setUserMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen, accountOpen]);

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
      <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-2">
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

        {/* Marca centralizada (a imagem já traz o nome "Nottase").
            `pointer-events-none` para não bloquear cliques dos controles;
            escondida em telas estreitas para não sobrepor o título/controles.
            O logo é branco: `brightness-0` o deixa preto no tema claro e
            `dark:brightness-100` mantém branco no tema escuro. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center sm:flex">
          <Image
            src={LOGO_SRC}
            alt="Nottase"
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            sizes="96px"
            priority
            className="h-8 w-auto flex-none object-contain brightness-0 dark:brightness-100"
          />
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

          {/* Lado direito: apenas o avatar. Clicar abre o menu do usuário
              ("Conta" → foto/nome/e-mail; "Sair" → encerra a sessão). */}
          <div className="relative ml-2 flex items-center">
            <button
              type="button"
              data-user-menu-trigger
              onClick={() => {
                setUserMenuOpen((open) => !open);
                setAccountOpen(false);
              }}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              aria-label="Menu do usuário"
              title={userName}
              className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full border bg-primary/10 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {userAvatar ? (
                <Image
                  src={userAvatar}
                  alt=""
                  width={32}
                  height={32}
                  unoptimized
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-4 w-4 text-primary" />
              )}
            </button>

            {userMenuOpen ? (
              <div
                data-user-menu
                role="menu"
                aria-label="Menu do usuário"
                className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border bg-popover p-1 shadow-md"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setAccountOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <User className="h-4 w-4 flex-none" />
                  Conta
                  <ChevronRight className="ml-auto h-3.5 w-3.5 flex-none" />
                </button>

                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <LogOut className="h-4 w-4 flex-none" />
                    Sair
                  </button>
                </form>

                {/* Popover "Conta": foto, nome e e-mail. Abre à esquerda do menu
                    (o avatar fica na borda direita da tela). */}
                {accountOpen ? (
                  <div
                    data-user-menu
                    role="dialog"
                    aria-label="Conta"
                    className="absolute right-full top-0 mr-1 w-64 rounded-md border bg-popover p-3 shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full bg-primary/10">
                        {userAvatar ? (
                          <Image
                            src={userAvatar}
                            alt=""
                            width={40}
                            height={40}
                            unoptimized
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <User className="h-5 w-5 text-primary" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {userName}
                        </p>
                        {userEmail ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {userEmail}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
