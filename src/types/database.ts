/** Tipos de propriedade suportados pelas colunas (estilo Notion). */
export type ColumnType =
  | "text"
  | "number"
  | "select"
  | "status"
  | "multi_select"
  | "date"
  | "checkbox"
  | "person"
  | "relation"
  | "rollup";

/** Formato de exibição de uma coluna do tipo número (estilo Notion). */
export type NumberFormat = "plain" | "separators" | "percent" | "currency";

/** Limite de vínculos de uma propriedade de relação (estilo Notion). */
export type RelationLimit = "one" | "many";

/** Função de agregação de um rollup (estilo Notion). */
export type RollupFunction =
  | "count_all"
  | "count_filled"
  | "count_empty"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "median"
  | "range"
  | "percent_checked"
  | "show_original"
  | "earliest_date"
  | "latest_date";

/**
 * Função de agregação exibida no **rodapé** de uma coluna numérica (estilo
 * Notion). Calculada no servidor sobre todas as linhas do database, respeitando
 * a busca e os filtros da visão ativa.
 */
export type CalcFunction =
  | "count_all"
  | "count_filled"
  | "count_empty"
  | "count_unique"
  | "percent_filled"
  | "percent_empty"
  | "sum"
  | "avg"
  | "median"
  | "min"
  | "max"
  | "range";

/**
 * Configuração de uma propriedade do tipo `rollup`: agrega uma propriedade do
 * item alvo (via uma propriedade de relação da mesma tabela). Rollup de rollup é
 * proibido (elimina ciclos).
 */
export interface RollupConfig {
  /** Id da coluna de relação da própria tabela (origem dos itens alvo). */
  relationPropertyId: string;
  /** Id da propriedade lida no item alvo. */
  targetPropertyId: string;
  fn: RollupFunction;
}

/** Definição de uma coluna/propriedade da tabela. */
export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  /** Largura da coluna em pixels (opcional; usa o padrão quando ausente). */
  width?: number;
  /** Quando true, a propriedade fica oculta na tabela (não remove os dados). */
  hidden?: boolean;
  /**
   * Formato de exibição quando `type === "number"`. Ausente equivale a
   * `"plain"` (número simples, sem separadores).
   */
  numberFormat?: NumberFormat;
  /**
   * Casas decimais exibidas quando `type === "number"`. `null`/ausente significa
   * "Padrão" (mínimo de casas que represente o valor, até 2 decimais).
   */
  decimals?: number | null;
  /**
   * Nome de um ícone lucide escolhido pelo usuário para a propriedade (ex.:
   * "Hash", "CalendarDays"). Ausente significa "Automático" (usa o ícone padrão
   * do tipo da coluna).
   */
  icon?: string;
  /** Código ISO 4217 da moeda quando `numberFormat === "currency"`. */
  currency?: string;
  /** Opções configuráveis para colunas do tipo select/multi_select. */
  options?: SelectOption[];
  /**
   * Id do database alvo quando `type === "relation"`. Os **vínculos** ficam na
   * tabela `relation_links` (não mais em `values`).
   */
  relationDatabaseId?: string;
  /**
   * Quando `true`, a relação cria uma coluna espelho no database alvo
   * (bidirecional). O espelho é criado/removido por RPC.
   */
  isBidirectional?: boolean;
  /**
   * Id da coluna espelho (na outra database) quando `isBidirectional`. É apenas
   * um id de coluna (sem FK) — a limpeza depende das RPCs de relação.
   */
  reversePropertyId?: string;
  /** Limite de vínculos por item quando `type === "relation"` (default "many"). */
  limit?: RelationLimit;
  /** Configuração quando `type === "rollup"`. */
  rollup?: RollupConfig;
  /**
   * Agregação exibida no rodapé da coluna (somente `type === "number"`).
   * Ausente equivale a "Nenhum" (sem rodapé para a coluna).
   */
  calculate?: CalcFunction;
}

/**
 * Categoria de uma opção de status (estilo Notion), usada para agrupar as
 * opções no editor: A fazer → Em andamento → Concluídos.
 */
export type StatusCategory = "todo" | "doing" | "done";

/** Opção de uma propriedade do tipo select/status/multi_select. */
export interface SelectOption {
  id: string;
  label: string;
  /** Classe de cor do "chip" (estilo Notion). */
  color: string;
  /**
   * Categoria da opção, apenas para propriedades do tipo `status`. Ausente em
   * opções de `select`/`multi_select` (e tratada como "todo" como fallback).
   */
  category?: StatusCategory;
}

/** Valor de célula: texto, número ou lista (multi-select). */
export type CellValue = string | string[];

/** Uma linha (item) de um database. */
export interface DbRow {
  id: string;
  /** Valores indexados pelo id da coluna. */
  values: Record<string, CellValue>;
  /** Posição de ordenação (keyset da paginação). Opcional no domínio. */
  position?: number;
}

