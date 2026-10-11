import type { CalendarEvent } from "@/types/event";
import {
  PAGE_TIME_KEY,
  type CellValue,
  type Column,
  type Database,
  type DbRow,
} from "@/types/database";

/**
 * Cor padrão usada nos eventos derivados de databases (verde-esmeralda), para
 * diferenciá-los visualmente dos eventos normais do calendário.
 */
export const DATABASE_EVENT_COLOR = "#10b981";

/** Prefixo do id dos eventos derivados de databases (permite detectar a origem). */
const DATABASE_EVENT_PREFIX = "db:";

/** Extrai o id do database a partir do id de um evento derivado (ou null). */
export function databaseIdFromEventId(eventId: string): string | null {
  if (!eventId.startsWith(DATABASE_EVENT_PREFIX)) return null;
  const rest = eventId.slice(DATABASE_EVENT_PREFIX.length);
  const sep = rest.indexOf(":");
  return sep > 0 ? rest.slice(0, sep) : null;
}

/** Extrai o id da linha (item) a partir do id de um evento derivado (ou null). */
export function databaseRowIdFromEventId(eventId: string): string | null {
  if (!eventId.startsWith(DATABASE_EVENT_PREFIX)) return null;
  const rest = eventId.slice(DATABASE_EVENT_PREFIX.length);
  const sep = rest.indexOf(":");
  return sep > 0 ? rest.slice(sep + 1) : null;
}

/** Verifica se uma string é uma data válida no formato "yyyy-MM-dd". */
function asDateKey(value: CellValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/** Verifica se uma string é um horário válido no formato "HH:mm". */
function asTimeKey(value: CellValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
}

/** Soma 1 hora a um horário "HH:mm" (para o fim padrão do evento). */
function plusOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + 60) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Primeira coluna de um dado tipo (não oculta preferida). */
function firstColumnOfType(columns: Column[], type: Column["type"]): Column | null {
  const visible = columns.find((c) => c.type === type && !c.hidden);
  return visible ?? columns.find((c) => c.type === type) ?? null;
}

/** Título do item: usa a primeira coluna de texto ou o primeiro valor não vazio. */
function rowTitle(row: DbRow, columns: Column[], fallback: string): string {
  const textCol = firstColumnOfType(columns, "text");
  if (textCol) {
    const value = row.values[textCol.id];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  for (const col of columns) {
    const value = row.values[col.id];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

/**
 * Converte as linhas de um database em eventos de calendário. Cada item que
 * possua uma propriedade do tipo "date" com uma data válida vira um evento
 * posicionado nessa data. Itens que também tenham horário (chave reservada
 * `PAGE_TIME_KEY`, ex.: gerados por um modelo recorrente com horário) viram
 * eventos com hora de início/fim; os demais ficam como "dia inteiro". O título
 * do evento é o nome do item.
 */
export function databaseRowsToEvents(database: Database): CalendarEvent[] {
  const dateColumn = firstColumnOfType(database.columns, "date");
  if (!dateColumn) return [];

  const events: CalendarEvent[] = [];
  for (const row of database.rows) {
    const date = asDateKey(row.values[dateColumn.id]);
    if (!date) continue;
    const time = asTimeKey(row.values[PAGE_TIME_KEY]);
    events.push({
      id: `${DATABASE_EVENT_PREFIX}${database.id}:${row.id}`,
      title: rowTitle(row, database.columns, database.name),
      description: null,
      date,
      endDate: null,
      allDay: !time,
      startTime: time,
      endTime: time ? plusOneHour(time) : null,
      color: DATABASE_EVENT_COLOR,
    });
  }
  return events;
}
