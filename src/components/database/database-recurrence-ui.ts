import { ensureHtml } from "@/lib/markdown";
import {
  WEEKDAY_LABELS,
  recurrenceOccurrences,
  type PageTemplate,
  type Recurrence,
  type RecurrenceEnd,
  type RecurrenceFrequency,
} from "@/types/database";

/** Opções de frequência da recorrência (estilo RRULE). */
export const RECURRENCE_FREQUENCIES: {
  value: RecurrenceFrequency;
  label: string;
  noun: string;
}[] = [
  { value: "daily", label: "Diariamente", noun: "dia" },
  { value: "weekly", label: "Semanalmente", noun: "semana" },
  { value: "monthly", label: "Mensalmente", noun: "más" },
  { value: "yearly", label: "Anualmente", noun: "ano" },
];

/** Opções de término da recorrência. */
export const RECURRENCE_ENDS: { value: RecurrenceEnd; label: string }[] = [
  { value: "never", label: "Nunca" },
  { value: "on", label: "Em uma data" },
  { value: "after", label: "Após" },
];

/** Recorrência padrão de um novo modelo (sem recorrência ativa). */
export function emptyRecurrence(): Recurrence {
  return {
    frequency: "weekly",
    interval: 1,
    weekdays: [],
    end: "never",
    endDate: "",
    endCount: 10,
    time: null,
    startDate: null,
    lastGenerated: null,
  };
}

/** Descreve uma recorrência em texto legível (ex.: "a cada 2 semanas"). */
export function describeRecurrence(rec: Recurrence): string {
  const freq =
    RECURRENCE_FREQUENCIES.find((f) => f.value === rec.frequency) ??
    RECURRENCE_FREQUENCIES[1];
  const interval = Math.max(1, Math.floor(rec.interval) || 1);
  const noun = interval === 1 ? freq.noun : `${freq.noun}s`;
  let text =
    interval === 1 ? `A ${freq.label.toLowerCase()}` : `A cada ${interval} ${noun}`;
  if (rec.frequency === "weekly" && rec.weekdays.length > 0) {
    const weekdays = [...rec.weekdays]
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_LABELS[d])
      .join(", ");
    text += ` (${weekdays})`;
  }
  if (rec.end === "on" && rec.endDate) text += ` até ${rec.endDate}`;
  else if (rec.end === "after" && rec.endCount) text += `, ${rec.endCount}x`;
  if (rec.time) text += ` às ${rec.time}`;
  return text;
}

/**
 * Monta a seção HTML de recorrência (descrição + próximas datas) para anexar ao
 * conteúdo da página ao aplicar um modelo. Retorna string vazia se não houver
 * recorrência ou datas geradas.
 */
export function recurrenceHtmlSection(rec: Recurrence, fromISO: string): string {
  const dates = recurrenceOccurrences(rec, fromISO, 12);
  const items = dates.map((d) => `<li>${formatRecurrenceDate(d)}</li>`).join("");
  return (
    `<h3>Recorrência</h3>` +
    `<p><strong>${describeRecurrence(rec)}</strong></p>` +
    (items ? `<p>Próximas datas:</p><ul>${items}</ul>` : "")
  );
}

/** Formata uma data ISO em "dd/mm/aaaa". */
export function formatRecurrenceDate(key: string): string {
  const [y, m, d] = key.split("-");
  if (!y || !m || !d) return key;
  return `${d}/${m}/${y}`;
}

/**
 * Monta o HTML aplicado à página do item ao usar um modelo: o conteúdo do
 * modelo (convertido para HTML) seguido da seção de recorrência, quando houver.
 */
export function templateContentHtml(tpl: PageTemplate): string {
  const base = ensureHtml(tpl.content);
  if (!tpl.recurrence) return base;
  const todayISO = (() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  })();
  const section = recurrenceHtmlSection(tpl.recurrence, todayISO);
  return [base, section].filter(Boolean).join("");
}
