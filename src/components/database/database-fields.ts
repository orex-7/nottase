import {
  AlignLeft,
  CalendarDays,
  CheckSquare,
  CircleDashed,
  Hash,
  Link2,
  List,
  ListOrdered,
  Percent,
  Sigma,
  Tags,
  User,
} from "lucide-react";

import { currencyByCode } from "@/lib/currencies";
import { ICON_BY_NAME } from "@/lib/database-icons";
import type {
  CalcFunction,
  CellValue,
  Column,
  ColumnType,
  Database,
  DbRow,
  NumberFormat,
  RelationLimit,
  RollupFunction,
  SelectOption,
  StatusCategory,
} from "@/types/database";

/* -------------------------------------------------------------------------- */
/* Larguras de coluna                                                          */
/* -------------------------------------------------------------------------- */

/** Larguras (px) das colunas: padrão, mínimo e máximo redimensionável. */
export const DEFAULT_COLUMN_WIDTH = 220;
export const MIN_COLUMN_WIDTH = 96;
/**
 * Mínimo (px) para colunas de caixa de seleção: permite reduzir a coluna até
 * que reste apenas o ícone da propriedade no cabeçalho (nome truncado).
 */
export const CHECKBOX_MIN_COLUMN_WIDTH = 52;
export const MAX_COLUMN_WIDTH = 640;
/** Largura da coluna final que guarda as ações (excluir linha). */
export const ACTIONS_COLUMN_WIDTH = 44;
/**
 * Largura da coluna "gutter" à esquerda da primeira coluna: guarda o botão
 * "+" (nova linha), a alça de arraste (reordenar) e o checkbox de seleção.
 */
export const ROW_GUTTER_WIDTH = 88;

/** Largura efetiva de uma coluna (respeita o valor persistido, se houver). */
export function columnWidth(column: Column): number {
  return column.width ?? DEFAULT_COLUMN_WIDTH;
}

/**
 * Largura mínima redimensionável de uma coluna. Colunas de caixa de seleção
 * podem encolher mais que as demais: o mínimo é suficiente para exibir apenas
 * o ícone da propriedade (o nome é truncado/oculto).
 */
export function minColumnWidth(column: Column): number {
  return column.type === "checkbox" ? CHECKBOX_MIN_COLUMN_WIDTH : MIN_COLUMN_WIDTH;
}

/* -------------------------------------------------------------------------- */
/* Tipos de coluna e ícones                                                    */
/* -------------------------------------------------------------------------- */

export const COLUMN_TYPES: {
  type: ColumnType;
  label: string;
  icon: typeof AlignLeft;
}[] = [
  { type: "text", label: "Texto", icon: AlignLeft },
  { type: "number", label: "Número", icon: Hash },
  { type: "select", label: "Seleção", icon: List },
  { type: "status", label: "Status", icon: CircleDashed },
  { type: "multi_select", label: "Seleção múltipla", icon: Tags },
  { type: "date", label: "Data", icon: CalendarDays },
  { type: "checkbox", label: "Caixa de seleção", icon: CheckSquare },
  { type: "person", label: "Pessoa", icon: User },
  { type: "relation", label: "Relação", icon: Link2 },
  { type: "rollup", label: "Rollup", icon: Sigma },
];

/* -------------------------------------------------------------------------- */
/* Relação e Rollup                                                            */
/* -------------------------------------------------------------------------- */

/** Opções do limite de vínculos de uma propriedade de relação. */
export const RELATION_LIMITS: { value: RelationLimit; label: string }[] = [
  { value: "many", label: "Vários itens" },
  { value: "one", label: "Um item" },
];

/** Rótulo do limite atual de uma relação (default "Vários itens"). */
export function relationLimitLabel(limit: RelationLimit | undefined): string {
  return RELATION_LIMITS.find((l) => l.value === (limit ?? "many"))?.label ?? "Vários itens";
}

