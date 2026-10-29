/**
 * Motor de automações — **compartilhado** entre o worker (Deno/Edge Function) e
 * o app (Next/Vitest).
 *
 * IMPORTANTE: este arquivo é **auto-contido (zero imports)** de propósito. O
 * Deno exige extensão explícita nos imports e o Next/bundler não; a única forma
 * de servir aos dois é não importar nada. Se precisar crescer, divida em mais
 * arquivos auto-contidos em vez de adicionar imports.
 *
 * Ele é a **fonte da verdade** dos literais de `kind` (gatilhos, ações e
 * eventos). O SQL registra o evento com o mesmo `kind` e o teste de contrato
 * garante que os dois lados continuam alinhados.
 */

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

/** Valor de célula: texto ou lista (multi-select). */
export type CellValue = string | string[];

/** Coluna "enxuta" o suficiente para casar regras e aplicar modelos. */
export interface ColumnLike {
  id: string;
  type: string;
  /** Quando true, a coluna é oculta (preferimos as visíveis ao escolher). */
  hidden?: boolean;
  /** Opções de select/status/multi_select (para o editor de ações). */
  options?: { id: string; label: string }[];
}

/** Linha usada no casamento/aplicação das regras. */
export interface AutomationRow {
  id: string;
  /** Database da linha (default do destino de `create_row`). */
  databaseId?: string;
  values: Record<string, CellValue>;
}

/** Diferença de uma célula entre duas escritas (`null` = ausente). */
export interface CellChange {
  from: CellValue | null;
  to: CellValue | null;
}

/** Evento registrado pelo gatilho (SQL) e consumido pelo motor (TS). */
export type AutomationEvent =
  | { kind: "row_created" }
  | { kind: "row_updated"; changed: Record<string, CellChange> }
  | { kind: "date_arrived"; columnId: string; date: string };

/** Condição de um gatilho de mudança de coluna. */
export type ColumnChangeCondition = "to" | "filled" | "empty" | "any";

/** Condição sobre os valores atuais da linha (ex.: "Prioridade = Alta"). */
export interface RowCondition {
  columnId: string;
  value: string;
}

/** Gatilho de uma regra. */
export type AutomationTrigger =
  | {
      kind: "row_created";
      /** Condições opcionais sobre os valores da linha recém-criada. */
      conditions?: RowCondition[];
    }
  | {
      kind: "column_changed";
      columnId: string;
      condition: ColumnChangeCondition;
      /** Valor esperado quando `condition === "to"`. */
      value?: string;
    }
  | { kind: "date_arrived"; columnId: string };

/** Ação "preencher valor" na própria linha. */
export interface SetValueAction {
  kind: "set_value";
  columnId: string;
  /** Valor literal (quando `valueFrom` não é informado). */
  value?: CellValue;
  /** `"today"` resolve para a data local do worker (`ctx.todayISO`). */
  valueFrom?: "today";
}

/** Ação "criar linha" (opcionalmente a partir de um modelo). */
export interface CreateRowAction {
  kind: "create_row";
  /** Database de destino (`null`/ausente = o mesmo da regra). */
  databaseId?: string | null;
  /** Modelo de página a aplicar (nome/conteúdo/data), quando informado. */
  templateId?: string | null;
  /** Valores explícitos (aplicados por cima do modelo). */
  values?: Record<string, CellValue>;
}

/** Ação de uma regra. */
export type AutomationAction = SetValueAction | CreateRowAction;

/** Uma regra "quando → então" de um database. */
export interface AutomationRule {
  id: string;
  databaseId: string;
  name: string;
  enabled: boolean;
  position: number;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  lastRunAt?: string | null;
}

/** Escrita concreta planejada a partir de uma regra casada. */
export type PlannedWrite =
  | { kind: "set_value"; rowId: string; columnId: string; value: CellValue }
  | {
      kind: "create_row";
      databaseId: string;
      values: Record<string, CellValue>;
      templateId: string | null;
    };

/** Contexto de execução do motor. */
export interface AutomationContext {
  /** Data "hoje" no fuso do worker (`YYYY-MM-DD`). */
  todayISO: string;
}

/* -------------------------------------------------------------------------- */
/* Constantes reservadas (espelham `src/types/database.ts`)                    */
/* -------------------------------------------------------------------------- */

/** Chave reservada em `values` que guarda o conteúdo da página do item. */
export const PAGE_CONTENT_KEY = "__content";

/** Chave reservada em `values` que guarda o horário (`HH:mm`) do item. */
export const PAGE_TIME_KEY = "__time";

/** Teto de profundidade do encadeamento (depth 4 é ignorado com cap 3). */
export const MAX_AUTOMATION_DEPTH = 3;

/* -------------------------------------------------------------------------- */
/* Helpers de célula                                                           */
/* -------------------------------------------------------------------------- */

/** A célula está vazia? (ausente, string vazia ou lista vazia) */
export function isEmptyCell(value: CellValue | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return value === "";
}

/**
 * A célula casa com o valor esperado? Listas casam por inclusão (multi-select);
 * escalares, por igualdade.
 */
