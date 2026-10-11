import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent } from "@/types/event";

/** Linha da tabela `events` no Supabase (snake_case). */
interface EventRow {
  id: string;
  title: string;
  description: string | null;
  date: string; // "yyyy-MM-dd" (coluna do tipo date)
  end_date: string | null;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  color: string;
}

function rowToEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    date: row.date,
    endDate: row.end_date,
    allDay: row.all_day,
    startTime: row.start_time,
    endTime: row.end_time,
    color: row.color,
  };
}

/**
 * Busca os eventos que **se sobrepõem** ao intervalo informado (yyyy-MM-dd).
 * Cobre: eventos que começam dentro do intervalo, que terminam dentro dele,
 * e que o englobam por completo. A RLS garante o filtro por usuário.
 */
export async function fetchEventsInRange(
  startKey: string,
  endKey: string,
): Promise<CalendarEvent[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .or(
      [
        `and(date.gte.${startKey},date.lte.${endKey})`,
        `and(end_date.gte.${startKey},end_date.lte.${endKey})`,
        `and(date.lte.${startKey},end_date.gte.${endKey})`,
      ].join(","),
    )
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data as EventRow[]).map(rowToEvent);
}

export interface EventPayload {
  title: string;
  description: string | null;
  date: string; // yyyy-MM-dd (início)
  endDate: string | null; // yyyy-MM-dd (término)
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  color: string;
}

/** Cria um evento para o usuário autenticado. */
export async function createEvent(payload: EventPayload): Promise<CalendarEvent> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("not-authenticated");

  const { data, error } = await supabase
    .from("events")
    .insert({
      user_id: user.id,
      title: payload.title,
      description: payload.description,
      date: payload.date,
      end_date: payload.endDate,
      all_day: payload.allDay,
      start_time: payload.startTime,
      end_time: payload.endTime,
      color: payload.color,
    })
    .select("*")
    .single();

  if (error) throw error;
  return rowToEvent(data as EventRow);
}

/** Atualiza um evento existente. */
export async function updateEvent(
  id: string,
  payload: EventPayload,
): Promise<CalendarEvent> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("events")
    .update({
      title: payload.title,
      description: payload.description,
      date: payload.date,
      end_date: payload.endDate,
      all_day: payload.allDay,
      start_time: payload.startTime,
      end_time: payload.endTime,
      color: payload.color,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return rowToEvent(data as EventRow);
}

/** Remove um evento. */
export async function deleteEvent(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}