/** Frequência base de uma regra de recorrência (estilo RRULE). */
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

/** Como a recorrência termina. */
export type RecurrenceEnd = "never" | "on" | "after";

/**
 * Configuração de recorrência de um modelo de página, no espírito de uma RRULE
 * (frequência + intervalo + dias da semana, com término opcional).
 */
export interface Recurrence {
  frequency: RecurrenceFrequency;
  /** A cada N períodos (ex.: intervalo 2 + semanal = a cada 2 semanas). */
  interval: number;
  /** Dias da semana (0=domingo .. 6=sábado). Usado só em frequência semanal. */
  weekdays: number[];
  end: RecurrenceEnd;
  /** Data final (YYYY-MM-DD) quando `end === "on"`. */
  endDate?: string;
  /** Número de ocorrências quando `end === "after"`. */
  endCount?: number;
  /**
   * Horário da ocorrência no formato `HH:mm` (opcional). Quando presente, os
   * itens gerados automaticamente aparecem no calendário com horário — e não
   * mais como evento de dia inteiro.
   */
  time?: string | null;
  /**
   * Data (YYYY-MM-DD) em que a geração automática de itens começou. É gravada
   * ao habilitar a automação no modelo, para que o app saiba a partir de quando
   * criar os itens que "vencem" ao longo dos dias.
   */
  startDate?: string | null;
  /**
   * Última data (YYYY-MM-DD) já gerada automaticamente por este modelo. Usada
   * para criar apenas as ocorrências que faltam (idempotência), sem duplicar.
   */
  lastGenerated?: string | null;
}

/** Modelo de página: conteúdo inicial reutilizável para a página de um item. */
export interface PageTemplate {
  id: string;
  name: string;
  /** Conteúdo (texto) aplicado à página do item. */
  content: string;
  /** Recorrência opcional aplicada ao modelo (gera datas na página). */
  recurrence?: Recurrence | null;
}

/** Rótulos curtos dos dias da semana (0=domingo .. 6=sábado). */
export const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * Gera as ocorrências (datas ISO `YYYY-MM-DD`) de uma regra de recorrência a
 * partir de `fromISO`, respeitando frequência, intervalo, dias da semana e
 * término. Retorna no máximo `limit` datas (para não gerar listas infinitas).
 */
export function recurrenceOccurrences(
  rec: Recurrence,
  fromISO: string,
  limit = 30,
): string[] {
  const start = parseISODate(fromISO);
  if (!start) return [];
  const interval = Math.max(1, Math.floor(rec.interval) || 1);
  const dates: string[] = [];
  const endDate = rec.end === "on" && rec.endDate ? parseISODate(rec.endDate) : null;
  const maxCount =
    rec.end === "after" ? Math.max(0, Math.floor(rec.endCount ?? 0)) : Infinity;

  // Limite de segurança de iterações para evitar loops muito longos.
  const guard = limit * 40 + 366 * 5;
  let iterations = 0;

  const push = (d: Date) => {
    if (endDate && d.getTime() > endDate.getTime()) return false;
    dates.push(toISODate(d));
    return dates.length < Math.min(limit, maxCount);
  };

  if (rec.frequency === "weekly" && rec.weekdays.length > 0) {
    const weekdays = [...rec.weekdays].sort((a, b) => a - b);
    const cursor = new Date(start);
    // Alinha o cursor ao domingo da semana de início.
    cursor.setDate(cursor.getDate() - cursor.getDay());
    while (iterations < guard) {
      iterations += 1;
      for (const wd of weekdays) {
        const d = new Date(cursor);
        d.setDate(cursor.getDate() + wd);
        if (d.getTime() < start.getTime()) continue;
        if (endDate && d.getTime() > endDate.getTime()) return dates;
        dates.push(toISODate(d));
        if (dates.length >= limit || dates.length >= maxCount) return dates;
      }
      cursor.setDate(cursor.getDate() + 7 * interval);
      if (cursor.getTime() > start.getTime() + 1000 * 60 * 60 * 24 * 366 * 20) {
        break;
      }
    }
    return dates;
  }

  let current = new Date(start);
  while (iterations < guard) {
    iterations += 1;
    if (!push(current)) break;
    const next = new Date(current);
    if (rec.frequency === "daily") next.setDate(current.getDate() + interval);
    else if (rec.frequency === "weekly") next.setDate(current.getDate() + 7 * interval);
    else if (rec.frequency === "monthly") next.setMonth(current.getMonth() + interval);
    else next.setFullYear(current.getFullYear() + interval);
    current = next;
  }
  return dates;
}