export function cellMatches(
  value: CellValue | null | undefined,
  expected: string,
): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.includes(expected);
  return value === expected;
}

/* -------------------------------------------------------------------------- */
/* Casamento de regra                                                          */
/* -------------------------------------------------------------------------- */

/** Todas as condições batem com os valores atuais da linha? (vazio = sim) */
export function conditionsMatch(
  conditions: RowCondition[] | undefined,
  values: Record<string, CellValue>,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((condition) =>
    cellMatches(values[condition.columnId], condition.value),
  );
}

/**
 * A regra dispara para este evento/linha?
 *
 * - `row_created` casa com o evento de criação (e com as condições opcionais
 *   sobre os valores da linha, ex.: "Prioridade = Alta");
 * - `column_changed` exige a coluna no diff **e** a condição
 *   (`to` | `filled` | `empty` | `any`);
 * - `date_arrived` exige a mesma coluna e que a data gravada na linha seja
 *   exatamente a data vencida (evita disparar por datas antigas/alteradas).
 */
export function matchRule(
  rule: AutomationRule,
  event: AutomationEvent,
  row: AutomationRow,
): boolean {
  if (!rule.enabled) return false;
  const trigger = rule.trigger;
  switch (trigger.kind) {
    case "row_created":
      return (
        event.kind === "row_created" &&
        conditionsMatch(trigger.conditions, row.values)
      );
    case "column_changed": {
      if (event.kind !== "row_updated") return false;
      const change = event.changed[trigger.columnId];
      if (!change) return false;
      switch (trigger.condition) {
        case "any":
          return true;
        case "to":
          return cellMatches(change.to, trigger.value ?? "");
        case "filled":
          return !isEmptyCell(change.to);
        case "empty":
          return isEmptyCell(change.to);
        default:
          return false;
      }
    }
    case "date_arrived": {
      if (event.kind !== "date_arrived") return false;
      if (event.columnId !== trigger.columnId) return false;
      return row.values[trigger.columnId] === event.date;
    }
    default:
      return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Planejamento de ações                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Traduz as ações de uma regra casada em escritas concretas. `valueFrom:
 * "today"` vira a data de `ctx.todayISO`; `create_row` sem database de destino
 * cai no database da própria linha/regra.
 */
export function planActions(
  rule: AutomationRule,
  row: AutomationRow,
  ctx: AutomationContext,
): PlannedWrite[] {
  const writes: PlannedWrite[] = [];
  for (const action of rule.actions ?? []) {
    if (action.kind === "set_value") {
      const value: CellValue =
        action.valueFrom === "today" ? ctx.todayISO : (action.value ?? "");
      writes.push({
        kind: "set_value",
        rowId: row.id,
        columnId: action.columnId,
        value,
      });
    } else if (action.kind === "create_row") {
      writes.push({
        kind: "create_row",
        databaseId: action.databaseId || row.databaseId || rule.databaseId,
        values: action.values ?? {},
        templateId: action.templateId ?? null,
      });
    }
  }
  return writes;
}

/** A profundidade do encadeamento estourou o teto? (depth 4 → true, cap 3) */
export function depthExceeded(
  depth: number,
  cap: number = MAX_AUTOMATION_DEPTH,
): boolean {
  return depth > cap;
}

/* -------------------------------------------------------------------------- */
/* Aplicação de modelos de página                                              */
/* -------------------------------------------------------------------------- */

/** Converte um conteúdo (possivelmente texto simples) em HTML mínimo. */
export function ensureHtml(value: string): string {
  if (!value) return "";
  return /^\s*<[a-z][\s\S]*>/i.test(value)
    ? value
    : `<p>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
}

/** Primeira coluna de um dado tipo (não oculta preferida). */
export function firstColumnOfType(
  columns: ColumnLike[],
  type: string,
): ColumnLike | null {
  const visible = columns.find((c) => c.type === type && !c.hidden);
  return visible ?? columns.find((c) => c.type === type) ?? null;
}

/** Dados de um modelo necessários para montar a linha. */
export interface TemplateLike {
  name: string;
  content: string;
  time?: string | null;
}

/**
 * Monta os `values` de uma linha criada a partir de um modelo, espelhando o que
 * `runAutoTemplates` (`src/lib/database-recurrence.ts`) faz: conteúdo na chave
 * reservada, data na coluna de data, nome na primeira coluna de texto/pessoa e
 * horário na chave reservada. Assim os itens criados por automação ficam
 * idênticos aos criados por recorrência (calendário e editor de página).
 */
export function templateRowValues(
  template: TemplateLike,
  columns: ColumnLike[],
  dateISO: string,
): Record<string, CellValue> {
  const values: Record<string, CellValue> = {
    [PAGE_CONTENT_KEY]: ensureHtml(template.content),
  };
  const dateColumn = firstColumnOfType(columns, "date");
  if (dateColumn) values[dateColumn.id] = dateISO;
  const titleColumn =
    firstColumnOfType(columns, "text") ?? firstColumnOfType(columns, "person");
  if (titleColumn) values[titleColumn.id] = template.name;
  if (template.time) values[PAGE_TIME_KEY] = template.time;
  return values;
}
