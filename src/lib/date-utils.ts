import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

/** Retorna "yyyy-MM-dd" no fuso local (evita off-by-one do UTC). */
export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Constrói uma Date a partir de "yyyy-MM-dd" sem deslocamento de timezone. */
export function fromDateKey(key: string): Date {
  return parseISO(key);
}

/** Matriz de semanas (domingo→sábado) cobrindo o mês inteiro de `monthDate`. */
export function getMonthMatrix(monthDate: Date): Date[][] {
  const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start, end });

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

export function formatDateLong(date: Date): string {
  return format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function formatMonthYear(date: Date): string {
  return format(date, "MMMM 'de' yyyy", { locale: ptBR });
}

/**
 * Formata um intervalo de datas (yyyy-MM-dd) de forma curta.
 * Mesmo ano: "10 abr – 15 abr 2026" · Anos diferentes: "10 abr 2026 – 15 jan 2027".
 */
export function formatShortRange(startKey: string, endKey: string): string {
  const start = fromDateKey(startKey);
  const end = fromDateKey(endKey);
  const sameYear = start.getFullYear() === end.getFullYear();

  const startLabel = format(start, sameYear ? "d MMM" : "d MMM yyyy", {
    locale: ptBR,
  });
  const endLabel = format(end, "d MMM yyyy", { locale: ptBR });

  return `${startLabel} – ${endLabel}`;
}
