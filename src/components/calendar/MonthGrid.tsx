"use client";

import { isSameMonth, isToday } from "date-fns";
import { Plus } from "lucide-react";

import { getMonthMatrix, toDateKey, WEEKDAYS, MONTH_NAMES } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/event";

interface MonthGridProps {
  monthIndex: number; // 0-11
  year: number;
  eventsByDate: Map<string, CalendarEvent[]>;
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
  onOpenEvent: (
    eventId: string,
    dateKey: string,
    anchorEl?: HTMLElement | null,
  ) => void;
  onCreate: (dateKey: string) => void;
  /** "compact" = grade anual; "comfortable" = visão de 1 mês (células maiores). */
  variant?: "compact" | "comfortable";
}

interface VariantStyles {
  maxVisible: number;
  barHeight: string;
  barGap: string;
  dayBadge: string;
  dayText: string;
  headerText: string;
  padding: string;
}

const VARIANTS: Record<"compact" | "comfortable", VariantStyles> = {
  compact: {
    maxVisible: 3,
    barHeight: "h-1.5",
    barGap: "gap-[3px]",
    dayBadge: "h-4 w-4",
    dayText: "text-[10px]",
    headerText: "text-xs",
    padding: "p-0.5",
  },
  comfortable: {
    maxVisible: 6,
    barHeight: "h-3",
    barGap: "gap-1",
    dayBadge: "h-6 w-6",
    dayText: "text-xs",
    headerText: "text-base",
    padding: "p-1.5",
  },
};

export function MonthGrid({
  monthIndex,
  year,
  eventsByDate,
  selectedDate,
  onSelectDate,
  onOpenEvent,
  onCreate,
  variant = "compact",
}: MonthGridProps) {
  const monthDate = new Date(year, monthIndex, 1);
  const weeks = getMonthMatrix(monthDate);
  const styles = VARIANTS[variant];
  const isComfortable = variant === "comfortable";

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <header className="flex shrink-0 items-center justify-between border-b px-3 py-1">
        <h3 className={cn("font-semibold", styles.headerText)}>
          {MONTH_NAMES[monthIndex]}{" "}
          <span className="text-muted-foreground">{year}</span>
        </h3>
      </header>

      <div
        className={cn(
          "grid shrink-0 grid-cols-7 border-b bg-muted/40 font-medium uppercase text-muted-foreground",
          isComfortable ? "text-[10px]" : "text-[9px]",
        )}
      >
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className={cn("text-center", isComfortable ? "py-1" : "py-0.5")}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-6">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid min-h-0 grid-cols-7 grid-rows-1">
            {week.map((day) => {
              const dateKey = toDateKey(day);
              const inMonth = isSameMonth(day, monthDate);
              const dayEvents = eventsByDate.get(dateKey) ?? [];
              const isSelected = selectedDate === dateKey;
              const today = isToday(day);

              return (
                <div
                  key={dateKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectDate(dateKey)}
                  onDoubleClick={() => onCreate(dateKey)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectDate(dateKey);
                    }
                  }}
                  className={cn(
                    "group relative flex min-h-0 cursor-pointer flex-col gap-0.5 overflow-hidden border-b border-r text-left transition-colors last:border-r-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    styles.padding,
                    !inMonth && "bg-muted/30 text-muted-foreground",
                    isSelected && "ring-2 ring-inset ring-primary",
                    "hover:bg-accent/60",
                  )}
                >
                  <div className="flex shrink-0 items-center justify-between leading-none">
                    <span
                      className={cn(
                        "flex items-center justify-center rounded-full font-medium",
                        styles.dayBadge,
                        styles.dayText,
                        today && "bg-primary text-primary-foreground",
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <button
                      type="button"
                      aria-label="Adicionar evento"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreate(dateKey);
                      }}
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      <Plus
                        className={cn(
                          "text-muted-foreground hover:text-foreground",
                          isComfortable ? "h-3.5 w-3.5" : "h-2.5 w-2.5",
                        )}
                      />
                    </button>
                  </div>

                  <div
                    className={cn(
                      "mt-px flex min-h-0 flex-1 flex-col overflow-hidden",
                      styles.barGap,
                    )}
                  >
                    {dayEvents.slice(0, styles.maxVisible).map((event) => {
                      const timeLabel =
                        !event.allDay && event.startTime
                          ? ` ${event.startTime}`
                          : "";
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenEvent(event.id, dateKey, e.currentTarget);
                          }}
                          title={`${event.title}${timeLabel}`}
                          aria-label={`${event.title}${timeLabel}`}
                          className={cn(
                            "flex w-full shrink-0 items-center overflow-hidden rounded-full ring-1 ring-inset ring-black/5 transition-opacity hover:opacity-70",
                            styles.barHeight,
                          )}
                          style={{ backgroundColor: event.color }}
                        >
                          {isComfortable ? (
                            <span className="truncate px-1.5 text-[10px] font-medium leading-none text-white">
                              {event.title}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    {dayEvents.length > styles.maxVisible ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDate(dateKey);
                        }}
                        className={cn(
                          "shrink-0 text-right font-medium leading-none text-muted-foreground hover:text-foreground",
                          isComfortable ? "text-[10px]" : "text-[8px]",
                        )}
                      >
                        +{dayEvents.length - styles.maxVisible}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
