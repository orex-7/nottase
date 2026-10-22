"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { eachDayOfInterval, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { Loader2 } from "lucide-react";

import { EventDialog } from "@/components/EventDialog";
import { DatabaseView } from "@/components/database/DatabaseView";
import { CalendarSidebar } from "@/components/calendar/CalendarSidebar";
import { DatabaseItemPopover } from "@/components/calendar/DatabaseItemPopover";
import { EventDetails } from "@/components/calendar/EventDetails";
import { Header } from "@/components/calendar/Header";
import { eventDateKey, YearCalendar } from "@/components/calendar/YearCalendar";
import { fromDateKey, toDateKey } from "@/lib/date-utils";
import {
  databaseRowsToEvents,
  databaseIdFromEventId,
  databaseRowIdFromEventId,
} from "@/lib/database-calendar";
import { fetchAllDatabaseRows, fetchDatabases } from "@/lib/database";
import { runAutoTemplates } from "@/lib/database-recurrence";
import { fetchEventsInRange } from "@/lib/events";
import { useCalendarStore } from "@/store/useCalendarStore";
import type { CalendarEvent } from "@/types/event";

interface CalendarProviderProps {
  userName: string;
  userEmail: string;
  /** Foto do usuário (provedor OAuth); `null` = usar o ícone padrão. */
  userAvatar: string | null;
}

