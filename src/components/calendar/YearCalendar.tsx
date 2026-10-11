"use client";

import { useMemo } from "react";
import { eachDayOfInterval } from "date-fns";

import { MonthGrid } from "@/components/calendar/MonthGrid";
import { WeekCalendar } from "@/components/calendar/WeekCalendar";
import { fromDateKey, toDateKey } from "@/lib/date-utils";
import type { CalendarViewMode } from "@/store/useCalendarStore";
import type { CalendarEvent } from "@/types/event";

interface YearCalendarProps {
  year: number;
  /** Mês de referência (0-11). */
  month: number;
  /** Dia de referência (1-31) usado para ancorar a semana. */
  day: number;
  /** Modo de visualização: semana (estilo Notion) ou mês. */
  viewMode: CalendarViewMode;
  events: CalendarEvent[];
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
  onOpenEvent: (
    eventId: string,
    dateKey: string,
    anchorEl?: HTMLElement | null,
  ) => void;
  onCreate: (dateKey: string, startTime?: string) => void;
}

/**
 * Normaliza a data de um evento para "yyyy-MM-dd".
 * Aceita tanto "yyyy-MM-dd" (formato do Supabase) quanto um datetime ISO,
 * evitando deslocamentos de fuso horário.
 */
export function eventDateKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function YearCalendar({
  year,
  month,
  day,
  viewMode,
  events,
  selectedDate,
  onSelectDate,
  onOpenEvent,
  onCreate,
}: YearCalendarProps) {
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const push = (key: string, event: CalendarEvent) => {
      const list = map.get(key);
      if (list) {
        list.push(event);
      } else {
        map.set(key, [event]);
      }
    };

    for (const event of events) {
      const startKey = eventDateKey(event.date);
      const endKey = event.endDate ? eventDateKey(event.endDate) : startKey;

      // Evento de um único dia (ou término anterior ao início por segurança).
      if (endKey <= startKey) {
        push(startKey, event);
        continue;
      }

      // Evento de vários dias: aparece em cada dia do intervalo.
      const days = eachDayOfInterval({
        start: fromDateKey(startKey),
        end: fromDateKey(endKey),
      });
      for (const day of days) {
        push(toDateKey(day), event);
      }
    }
    return map;
  }, [events]);

  if (viewMode === "week") {
    return (
      <WeekCalendar
        anchorKey={toDateKey(new Date(year, month, day))}
        events={events}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        onOpenEvent={onOpenEvent}
        onCreate={onCreate}
      />
    );
  }

  return (
    <MonthGrid
      monthIndex={month}
      year={year}
      variant="comfortable"
      eventsByDate={eventsByDate}
      selectedDate={selectedDate}
      onSelectDate={onSelectDate}
      onOpenEvent={onOpenEvent}
      onCreate={onCreate}
    />
  );
}