/** Funções de agregação disponíveis em uma propriedade do tipo rollup. */
export const ROLLUP_FUNCTIONS: {
  value: RollupFunction;
  label: string;
  icon: typeof Sigma;
}[] = [
  { value: "count_all", label: "Contar todos", icon: Sigma },
  { value: "count_filled", label: "Contar preenchidos", icon: Sigma },
  { value: "count_empty", label: "Contar vazios", icon: Sigma },
  { value: "sum", label: "Soma", icon: Sigma },
  { value: "avg", label: "Média", icon: Sigma },
  { value: "min", label: "Mínimo", icon: Sigma },
  { value: "max", label: "Máximo", icon: Sigma },
  { value: "median", label: "Mediana", icon: Sigma },
  { value: "range", label: "Intervalo", icon: Sigma },
  { value: "percent_checked", label: "Porcentagem marcada", icon: Sigma },
  { value: "show_original", label: "Mostrar original", icon: Sigma },
  { value: "earliest_date", label: "Data mais antiga", icon: Sigma },
  { value: "latest_date", label: "Data mais recente", icon: Sigma },
];

/** Rótulo de uma função de rollup. */
export function rollupFunctionLabel(fn: RollupFunction): string {
  return ROLLUP_FUNCTIONS.find((f) => f.value === fn)?.label ?? "Contar todos";
}

/**
 * Funções de agregação disponíveis no item "Calcular" de uma coluna numérica
 * (rodapé da tabela, estilo Notion).
 */
export const CALC_FUNCTIONS: { value: CalcFunction; label: string }[] = [
  { value: "count_all", label: "Contagem" },
  { value: "count_filled", label: "Contagem preenchidos" },
  { value: "count_empty", label: "Contagem vazios" },
  { value: "count_unique", label: "Contagem única" },
  { value: "percent_filled", label: "Porcentagem preenchidos" },
  { value: "percent_empty", label: "Porcentagem vazios" },
  { value: "sum", label: "Soma" },
  { value: "avg", label: "Média" },
  { value: "median", label: "Mediana" },
  { value: "min", label: "Mínimo" },
  { value: "max", label: "Máximo" },
  { value: "range", label: "Intervalo" },
];

/** Rótulo de uma função de cálculo (default "Contagem"). */
export function calcFunctionLabel(fn: CalcFunction): string {
  return CALC_FUNCTIONS.find((f) => f.value === fn)?.label ?? "Contagem";
}

export function columnTypeMeta(type: ColumnType) {
  return COLUMN_TYPES.find((t) => t.type === type) ?? COLUMN_TYPES[0];
}

/**
 * Resolve o ícone exibido para uma propriedade: o escolhido pelo usuário
 * (`column.icon`), ou o ícone padrão do tipo quando ausente/"Automático".
 */
export function columnIcon(column: Column) {
  if (column.icon) {
    const custom = ICON_BY_NAME[column.icon];
    if (custom) return custom;
  }
  return columnTypeMeta(column.type).icon;
}

/* -------------------------------------------------------------------------- */
/* Formato de número                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Opções de formato de número (estilo Notion). A quarta opção, "Moedas", abre a
 * lista de 30 moedas em vez de ser um valor de `NumberFormat` próprio.
 */
export const NUMBER_FORMATS: {
  value: NumberFormat;
  label: string;
  icon: typeof Hash;
}[] = [
  { value: "plain", label: "Número", icon: Hash },
  { value: "separators", label: "Número com separadores", icon: ListOrdered },
  { value: "percent", label: "Percentual", icon: Percent },
];

/** Rótulo curto do formato de número atual de uma coluna (ex.: "Moedas — R$"). */
export function numberFormatLabel(column: Column): string {
  if (column.numberFormat === "separators") return "Número com separadores";
  if (column.numberFormat === "percent") return "Percentual";
  if (column.numberFormat === "currency") {
    const currency = currencyByCode(column.currency);
    return `Moedas — ${currency.symbol} ${currency.code}`;
  }
  return "Número";
}

/**
 * Opções de casas decimais exibidas por uma coluna numérica. `null` = "Padrão"
 * (mostra o mínimo de casas que represente o valor, até 2 decimais).
 */
export const DECIMAL_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Padrão" },
  { value: 0, label: "0" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
];

/** Rótulo do número de casas decimais atual (ex.: "2" ou "Padrão"). */
export function decimalsLabel(column: Column): string {
  const decimals = column.decimals ?? null;
  if (decimals === null) return "Padrão";
  return String(decimals);
}

/* -------------------------------------------------------------------------- */
/* Status, tags e opções                                                       */
/* -------------------------------------------------------------------------- */