export function CalendarProvider({
  userName,
  userEmail,
  userAvatar,
}: CalendarProviderProps) {
  const appView = useCalendarStore((s) => s.appView);
  const viewMode = useCalendarStore((s) => s.viewMode);
  const year = useCalendarStore((s) => s.year);
  const month = useCalendarStore((s) => s.month);
  const day = useCalendarStore((s) => s.day);
  const selectedDate = useCalendarStore((s) => s.selectedDate);
  const editingEventId = useCalendarStore((s) => s.editingEventId);
  const isDialogOpen = useCalendarStore((s) => s.isDialogOpen);
  const setViewMode = useCalendarStore((s) => s.setViewMode);
  const setAppView = useCalendarStore((s) => s.setAppView);
  const goNext = useCalendarStore((s) => s.goNext);
  const goPrev = useCalendarStore((s) => s.goPrev);
  const goToToday = useCalendarStore((s) => s.goToToday);
  const selectDate = useCalendarStore((s) => s.selectDate);
  const setYear = useCalendarStore((s) => s.setYear);
  const setMonth = useCalendarStore((s) => s.setMonth);
  const requestCreateDatabase = useCalendarStore((s) => s.requestCreateDatabase);
  const requestOpenDatabase = useCalendarStore((s) => s.requestOpenDatabase);
  const openCreateDialog = useCalendarStore((s) => s.openCreateDialog);
  const closeDialog = useCalendarStore((s) => s.closeDialog);
  const hydrate = useCalendarStore((s) => s.hydrate);
  const sidebarDatabases = useCalendarStore((s) => s.sidebarDatabases);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [databaseEvents, setDatabaseEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialStartTime, setInitialStartTime] = useState<string | null>(null);
  const [detailsEventId, setDetailsEventId] = useState<string | null>(null);
  /** Popover de propriedades de um item de database (evento derivado). */
  const [dbPopover, setDbPopover] = useState<{
    databaseId: string;
    rowId: string;
    anchorEl: HTMLElement | null;
  } | null>(null);
  /** Incrementado após edições no popover para forçar recarga dos eventos de db. */
  const [dbRefreshKey, setDbRefreshKey] = useState(0);

  // Intervalo de datas visível (semana: dom–sáb; mês: grade completa).
  const range = useMemo(() => {
    const anchor = new Date(year, month, day);
    if (viewMode === "week") {
      return {
        start: toDateKey(startOfWeek(anchor, { weekStartsOn: 0 })),
        end: toDateKey(endOfWeek(anchor, { weekStartsOn: 0 })),
      };
    }
    return {
      start: toDateKey(startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 })),
      end: toDateKey(endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 })),
    };
  }, [viewMode, year, month, day]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEventsInRange(range.start, range.end);
      setEvents(data);
    } catch {
      setError("Não foi possível carregar os eventos.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Databases fixados na sidebar que possuem coluna de data viram eventos do
  // calendário. Recarrega sempre que o conjunto de ids fixados muda e também
  // ao voltar para a tela do calendário (para refletir edições feitas no db).
  const sidebarDatabaseIds = sidebarDatabases.map((d) => d.id).join(",");
  useEffect(() => {
    if (appView !== "calendar" || !sidebarDatabaseIds) {
      if (!sidebarDatabaseIds) setDatabaseEvents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const wanted = new Set(sidebarDatabaseIds.split(","));
        const all = await fetchDatabases();
        if (cancelled) return;
        const byId = new Map(all.map((db) => [db.id, db]));
        const wantedDatabases = all.filter((db) => wanted.has(db.id));
        // As linhas não vêm mais em `fetchDatabases` (a Tabela é paginada):
        // carrega o conjunto completo dos databases fixados, sob demanda. Numa
        // **visão vinculada**, colunas e itens vêm do database de origem.
        const withRows = await Promise.all(
          wantedDatabases.map(async (db) => {
            const source = db.linkedDatabaseId
              ? byId.get(db.linkedDatabaseId)
              : null;
            return {
              ...db,
              columns: source?.columns ?? db.columns,
              rows: await fetchAllDatabaseRows(source?.id ?? db.id),
            };
          }),
        );
        if (cancelled) return;
        // Gera automaticamente os itens que "venceram" para os modelos
        // recorrentes (ex.: um hábito diário). Idempotente: só cria o que falta.
        const generated = await runAutoTemplates(withRows);
        if (cancelled) return;
        const merged = withRows.map((db) => {
          const change = generated.find((g) => g.databaseId === db.id);
          return change ? change.database : db;
        });
        const derived = merged.flatMap((db) => databaseRowsToEvents(db));
        setDatabaseEvents(derived);
      } catch {
        if (!cancelled) setDatabaseEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appView, sidebarDatabaseIds, dbRefreshKey]);

  // Aplica preferências salvas (appView/viewMode) só após a montagem, evitando
  // divergência entre o HTML do servidor e o primeiro render do cliente.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Eventos exibidos no calendário (eventos reais + itens de databases fixados).
  const allEvents = useMemo(
    () => [...events, ...databaseEvents],
    [events, databaseEvents],
  );

  const detailsEvent = useMemo(
    () => allEvents.find((e) => e.id === detailsEventId) ?? null,
    [allEvents, detailsEventId],
  );

  const editingEvent = useMemo(
    () => events.find((e) => e.id === editingEventId) ?? null,
    [events, editingEventId],
  );

  const handleOpenDetails = useCallback(
    (eventId: string, _dateKey?: string, anchorEl?: HTMLElement | null) => {
      // Evento derivado de um database: abre um popover com as propriedades do
      // item (caso o database original seja encontrado), sem sair do calendário.
      const databaseId = databaseIdFromEventId(eventId);
      const rowId = databaseRowIdFromEventId(eventId);
      if (databaseId && rowId) {
        setDbPopover({ databaseId, rowId, anchorEl: anchorEl ?? null });
        return;
      }
      setDetailsEventId(eventId);
    },
    [],
  );

  const handleCloseDbPopover = useCallback(() => {
    setDbPopover(null);
  }, []);

  // Recarrega os eventos derivados de databases após uma edição no popover.
  const handleDbPopoverUpdated = useCallback(() => {
    setDbRefreshKey((k) => k + 1);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setDetailsEventId(null);
  }, []);

  const handleSaved = useCallback(
    (saved: CalendarEvent) => {
      setEvents((prev) => {
        const exists = prev.some((e) => e.id === saved.id);
        const next = exists
          ? prev.map((e) => (e.id === saved.id ? saved : e))
          : [...prev, saved];
        return next;
      });
      setDetailsEventId(saved.id);
      closeDialog();
    },
    [closeDialog],
  );

  const handleDeleted = useCallback(
    (eventId: string) => {
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      setDetailsEventId(null);
      closeDialog();
    },
    [closeDialog],
  );

  const handleCreateToday = useCallback(() => {
    setInitialStartTime(null);
    openCreateDialog(toDateKey(new Date()));
  }, [openCreateDialog]);

  const handleCreateDate = useCallback(
    (dateKey: string, startTime?: string) => {
      setInitialStartTime(startTime ?? null);
      openCreateDialog(dateKey);
    },
    [openCreateDialog],
  );

  const handleCloseDialog = useCallback(() => {
    setInitialStartTime(null);
    closeDialog();
  }, [closeDialog]);

  /** Conjunto de datas (yyyy-MM-dd) que possuem eventos — marcadores do mini-calendário. */
  const eventDates = useMemo(() => {
    const set = new Set<string>();
    for (const event of allEvents) {
      const startKey = eventDateKey(event.date);
      const endKey = event.endDate ? eventDateKey(event.endDate) : startKey;

      // Evento de um único dia (ou término anterior ao início por segurança).
      if (endKey <= startKey) {
        set.add(startKey);
        continue;
      }

      // Evento de vários dias: marca cada dia do intervalo.
      const days = eachDayOfInterval({
        start: fromDateKey(startKey),
        end: fromDateKey(endKey),
      });
      for (const day of days) set.add(toDateKey(day));
    }
    return set;
  }, [allEvents]);

  /** Seleciona um dia no mini-calendário (também reposiciona a âncora do calendário). */
  const handleSidebarSelectDate = useCallback(
    (dateKey: string) => {
      const picked = fromDateKey(dateKey);
      setYear(picked.getFullYear());
      setMonth(picked.getMonth());
      selectDate(dateKey);
    },
    [selectDate, setMonth, setYear],
  );

  /** Navega o mini-calendário um mês para trás (com ajuste de ano). */
  const handleSidebarPrevMonth = useCallback(() => {
    const total = year * 12 + month - 1;
    setYear(Math.floor(total / 12));
    setMonth(((total % 12) + 12) % 12);
  }, [month, setMonth, setYear, year]);

  /** Navega o mini-calendário um mês para frente (com ajuste de ano). */
  const handleSidebarNextMonth = useCallback(() => {
    const total = year * 12 + month + 1;
    setYear(Math.floor(total / 12));
    setMonth(((total % 12) + 12) % 12);
  }, [month, setMonth, setYear, year]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Header
        appView={appView}
        onChangeAppView={setAppView}
        year={year}
        month={month}
        day={day}
        viewMode={viewMode}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToToday}
        onChangeView={setViewMode}
        onCreate={handleCreateToday}
        userName={userName}
        userEmail={userEmail}
        userAvatar={userAvatar}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {appView === "calendar" ? (
          <>
            <CalendarSidebar
              year={year}
              month={month}
              selectedDate={selectedDate}
              eventDates={eventDates}
              onSelectDate={handleSidebarSelectDate}
              onPrevMonth={handleSidebarPrevMonth}
              onNextMonth={handleSidebarNextMonth}
              onToday={goToToday}
              onOpenDatabase={requestOpenDatabase}
              onCreateDatabase={requestCreateDatabase}
            />
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
              {error ? (
                <div className="shrink-0 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <div
                className={
                  detailsEvent
                    ? "grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]"
                    : "grid min-h-0 flex-1 grid-cols-1 gap-3"
                }
              >
                <div className="relative min-h-0">
                  {loading ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : null}
                  <YearCalendar
                    year={year}
                    month={month}
                    day={day}
                    viewMode={viewMode}
                    events={allEvents}
                    selectedDate={selectedDate}
                    onSelectDate={selectDate}
                    onOpenEvent={handleOpenDetails}
                    onCreate={handleCreateDate}
                  />
                </div>

                {detailsEvent ? (
                  <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card p-4 shadow-sm">
                    <EventDetails
                      event={detailsEvent}
                      onSaved={handleSaved}
                      onDeleted={handleDeleted}
                      onClose={handleCloseDetails}
                    />
                  </aside>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <DatabaseView userName={userName} />
        )}
      </div>

      <EventDialog
        open={isDialogOpen}
        dateKey={selectedDate ?? toDateKey(new Date())}
        event={editingEvent}
        initialStartTime={initialStartTime}
        onClose={handleCloseDialog}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />

      {dbPopover ? (
        <DatabaseItemPopover
          databaseId={dbPopover.databaseId}
          rowId={dbPopover.rowId}
          anchorEl={dbPopover.anchorEl}
          onUpdated={handleDbPopoverUpdated}
          onClose={handleCloseDbPopover}
        />
      ) : null}
    </div>
  );
}
