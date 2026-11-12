"use client";

import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  PlusCircle,
  LayoutDashboard,
  Menu,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/calendar/UserMenu";
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
  /** Abre a navegação off-canvas no celular (botão `md:hidden`). */
  onOpenMobileNav: () => void;
  /** Estado da navegação off-canvas, usado no `aria-expanded` do botão. */
  mobileNavOpen: boolean;
  /**
   * No desktop o alternador Calendário/Workspace vive no topo da sidebar (que
   * ocupa a altura toda), então o cabeçalho não o exibe.
   */
  hideAppSwitcher?: boolean;
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
  onOpenMobileNav,
  mobileNavOpen,
  hideAppSwitcher = false,
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

  // `relative z-30`: o `backdrop-blur` cria um stacking context e, sem um
  // z-index explícito, o cabeçalho sticky da tabela (`z-10`) ficava por cima do
  // menu do usuário. Fica abaixo do fundo escuro/gaveta do celular (z-40/z-50).
  return (
    <header
      className={cn(
        "app-drag relative z-30 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        // No desktop reserva a altura da title bar (controles nativos à
        // direita) para o conteúdo do cabeçalho não ficar sob eles.
        hideAppSwitcher && "pt-10",
      )}
    >
      <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-2">
        <div className="app-no-drag flex items-center gap-3">
          {/* Navegação off-canvas: só no celular (`md:hidden`). */}
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Abrir navegação"
            aria-expanded={mobileNavOpen}
            title="Abrir navegação"
            className="flex h-7 w-7 flex-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          {hideAppSwitcher ? null : (
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
                  {/* O rótulo some no celular para a barra não quebrar em 3 linhas. */}
                  <span className="hidden sm:inline">{workspaceOption.label}</span>
                </button>
              </div>
            </div>
          )}

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
            `dark:brightness-100` mantém branco no tema escuro. No desktop o logo
            já aparece no topo da sidebar, então some do cabeçalho. */}
        {hideAppSwitcher ? null : (
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
        )}

        <div className="app-no-drag flex flex-wrap items-center gap-1">
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
              ("Conta" → foto/nome/e-mail; "Sair" → encerra a sessão). No desktop
              o perfil já aparece no topo da sidebar, então some do cabeçalho. */}
          {hideAppSwitcher ? null : (
            <UserMenu
              className="ml-2"
              userName={userName}
              userEmail={userEmail}
              userAvatar={userAvatar}
            />
          )}
        </div>
      </div>
    </header>
  );
}
