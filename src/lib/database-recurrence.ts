import { createRow, updateTemplateRecurrence } from "@/lib/database";
import {
  PAGE_CONTENT_KEY,
  PAGE_TIME_KEY,
  recurrenceOccurrencesUntil,
  type Column,
  type Database,
  type PageTemplate,
} from "@/types/database";

/* -------------------------------------------------------------------------- */
/* Utilidades de data (locais, sem dependência de timezone do navegador)       */
/* -------------------------------------------------------------------------- */

/** Formata uma data local como `YYYY-MM-DD`. */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Data "hoje" no fuso local, em `YYYY-MM-DD`. */
export function todayISO(): string {
  return toISODate(new Date());
}

/** Soma 1 dia a uma data `YYYY-MM-DD` (para procurar a partir do dia seguinte). */
function nextDayISO(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 1);
  return toISODate(date);
}

/** Converte um conteúdo (possivelmente texto simples) em HTML mínimo. */
function ensureHtml(value: string): string {
  if (!value) return "";
  return /^\s*<[a-z][\s\S]*>/i.test(value)
    ? value
    : `<p>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
}

/** Primeira coluna de um dado tipo (não oculta preferida). */
function firstColumnOfType(columns: Column[], type: Column["type"]): Column | null {
  const visible = columns.find((c) => c.type === type && !c.hidden);
  return visible ?? columns.find((c) => c.type === type) ?? null;
}

/**
 * Um modelo é "automático" quando tem uma regra de recorrência **e** uma data de
 * início registrada (`recurrence.startDate`). Essa data é gravada quando o
 * usuário habilita a automação ao criar/editar o modelo.
 */
export function isAutoTemplate(template: PageTemplate): boolean {
  return Boolean(template.recurrence && template.recurrence.startDate);
}

/** Resultado de uma rodada de geração automática para um database. */
export interface AutoGenerateResult {
  /** Database que teve itens gerados. */
  databaseId: string;
  /** Linhas recém-criadas (na ordem de criação). */
  created: number;
  /** Database após a geração (com as novas linhas), quando houve mudança. */
  database: Database;
}

/**
 * Gera automaticamente os itens "que venceram" para todos os modelos recorrentes
 * automáticos de um conjunto de databases.
 *
 * Regra: para cada modelo automático, cria **uma linha por ocorrência** entre
 * `recorrence.lastGenerated + 1 dia` (ou `recurrence.startDate`, na primeira vez)
 * e **hoje** (inclusive). Depois grava a última data gerada no modelo para não
 * duplicar em execuções futuras. Cada linha recebe:
 * - a data da ocorrência na coluna de `date` (para aparecer no calendário);
 * - o horário (`recurrence.time`) na chave reservada `PAGE_TIME_KEY`;
 * - o nome do modelo na primeira coluna de texto/pessoa (título);
 * - o conteúdo do modelo na chave reservada `PAGE_CONTENT_KEY`.
 *
 * Retorna apenas os databases que sofreram mudanças. É idempotente: chamar de
 * novo no mesmo dia não cria duplicatas.
 */
export async function runAutoTemplates(
  databases: Database[],
): Promise<AutoGenerateResult[]> {
  const today = todayISO();
  const results: AutoGenerateResult[] = [];

  for (const database of databases) {
    const autoTemplates = database.templates.filter(isAutoTemplate);
    if (autoTemplates.length === 0) continue;

    const dateColumn = firstColumnOfType(database.columns, "date");
    const titleColumn = (() => {
      const text = firstColumnOfType(database.columns, "text");
      if (text) return text;
      return firstColumnOfType(database.columns, "person");
    })();

    let rows = database.rows;
    let position = rows.length;
    let created = 0;

    for (const template of autoTemplates) {
      const recurrence = template.recurrence;
      if (!recurrence) continue;

      const startDate = recurrence.startDate ?? today;
      // A partir da última data gerada (exclusive) ou do início (inclusive).
      const from = recurrence.lastGenerated
        ? nextDayISO(recurrence.lastGenerated)
        : startDate;
      if (from > today) continue;

      const dates = recurrenceOccurrencesUntil(recurrence, from, today);
      if (dates.length === 0) {
        // Nada a gerar hoje, mas pode ser que startDate seja futura — registra
        // apenas se ainda não houver marcador (para começar a contar a partir dali).
        continue;
      }

      for (const date of dates) {
        const values: Record<string, string> = { [PAGE_CONTENT_KEY]: ensureHtml(template.content) };
        if (dateColumn) values[dateColumn.id] = date;
        if (titleColumn) values[titleColumn.id] = template.name;
        if (recurrence.time) values[PAGE_TIME_KEY] = recurrence.time;

        const row = await createRow(database.id, values, position);
        position += 1;
        created += 1;
        rows = [...rows, row];
      }

      // Marca a última data gerada para não repetir amanhã.
      const lastGenerated = dates[dates.length - 1];
      const updatedRecurrence = { ...recurrence, lastGenerated };
      await updateTemplateRecurrence(template.id, updatedRecurrence);
      database.templates = database.templates.map((t) =>
        t.id === template.id ? { ...t, recurrence: updatedRecurrence } : t,
      );
    }

    if (created > 0) {
      results.push({ databaseId: database.id, created, database: { ...database, rows } });
    }
  }

  return results;
}