/**
 * Gera todas as ocorrências (datas ISO `YYYY-MM-DD`) de uma regra que ocorrem no
 * intervalo `[fromISO, untilISO]` (inclusive), respeitando frequência, intervalo,
 * dias da semana e término. Usada pela geração automática de itens ao longo dos
 * dias — por isso não aplica o limite "de exibição" da `recurrenceOccurrences`
 * (apenas um teto de segurança para evitar laços muito longos).
 */
export function recurrenceOccurrencesUntil(
  rec: Recurrence,
  fromISO: string,
  untilISO: string,
): string[] {
  const start = parseISODate(fromISO);
  const until = parseISODate(untilISO);
  if (!start || !until || until.getTime() < start.getTime()) return [];

  const interval = Math.max(1, Math.floor(rec.interval) || 1);
  const endDate = rec.end === "on" && rec.endDate ? parseISODate(rec.endDate) : null;
  const maxCount =
    rec.end === "after" ? Math.max(0, Math.floor(rec.endCount ?? 0)) : Infinity;

  const dates: string[] = [];
  const guard = 366 * 60; // teto de segurança de iterações (~60 anos de dias)
  let iterations = 0;

  const withinEnd = (d: Date) => {
    if (endDate && d.getTime() > endDate.getTime()) return false;
    return dates.length < maxCount;
  };

  if (rec.frequency === "weekly" && rec.weekdays.length > 0) {
    const weekdays = [...rec.weekdays].sort((a, b) => a - b);
    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() - cursor.getDay());
    while (iterations < guard && cursor.getTime() <= until.getTime()) {
      iterations += 1;
      for (const wd of weekdays) {
        const d = new Date(cursor);
        d.setDate(cursor.getDate() + wd);
        if (d.getTime() < start.getTime() || d.getTime() > until.getTime()) continue;
        if (!withinEnd(d)) return dates;
        dates.push(toISODate(d));
      }
      cursor.setDate(cursor.getDate() + 7 * interval);
    }
    return dates;
  }

  let current = new Date(start);
  while (iterations < guard && current.getTime() <= until.getTime()) {
    iterations += 1;
    if (!withinEnd(current)) break;
    dates.push(toISODate(current));
    const next = new Date(current);
    if (rec.frequency === "daily") next.setDate(current.getDate() + interval);
    else if (rec.frequency === "weekly") next.setDate(current.getDate() + 7 * interval);
    else if (rec.frequency === "monthly") next.setMonth(current.getMonth() + interval);
    else next.setFullYear(current.getFullYear() + interval);
    current = next;
  }
  return dates;
}

/** Interpreta `YYYY-MM-DD` como data local; devolve `null` se inválida. */
function parseISODate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Formata uma data local como `YYYY-MM-DD`. */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Um database completo: metadados + definição de colunas + linhas + modelos. */
export interface Database {
  id: string;
  name: string;
  /**
   * Nome de um ícone lucide escolhido pelo usuário para o database (ex.:
   * "Table2", "Folder"). `null`/ausente significa "Padrão" (usa `Table2`).
   */
  icon: string | null;
  /** Projeto ao qual o database pertence (`null` para databases sem projeto). */
  projectId: string | null;
  /**
   * Visão vinculada: id do database de origem cujas propriedades e itens este
   * database exibe (editar em um reflete no outro). `null`/ausente = próprio.
   */
  linkedDatabaseId?: string | null;
  columns: Column[];
  rows: DbRow[];
  /** Modelos de página disponíveis para os itens deste database. */
  templates: PageTemplate[];
}

/** Um projeto: agrupador de databases (hierarquia Projeto > Databases). */
export interface Project {
  id: string;
  name: string;
  /** Categoria do projeto (ex.: Pessoal, Trabalho, Estudos...). `null` = sem categoria. */
  category: string | null;
  /** Classe de cor **da categoria** do projeto (estilo Notion). `null` = cor padrão. */
  color: string | null;
  /** Ordem de exibição na sidebar (menor = primeiro). Atualizada no drag & drop. */
  position: number;
}

/**
 * Uma categoria de projetos do usuário (ex.: Pessoal, Trabalho...). As categorias
 * são compartilhadas entre os projetos do usuário e a **ordem** (`position`) é
 * persistida para o seletor do popover "Novo projeto", atualizada no drag & drop.
 */
export interface ProjectCategory {
  id: string;
  name: string;
  /** Classe de cor do marcador da categoria. `null` = cor padrão. */
  color: string | null;
  /** Ordem de exibição (menor = primeiro). */
  position: number;
}

/** Chave reservada em `DbRow.values` que guarda o conteúdo da página do item. */
export const PAGE_CONTENT_KEY = "__content";

/**
 * Chave reservada em `DbRow.values` que guarda o horário (`HH:mm`) do item.
 * Quando presente, o evento derivado no calendário deixa de ser "dia inteiro"
 * e passa a ter horário de início/fim.
 */
export const PAGE_TIME_KEY = "__time";