export const STATUS_OPTIONS: SelectOption[] = [
  // Não iniciado (cinza) → Em andamento (azul) → Concluído (verde)
  { id: "todo", label: "Não iniciado", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300", category: "todo" },
  { id: "doing", label: "Em andamento", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300", category: "doing" },
  { id: "done", label: "Concluído", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", category: "done" },
];

/**
 * Categorias de status (estilo Notion), na ordem exibida no editor: as opções
 * de uma propriedade `status` são agrupadas sob cada um destes títulos, com um
 * botão "+" para adicionar uma nova opção já na categoria correspondente.
 */
export const STATUS_CATEGORIES: { key: StatusCategory; label: string }[] = [
  { key: "todo", label: "A fazer" },
  { key: "doing", label: "Em andamento" },
  { key: "done", label: "Concluídos" },
];

export const TAG_OPTIONS: SelectOption[] = [
  { id: "design", label: "Design", color: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  { id: "dev", label: "Dev", color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  { id: "marketing", label: "Marketing", color: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  { id: "pessoal", label: "Pessoal", color: "bg-pink-500/15 text-pink-700 dark:text-pink-300" },
];

/** Converte "yyyy-MM-dd" em "dd MMM" curto (pt-BR), sem depender de timezone. */
export function formatShortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  const months = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  return `${d} ${months[m - 1]}`;
}

/** Gera um id único para colunas criadas no cliente (chave em `DbRow.values`). */
export function newColumnId(): string {
  return `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Busca a opção (status/tag) pelo id, para exibir chips em modo leitura. */
export function tagById(id: string): SelectOption | undefined {
  return TAG_OPTIONS.find((t) => t.id === id);
}

/** Paleta de cores disponíveis para as opções (chips estilo Notion). */
export const OPTION_COLORS: string[] = [
  "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-red-500/15 text-red-700 dark:text-red-300",
  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];

/** Gera um id único para uma opção criada no cliente. */
export function newOptionId(): string {
  return `opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Opções disponíveis para uma coluna do tipo select/multi_select.
 * Colunas `select`/`multi_select` criadas pelo usuário começam **vazias**
 * (sem opções) até que o usuário as cadastre. Apenas `status` (categorias
 * fixas) e a coluna legada `tags` têm uma lista base pré-definida.
 */
export function optionsForColumn(column: Column): SelectOption[] {
  if (
    column.type !== "select" &&
    column.type !== "status" &&
    column.type !== "multi_select"
  )
    return [];
  // Opções configuradas na coluna têm prioridade (colunas customizadas).
  if (column.options && column.options.length > 0) return column.options;
  // Colunas de status usam as categorias fixas (A fazer/Em andamento/Concluído).
  if (column.id === "status" || column.type === "status") return STATUS_OPTIONS;
  // Coluna legada de tags reutiliza a lista base por id.
  if (column.id === "tags") return TAG_OPTIONS;
  // Propriedades de seleção/seleção múltipla começam vazias por padrão.
  return [];
}

/**
 * Opções que podem ser editadas na tela "Editar propriedades".
 * Para colunas select/multi_select sempre devolve uma lista (mesmo que base),
 * de modo que o usuário possa adicionar/renomear/excluir a partir dela.
 */
export function editableOptionsForColumn(column: Column): SelectOption[] {
  if (
    column.type !== "select" &&
    column.type !== "status" &&
    column.type !== "multi_select"
  )
    return [];
  return optionsForColumn(column);
}

/** Valor de uma célula (nunca undefined — usa "" como padrão). */
export function cellOf(row: DbRow, columnId: string): CellValue {
  return row.values[columnId] ?? "";
}

/**
 * Coluna usada como **título** de um item: a primeira de texto ou, na falta,
 * a primeira de pessoa. Devolve `null` quando não há nenhuma (usado pelos
 * títulos das linhas relacionadas e dos cards).
 */
export function titleColumnOf(columns: Column[]): Column | null {
  return (
    columns.find((c) => c.type === "text") ??
    columns.find((c) => c.type === "person") ??
    null
  );
}

/** Título legível de uma linha (fallback "Sem título" quando vazio). */
export function rowTitleOf(row: DbRow, columns: Column[]): string {
  const column = titleColumnOf(columns);
  if (!column) return "Sem título";
  const raw = row.values[column.id] ?? "";
  const text = Array.isArray(raw) ? raw.join(", ") : String(raw);
  return text.trim() || "Sem título";
}

/**
 * Permite que **toda a área** de um `<td>` responda ao clique — e não apenas o
 * conteúdo interno (input/botão/label) —, executando a ação principal da célula
 * mesmo quando o clique cai no padding/área vazia do `td`.
 *
 * Ignora cliques que já estão sobre controles interativos, para não duplicar a
 * ação de quem já trata o evento (ex.: o próprio input/botão/chip).
 */
export function cellAreaClick(
  event: { target: EventTarget | null; currentTarget: HTMLTableCellElement },
  action: () => void,
) {
  const target = event.target as HTMLElement | null;
  if (
    target?.closest(
      "input, button, label, a, textarea, select, [data-cell-menu], [contenteditable='true']",
    )
  ) {
    return;
  }
  action();
}

/**
 * Colunas que podem agrupar um quadro Kanban (estilo Notion): apenas
 * seleção/status, cujas opções viram as colunas do quadro. `multi_select`
 * fica de fora por não ter um único valor por linha.
 */
export function kanbanGroupColumns(columns: Column[]): Column[] {
  return columns.filter((c) => c.type === "select" || c.type === "status");
}

/**
 * Move a coluna `draggedId` para antes de `beforeId` (`null` = para o fim),
 * preservando as demais. Usado no arraste das propriedades no cabeçalho da
 * Tabela. Devolve o mesmo array quando não há mudança.
 */
export function moveColumnTo(
  columns: Column[],
  draggedId: string,
  beforeId: string | null,
): Column[] {
  if (draggedId === beforeId) return columns;
  const dragged = columns.find((c) => c.id === draggedId);
  if (!dragged) return columns;
  const rest = columns.filter((c) => c.id !== draggedId);
  const at = beforeId ? rest.findIndex((c) => c.id === beforeId) : -1;
  const insertAt = at === -1 ? rest.length : at;
  const next = [...rest];
  next.splice(insertAt, 0, dragged);
  return next;
}

/**
 * Aplica ao array completo de colunas a ordem `order` (ids das colunas
 * **visíveis**), mantendo as colunas ocultas nas mesmas posições. Usado para
 * gravar a ordem depois do arraste das propriedades (a pré-visualização só
 * reordena as visíveis). Devolve o mesmo array quando `order` não casa.
 */
export function applyVisibleColumnOrder(
  columns: Column[],
  visibleIds: string[],
  order: string[],
): Column[] {
  const byId = new Map(columns.map((c) => [c.id, c]));
  const ordered = order
    .map((id) => byId.get(id))
    .filter((c): c is Column => c !== undefined);
  if (ordered.length !== visibleIds.length) return columns;
  const visible = new Set(visibleIds);
  let i = 0;
  return columns.map((c) => (visible.has(c.id) ? ordered[i++] : c));
}

/**
 * Escolhe a coluna padrão de agrupamento do Kanban: prefere status, depois
 * seleção; cai para a primeira opção disponível. Devolve `null` se não houver
 * nenhuma coluna agrupável.
 */
export function defaultKanbanColumnId(columns: Column[]): string | null {
  const candidates = kanbanGroupColumns(columns);
  if (candidates.length === 0) return null;
  const status = candidates.find((c) => c.type === "status");
  return (status ?? candidates[0]).id;
}

/* -------------------------------------------------------------------------- */
/* Relação: database "relacionado" para o link ao lado do nome                 */
/* -------------------------------------------------------------------------- */

/**
 * Resolve o database "relacionado" a um database, usado pelo link ao lado do
 * nome. Considera, nesta ordem:
 *
 * 1. o **destino** da primeira coluna de relação configurada deste database
 *    (o alvo já foi escolhido) — aparece assim que a relação é criada;
 * 2. a **origem**: outro database que tenha uma coluna de relação apontando
 *    para este (cobre relações não bidirecionais).
 *
 * Em ambos os casos devolve o primeiro encontrado; `null` quando não há relação
 * envolvendo o database (ou o alvo não está carregado em `allDatabases`).
 */
export function relatedDatabaseFor(
  currentDatabaseId: string,
  columns: Column[],
  allDatabases: Database[],
): Database | null {
  const ownRelation = columns.find((c) => c.relationDatabaseId);
  if (ownRelation?.relationDatabaseId) {
    const target = allDatabases.find(
      (d) => d.id === ownRelation.relationDatabaseId,
    );
    if (target && target.id !== currentDatabaseId) return target;
  }
  return (
    allDatabases.find(
      (db) =>
        db.id !== currentDatabaseId &&
        db.columns.some((c) => c.relationDatabaseId === currentDatabaseId),
    ) ?? null
  );
}
