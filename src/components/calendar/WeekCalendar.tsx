"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  eachDayOfInterval,
  endOfWeek,
  isToday,
  startOfWeek,
} from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";

import { WEEKDAYS, fromDateKey, toDateKey } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/event";

interface WeekCalendarProps {
  /** Data âncora (yyyy-MM-dd) da semana exibida. */
  anchorKey: string;
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

/** Altura, em pixels, de uma hora na grade. */
const HOUR_HEIGHT = 48;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Normaliza uma data de evento para "yyyy-MM-dd" (aceita ISO datetime). */
function toEventKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return toDateKey(new Date(value));
}

/** Converte "HH:mm" em minutos desde a meia-noite. */
function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":");
  const hours = Number(h);
  const minutes = Number(m);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function WeekCalendar({
  anchorKey,
  events,
  selectedDate,
  onSelectDate,
  onOpenEvent,
  onCreate,
}: WeekCalendarProps) {
  const anchor = fromDateKey(anchorKey);

  const days = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 0 });
    const end = endOfWeek(anchor, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [anchor]);

  const weekStartKey = toDateKey(days[0]);
  const weekEndKey = toDateKey(days[days.length - 1]);

  // Eventos que abrangem a semana, separados em "dia todo" vs "com horário".
  const { allDayByDay, timedByDay } = useMemo(() => {
    const allDay = new Map<string, CalendarEvent[]>();
    const timed = new Map<string, CalendarEvent[]>();

    const push = (
      map: Map<string, CalendarEvent[]>,
      key: string,
      ev: CalendarEvent,
    ) => {
      const list = map.get(key);
      if (list) list.push(ev);
      else map.set(key, [ev]);
    };

    for (const event of events) {
      const startKey = toEventKey(event.date);
      const endKey = event.endDate ? toEventKey(event.endDate) : startKey;

      // Dias da semana que intersectam o evento.
      const from = startKey < weekStartKey ? weekStartKey : startKey;
      const to = endKey > weekEndKey ? weekEndKey : endKey;
      if (from > to) continue;

      const spanDays = eachDayOfInterval({
        start: fromDateKey(from),
        end: fromDateKey(to),
      });
      const isMultiDay = endKey > startKey;
      const startMinutes = timeToMinutes(event.startTime);

      for (const day of spanDays) {
        const key = toDateKey(day);
        if (event.allDay || isMultiDay || startMinutes === null) {
          push(allDay, key, event);
        } else {
          push(timed, key, event);
        }
      }
    }
    return { allDayByDay: allDay, timedByDay: timed };
  }, [events, weekStartKey, weekEndKey]);

  const hasAllDay = allDayByDay.size > 0;

  // Relógio ao vivo: atualiza o marcador "agora" a cada minuto.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const scrollRef = useRef<HTMLDivElement>(null);
  const didScrollRef = useRef(false);
  const [allDayExpanded, setAllDayExpanded] = useState(false);

  // Rolagem automática até a hora atual na primeira exibição da semana.
  useEffect(() => {
    if (didScrollRef.current) return;
    const container = scrollRef.current;
    if (!container) return;

    const todayInWeek = days.some((d) => isToday(d));
    const focusMinutes = todayInWeek ? nowMinutes : 8 * 60;
    const target = (focusMinutes / 60) * HOUR_HEIGHT - container.clientHeight / 3;

    container.scrollTop = Math.max(target, 0);
    didScrollRef.current = true;
  }, [days, nowMinutes]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      {/* Cabeçalho: canto + 7 dias */}
      <div className="flex shrink-0 border-b">
        <div className="w-14 shrink-0 border-r" />
        <div className="grid flex-1 grid-cols-7">
          {days.map((day, i) => {
            const key = toDateKey(day);
            const isSelected = selectedDate === key;
            const today = isToday(day);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectDate(key)}
                onDoubleClick={() => onCreate(key)}
                className={cn(
                  "flex flex-col items-center gap-0.5 border-r py-1.5 text-center transition-colors last:border-r-0 hover:bg-accent/60",
                  isSelected && "bg-accent",
                )}
              >
                <span className="text-[10px] font-medium uppercase text-muted-foreground">
                  {WEEKDAYS[i]}
                </span>
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                    today && "bg-primary text-primary-foreground",
                  )}
                >
                  {day.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Faixa de eventos "dia todo" */}
      {hasAllDay ? (
        <div className="flex shrink-0 border-b bg-muted/20">
          <div className="flex w-14 shrink-0 flex-col items-end justify-center gap-1 border-r pr-1.5">
            <span className="text-[9px] uppercase text-muted-foreground">
              dia todo
            </span>
            <button
              type="button"
              onClick={() => setAllDayExpanded((v) => !v)}
              aria-label={allDayExpanded ? "Recolher faixa" : "Expandir faixa"}
              title={allDayExpanded ? "Recolher" : "Expandir"}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {allDayExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          </div>
          <div
            className={cn(
              "grid flex-1 grid-cols-7",
              allDayExpanded ? "max-h-none" : "no-scrollbar max-h-16 overflow-y-auto",
            )}
          >
            {days.map((day) => {
              const key = toDateKey(day);
              const dayEvents = allDayByDay.get(key) ?? [];
              const visible = allDayExpanded ? dayEvents : dayEvents.slice(0, 3);
              const hidden = dayEvents.length - visible.length;
              return (
                <div
                  key={key}
                  className="flex flex-col gap-0.5 border-r p-0.5 last:border-r-0"
                >
                  {visible.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(e) => onOpenEvent(event.id, key, e.currentTarget)}
                      title={event.title}
                      className="truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight text-white ring-1 ring-inset ring-black/5 transition-opacity hover:opacity-80"
                      style={{ backgroundColor: event.color }}
                    >
                      {event.title}
                    </button>
                  ))}
                  {hidden > 0 ? (
                    <button
                      type="button"
                      onClick={() => setAllDayExpanded(true)}
                      className="shrink-0 text-left text-[9px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      +{hidden} mais
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Grade de horas (rolável) */}
      <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="flex">
          {/* Coluna de horários */}
          <div className="w-14 shrink-0 border-r">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="relative border-b last:border-b-0"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="absolute -top-2 right-1.5 text-[10px] text-muted-foreground">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* 7 colunas de dias */}
          <div className="grid flex-1 grid-cols-7">
            {days.map((day) => {
              const key = toDateKey(day);
              const dayEvents = timedByDay.get(key) ?? [];
              const isSelected = selectedDate === key;
              const today = isToday(day);

              return (
                <div
                  key={key}
                  className={cn(
                    "relative border-r last:border-r-0",
                    isSelected && "bg-accent/30",
                  )}
                >
                  {/* Linhas de fundo por hora (clicáveis = criar evento) */}
                  {HOURS.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      aria-label={`Criar evento ${formatHour(hour)}`}
                      onClick={() => onCreate(key, formatHour(hour))}
                      className="block w-full border-b last:border-b-0 transition-colors hover:bg-accent/40"
                      style={{ height: HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Eventos com horário */}
                  {dayEvents.map((event) => {
                    const start = timeToMinutes(event.startTime) ?? 0;
                    const end = timeToMinutes(event.endTime);
                    const durationMin =
                      end !== null && end > start ? end - start : 60;
                    const top = (start / 60) * HOUR_HEIGHT;
                    const height = Math.max(
                      (durationMin / 60) * HOUR_HEIGHT,
                      18,
                    );

                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenEvent(event.id, key, e.currentTarget);
                        }}
                        title={`${event.title}${
                          event.startTime ? ` ${event.startTime}` : ""
                        }`}
                        className="absolute left-0.5 right-0.5 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight text-white ring-1 ring-inset ring-black/10 transition-opacity hover:opacity-80"
                        style={{ top, height, backgroundColor: event.color }}
                      >
                        <span className="block truncate">{event.title}</span>
                        {event.startTime ? (
                          <span className="block truncate text-[9px] opacity-90">
                            {event.startTime}
                            {event.endTime ? ` – ${event.endTime}` : ""}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}

                  {/* Indicador de "agora" */}
                  {today ? (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
                      style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                    >
                      <span className="h-2 w-2 -translate-x-1 rounded-full bg-red-500" />
                      <span className="h-px flex-1 bg-red-500" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
