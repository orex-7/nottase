"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  restrictToHorizontalAxis,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import {
  AlignLeft,
  ArrowLeftRight,
  Bell,
  Bookmark,
  CalendarDays,
  ChartArea,
  ChartColumn,
  ChartLine,
  ChartPie,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock,
  Coins,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Flag,
  Folder,
  GripVertical,
  Hash,
  Heart,
  Home,
  Image,
  LayoutTemplate,
  Lightbulb,
  Link,
  List,
  ListOrdered,
  MapPin,
  Maximize2,
  MessageSquare,
  Package,
  Percent,
  Pencil,
  Plane,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  SquareKanban,
  Star,
  Table2,
  Tags,
  Trash2,
  TrendingUp,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NewDatabaseInput } from "@/components/database/DatabasesScreen";
import type { NewProjectInput } from "@/components/database/ProjectsScreen";
import { ProjectsSidebar } from "@/components/database/ProjectsSidebar";
import { WorkspaceEmptyState } from "@/components/database/WorkspaceEmptyState";
import { PageEditor } from "@/components/database/PageEditor";
import { RowPageContent } from "@/components/database/RowPageContent";
import { KanbanBoard } from "@/components/database/KanbanBoard";
import { PageTemplateDialog } from "@/components/database/PageTemplateDialog";
import {
  SelectOptionsEditor,
  SelectOptionsPopover,
  StatusCategoryTabs,
} from "@/components/database/SelectOptionsPopover";
import { TableSettingsPopover } from "@/components/database/TableSettingsPopover";
import { OptionColorPopover } from "@/components/database/OptionColorPopover";
import { markOptionDrag, moveOption, OPTION_DROP_BAR } from "@/components/database/option-dnd";
import {
  ACTIONS_COLUMN_WIDTH,
  applyVisibleColumnOrder,
  CALC_FUNCTIONS,
  calcFunctionLabel,
  cellAreaClick,
  cellOf,
  COLUMN_TYPES,
  columnIcon,
  columnTypeMeta,
  columnWidth,
  DECIMAL_OPTIONS,
  decimalsLabel,
  DEFAULT_COLUMN_WIDTH,
  defaultKanbanColumnId,
  editableOptionsForColumn,
  formatShortDate,
  kanbanGroupColumns,
  linkHref,
  MAX_COLUMN_WIDTH,
  minColumnWidth,
  moveColumnTo,
  newColumnId,
  newOptionId,
  NUMBER_FORMATS,
  numberFormatLabel,
  OPTION_COLORS,
  optionsForColumn,
  relatedDatabaseFor,
  ROW_GUTTER_WIDTH,
  rowTitleOf,
  STATUS_CATEGORIES,
  STATUS_OPTIONS,
  TAG_OPTIONS,
  tagById,
  titleColumnOf,
} from "@/components/database/database-fields";
import {
  RECURRENCE_ENDS,
  RECURRENCE_FREQUENCIES,
  describeRecurrence,
  emptyRecurrence,
  formatRecurrenceDate,
  recurrenceHtmlSection,
  templateContentHtml,
} from "@/components/database/database-recurrence-ui";
import {
  useFlipPopover,
  useFlipSide,
} from "@/components/database/use-flip-popover";
import {
  DEFAULT_ROW_HEIGHT,
  useVirtualTableRows,
} from "@/components/database/use-virtual-table-rows";
import {
  ROWS_PAGE_SIZE,
  useDatabaseRows,
} from "@/components/database/use-database-rows";
import { useAllDatabaseRows } from "@/components/database/use-all-database-rows";
import {
  CHART_COUNT,
  ChartView,
  chartGroupColumns,
  chartNumberColumns,
  defaultChartConfig,
  isChartConfig,
  type ChartConfig,
} from "@/components/database/database-chart";
import { Chip, NumberCellInput } from "@/components/database/database-cells";
import { RelationCell, RelationTitle } from "@/components/database/RelationCell";
import { RelationSelect } from "@/components/database/RelationSelect";
import { invalidateRelatedRows } from "@/components/database/use-related-rows";
import {
  invalidateRelationLinks,
  useRelationLinks,
} from "@/components/database/use-relation-links";
import {
  invalidateRollupValues,
  staleRollupValues,
  useRollupValues,
} from "@/components/database/use-rollup-values";
import { useColumnAggregates } from "@/components/database/use-column-aggregates";
import { DatabaseItemPopover } from "@/components/calendar/DatabaseItemPopover";
import {
  EMPTY_FILTER_IDS,
  EMPTY_FILTER_VALUES,
  VIEW_TYPES,
  initialViews,
  loadPageLayout,
  loadPersistedViews,
  newViewId,
  savePageLayout,
  savePersistedViews,
  viewTypeMeta,
  type DbView,
  type DbViewType,
  type PageLayout,
  type PersistedViews,
} from "@/components/database/database-views";
import {
  useCalendarStore,
  type DatabaseFocusRequest,
} from "@/store/useCalendarStore";
import type { WorkspaceSearchResult } from "@/components/database/workspace-search";
import { OpenDatabaseBar } from "@/components/database/OpenDatabaseBar";
import { cn } from "@/lib/utils";
import { ensureHtml } from "@/lib/markdown";
import { todayISO } from "@/lib/database-recurrence";
import { runAutoTemplates } from "@/lib/database-recurrence";
import { CURRENCIES, currencyByCode } from "@/lib/currencies";
import { ICON_OPTIONS, ICON_BY_NAME, databaseIcon } from "@/lib/database-icons";
import {
  formatNumberByColumn,
  formatNumberValue,
  parseNumberValue,
} from "@/lib/number-format";
import {
  createDatabase,
  createLinkedDatabase,
  createProject,
  createProjectCategory,
  createRow,
  createTemplate,
  deleteDatabase,
  deleteProject,
  type OpenDatabasesState,
  deleteProjectCategory,
  deleteRow,
  deleteTemplate,
  emptyValuesFor,
  ensureDefaultProject,
  fetchDatabases,
  fetchOpenDatabases,
  fetchProjectCategories,
  fetchProjects,
  reorderProjectCategories,
  reorderProjects,
  saveOpenDatabases,
  updateDatabaseColumns,
  updateDatabaseIcon,
  updateDatabaseName,
  updateProjectCategory,
  updateProject,
  updateRowPositions,
  updateRowValues,
  DEFAULT_PROJECT_NAME,
  createRowAtEnd,
  fetchRowById,
  fetchDatabaseById,
  updateRowCell,
  addRelationLink,
  removeRelationLink,
  createRelationProperty,
  deleteRelationProperty,
  setRelationLimit,
  cleanupRelationsForDatabase,
  type ColumnAggregateRequest,
  type FilterOperator,
  type RowsFilter,
  type RollupValueRequest,
} from "@/lib/database";
import type {
  CellValue,
  Column,
  ColumnType,
  Database as DatabaseModel,
  DbRow,
  NumberFormat,
  PageTemplate,
  Project,
  ProjectCategory,
  Recurrence,
  RecurrenceEnd,
  RecurrenceFrequency,
  RelationLimit,
  RollupConfig,
  SelectOption,
  StatusCategory,
} from "@/types/database";
import {
  PAGE_CONTENT_KEY,
  WEEKDAY_LABELS,
  recurrenceOccurrences,
} from "@/types/database";

/*
 * Este arquivo agora contém apenas o `DatabaseTable` (tabela/visualizações) e o
 * wrapper `DatabaseView`. As partes independentes foram extraídas para módulos
 * irmãos em `src/components/database/`:
 *   - database-fields.ts        (tipos de coluna, ícones, opções, células, Kanban)
 *   - database-cells.tsx        (NumberCellInput, Chip)
 *   - database-chart.tsx        (visualização Gráfico)
 *   - database-recurrence-ui.ts (UI de recorrência)
 *   - database-views.ts         (tipos/persistência de visualizações)
 *   - use-flip-popover.ts       (hooks de posicionamento de popover)
 *   - RowPageContent.tsx        (página do item)
 *   - KanbanBoard.tsx           (quadro Kanban)
 *   - PageTemplateDialog.tsx    (modelos de página)
 *   - SelectOptionsPopover.tsx  (editores de opções Seleção/Status)
 *   - TableSettingsPopover.tsx  (configurações da tabela)
 *   - AutomationsPanel.tsx      (automações do database, no popover de configurações)
 */

/**
 * Debounce (ms) do salvamento da navegação entre databases abertos: evita uma
 * escrita no servidor a cada clique/abertura.
 */
const OPEN_DATABASES_SAVE_DEBOUNCE_MS = 600;

/**
 * Linha de preenchimento (spacer) usada na virtualização da tabela: ocupa o
 * espaço das linhas fora da área visível, para a barra de rolagem refletir o
 * total real. É uma única célula com `colSpan` (não distorce o `<colgroup>`) e
 * sem padding/borda (não herda a grade de `[data-database-table] td`).
 */
function TableSpacerRow({ height, colSpan }: { height: number; colSpan: number }) {
  return (
    <tr aria-hidden>
      <td colSpan={colSpan} style={{ height, padding: 0, border: 0 }} />
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* Drag and drop (dnd-kit)                                                    */
/* -------------------------------------------------------------------------- */

/** Id do item arrastável do cabeçalho de uma propriedade. */
function columnDragId(columnId: string): string {
  return `column:${columnId}`;
}

/**
 * `<th>` de uma propriedade registrado como **arrastável** e **soltável**
 * (dnd-kit). O conteúdo continua vindo de `children` (o JSX do cabeçalho fica
 * onde está); só a célula e o registro no DnD vivem aqui — necessário porque os
 * hooks do dnd-kit não podem ser chamados dentro de um `.map`.
 */
function ColumnHeaderCell({
  columnId,
  className,
  isAnchor,
  anchorRef,
  children,
}: {
  columnId: string;
  className?: string;
  /** Se este é o cabeçalho com o editor aberto (dono de `anchorRef`). */
  isAnchor?: boolean;
  /**
   * Ref do cabeçalho do editor de coluna (posicionamento do popover). Tipo
   * estrutural (não `RefObject`) para permitir atribuir `.current` aqui.
   */
  anchorRef?: { current: HTMLTableCellElement | null };
  children: ReactNode;
}) {
  const { setNodeRef, listeners } = useDraggable({
    id: columnDragId(columnId),
    data: { type: "column", columnId },
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `column-drop:${columnId}`,
    data: { type: "column", columnId },
  });
  // Ref estável: sem isso o registro no dnd-kit seria refeito a cada render.
  const setRefs = useCallback(
    (node: HTMLTableCellElement | null) => {
      setNodeRef(node);
      setDropRef(node);
      if (isAnchor && anchorRef) anchorRef.current = node;
    },
    [setNodeRef, setDropRef, isAnchor, anchorRef],
  );
  return (
    <th
      ref={setRefs}
      {...listeners}
      data-column-cell={columnId}
      className={className}
    >
      {children}
    </th>
  );
}

/** Linha da Tabela registrada como **soltável** (dnd-kit). */
function DropRow({
  rowId,
  className,
  dropBefore,
  children,
}: {
  rowId: string;
  className?: string;
  /** Marca a barra de inserção (mesmo CSS do arraste nativo anterior). */
  dropBefore: boolean;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id: `row:${rowId}`,
    data: { type: "row", rowId },
  });
  // Ref estável: evita re-registrar o droppable a cada render das linhas.
  const setRef = useCallback(
    (node: HTMLTableRowElement | null) => setNodeRef(node),
    [setNodeRef],
  );
  return (
    <tr
      ref={setRef}
      data-row-id={rowId}
      className={className}
      data-drop-before={dropBefore ? "" : undefined}
    >
      {children}
    </tr>
  );
}

/** Alça de arraste de uma linha (gutter), registrada no dnd-kit. */
function RowDragHandle({ rowId }: { rowId: string }) {
  const { setNodeRef, listeners } = useDraggable({
    id: `row-handle:${rowId}`,
    data: { type: "row", rowId },
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      aria-label="Arrastar linha para reordenar"
      title="Arrastar para reordenar"
      className="flex h-6 w-6 flex-none cursor-grab items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground active:cursor-grabbing focus-visible:opacity-100 group-hover:opacity-100"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Posição para inserir uma linha entre dois vizinhos, aproveitando os gaps de
 * 1000. Devolve `null` quando não há espaço (vizinhos adjacentes ou sem
 * posição) — sinal de que é preciso renumerar a janela.
 */
function gapPositionBetween(prev: DbRow | null, next: DbRow | null): number | null {
  const p = typeof prev?.position === "number" ? prev.position : null;
  const n = typeof next?.position === "number" ? next.position : null;
  if (p !== null && n !== null) {
    if (n - p < 2) return null;
    return Math.floor((p + n) / 2);
  }
  if (p !== null) return p + 1000;
  if (n !== null) return n - 1000;
  return 1000;
}

/**
 * Formata o agregado calculado de uma coluna numérica para o rodapé (pt-BR):
 * contagens com separador de milhar, porcentagens com "%" e as demais funções
 * conforme o formato da própria coluna. `null`/vazio → "—".
 */
function formatCalcValue(value: CellValue | null, column: Column): string {
  const fn = column.calculate;
  if (!fn || value === null || value === "") return "—";
  const n = parseNumberValue(value);
  if (n === null) return "—";
  switch (fn) {
    case "count_all":
    case "count_filled":
    case "count_empty":
    case "count_unique":
      return n.toLocaleString("pt-BR");
    case "percent_filled":
    case "percent_empty":
      return `${formatNumberByColumn(n, null)}%`;
    default:
      return formatNumberByColumn(n, column);
  }
}

/** Operadores de filtro exibidos no popover do chip. */
const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "is", label: "é" },
  { value: "is_not", label: "não é" },
  { value: "is_empty", label: "está vazio" },
  { value: "is_not_empty", label: "não está vazio" },
];

/** Referência vazia estável dos operadores (evita recriar a cada render). */
const EMPTY_FILTER_OPERATORS: Record<string, string> = {};

/**
 * Operadores de filtro por tipo de coluna. Em `multi_select` o valor é uma
 * lista, então "é"/"não é" viram **"contém"/"não contém"** (mesma semântica do
 * `is`/`is_not` no servidor: `@>` no array). Em `relation` os operadores são
 * resolvidos no servidor contra `relation_links` (`relation_*`). `rollup` é
 * calculado e **não** é filtrável (lista vazia).
 */
function filterOperatorsFor(
  column: Column,
): { value: FilterOperator; label: string }[] {
  if (column.type === "relation") {
    return [
      { value: "relation_is", label: "contém" },
      { value: "relation_is_not", label: "não contém" },
      { value: "relation_is_empty", label: "está vazio" },
      { value: "relation_is_not_empty", label: "não está vazio" },
    ];
  }
  if (column.type === "multi_select") {
    return [
      { value: "is", label: "contém" },
      { value: "is_not", label: "não contém" },
      { value: "is_empty", label: "está vazio" },
      { value: "is_not_empty", label: "não está vazio" },
    ];
  }
  if (column.type === "checkbox") {
    // Caixa de seleção: só "é"/"não é" — o valor é Marcadas/Desmarcadas.
    return [
      { value: "is", label: "é" },
      { value: "is_not", label: "não é" },
    ];
  }
  if (column.type === "rollup") return [];
  return FILTER_OPERATORS;
}

/**
 * Converte o operador genérico de uma relação ("is"/"is_not"/...) para o
 * operador `relation_*` (resolve contra `relation_links`). Necessário para
 * filtros salvos em visualizações antigas (antes dos operadores de relação).
 */
function relationFilterOperator(operator: FilterOperator): FilterOperator {
  switch (operator) {
    case "is":
      return "relation_is";
    case "is_not":
      return "relation_is_not";
    case "is_empty":
      return "relation_is_empty";
    case "is_not_empty":
      return "relation_is_not_empty";
    default:
      return operator;
  }
}

/**
 * Normaliza o filtro de uma propriedade. É compatível com o formato antigo da
 * caixa de seleção ("checked"/"unchecked") gravado nas visualizações salvas.
 */
function normalizeFilter(
  operator: string | undefined,
  value: string | undefined,
): { operator: FilterOperator; value: string | null } {
  if (value === "checked") return { operator: "is", value: "true" };
  if (value === "unchecked") return { operator: "is_not", value: "true" };
  return {
    operator: (operator ?? "is") as FilterOperator,
    value: value ?? null,
  };
}

interface DatabaseTableProps {
  database: DatabaseModel;
  /** Todos os databases do usuário (para configurar/exibir colunas de relação). */
  allDatabases: DatabaseModel[];
  /** Ações de persistência (aplicam otimisticamente no pai e persistem no Supabase). */
  onRename: (id: string, name: string) => void;
  onUpdateColumns: (id: string, columns: Column[]) => void;
  onAddRow: (
    id: string,
    initialValues?: Record<string, CellValue>,
    afterRowId?: string | null,
    /** Posição calculada pela Tabela (gaps entre os vizinhos carregados). */
    position?: number | null,
  ) => Promise<DbRow | null>;
  onUpdateCell: (
    databaseId: string,
    rowId: string,
    columnId: string,
    value: CellValue,
  ) => void;
  onDeleteRow: (databaseId: string, rowId: string, removedRow?: DbRow) => void;
  /** Aplica uma nova ordem (por id) às linhas do database, persistindo posições. */
  onReorderRows: (databaseId: string, orderedIds: string[]) => void;
  /** Aplica novas `position` a um subconjunto de linhas (reorder por keyset). */
  onRowsReordered: (
    databaseId: string,
    updates: { id: string; position: number }[],
  ) => void;
  onAddTemplate: (
    databaseId: string,
    name: string,
    content: string,
    recurrence: Recurrence | null,
  ) => void;
  onDeleteTemplate: (databaseId: string, templateId: string) => void;
  /** Cria um novo item (linha) no database a partir de um modelo de página. */
  onApplyTemplate: (databaseId: string, template: PageTemplate) => void;
  /** Exclui o database inteiro (tabela e suas linhas). */
  onDeleteDatabase: (id: string) => void;
  /** Define (ou limpa, com `null`) o ícone escolhido do database. */
  onUpdateIcon: (id: string, icon: string | null) => void;
  /**
   * Abre outro database pelo id. Usado pelo link ao lado do nome: quando este
   * database tem uma coluna de relação configurada, o link leva ao database de
   * destino (aparece assim que a relação é criada).
   */
  onOpenDatabase: (id: string) => void;
  /** Notifica um erro para o wrapper exibir a mensagem ao usuário. */
  onError: (message: string) => void;
  /** Aplica um patch em outro database (ex.: coluna espelho criada/removida). */
  onPatchDatabase: (id: string, patch: Partial<DatabaseModel>) => void;
  /**
   * Id do database **como entidade** (nome/ícone/abas/exclusão). Igual a
   * `database.id` normalmente; numa visão vinculada é o id da visão, enquanto
   * `database.id` é o da origem (de onde vêm colunas, linhas e templates).
   */
  viewId: string;
  /**
   * Quando este database é uma **visão vinculada**, o id do database de origem
   * (usado pelo link ao lado do nome e para marcar a visão). `null` caso não seja.
   */
  linkedDatabaseId: string | null;
  /**
   * Foco a aplicar ao abrir (paleta de busca global): aba, propriedade, item ou
   * diálogo de modelos. Aplicado uma única vez por pedido.
   */
  focusRequest?: DatabaseFocusRequest | null;
  /** Notifica que o foco pendente foi aplicado (o wrapper limpa o pedido). */
  onFocusApplied?: () => void;
}

function DatabaseTable({
  database,
  allDatabases,
  viewId,
  linkedDatabaseId,
  onRename,
  onUpdateIcon,
  onUpdateColumns,
  onAddRow,
  onUpdateCell,
  onDeleteRow,
  onReorderRows,
  onRowsReordered,
  onAddTemplate,
  onDeleteTemplate,
  onApplyTemplate,
  onDeleteDatabase,
  onOpenDatabase,
  onError,
  onPatchDatabase,
  focusRequest,
  onFocusApplied,
}: DatabaseTableProps) {
  const { id: databaseId, columns, rows, name: title, icon, templates } = database;
  const TitleIcon = databaseIcon(icon);
  /** Databases por id (resolve colunas/títulos das colunas de relação). */
  const databasesById = useMemo(
    () => new Map(allDatabases.map((d) => [d.id, d])),
    [allDatabases],
  );
  /**
   * Database "relacionado" a este, para o link ao lado do nome: numa **visão
   * vinculada** é o database de origem; caso contrário, usa `relatedDatabaseFor`
   * (destino da relação deste database ou a origem de uma relação que aponte
   * para este).
   */
  const linkedDatabase = useMemo(
    () =>
      linkedDatabaseId
        ? databasesById.get(linkedDatabaseId) ?? null
        : relatedDatabaseFor(databaseId, columns, allDatabases),
    [linkedDatabaseId, databasesById, databaseId, columns, allDatabases],
  );
  const setColumns = useCallback(
    (updater: Column[] | ((prev: Column[]) => Column[])) => {
      const next = typeof updater === "function" ? updater(columns) : updater;
      onUpdateColumns(databaseId, next);
    },
    [databaseId, columns, onUpdateColumns],
  );
  const setTitle = useCallback(
    (value: string) => {
      // Nome é da **visão** (entidade), não da origem dos dados.
      onRename(viewId, value);
    },
    [viewId, onRename],
  );
  const [query, setQuery] = useState("");
  /** Busca da tabela expandida (a barra mostra só a lupa até clicar nela). */
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [openCell, setOpenCell] = useState<string | null>(null);
  /** Posição (viewport) do popover do seletor da célula de relação aberta. */
  const [relationCellPos, setRelationCellPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** Item referenciado aberto no `DatabaseItemPopover` (âncora = o chip). */
  const [openItem, setOpenItem] = useState<{
    databaseId: string;
    rowId: string;
    anchorEl: HTMLElement;
  } | null>(null);
  /** Texto do campo "criar opção" dentro do menu de uma célula select/multi_select. */
  const [newOptionText, setNewOptionText] = useState("");
  /** Id da coluna com o editor de propriedade aberto. */
  const [openColumnEditor, setOpenColumnEditor] = useState<string | null>(null);
  /**
   * Id da coluna cujo popover "Alterar tipo" está aberto no cabeçalho (topo da
   * tabela), na propriedade Status.
   */
  const [openHeaderTypeMenu, setOpenHeaderTypeMenu] = useState<string | null>(
    null,
  );
  /**
   * Id da coluna cujo popover "Editar propriedade" (nível 1, aberto para
   * propriedades do tipo número) está aberto no cabeçalho.
   */
  const [openPropEditMenu, setOpenPropEditMenu] = useState<string | null>(null);
  /**
   * Id da coluna cujo submenu "Formato de número" (nível 2) está aberto, com as
   * opções Número / Número com separadores / Percentual / Moedas.
   */
  const [openNumberFormatMenu, setOpenNumberFormatMenu] = useState<string | null>(
    null,
  );
  /**
   * Id da coluna cujo submenu "Casas decimais" (nível 2) está aberto, com as
   * opções Padrão / 0 / 1 / 2 / 3 / 4 / 5.
   */
  const [openDecimalsMenu, setOpenDecimalsMenu] = useState<string | null>(null);
  /**
   * Id da coluna cujo submenu "Calcular" (nível 2) está aberto, com as funções
   * de agregação exibidas no rodapé da coluna (estilo Notion).
   */
  const [openCalcMenu, setOpenCalcMenu] = useState<string | null>(null);
  /**
   * Id da coluna cujo seletor de ícone está aberto (botão à esquerda do nome no
   * popover "Editar propriedade").
   */
  const [openIconPicker, setOpenIconPicker] = useState<string | null>(null);
  /** Controla o seletor de ícone do próprio database (botão à esquerda do título). */
  const [openTitleIconPicker, setOpenTitleIconPicker] = useState(false);
  /**
   * Id da coluna cujo sub-popover de "Opções de status" está aberto (botão
   * dentro do popover "Editar propriedade", para colunas do tipo status).
   */
  const [openStatusOptions, setOpenStatusOptions] = useState<string | null>(null);
  /**
   * Id da coluna cujo sub-popover de "Opções" está aberto (botão dentro do
   * popover "Editar propriedade", para colunas do tipo seleção).
   */
  const [openSelectOptions, setOpenSelectOptions] = useState<string | null>(null);
  /**
   * Opção sendo arrastada no menu de uma célula (select/multi_select) para
   * reordenar as opções da coluna. Guarda a coluna e a opção de origem.
   */
  const [optionDrag, setOptionDrag] = useState<{
    columnId: string;
    optionId: string;
  } | null>(null);
  /** Opção sob o cursor (destino do arraste) no menu da célula. */
  const [optionOver, setOptionOver] = useState<string | null>(null);
  /** Posicionamento (abre para baixo/cima e esquerda/direita) dos submenus internos. */
  const numberFormatMenuFlip = useFlipPopover<HTMLDivElement>();
  const decimalsMenuFlip = useFlipPopover<HTMLDivElement>();
  const calcMenuFlip = useFlipPopover<HTMLDivElement>();
  /**
   * Editor de propriedade do cabeçalho (aberto pelo botão "+" e pelo clique na
   * propriedade). É posicionado com `position: fixed` a partir do cabeçalho da
   * coluna, para não ser recortado pelo container/tabela quando a coluna está
   * perto da borda direita da tela.
   */
  const columnHeaderRef = useRef<HTMLTableCellElement | null>(null);
  const [columnEditorPos, setColumnEditorPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Posiciona o editor de propriedade (fixed) logo abaixo do cabeçalho da coluna,
  // mantendo-o dentro da viewport. Recalcula ao rolar/redimensionar.
  useLayoutEffect(() => {
    if (!openColumnEditor) {
      setColumnEditorPos(null);
      return;
    }
    const compute = () => {
      const th = columnHeaderRef.current;
      if (!th) return;
      const rect = th.getBoundingClientRect();
      const width = 288; // w-72 (maior variante)
      const margin = 8;
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - width - margin),
      );
      setColumnEditorPos({ top: rect.bottom + 4, left });
    };
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [openColumnEditor]);
  /**
   * Submenus do cabeçalho ("Alterar tipo", "Editar propriedade" e "Opções de
   * status") abrem ao lado direito do popover da propriedade e flipam para a
   * esquerda quando não há espaço à direita (coluna próxima à borda da tela).
   */
  const headerTypeMenuSide = useFlipSide<HTMLDivElement>();
  const propEditMenuSide = useFlipSide<HTMLDivElement>();
  const statusOptionsSide = useFlipSide<HTMLDivElement>();
  const selectOptionsSide = useFlipSide<HTMLDivElement>();
  /** Id da linha com a página aberta (modal flutuante). */
  const [openRowPage, setOpenRowPage] = useState<string | null>(null);
  /** Ids das linhas marcadas pelo checkbox da coluna de seleção (gutter). */
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  /** Modal de confirmação para excluir as linhas marcadas. */
  const [confirmDeleteSelectedOpen, setConfirmDeleteSelectedOpen] =
    useState(false);
  /** Id da linha sendo arrastada pela alça (reordenação). */
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  /** Id da linha antes da qual o item arrastado será solto (null = no fim). */
  const [rowDropBeforeId, setRowDropBeforeId] = useState<string | null>(null);
  /** Id da coluna (propriedade) sendo arrastada pelo cabeçalho (reordenação). */
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  /**
   * Pré-visualização da ordem das colunas **visíveis** enquanto uma propriedade
   * é arrastada: as demais "escorregam" para o lado em tempo real. `null` = sem
   * arraste (vale a ordem real).
   */
  const [columnDragOrder, setColumnDragOrder] = useState<Column[] | null>(null);
  /**
   * Tamanho (px) do cabeçalho arrastado, medido ao iniciar o arraste: a prévia
   * (overlay do dnd-kit) fica idêntica à célula da propriedade.
   */
  const [draggingColumnBox, setDraggingColumnBox] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // --- Drag and drop (dnd-kit) --------------------------------------------
  const sensors = useSensors(
    // Uma pequena distância evita que um clique simples vire arraste — o clique
    // continua abrindo o editor da propriedade.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  /** Restringe ao eixo: horizontal para propriedades, vertical para linhas. */
  const dragAxisModifier: Modifier = useCallback(
    (args) =>
      args.active?.data.current?.type === "row"
        ? restrictToVerticalAxis(args)
        : restrictToHorizontalAxis(args),
    [],
  );

  /** Propriedade/linha em arraste (conteúdo do overlay). */
  const draggingColumn = useMemo(
    () =>
      draggingColumnId
        ? (columns.find((c) => c.id === draggingColumnId) ?? null)
        : null,
    [columns, draggingColumnId],
  );
  /** Ícone da propriedade em arraste (usado no overlay do dnd-kit). */
  const DraggingColumnIcon = draggingColumn ? columnIcon(draggingColumn) : null;

  /** Centro do item arrastado (no eixo do arraste), em coordenadas da tela. */
  function draggedCenter(event: DragMoveEvent | DragEndEvent): number | null {
    const rect = event.active.rect.current.translated;
    if (!rect) return null;
    return event.active.data.current?.type === "row"
      ? rect.top + rect.height / 2
      : rect.left + rect.width / 2;
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === "column") {
      const columnId = String(data.columnId);
      setDraggingColumnId(columnId);
      setColumnDragOrder(visibleColumns);
      // Mede a célula para a prévia ficar com o mesmo tamanho (largura/altura).
      const cell = tableHeadRef.current?.querySelector<HTMLTableCellElement>(
        `[data-column-cell="${columnId}"]`,
      );
      const rect = cell?.getBoundingClientRect();
      setDraggingColumnBox(
        rect ? { width: rect.width, height: rect.height } : null,
      );
      return;
    }
    if (data?.type === "row") setDraggingRowId(String(data.rowId));
  }

  function handleDragMove(event: DragMoveEvent) {
    const data = event.active.data.current;
    const center = draggedCenter(event);
    if (center === null) return;

    if (data?.type === "column") {
      const draggedId = String(data.columnId);
      // Mede o DOM (que já reflete a pré-visualização) para achar a coluna sob o
      // centro do arraste e move a arrastada para antes/depois dela.
      const cells = tableHeadRef.current?.querySelectorAll<HTMLTableCellElement>(
        "[data-column-cell]",
      );
      let targetId: string | null = null;
      let after = false;
      let lastId: string | null = null;
      if (cells) {
        for (const cell of Array.from(cells)) {
          const id = cell.dataset.columnCell ?? null;
          if (!id || id === draggedId) continue;
          lastId = id;
          const rect = cell.getBoundingClientRect();
          if (center >= rect.left && center <= rect.right) {
            targetId = id;
            after = center - rect.left > rect.width / 2;
          }
        }
      }
      if (!targetId) {
        // Fora das colunas: se o centro passou da última, vai para o fim.
        const last = lastId
          ? tableHeadRef.current?.querySelector<HTMLTableCellElement>(
              `[data-column-cell="${lastId}"]`,
            )
          : null;
        const rect = last?.getBoundingClientRect();
        if (!lastId || !rect || center <= rect.right) return;
        targetId = lastId;
        after = true;
      }
      setColumnDragOrder((cur) => {
        const base = cur ?? visibleColumns;
        const idx = base.findIndex((c) => c.id === targetId);
        if (idx === -1) return base;
        const beforeId = after ? (base[idx + 1]?.id ?? null) : targetId;
        return moveColumnTo(base, draggedId, beforeId);
      });
      return;
    }

    if (data?.type === "row") {
      const rows = tableScrollRef.current?.querySelectorAll<HTMLTableRowElement>(
        "tr[data-row-id]",
      );
      if (!rows) return;
      let next: string | null | undefined;
      for (const tr of Array.from(rows)) {
        const rect = tr.getBoundingClientRect();
        if (center < rect.top || center > rect.bottom) continue;
        const id = tr.dataset.rowId ?? null;
        if (!id) continue;
        next =
          center - rect.top > rect.height / 2
            ? ((tr.nextElementSibling as HTMLTableRowElement | null)?.dataset
                .rowId ?? null)
            : id;
        break;
      }
      if (next === undefined) return;
      setRowDropBeforeId((cur) => (cur === next ? cur : next));
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const data = event.active.data.current;
    if (data?.type === "column") {
      commitColumnDrag();
      return;
    }
    if (data?.type === "row") {
      const draggedId = String(data.rowId);
      const beforeId = rowDropBeforeId;
      setDraggingRowId(null);
      setRowDropBeforeId(null);
      moveRow(draggedId, beforeId);
    }
  }

  function handleDragCancel() {
    setDraggingColumnId(null);
    setColumnDragOrder(null);
    setDraggingColumnBox(null);
    setDraggingRowId(null);
    setRowDropBeforeId(null);
  }

  /** Id da linha recém-criada pelo botão "+" que deve receber foco no 1º campo. */
  const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(null);
  /**
   * Ids das linhas recém-criadas que devem permanecer visíveis mesmo com uma
   * busca ativa (elas nascem vazias e, sem isso, seriam escondidas pelo filtro —
   * o que fazia parecer que "Nova linha" não funcionava). É um conjunto para
   * que cada linha criada continue visível, e não apenas a última.
   */
  const [pinnedRowIds, setPinnedRowIds] = useState<Set<string>>(new Set());
  /** Controla a abertura do diálogo de criação/gestão de modelos de página. */
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  /** Controla a abertura do popover "Filtrar" (lista de propriedades). */
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  /** Controla a abertura do popover do "+" da barra de filtros. */
  const [isFilterBarOpen, setIsFilterBarOpen] = useState(false);
  /** Minimiza (oculta) a barra de filtros, mantendo os filtros ativos. */
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  /** Id do botão de filtro cujo popover de opções está aberto. */
  const [filterChipId, setFilterChipId] = useState<string | null>(null);
  /** Id do chip cujo popover de operador de filtro está aberto. */
  const [filterOperatorChipId, setFilterOperatorChipId] = useState<
    string | null
  >(null);
  /** Posição (viewport) do popover de opções do filtro. */
  const [filterChipPos, setFilterChipPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** âncora do botão "Filtrar" é usada para ancorar o popover de propriedades. */
  const filterAnchorRef = useRef<HTMLDivElement>(null);
  /** âncora do botão "Criar modelo" é usada para ancorar o popover da lista. */
  const templateAnchorRef = useRef<HTMLDivElement>(null);
  /** âncora do botão de configurações é usada para ancorar o popover abaixo dele. */
  const settingsAnchorRef = useRef<HTMLDivElement>(null);
  /** âncora do botão de ícone do database é usada para ancorar o seletor abaixo. */
  const titleIconAnchorRef = useRef<HTMLDivElement>(null);
  /** Container rolável da tabela é usado para medir a largura disponível. */
  const tableScrollRef = useRef<HTMLDivElement>(null);
  /** Painel aberto da célula (campo + lista): usado para medir e limitar. */
  const cellPanelRef = useRef<HTMLDivElement>(null);
  /**
   * Layout do painel da célula aberta (medido do DOM), guardado **junto com a
   * célula**: ao abrir outra célula os valores começam nulos, o que permite medir
   * a altura natural do painel antes de limitá-la.
   * - `flip`: o painel abre para **cima** (a lista fica acima do campo) quando
   *   não cabe abaixo — evita descer por baixo do rodapé fixo;
   * - `max`: altura disponível para o painel/lista (trava de segurança);
   * - `natural`: altura natural medida (campo + lista até 256px + prévia).
   */
  const [cellPanelState, setCellPanelState] = useState<{
    cell: string;
    flip: boolean;
    max: number;
    natural: number;
  } | null>(null);
  /** Layout válido para a célula aberta agora (`null` = ainda não medido). */
  const cellPanelLayout =
    cellPanelState && cellPanelState.cell === openCell ? cellPanelState : null;
  /** O painel abre para cima? */
  const cellPanelFlip = cellPanelLayout?.flip ?? false;
  /** Cabeçalho da tabela (`<thead>`): mede a altura para o `scrollMargin`. */
  const tableHeadRef = useRef<HTMLTableSectionElement>(null);
  /** Altura (px) do cabeçalho sticky, medida do DOM (offset da lista). */
  const [tableHeadHeight, setTableHeadHeight] = useState(0);
  /** Altura (px) de uma linha, calibrada pela 1ª `<tr>` renderizada. */
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT);
  /** Id da linha com foco (célula em edição) — mantida montada na virtualização. */
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  /**
   * Contador incrementado nas mutações de dados (edição/adição/remoção de linha)
   * para recalcular os agregados do rodapé. **Não** muda na paginação.
   */
  const [dataRevision, setDataRevision] = useState(0);
  /** Barra das abas de visualização é usada para medir o espaço disponível. */
  const viewTabsBarRef = useRef<HTMLDivElement>(null);
  /** Lista de abas renderizada (null quando recolhida no botão "Mais"). */
  const viewTabsListRef = useRef<HTMLDivElement>(null);
  /** Camada invisível com as abas em tamanho natural (para medir overflow). */
  const viewTabsMeasureRef = useRef<HTMLDivElement>(null);
  /** Controla a abertura do popover de configurações da tabela. */
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  /**
   * Largura útil (px) do container rolável da tabela, medida com
   * `ResizeObserver`. A coluna "fantasma" é **derivada** dela no render (junto
   * com a largura efetiva das colunas) para acompanhar o arraste da alça no
   * mesmo frame — se fosse um estado atualizado por efeito, o total da tabela
   * ficaria um frame fora de sincronia e o `table-fixed` redistribuiria o
   * espaço, fazendo as colunas "pularem" ao redimensionar.
   */
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  /**
   * Altura real (px) da barra de rolagem horizontal do navegador — `0` quando
   * ele usa barras "overlay" (que não ocupam espaço). Serve para reservar esse
   * espaço quando a barra **não** está visível (ver o espaçador abaixo da área
   * rolável).
   */
  const [hScrollbarHeight, setHScrollbarHeight] = useState(0);
  /**
   * A tabela está mais larga que a área visível? Quando está, a própria barra
   * horizontal ocupa o espaço; quando não está, o espaçador de mesma altura
   * reserva esse espaço. Assim o conteúdo nunca "sobe" ao aparecer/sumir a barra
   * — e a barra continua aparecendo só quando é necessária.
   */
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  /** Sinaliza para rolar a tabela até o fim após adicionar uma nova coluna. */
  const [scrollToColumnsEnd, setScrollToColumnsEnd] = useState(false);

  // Ao adicionar uma coluna, rola a tabela para o fim para que a nova propriedade
  // fique visível no cabeçalho (as demais "empurram" para a esquerda), sem cortar.
  useLayoutEffect(() => {
    if (!scrollToColumnsEnd) return;
    const el = tableScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
    setScrollToColumnsEnd(false);
  }, [scrollToColumnsEnd, columns]);
  /** Tela inicial do popover de configurações ao ser aberto (menu ou edição). */
  const [settingsInitialView, setSettingsInitialView] = useState<
    "menu" | "edit" | "visibility"
  >("menu");
  /** Largura (px) de preview durante o arraste de redimensionamento de uma coluna. */
  const [resizing, setResizing] = useState<{ columnId: string; width: number } | null>(
    null,
  );
  /** Como a página de um item é aberta (preferência por database). */
  const [pageLayout, setPageLayout] = useState<PageLayout>(() =>
    loadPageLayout(viewId),
  );
  /** Visualizações criadas pelo usuário sobre este database (tabela/kanban). */
  const [views, setViews] = useState<DbView[]>(
    () => loadPersistedViews(viewId)?.views ?? initialViews(columns),
  );
  /** Id da visualização ativa (aba selecionada). */
  const [activeViewId, setActiveViewId] = useState<string>(
    () => loadPersistedViews(viewId)?.activeViewId ?? views[0].id,
  );
  /** Controla o menu do botão "+" (criar nova visualização). */
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false);
  /**
   * Quantas abas de visualização cabem inteiras na largura disponível. As que
   * não cabem ficam acessíveis pelo botão "Mais" (que aparece nesse caso).
   */
  const [visibleViewCount, setVisibleViewCount] = useState(views.length);
  /** Controla a abertura do popover "Mais" (lista de visualizações). */
  const [overflowViewsOpen, setOverflowViewsOpen] = useState(false);
  /** Texto de busca do popover "Mais" (filtra as visualizações pelo nome). */
  const [overflowViewsQuery, setOverflowViewsQuery] = useState("");
  /** Posição (viewport) do popover "Mais", calculada ao abrir. */
  const [overflowViewsPos, setOverflowViewsPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** Botão "Mais" usado para ancorar o popover flutuante. */
  const overflowViewsBtnRef = useRef<HTMLButtonElement>(null);
  /** Controla o submenu "Nova visualização" (abre à esquerda do botão). */
  const [overflowNewOpen, setOverflowNewOpen] = useState(false);
  /** Posição (viewport) do submenu "Nova visualização". */
  const [overflowNewPos, setOverflowNewPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** Botão "Nova visualização" usado para ancorar o submenu. */
  const overflowNewBtnRef = useRef<HTMLButtonElement>(null);
  /** Id da visualização sendo renomeada (inline no rótulo da aba). */
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
  /** Id da visualização sendo arrastada para reordenar as abas. */
  const [draggingViewId, setDraggingViewId] = useState<string | null>(null);
  /** Id da aba antes da qual o item arrastado será solto (null = no fim). */
  const [viewDropBeforeId, setViewDropBeforeId] = useState<string | null>(null);
  /** Id da visualização cujo menu (clique na aba ativa) está aberto. */
  const [viewMenuId, setViewMenuId] = useState<string | null>(null);
  /** Posição (viewport) do menu da visualização, calculada ao abrir. */
  const [viewMenuPos, setViewMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** Coluna usada para agrupar os itens no Kanban (select/status). */
  const [kanbanColumnId, setKanbanColumnId] = useState<string | null>(
    () => loadPersistedViews(viewId)?.kanbanColumnId ?? defaultKanbanColumnId(columns),
  );

  // --- Foco vindo da paleta de busca global -------------------------------
  /**
   * Aplica o foco pedido (aba/propriedade/item/modelos) uma única vez por
   * pedido. A guarda por identidade evita reaplicar a cada render; o wrapper
   * limpa o pedido via `onFocusApplied` logo depois.
   */
  const appliedFocusRef = useRef<DatabaseFocusRequest | null>(null);
  useEffect(() => {
    if (!focusRequest || appliedFocusRef.current === focusRequest) return;
    appliedFocusRef.current = focusRequest;
    const { viewId: focusViewId, editColumnId, rowId, openTemplates } =
      focusRequest;

    // A aba vem primeiro: o editor da propriedade e a página do item dependem
    // do que está visível na tabela.
    if (focusViewId && views.some((v) => v.id === focusViewId)) {
      setActiveViewId(focusViewId);
    }
    if (openTemplates) setIsTemplateDialogOpen(true);
    if (rowId) setOpenRowPage(rowId);

    if (editColumnId && columns.some((c) => c.id === editColumnId)) {
      const column = columns.find((c) => c.id === editColumnId);
      // Reexibe a propriedade oculta (o editor é medido a partir do `<th>`).
      if (column?.hidden) {
        setColumns((prev) =>
          prev.map((c) => (c.id === editColumnId ? { ...c, hidden: false } : c)),
        );
      }
      // Mede a posição só depois de o cabeçalho refletir o novo estado.
      let attempts = 0;
      const focusColumn = () => {
        const cell = tableHeadRef.current?.querySelector<HTMLTableCellElement>(
          `[data-column-cell="${editColumnId}"]`,
        );
        if (!cell && attempts < 5) {
          attempts += 1;
          requestAnimationFrame(focusColumn);
          return;
        }
        cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
        setOpenColumnEditor(editColumnId);
      };
      requestAnimationFrame(focusColumn);
    }
    onFocusApplied?.();
  }, [focusRequest, views, columns, setColumns, onFocusApplied]);

  // --- Filtros por visualização -------------------------------------------
  // Cada visualização tem seus próprios filtros (independentes das demais).
  const activeViewRecord = views.find((v) => v.id === activeViewId);
  /** Ids das propriedades usadas como filtro na visualização ativa. */
  const filterColumnIds =
    activeViewRecord?.filters?.columnIds ?? EMPTY_FILTER_IDS;
  /** Valor escolhido por filtro (id da opção; "true" p/ caixa de seleção). */
  const filterValues =
    activeViewRecord?.filters?.values ?? EMPTY_FILTER_VALUES;
  /** Operador de filtro por propriedade (default "is"). */
  const filterOperators =
    activeViewRecord?.filters?.operators ?? EMPTY_FILTER_OPERATORS;

  /** Atualiza os filtros apenas da visualização ativa. */
  function updateActiveViewFilters(
    updater: (cur: {
      columnIds: string[];
      values: Record<string, string>;
      operators: Record<string, string>;
    }) => {
      columnIds: string[];
      values: Record<string, string>;
      operators: Record<string, string>;
    },
  ) {
    setViews((prev) =>
      prev.map((v) =>
        v.id === activeViewId
          ? {
              ...v,
              filters: updater({
                columnIds: v.filters?.columnIds ?? [],
                values: v.filters?.values ?? {},
                operators: v.filters?.operators ?? {},
              }),
            }
          : v,
      ),
    );
  }

  /** Define as propriedades filtradas da visualização ativa. */
  const setFilterColumnIds = (
    updater: string[] | ((prev: string[]) => string[]),
  ) => {
    updateActiveViewFilters((cur) => ({
      ...cur,
      columnIds: typeof updater === "function" ? updater(cur.columnIds) : updater,
    }));
  };

  /** Define os valores de filtro da visualização ativa. */
  const setFilterValues = (
    updater:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>),
  ) => {
    updateActiveViewFilters((cur) => ({
      ...cur,
      values: typeof updater === "function" ? updater(cur.values) : updater,
    }));
  };

  /** Define os operadores de filtro da visualização ativa. */
  const setFilterOperators = (
    updater:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>),
  ) => {
    updateActiveViewFilters((cur) => ({
      ...cur,
      operators:
        typeof updater === "function"
          ? updater(cur.operators ?? {})
          : updater,
    }));
  };

  // --- Configuração do gráfico por visualização ---------------------------
  // Cada visualização "Gráfico" tem sua própria configuração (formato, eixos...).
  /** Configuração do gráfico da visualização ativa (padrão quando ausente). */
  const chartConfig = activeViewRecord?.chart ?? defaultChartConfig(columns);

  /** Aplica um patch na configuração do gráfico da visualização ativa. */
  function updateChartConfig(patch: Partial<ChartConfig>) {
    setViews((prev) =>
      prev.map((v) =>
        v.id === activeViewId
          ? {
              ...v,
              chart: { ...(v.chart ?? defaultChartConfig(columns)), ...patch },
            }
          : v,
      ),
    );
  }

  /**
   * Lista de propriedades do popover "Filtrar" (compartilhada pelo botão do
   * cabeçalho e pelo "+" da barra de filtros). `close` fecha o popover de origem.
   */
  const renderFilterPropertyList = (close: () => void) => (
    <>
      <p className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        Propriedades
      </p>
      {columns.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Nenhuma propriedade.
        </p>
      ) : (
        // Rollup é calculado — não é filtrável (fica fora da lista de filtros).
        columns
          .filter((column) => column.type !== "rollup")
          .map((column) => {
          const Icon = columnIcon(column);
          const active = filterColumnIds.includes(column.id);
          return (
            <button
              key={column.id}
              type="button"
              role="menuitem"
              onClick={() => {
                // Adiciona/remove a propriedade como filtro e fecha o popover.
                setFilterColumnIds((prev) =>
                  prev.includes(column.id)
                    ? prev.filter((id) => id !== column.id)
                    : [...prev, column.id],
                );
                // Garante que a barra de filtros esteja visível ao escolher.
                setFiltersCollapsed(false);
                close();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 flex-none" />
              <span className="min-w-0 truncate">{column.name}</span>
              {active ? (
                <Check className="ml-auto h-3.5 w-3.5 flex-none" />
              ) : null}
            </button>
          );
        })
      )}
    </>
  );

  /**
   * Persiste as visualizações (lista, ativa e agrupamento) sempre que mudarem,
   * para que a última configuração seja restaurada ao reabrir. A configuração
   * do gráfico e os filtros viajam dentro de cada visualização (`views`).
   */
  useEffect(() => {
    savePersistedViews(viewId, {
      views,
      activeViewId,
      kanbanColumnId,
    });
  }, [viewId, views, activeViewId, kanbanColumnId]);

  /** Persiste como a página do item é aberta (preferência por database). */
  useEffect(() => {
    savePageLayout(viewId, pageLayout);
  }, [viewId, pageLayout]);

  /** Nem todas as abas cabem: o botão "Mais" é exibido no lugar do "+". */
  const viewsCollapsed = visibleViewCount < views.length;

  /**
   * Mede quantas abas de visualização cabem inteiras na largura disponível.
   * Usa a largura natural de cada aba (camada invisível) contra o espaço que
   * sobra na barra após os controles. Recalcula a cada resize (ResizeObserver).
   */
  useLayoutEffect(() => {
    const bar = viewTabsBarRef.current;
    const measure = viewTabsMeasureRef.current;
    if (!bar || !measure) return;
    const compute = () => {
      const styles = window.getComputedStyle(bar);
      const padding =
        parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const gap = parseFloat(styles.columnGap || styles.gap) || 0;
      const children = Array.from(bar.children).filter(
        (child) => !(child as HTMLElement).hasAttribute("data-views-measure"),
      );
      const gaps = gap * Math.max(0, children.length - 1);
      // Soma a largura dos controles (tudo, menos a própria lista de abas).
      let controlsWidth = 0;
      for (const child of children) {
        if (child === viewTabsListRef.current) continue;
        controlsWidth += (child as HTMLElement).offsetWidth;
      }
      const available = bar.clientWidth - padding - controlsWidth - gaps;
      // Conta quantas abas cabem inteiras (a próxima nunca fica cortada).
      const tabEls = Array.from(measure.children) as HTMLElement[];
      let used = 0;
      let count = 0;
      for (const el of tabEls) {
        const width = el.offsetWidth;
        const add = count === 0 ? width : gap + width;
        if (used + add <= available) {
          used += add;
          count += 1;
        } else {
          break;
        }
      }
      setVisibleViewCount(count);
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(bar);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [views, activeViewId, renamingViewId, visibleViewCount, viewsCollapsed]);

  // Fecha o popover "Mais" ao voltar a caber tudo na barra.
  useEffect(() => {
    if (!viewsCollapsed) setOverflowViewsOpen(false);
  }, [viewsCollapsed]);

  /**
   * Mantém a configuração do gráfico de cada visualização coerente com as
   * colunas existentes: se a categoria/valor escolhidos deixarem de existir,
   * cai para valores válidos.
   */
  useEffect(() => {
    setViews((prev) => {
      let changed = false;
      const next = prev.map((v) => {
        if (!v.chart) return v;
        const cur = v.chart;
        const groupOk =
          cur.groupColumnId !== null &&
          chartGroupColumns(columns).some((c) => c.id === cur.groupColumnId);
        const valueOk =
          cur.valueColumnId === CHART_COUNT ||
          chartNumberColumns(columns).some((c) => c.id === cur.valueColumnId);
        if (groupOk && valueOk) return v;
        changed = true;
        return {
          ...v,
          chart: {
            ...cur,
            groupColumnId: groupOk
              ? cur.groupColumnId
              : defaultChartConfig(columns).groupColumnId,
            valueColumnId: valueOk
              ? cur.valueColumnId
              : defaultChartConfig(columns).valueColumnId,
          },
        };
      });
      return changed ? next : prev;
    });
  }, [columns]);

  /**
   * Fecha o popup do editor de propriedade e o menu de célula ao clicar fora.
   * Ignora cliques na própria alça de abertura (data-*-trigger) e no popup
   * (data-column-editor / data-cell-menu), para não brigar com o toggle.
   */
  useEffect(() => {
    if (
      !openColumnEditor &&
      !openCell &&
      !viewsMenuOpen &&
      !isFilterOpen &&
      !isFilterBarOpen &&
      !filterChipId &&
      !filterOperatorChipId
    )
      return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Popover/editor da célula (seleção, seleção múltipla, relação): fecha ao
      // clicar em qualquer lugar FORA dele — inclusive em gatilhos do cabeçalho,
      // que abrem os próprios menus (por isso este trecho vem ANTES da lista de
      // "não feche" abaixo). O próprio popover e o gatilho da célula ficam de
      // fora: o clique neles é tratado pelos seus `onClick`.
      const insideCell =
        target.closest("[data-cell-menu-trigger]") ||
        target.closest("[data-cell-menu]") ||
        target.closest("[data-cell-editor]") ||
        target.closest("[data-relation-cell-trigger]") ||
        target.closest("[data-relation-cell-popover]") ||
        target.closest("[data-option-color-popover]");
      if (!insideCell) {
        setOpenCell(null);
        setRelationCellPos(null);
      }

      if (
        target.closest("[data-column-editor-trigger]") ||
        target.closest("[data-column-editor]") ||
        target.closest("[data-header-type-menu-trigger]") ||
        target.closest("[data-header-type-menu]") ||
        target.closest("[data-prop-edit-menu-trigger]") ||
        target.closest("[data-prop-edit-menu]") ||
        target.closest("[data-number-format-menu-trigger]") ||
        target.closest("[data-number-format-menu]") ||
        target.closest("[data-decimals-menu-trigger]") ||
        target.closest("[data-decimals-menu]") ||
        target.closest("[data-calc-menu-trigger]") ||
        target.closest("[data-calc-menu]") ||
        target.closest("[data-icon-picker-trigger]") ||
        target.closest("[data-icon-picker]") ||
        target.closest("[data-status-options-trigger]") ||
        target.closest("[data-status-options]") ||
        target.closest("[data-select-options-trigger]") ||
        target.closest("[data-select-options]") ||
        target.closest("[data-option-color-palette]") ||
        target.closest("[data-option-color-popover]") ||
        target.closest("[data-views-menu-trigger]") ||
        target.closest("[data-views-menu]") ||
        target.closest("[data-filter-trigger]") ||
        target.closest("[data-filter-popover]") ||
        target.closest("[data-filter-bar-trigger]") ||
        target.closest("[data-filter-bar-popover]") ||
        target.closest("[data-filter-chip-trigger]") ||
        target.closest("[data-filter-chip-popover]") ||
        target.closest("[data-filter-operator-trigger]") ||
        target.closest("[data-filter-operator-popover]")
      ) {
        return;
      }
      setOpenColumnEditor(null);
      setOpenHeaderTypeMenu(null);
      setOpenPropEditMenu(null);
      setOpenNumberFormatMenu(null);
      setOpenDecimalsMenu(null);
      setOpenCalcMenu(null);
      setOpenIconPicker(null);
      setViewsMenuOpen(false);
      setIsFilterOpen(false);
      setIsFilterBarOpen(false);
      setFilterChipId(null);
      setFilterOperatorChipId(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [
    openColumnEditor,
    openCell,
    viewsMenuOpen,
    isFilterOpen,
    isFilterBarOpen,
    filterChipId,
    filterOperatorChipId,
  ]);

  /** Linhas completas, carregadas sob demanda para Kanban/Gráfico (a Tabela é
   *  paginada por cursor). */
  const { rows: allRows } = useAllDatabaseRows(
    databaseId,
    (views.find((v) => v.id === activeViewId) ?? views[0])?.type !== "table",
  );

  // Ao mudar os filtros, libera as linhas "fixadas" para que o filtro valha.
  useEffect(() => {
    setPinnedRowIds(new Set());
  }, [filterColumnIds, filterValues]);
  /** Colunas visíveis na tabela (respeita a visibilidade definida pelo usuário). */
  const visibleColumns = useMemo(
    () => columns.filter((c) => !c.hidden),
    [columns],
  );

  /**
   * Ordem renderizada das colunas visíveis: durante o arraste de uma
   * propriedade vale a **pré-visualização** (`columnDragOrder`), para as demais
   * "escorregarem" para o lado em tempo real; fora do arraste, a ordem real.
   */
  const orderedVisibleColumns = columnDragOrder ?? visibleColumns;

  /**
   * Id da 1ª coluna visível na ordem **real** (não muda durante o arraste) —
   * define qual célula mostra o botão de abrir a página do item.
   */
  const firstVisibleId = visibleColumns[0]?.id ?? null;

  // --- Paginação por cursor das linhas (visão Tabela) --------------------
  /** Busca "debounced" (250ms): o filtro de texto é aplicado no servidor. */
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Foca o campo assim que a busca é expandida pelo ícone de lupa.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  /** Filtros por propriedade traduzidos para o servidor. */
  const serverFilters = useMemo<RowsFilter[]>(() => {
    const out: RowsFilter[] = [];
    for (const id of filterColumnIds) {
      const column = columns.find((c) => c.id === id);
      const { operator, value } = normalizeFilter(
        filterOperators[id],
        filterValues[id],
      );
      // Relação: resolve contra `relation_links` (operadores `relation_*`).
      const op =
        column?.type === "relation" ? relationFilterOperator(operator) : operator;
      // "" é um valor válido (Desmarcadas) — só `null` significa "sem valor".
      if (
        (op === "is" ||
          op === "is_not" ||
          op === "relation_is" ||
          op === "relation_is_not") &&
        value === null
      )
        continue;
      out.push({ columnId: id, operator: op, value: value ?? undefined });
    }
    return out;
  }, [filterColumnIds, filterOperators, filterValues, columns]);

  /** A visão ativa é a Tabela (paginada por cursor)? */
  const activeViewIsTable =
    (views.find((v) => v.id === activeViewId) ?? views[0])?.type === "table";

  const {
    rows: tableRows,
    loadingMore: tableRowsLoadingMore,
    error: tableRowsError,
    hasMore: tableRowsHasMore,
    fetchNextPage: fetchNextRowsPage,
    patchRows: patchTableRows,
  } = useDatabaseRows({
    // Só busca páginas quando a visão Tabela está ativa.
    databaseId: activeViewIsTable ? databaseId : null,
    search: debouncedQuery,
    filters: serverFilters,
    limit: ROWS_PAGE_SIZE,
  });

  /** Linha em arraste (conteúdo do overlay do dnd-kit). */
  const draggingRow = useMemo(
    () =>
      draggingRowId
        ? (tableRows.find((r) => r.id === draggingRowId) ?? null)
        : null,
    [tableRows, draggingRowId],
  );

  // --- Relação (vínculos) e Rollup (calculado) ----------------------------
  /** Colunas de rollup configuradas. */
  const rollupColumns = useMemo(
    () => columns.filter((c) => c.type === "rollup" && c.rollup),
    [columns],
  );
  /** Ids das linhas carregadas (Tabela paginada ou visões com conjunto completo). */
  const loadedRowIds = useMemo(() => {
    const source = activeViewIsTable ? tableRows : allRows;
    return source.map((r) => r.id);
  }, [activeViewIsTable, tableRows, allRows]);

  const { getTargets, setTargets } = useRelationLinks(loadedRowIds);

  /** Requisições de rollup (uma por coluna), com o tipo da propriedade alvo. */
  const rollupRequests = useMemo<RollupValueRequest[]>(() => {
    const out: RollupValueRequest[] = [];
    for (const column of rollupColumns) {
      const config = column.rollup;
      if (!config) continue;
      const relationColumn = columns.find(
        (c) => c.id === config.relationPropertyId,
      );
      const targetDb = relationColumn?.relationDatabaseId
        ? databasesById.get(relationColumn.relationDatabaseId)
        : undefined;
      const targetColumn = targetDb?.columns.find(
        (c) => c.id === config.targetPropertyId,
      );
      out.push({
        propertyId: column.id,
        relationPropertyId: config.relationPropertyId,
        targetPropertyId: config.targetPropertyId,
        fn: config.fn,
        targetType: targetColumn?.type,
      });
    }
    return out;
  }, [rollupColumns, columns, databasesById]);

  const { getValue: getRollupValue } = useRollupValues(
    loadedRowIds,
    rollupRequests,
  );

  // --- Calcular (agregado no rodapé da coluna) ----------------------------
  /** Colunas numéricas com uma função de cálculo configurada. */
  const calcColumns = useMemo(
    () => columns.filter((c) => c.type === "number" && c.calculate),
    [columns],
  );
  /** Uma requisição por coluna calculada (o rodapé é uma linha por coluna). */
  const calcConfigs = useMemo<ColumnAggregateRequest[]>(() => {
    const out: ColumnAggregateRequest[] = [];
    for (const column of calcColumns) {
      if (column.calculate) out.push({ columnId: column.id, fn: column.calculate });
    }
    return out;
  }, [calcColumns]);

  const { getValue: getColumnAggregate } = useColumnAggregates({
    databaseId,
    configs: calcConfigs,
    search: debouncedQuery,
    filters: serverFilters,
    revision: dataRevision,
  });

  /**
   * Linhas filtradas para as visões que carregam o conjunto completo
   * (Kanban/Gráfico). Na Tabela o filtro roda no servidor. O filtro de relação
   * usa os vínculos (`getTargets`), não mais `values`.
   */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((r) => {
      // Linhas recém-criadas permanecem visíveis (mesmo fora do filtro/busca).
      if (pinnedRowIds.has(r.id)) return true;
      for (const id of filterColumnIds) {
        const column = columns.find((c) => c.id === id);
        if (!column) continue;
        const normalized = normalizeFilter(filterOperators[id], filterValues[id]);
        const operator =
          column.type === "relation"
            ? relationFilterOperator(normalized.operator)
            : normalized.operator;
        const value = normalized.value;
        // Relação: valores vêm dos vínculos.
        if (column.type === "relation") {
          const targets = getTargets(r.id, id);
          const isEmpty = targets.length === 0;
          if (operator === "relation_is_empty") {
            if (!isEmpty) return false;
            continue;
          }
          if (operator === "relation_is_not_empty") {
            if (isEmpty) return false;
            continue;
          }
          if (value === null) continue;
          const matches = targets.includes(value);
          if (operator === "relation_is" ? !matches : matches) return false;
          continue;
        }
        const raw = cellOf(r, id);
        const isEmpty = Array.isArray(raw)
          ? raw.length === 0
          : String(raw ?? "") === "";
        if (operator === "is_empty") {
          if (!isEmpty) return false;
          continue;
        }
        if (operator === "is_not_empty") {
          if (isEmpty) return false;
          continue;
        }
        if (value === null) continue;
        const matches = Array.isArray(raw)
          ? raw.includes(value)
          : String(raw ?? "") === value;
        if (operator === "is" ? !matches : matches) return false;
      }
      // Busca textual.
      if (!q) return true;
      return Object.values(r.values).some((v) =>
        (Array.isArray(v) ? v.join(" ") : String(v ?? ""))
          .toLowerCase()
          .includes(q),
      );
    });
  }, [
    allRows,
    query,
    pinnedRowIds,
    filterColumnIds,
    filterOperators,
    filterValues,
    columns,
    getTargets,
  ]);

  // --- Virtualização das linhas da tabela --------------------------------
  /**
   * Índices das linhas que precisam ficar sempre montadas durante a
   * virtualização: a que está sendo arrastada, a linha-alvo do drop, a com
   * menu de célula aberto e a com célula em edição (foco).
   */
  const pinnedRowIndexes = useMemo(() => {
    const ids = new Set<string>();
    if (draggingRowId) ids.add(draggingRowId);
    if (rowDropBeforeId) ids.add(rowDropBeforeId);
    if (openCell) ids.add(openCell.split(":")[0]);
    if (activeRowId) ids.add(activeRowId);
    const indexes: number[] = [];
    tableRows.forEach((r, index) => {
      if (ids.has(r.id)) indexes.push(index);
    });
    return indexes;
  }, [draggingRowId, rowDropBeforeId, openCell, activeRowId, tableRows]);

  /** Id estável de uma linha pelo índice (chave do virtualizador). */
  const getRowIdByIndex = useCallback(
    (index: number) => tableRows[index]?.id ?? `__loading_${index}__`,
    [tableRows],
  );

  const {
    virtualizer: rowsVirtualizer,
    items: virtualRows,
    paddingTop: rowsPaddingTop,
    paddingBottom: rowsPaddingBottom,
  } = useVirtualTableRows({
    // +1 item no fim: a linha "carregando" quando ainda há páginas.
    count: tableRows.length + (tableRowsHasMore ? 1 : 0),
    scrollRef: tableScrollRef,
    getRowId: getRowIdByIndex,
    estimateSize: rowHeight,
    pinnedIndexes: pinnedRowIndexes,
    overscan: 10,
    scrollMargin: tableHeadHeight,
  });

  /** Nº de colunas do `<tbody>` (gutter + visíveis + ações + fantasma). */
  const tableColumnCount = visibleColumns.length + 3;

  /**
   * Largura efetiva de uma coluna: durante o arraste da alça vale o preview
   * (`resizing`), senão a largura persistida. O **mesmo** valor precisa ser usado
   * no `<col>`, na largura total da tabela e na coluna fantasma: assim a soma das
   * colunas continua igual à largura fixa da tabela em todos os frames e o
   * `table-fixed` não redistribui o espaço que sobra (o que fazia as colunas
   * "pularem"/ficarem elásticas ao redimensionar).
   */
  const effectiveColumnWidth = (column: Column) =>
    resizing?.columnId === column.id ? resizing.width : columnWidth(column);

  /** Soma das larguras das colunas visíveis (já com o preview do arraste). */
  const columnsWidth = visibleColumns.reduce(
    (sum, c) => sum + effectiveColumnWidth(c),
    0,
  );

  /**
   * Largura (px) da coluna "fantasma" da tabela. Ela absorve o espaço restante
   * do container rolável para esticar a tabela até o fim da tela (as linhas
   * horizontais passam a cobrir toda a largura). Vale 0 quando a soma das
   * colunas já ultrapassa o container (caso em que há rolagem horizontal).
   * Derivada no render (e não em um efeito) para acompanhar o arraste da alça
   * no mesmo frame.
   *
   * O `- 1` é folga: com `border-collapse`, o Chromium arredonda a largura
   * renderizada da tabela para cima (ex.: `width: 1230px` vira 1230.5px), o que
   * geraria 1px de overflow e uma barra de rolagem horizontal mesmo quando as
   * colunas cabem na tela.
   */
  const tableSpacerWidth = Math.max(
    0,
    tableViewportWidth -
      (ROW_GUTTER_WIDTH + columnsWidth + ACTIONS_COLUMN_WIDTH) -
      1,
  );

  /** Largura total da tabela (gutter + visíveis + ações + coluna fantasma). */
  const tableWidth =
    ROW_GUTTER_WIDTH + columnsWidth + ACTIONS_COLUMN_WIDTH + tableSpacerWidth;

  // Mede a altura do cabeçalho sticky (offset do início da lista no scroll).
  useLayoutEffect(() => {
    const h = tableHeadRef.current?.getBoundingClientRect().height ?? 0;
    setTableHeadHeight((cur) => (Math.abs(cur - h) >= 0.5 ? h : cur));
  }, [visibleColumns.length, selectedRowIds.size]);

  // Calibra a altura real da linha (fixa) a partir da 1ª <tr> renderizada.
  useLayoutEffect(() => {
    const tr = tableScrollRef.current?.querySelector<HTMLTableRowElement>(
      "tbody tr[data-row-id]",
    );
    const h = tr?.getBoundingClientRect().height ?? 0;
    if (h > 0) setRowHeight((cur) => (Math.abs(cur - h) >= 0.5 ? h : cur));
  }, [rowHeight, visibleColumns.length, rows.length]);

  // Volta ao topo ao mudar a busca ou os filtros (evita "pular" de posição).
  useEffect(() => {
    rowsVirtualizer.scrollToOffset(0);
  }, [query, filterColumnIds, filterValues, rowsVirtualizer]);

  /**
   * Mede a altura real da barra de rolagem horizontal do navegador (varia por
   * navegador/SO; é `0` quando as barras são "overlay"). Usa um elemento
   * descartável com `overflow: scroll` — não há API direta para isso.
   */
  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow:scroll";
    document.body.appendChild(probe);
    setHScrollbarHeight(probe.offsetHeight - probe.clientHeight);
    probe.remove();
  }, []);

  /**
   * Mede a largura útil do container rolável da tabela (a coluna "fantasma" é
   * derivada dela no render — ver `tableSpacerWidth`) e se a tabela está mais
   * larga que a área visível (define quem reserva o espaço da barra horizontal).
   */
  useEffect(() => {
    const container = tableScrollRef.current;
    if (!container) return;

    const measure = () => {
      // `clientWidth` exclui a barra de rolagem vertical — mede o espaço útil.
      setTableViewportWidth(container.clientWidth);
      // A tabela é mais larga que a área visível? Define quem ocupa o espaço da
      // barra horizontal: a própria barra (visível) ou o espaçador reservado.
      setHasHorizontalOverflow(container.scrollWidth > container.clientWidth);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
    // Recalcula quando as colunas mudam (add/remover/ocultar), garantindo a
    // medição caso o container só passe a existir depois (ex.: troca de
    // visualização). Durante o arraste a fantasma acompanha pelo render.
  }, [visibleColumns, columns]);

  /**
   * Mede o painel da célula aberta e decide como ele cabe:
   * - se o espaço abaixo (até o rodapé fixo) comporta a altura natural, abre
   *   para **baixo**, como hoje;
   * - senão, **flipa para cima** (a lista fica acima do campo), desde que haja
   *   mais espaço em cima — assim o popover nunca desce por baixo do rodapé.
   *
   * O `max` fica como trava de segurança para o caso extremo (lista maior que a
   * área disponível dos dois lados): só aí a lista rola por dentro.
   */
  useLayoutEffect(() => {
    if (!openCell) return;
    const container = tableScrollRef.current;
    const panel = cellPanelRef.current;
    if (!container || !panel) return;

    const measure = () => {
      const containerTop = container.getBoundingClientRect().top;
      const containerBottom = containerTop + container.clientHeight;
      const cellTop = panel.getBoundingClientRect().top;
      const spaceBelow = containerBottom - cellTop;
      const spaceAbove = cellTop - containerTop;
      setCellPanelState((prev) => {
        // Altura natural: medida na 1ª passada (quando o painel ainda não tem
        // limite) e reaproveitada depois, já que o limite a encolheria.
        const natural =
          prev && prev.cell === openCell ? prev.natural : panel.scrollHeight;
        const flip = spaceBelow < natural + 8 && spaceAbove > spaceBelow;
        const space = flip ? spaceAbove : spaceBelow;
        const max = Math.max(96, space - 8);
        return prev &&
          prev.cell === openCell &&
          prev.flip === flip &&
          prev.natural === natural &&
          Math.abs(prev.max - max) < 1
          ? prev
          : { cell: openCell, flip, max, natural };
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    // `capture`: pega a rolagem da própria tabela, não só a da janela.
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [openCell]);

  /** Colunas agrupáveis do Kanban (select/status), na ordem das colunas. */
  const kanbanColumns = useMemo(() => kanbanGroupColumns(columns), [columns]);
  /** Coluna efetivamente usada no agrupamento (fallback para a padrão). */
  const kanbanColumn = useMemo(() => {
    const current = kanbanColumns.find((c) => c.id === kanbanColumnId);
    if (current) return current;
    const fallbackId = defaultKanbanColumnId(columns);
    return kanbanColumns.find((c) => c.id === fallbackId) ?? null;
  }, [kanbanColumns, kanbanColumnId, columns]);

  /**
   * Mantém `kanbanColumnId` apontando para uma coluna válida: se a coluna
   * escolhida for removida (ou trocada de tipo), volta para a padrão.
   */
  useEffect(() => {
    if (kanbanColumnId && kanbanColumns.some((c) => c.id === kanbanColumnId)) return;
    setKanbanColumnId(defaultKanbanColumnId(columns));
  }, [kanbanColumnId, kanbanColumns, columns]);

  /** Visualização ativa (fallback para a primeira se o id não existir mais). */
  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? views[0],
    [views, activeViewId],
  );

  /**
   * Início da janela de abas visíveis. Desloca a janela para garantir que a
   * visualização ativa fique sempre visível.
   */
  const activeViewIndex = Math.max(
    0,
    views.findIndex((v) => v.id === activeView.id),
  );
  const visibleViewsStart = Math.max(
    0,
    Math.min(
      activeViewIndex - visibleViewCount + 1,
      views.length - visibleViewCount,
    ),
  );
  const visibleViews = views.slice(
    visibleViewsStart,
    visibleViewsStart + visibleViewCount,
  );

  /** Quantas visualizações ficam fora do cabeçalho (acessíveis pelo "Mais"). */
  const hiddenViewsCount = views.length - visibleViews.length;

  /** Visualizações filtradas pela busca do popover "Mais". */
  const filteredOverflowViews = views.filter((view) =>
    view.name.toLowerCase().includes(overflowViewsQuery.trim().toLowerCase()),
  );

  // Fecha o menu da visualização quando a aba deixa de estar visível.
  useEffect(() => {
    if (!viewMenuId) return;
    if (!visibleViews.some((v) => v.id === viewMenuId)) {
      setViewMenuId(null);
    }
  }, [viewMenuId, views, visibleViewsStart, visibleViewCount]);

  function updateCell(rowId: string, columnId: string, value: CellValue) {
    const previous = tableRows.find((r) => r.id === rowId)?.values;
    // Reflete a edição na lista paginada; em erro, reverte só esta linha.
    patchTableRows((prevRows) =>
      prevRows.map((r) =>
        r.id === rowId ? { ...r, values: { ...r.values, [columnId]: value } } : r,
      ),
    );
    // Título mudou: os chips de relação que apontam para esta linha ficam stale.
    if (titleColumnOf(columns)?.id === columnId) invalidateRelatedRows([rowId]);
    // Se a coluna for alvo de rollup em alguma tabela, os rollups que a agregam
    // ficam stale; senão, só os rollups da própria linha.
    const isRollupTarget = allDatabases.some((db) =>
      db.columns.some(
        (c) => c.type === "rollup" && c.rollup?.targetPropertyId === columnId,
      ),
    );
    // `staleRollupValues` mantém o valor visível enquanto recalcula (sem piscar).
    if (isRollupTarget) staleRollupValues();
    else staleRollupValues([rowId]);
    // O rodapé ("Calcular") depende dos valores: recalcula (agrupado no hook).
    setDataRevision((r) => r + 1);
    void Promise.resolve(onUpdateCell(databaseId, rowId, columnId, value)).catch(
      () => {
        if (!previous) return;
        patchTableRows((prevRows) =>
          prevRows.map((r) =>
            r.id === rowId ? { ...r, values: previous } : r,
          ),
        );
        // Revertida a edição, o rodapé volta ao valor do servidor.
        setDataRevision((r) => r + 1);
      },
    );
  }

  /**
   * Aplica a diferença entre os alvos atuais e a nova lista de uma relação,
   * chamando as RPCs de vínculo (`relation_link_add`/`relation_link_remove`).
   * Atualiza o cache do hook de forma otimista; em erro, invalida para
   * recarregar do servidor (revertendo a UI).
   */
  function applyRelationSelection(
    rowId: string,
    columnId: string,
    next: string[],
  ) {
    const current = getTargets(rowId, columnId);
    const currentSet = new Set(current);
    const nextSet = new Set(next);
    const added = next.filter((id) => !currentSet.has(id));
    const removed = current.filter((id) => !nextSet.has(id));
    if (added.length === 0 && removed.length === 0) return;

    // Otimista: reflete a nova lista imediatamente.
    setTargets(rowId, columnId, next);
    // Os rollups desta linha dependem dos vínculos: invalida para recalcular.
    invalidateRollupValues([rowId]);

    void (async () => {
      try {
        // Remoções antes das adições: em relação "um item", trocar o alvo
        // remove o antigo e só então insere o novo (senão a RPC de limite
        // rejeitaria a inserção).
        for (const id of removed) await removeRelationLink(columnId, rowId, id);
        for (const id of added) await addRelationLink(columnId, rowId, id);
        // Bidirecional: o espelho muda os vínculos do **alvo** (a origem já está
        // atualizada de forma otimista, então não é invalidada para não piscar).
        invalidateRelationLinks([...added, ...removed]);
        invalidateRollupValues([rowId, ...added, ...removed]);
      } catch (err) {
        onError((err as Error).message || "Falha ao salvar relação");
        invalidateRelationLinks([rowId, ...added, ...removed]);
      }
    })();
  }

  /** Adiciona/remove um único vínculo (usado pelo "x" do chip). */
  function toggleRelationLink(rowId: string, columnId: string, targetId: string, add: boolean) {
    const current = getTargets(rowId, columnId);
    const next = add
      ? [...current, targetId]
      : current.filter((id) => id !== targetId);
    applyRelationSelection(rowId, columnId, next);
  }

  /**
   * Abre as **configurações da tabela** (aba "Editar propriedades") para escolher
   * o database de destino de uma relação ainda sem alvo — usado ao clicar na
   * célula de uma coluna de relação sem destino.
   */
  function openRelationSettings() {
    setSettingsInitialView("edit");
    setOpenColumnEditor(null);
    setOpenHeaderTypeMenu(null);
    setOpenPropEditMenu(null);
    setOpenNumberFormatMenu(null);
    setOpenDecimalsMenu(null);
    setOpenCalcMenu(null);
    setOpenIconPicker(null);
    setOpenCell(null);
    setRelationCellPos(null);
    setIsSettingsOpen(true);
  }

  /**
   * Salva a configuração de uma relação (limite, bidirecional + espelho). Cria
   * o espelho via RPC e recarrega origem e destino para refletir a coluna.
   */
  function saveRelationConfig(
    column: Column,
    config: { limit: RelationLimit; bidirectional: boolean; reverseName: string },
  ) {
    const relationDatabaseId = column.relationDatabaseId;
    if (!relationDatabaseId) return;
    void (async () => {
      try {
        await createRelationProperty({
          databaseId,
          columnId: column.id,
          name: column.name,
          relationDatabaseId,
          limit: config.limit,
          bidirectional: config.bidirectional,
          reverseColumnId: column.reversePropertyId,
          reverseName: config.reverseName,
        });
        const [origin, target] = await Promise.all([
          fetchDatabaseById(databaseId),
          fetchDatabaseById(relationDatabaseId),
        ]);
        if (origin) onPatchDatabase(databaseId, { columns: origin.columns });
        if (target) onPatchDatabase(relationDatabaseId, { columns: target.columns });
      } catch (err) {
        onError((err as Error).message || "Falha ao salvar a relação");
      }
    })();
  }

  /** Salva a configuração de um rollup (persistida nas colunas do database). */
  function saveRollupConfig(column: Column, config: RollupConfig | null) {
    updateColumn(column.id, { rollup: config ?? undefined });
  }

  /** Remove uma propriedade de relação via RPC (coluna + vínculos + espelho). */
  function removeRelationColumn(column: Column) {
    const relationDatabaseId = column.relationDatabaseId;
    setColumns((prev) => prev.filter((c) => c.id !== column.id));
    setOpenColumnEditor(null);
    invalidateRelationLinks();
    invalidateRollupValues();
    void (async () => {
      try {
        await deleteRelationProperty(databaseId, column.id);
        // Recarrega o destino (o espelho foi removido) e a origem.
        const [origin, target] = await Promise.all([
          fetchDatabaseById(databaseId),
          relationDatabaseId
            ? fetchDatabaseById(relationDatabaseId)
            : Promise.resolve(null),
        ]);
        if (origin) onPatchDatabase(databaseId, { columns: origin.columns });
        if (target && relationDatabaseId)
          onPatchDatabase(relationDatabaseId, { columns: target.columns });
      } catch (err) {
        onError((err as Error).message || "Falha ao excluir a relação");
      }
    })();
  }

  /**
   * Move um card no Kanban: atualiza o valor da coluna de agrupamento e recoloca
   * a linha na ordem global (logo antes de `beforeRowId`, ou no fim quando null).
   * A nova ordem é persistida como `position` de cada linha.
   */
  function moveCard(
    rowId: string,
    columnId: string,
    value: CellValue,
    beforeRowId: string | null,
  ) {
    updateCell(rowId, columnId, value);
    const ordered = rows.filter((r) => r.id !== rowId).map((r) => r.id);
    const targetIndex = beforeRowId ? ordered.indexOf(beforeRowId) : -1;
    const insertAt = targetIndex === -1 ? ordered.length : targetIndex;
    ordered.splice(insertAt, 0, rowId);
    onReorderRows(databaseId, ordered);
  }

  /** Atualiza nome/tipo de uma coluna (propriedade). */
  function updateColumn(id: string, patch: Partial<Column>) {
    setColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  /** Adiciona uma nova coluna de texto ao final da tabela. */
  function addColumn() {
    const id = newColumnId();
    setColumns((prev) => [...prev, { id, name: "Nova coluna", type: "text" }]);
    setOpenColumnEditor(id);
    // Rola a tabela para revelar a nova coluna no cabeçalho.
    setScrollToColumnsEnd(true);
  }

  function removeColumn(id: string) {
    const column = columns.find((c) => c.id === id);
    // Relação: a coluna, os vínculos e o espelho são removidos por RPC.
    if (column?.type === "relation") {
      removeRelationColumn(column);
      return;
    }
    setColumns((prev) => prev.filter((c) => c.id !== id));
    // Zera os valores da coluna removida em todas as linhas (persiste cada uma).
    for (const row of rows) {
      if (!(id in row.values)) continue;
      onUpdateCell(databaseId, row.id, id, "");
    }
    setOpenColumnEditor(null);
  }

  /**
   * Redimensiona uma coluna arrastando a alça na borda do cabeçalho.
   * Durante o arraste só atualiza o preview local; ao soltar, persiste a largura
   * junto da definição de colunas (mesmo fluxo de `onUpdateColumns`).
   */
  function startColumnResize(
    event: ReactPointerEvent<HTMLDivElement>,
    column: Column,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidth(column);
    const minWidth = minColumnWidth(column);

    const onMove = (e: PointerEvent) => {
      const next = Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(minWidth, startWidth + (e.clientX - startX)),
      );
      setResizing({ columnId: column.id, width: Math.round(next) });
    };

    const onUp = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const next = Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(minWidth, startWidth + (e.clientX - startX)),
      );
      setResizing(null);
      setColumns((prev) =>
        prev.map((c) => (c.id === column.id ? { ...c, width: Math.round(next) } : c)),
      );
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function addRow(
    initialValues?: Record<string, CellValue>,
    afterRowId?: string | null,
    focusNewRow = false,
  ) {
    // A linha nova nasce com os valores dos filtros da visão ativa (como no
    // Notion): assim ela **casa** com o filtro e aparece também nas outras
    // visões. Sem isso ela nasceria vazia: apareceria só na visão em que foi
    // criada (pelo patch local abaixo) e sumiria ao trocar de visão, porque o
    // filtro roda no servidor.
    const seeded: Record<string, CellValue> = {};
    for (const id of filterColumnIds) {
      const column = columns.find((c) => c.id === id);
      if (!column) continue;
      const { operator, value } = normalizeFilter(
        filterOperators[id],
        filterValues[id],
      );
      // Só "é <valor>": os outros operadores não têm valor para preencher
      // ("está vazio" já nasce satisfeito; "não é"/"não está vazio" são abertos).
      if (operator !== "is" || value === null) continue;
      seeded[id] = column.type === "multi_select" ? [value] : value;
    }
    // Valores explícitos do chamador têm prioridade sobre os do filtro.
    const values = { ...seeded, ...(initialValues ?? {}) };
    // Posição calculada entre os vizinhos **carregados** (gaps de 1000) — o
    // wrapper não tem mais a lista completa de linhas.
    let position: number | null = null;
    if (afterRowId) {
      const at = tableRows.findIndex((r) => r.id === afterRowId);
      if (at >= 0) {
        position = gapPositionBetween(tableRows[at], tableRows[at + 1] ?? null);
      }
    }
    return onAddRow(databaseId, values, afterRowId, position).then((created) => {
      if (created) {
        // "Fixa" a linha criada: com busca ativa ela não casa com o texto
        // buscado, mas deve continuar visível (sem limpar a busca).
        setPinnedRowIds((prev) => {
          const next = new Set(prev);
          next.add(created.id);
          return next;
        });
        if (focusNewRow) setPendingFocusRowId(created.id);
        // Reflete a nova linha na lista paginada (sem recarregar a página).
        patchTableRows((prevRows) => {
          const at = afterRowId
            ? prevRows.findIndex((r) => r.id === afterRowId)
            : -1;
          const nextRows = [...prevRows];
          nextRows.splice(at === -1 ? nextRows.length : at + 1, 0, created);
          return nextRows;
        });
        // Nova linha: o rodapé ("Calcular") recalcula (contagens/somas).
        setDataRevision((r) => r + 1);
      }
      return created;
    });
  }

  /** Marca/desmarca a seleção de uma linha (checkbox da coluna gutter). */
  function toggleRowSelection(id: string) {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Marca/desmarca todas as linhas (checkbox do cabeçalho da gutter). */
  function toggleAllRowsSelection() {
    setSelectedRowIds((prev) =>
      prev.size > 0 && prev.size === tableRows.length
        ? new Set()
        : new Set(tableRows.map((r) => r.id)),
    );
  }

  /**
   * Reordena por arraste **na Tabela**: move `draggedId` para antes de
   * `beforeId` dentro da lista **carregada** e grava **uma** posição (o gap
   * entre os vizinhos). Sem espaço entre os vizinhos, renumera a janela
   * carregada (caso raro, após muitos inserts no mesmo ponto).
   */
  function moveRow(draggedId: string, beforeId: string | null) {
    if (draggedId === beforeId) return;
    const loaded = tableRows;
    const from = loaded.findIndex((r) => r.id === draggedId);
    if (from === -1) return;
    const moved = loaded[from];
    const rest = loaded.filter((r) => r.id !== draggedId);
    const at = beforeId ? rest.findIndex((r) => r.id === beforeId) : -1;
    const insertAt = at === -1 ? rest.length : at;
    const prevRow = insertAt > 0 ? rest[insertAt - 1] : null;
    const nextRow = insertAt < rest.length ? rest[insertAt] : null;

    const position = gapPositionBetween(prevRow, nextRow);
    if (position === null) {
      // Gaps esgotados entre os vizinhos: renumera a janela carregada.
      const renumbered = [...rest];
      renumbered.splice(insertAt, 0, moved);
      const updates = renumbered.map((r, index) => ({
        id: r.id,
        position: (index + 1) * 1000,
      }));
      onRowsReordered(databaseId, updates);
      patchTableRows((prevRows) => {
        const byId = new Map(prevRows.map((r) => [r.id, r]));
        const ordered: DbRow[] = [];
        for (const u of updates) {
          const found = byId.get(u.id);
          if (found) ordered.push({ ...found, position: u.position });
        }
        return ordered;
      });
      return;
    }

    onRowsReordered(databaseId, [{ id: draggedId, position }]);
    patchTableRows((prevRows) => {
      const without = prevRows.filter((r) => r.id !== draggedId);
      const idx = beforeId ? without.findIndex((r) => r.id === beforeId) : -1;
      const nextRows = [...without];
      nextRows.splice(idx === -1 ? nextRows.length : idx, 0, {
        ...moved,
        position,
      });
      return nextRows;
    });
  }

  /**
   * Grava a ordem das **propriedades** ao soltar o arraste (a pré-visualização
   * reordena só as visíveis; as ocultas mantêm a posição). A ordem é a do array
   * `columns`, persistida em `databases.columns`.
   */
  function commitColumnDrag() {
    const preview = columnDragOrder;
    setDraggingColumnId(null);
    setColumnDragOrder(null);
    setDraggingColumnBox(null);
    if (!preview) return;
    const visibleIds = visibleColumns.map((c) => c.id);
    const order = preview.map((c) => c.id);
    // Nada mudou: evita uma gravação desnecessária.
    if (order.every((id, index) => id === visibleIds[index])) return;
    setColumns((prev) => applyVisibleColumnOrder(prev, visibleIds, order));
  }

  // Foca o primeiro campo da linha recém-criada pelo botão "+" da gutter.
  // Com a virtualização, a linha pode estar fora da área renderizada: nesse
  // caso rola até ela (o efeito roda de novo quando a linha estiver montada).
  useEffect(() => {
    if (!pendingFocusRowId) return;
    const input = tableScrollRef.current?.querySelector<HTMLInputElement>(
      `tr[data-row-id="${pendingFocusRowId}"] td:nth-child(2) input`,
    );
    if (!input) {
      const index = tableRows.findIndex((r) => r.id === pendingFocusRowId);
      if (index >= 0) rowsVirtualizer.scrollToIndex(index, { align: "auto" });
      return;
    }
    input.focus();
    setPendingFocusRowId(null);
  }, [pendingFocusRowId, tableRows, rowsVirtualizer, virtualRows]);

  // Carrega a próxima página quando o último item virtual se aproxima do fim
  // (~15 linhas). O hook garante uma requisição por vez.
  useEffect(() => {
    if (!tableRowsHasMore || tableRowsLoadingMore) return;
    const last = virtualRows[virtualRows.length - 1];
    if (!last) return;
    if (last.index >= tableRows.length - 15) fetchNextRowsPage();
  }, [
    virtualRows,
    tableRows.length,
    tableRowsHasMore,
    tableRowsLoadingMore,
    fetchNextRowsPage,
  ]);

  /** Marca a linha com foco (célula em edição) para mantê-la montada. */
  function handleTableFocus(event: ReactFocusEvent<HTMLTableElement>) {
    const rowEl = (event.target as HTMLElement).closest("tr[data-row-id]");
    const id = rowEl?.getAttribute("data-row-id") ?? null;
    setActiveRowId((cur) => (cur === id ? cur : id));
  }

  /** Limpa a linha ativa quando o foco sai da tabela. */
  function handleTableBlur(event: ReactFocusEvent<HTMLTableElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setActiveRowId(null);
  }

  /**
   * Invalida o título cacheado da linha que estava em edição ao trocar de
   * linha/foco (uma vez por linha, e não a cada tecla digitada). Assim as
   * células de relação que apontam para ela recarregam o título atualizado.
   */
  useEffect(() => {
    if (!activeRowId) return;
    const rowId = activeRowId;
    return () => invalidateRelatedRows([rowId]);
  }, [activeRowId]);

  function removeRow(id: string) {
    const removed = tableRows.find((r) => r.id === id);
    if (!removed) return;
    patchTableRows((prevRows) => prevRows.filter((r) => r.id !== id));
    // Referências a esta linha passam a exibir "linha removida".
    invalidateRelatedRows([id]);
    // Linha removida: o rodapé ("Calcular") recalcula.
    setDataRevision((r) => r + 1);
    // Em erro, reinsere a linha na lista carregada (o wrapper não tem a lista).
    void Promise.resolve(onDeleteRow(databaseId, id, removed)).catch(() => {
      patchTableRows((prevRows) =>
        prevRows.some((r) => r.id === id) ? prevRows : [...prevRows, removed],
      );
      // Revertida a exclusão, o rodapé volta ao valor do servidor.
      setDataRevision((r) => r + 1);
    });
  }

  /**
   * Exclui todas as linhas marcadas na gutter. Reaproveita `onDeleteRow` (uma
   * chamada por linha, como o botão de excluir da própria linha) e limpa a
   * seleção. A lista carregada é atualizada na hora; o wrapper cuida do banco e
   * dos caches de relação.
   */
  function removeSelectedRows() {
    const ids = new Set(selectedRowIds);
    if (ids.size === 0) return;
    const removed = tableRows.filter((r) => ids.has(r.id));
    patchTableRows((prevRows) => prevRows.filter((r) => !ids.has(r.id)));
    // Referências a estas linhas passam a exibir "linha removida".
    invalidateRelatedRows(Array.from(ids));
    // Rodapé ("Calcular") recalcula com as linhas restantes.
    setDataRevision((r) => r + 1);
    setSelectedRowIds(new Set());
    // Em erro, reinsere as linhas na lista carregada (o wrapper não tem a lista).
    void Promise.all(
      removed.map((row) => Promise.resolve(onDeleteRow(databaseId, row.id, row))),
    ).catch(() => {
      patchTableRows((prevRows) => {
        const existing = new Set(prevRows.map((r) => r.id));
        return [...prevRows, ...removed.filter((r) => !existing.has(r.id))];
      });
      setDataRevision((r) => r + 1);
    });
  }

  /**
   * Cria uma nova visualização do database (do tipo escolhido no menu "+"),
   * dá um nome único ("Tabela 2", "Kanban 2"...) e a ativa em seguida.
   */
  function createView(type: DbViewType) {
    const baseName = viewTypeMeta(type).label;
    const existing = views.filter((v) => v.type === type).length;
    const name = existing === 0 ? baseName : `${baseName} ${existing + 1}`;
    const view: DbView = { id: newViewId(), type, name };
    setViews((prev) => [...prev, view]);
    setActiveViewId(view.id);
    setViewsMenuOpen(false);
  }

  /** Altera o tipo (layout) da visualização ativa. */
  function changeViewType(type: DbViewType) {
    setViews((prev) =>
      prev.map((v) => (v.id === activeView.id ? { ...v, type } : v)),
    );
  }

  /** Remove uma visualização criada (nunca a última restante). */
  function removeView(id: string) {
    setViews((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((v) => v.id !== id);
      setActiveViewId((current) =>
        current === id ? (next[0]?.id ?? current) : current,
      );
      return next;
    });
  }

  /**
   * Abre/fecha o menu da aba ativa (clique na aba já selecionada), posicionando-o
   * abaixo dela. Renderizado via portal para não ser recortado pela tabela.
   */
  function toggleViewMenu(id: string, anchor: HTMLElement) {
    if (viewMenuId === id) {
      setViewMenuId(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const width = 208;
    const margin = 8;
    const left = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, window.innerWidth - width - margin),
    );
    setViewMenuPos({ top: rect.bottom + 4, left });
    setViewMenuId(id);
  }

  /**
   * Abre/fecha o popover "Mais", posicionando-o abaixo do botão. Renderizado
   * via portal (fora do container rolável) para não ser recortado.
   */
  function toggleOverflowViews() {
    if (overflowViewsOpen) {
      setOverflowViewsOpen(false);
      setOverflowNewOpen(false);
      return;
    }
    setOverflowViewsQuery("");
    setOverflowNewOpen(false);
    const rect = overflowViewsBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 224;
      const margin = 8;
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - width - margin),
      );
      setOverflowViewsPos({ top: rect.bottom + 6, left });
    }
    setOverflowViewsOpen(true);
  }

  /**
   * Abre/fecha o submenu "Nova visualização", posicionando-o à esquerda do
   * botão (dentro do popover "Mais"). Renderizado via portal.
   */
  function toggleOverflowNew() {
    if (overflowNewOpen) {
      setOverflowNewOpen(false);
      return;
    }
    const rect = overflowNewBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 176;
      const margin = 8;
      const left = Math.max(margin, rect.left - width - 6);
      setOverflowNewPos({ top: rect.top, left });
    }
    setOverflowNewOpen(true);
  }

  /** Reordena as visualizações: move `draggedId` para antes de `beforeId`
   * (ou para o fim quando `beforeId` é null). */
  function moveView(draggedId: string, beforeId: string | null) {
    setViews((prev) => {
      if (draggedId === beforeId) return prev;
      const dragged = prev.find((v) => v.id === draggedId);
      if (!dragged) return prev;
      const without = prev.filter((v) => v.id !== draggedId);
      const index = beforeId ? without.findIndex((v) => v.id === beforeId) : -1;
      const insertAt = index === -1 ? without.length : index;
      const next = [...without];
      next.splice(insertAt, 0, dragged);
      return next;
    });
  }

  /** Renomeia uma visualização (nome vazio cai de volta para o rótulo do tipo). */
  function renameView(id: string, name: string) {
    const trimmed = name.trim();
    setViews((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        return { ...v, name: trimmed || viewTypeMeta(v.type).label };
      }),
    );
    setRenamingViewId(null);
  }

  function updatePageContent(rowId: string, content: string) {
    updateCell(rowId, PAGE_CONTENT_KEY, content);
  }

  /** Cria e adiciona um novo modelo de página. */
  function addTemplate(name: string, content: string, recurrence: Recurrence | null) {
    onAddTemplate(
      databaseId,
      name.trim() || "Modelo sem título",
      content,
      recurrence,
    );
  }

  function removeTemplate(id: string) {
    onDeleteTemplate(databaseId, id);
  }

  function toggleTag(row: DbRow, columnId: string, tagId: string) {
    const current = cellOf(row, columnId);
    const list = Array.isArray(current) ? current : [];
    updateCell(
      row.id,
      columnId,
      list.includes(tagId)
        ? list.filter((t) => t !== tagId)
        : [...list, tagId],
    );
  }

  /**
   * Cria uma nova opção para uma coluna select/multi_select e persiste na coluna.
   * Retorna a opção criada (ou a já existente com o mesmo rótulo) para uso imediato.
   */
  function createOptionForColumn(column: Column, label: string): SelectOption | null {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const base = optionsForColumn(column);
    const existing = base.find(
      (o) => o.label.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) return existing;
    const option: SelectOption = {
      id: newOptionId(),
      label: trimmed,
      color: OPTION_COLORS[base.length % OPTION_COLORS.length],
      // Novas opções de status entram na primeira categoria ("A fazer").
      ...(column.type === "status" ? { category: "todo" as StatusCategory } : {}),
    };
    setColumns((prev) =>
      prev.map((c) =>
        c.id === column.id ? { ...c, options: [...base, option] } : c,
      ),
    );
    return option;
  }

  /**
   * Atualiza uma opção (rótulo/cor) de uma coluna de seleção e persiste na
   * definição da coluna — as opções vivem em `column.options`.
   */
  function patchColumnOption(
    column: Column,
    optionId: string,
    patch: Partial<SelectOption>,
  ) {
    updateColumn(column.id, {
      options: editableOptionsForColumn(column).map((o) =>
        o.id === optionId ? { ...o, ...patch } : o,
      ),
    });
  }

  /**
   * Remove uma opção da coluna e limpa o valor dela na linha em edição (a opção
   * deixou de existir). As demais linhas são atualizadas ao reabrirem.
   */
  function removeColumnOption(column: Column, row: DbRow, optionId: string) {
    updateColumn(column.id, {
      options: editableOptionsForColumn(column).filter((o) => o.id !== optionId),
    });
    const raw = cellOf(row, column.id);
    if (column.type === "multi_select") {
      const list = Array.isArray(raw) ? raw : [];
      if (list.includes(optionId)) {
        updateCell(
          row.id,
          column.id,
          list.filter((id) => id !== optionId),
        );
      }
      return;
    }
    if (raw === optionId) updateCell(row.id, column.id, "");
  }

  /** Cria a opção digitada no menu da célula e já a aplica (select/multi_select). */
  function createOptionFromCell(row: DbRow, column: Column) {
    const option = createOptionForColumn(column, newOptionText);
    setNewOptionText("");
    if (!option) return;
    if (column.type === "multi_select") {
      const current = cellOf(row, column.id);
      const list = Array.isArray(current) ? current : [];
      if (!list.includes(option.id)) {
        updateCell(row.id, column.id, [...list, option.id]);
      }
    } else {
      updateCell(row.id, column.id, option.id);
      setOpenCell(null);
    }
  }

  /**
   * Prévia da opção que está sendo digitada no campo da célula
   * (select/multi_select): devolve a opção "fantasma" (rótulo + próxima cor da
   * paleta) ou `null` quando o campo está vazio ou já existe opção com o mesmo
   * rótulo — nesse caso não há nada a criar.
   */
  function cellOptionPreview(column: Column): SelectOption | null {
    const label = newOptionText.trim();
    if (!label) return null;
    const options = optionsForColumn(column);
    if (options.some((o) => o.label.toLowerCase() === label.toLowerCase())) {
      return null;
    }
    return {
      id: "preview",
      label,
      color: OPTION_COLORS[options.length % OPTION_COLORS.length],
    };
  }

  /** Inicia o arraste de uma opção no menu da célula (reordenação). */
  function startOptionDrag(
    columnId: string,
    optionId: string,
    event: ReactDragEvent<HTMLElement>,
  ) {
    setOptionDrag({ columnId, optionId });
    setOptionOver(null);
    markOptionDrag(event, optionId);
  }

  /** Encerra o arraste de opção (limpa o estado). */
  function endOptionDrag() {
    setOptionDrag(null);
    setOptionOver(null);
  }

  /**
   * Solta a opção arrastada na posição de `toId`, persistindo a nova ordem das
   * opções da coluna.
   */
  function dropOption(column: Column, toId: string) {
    if (optionDrag && optionDrag.columnId === column.id) {
      const next = moveOption(
        optionsForColumn(column),
        optionDrag.optionId,
        toId,
      );
      if (next) updateColumn(column.id, { options: next });
    }
    endOptionDrag();
  }

  /** Props da linha de opção que recebe o "solta aqui" (menu da célula). */
  function optionDropProps(column: Column, optionId: string) {
    const dragging = optionDrag?.columnId === column.id;
    return {
      onDragOver: (event: ReactDragEvent<HTMLElement>) => {
        if (!dragging) return;
        // Necessário para permitir o "drop" nesta linha.
        event.preventDefault();
        setOptionOver(optionId);
      },
      onDrop: (event: ReactDragEvent<HTMLElement>) => {
        if (!dragging) return;
        event.preventDefault();
        event.stopPropagation();
        dropOption(column, optionId);
      },
    };
  }


  /** Renderiza a célula de uma linha conforme o tipo da coluna. */
  function renderCell(row: DbRow, column: Column, isFirst: boolean) {
    const value = cellOf(row, column.id);
    const pageOpen = openRowPage === row.id;

    /** Botão "abrir página" (aparece no hover, na primeira coluna). */
    const openPageButton = isFirst ? (
      <button
        type="button"
        onClick={() => setOpenRowPage(pageOpen ? null : row.id)}
        aria-label={pageOpen ? "Fechar página" : "Abrir página"}
        title={pageOpen ? "Fechar página" : "Abrir página"}
        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
    ) : null;

    if (column.type === "select" || column.type === "status") {
      const options = optionsForColumn(column);
      const current = options.find((o) => o.id === value) ?? null;
      const cellKey = `${row.id}:${column.id}`;
      /** Prévia da opção sendo digitada (mostrada no rodapé do popover). */
      const preview = cellOptionPreview(column);
      /** Opções filtradas pelo texto digitado no campo da célula. */
      const query = newOptionText.trim().toLowerCase();
      const visibleOptions = query
        ? options.filter((o) => o.label.toLowerCase().includes(query))
        : options;
      return (
        <td
          className={cn(
            "relative cursor-pointer",
            // Aberta: mantém a altura da célula fechada (o painel é posicionado,
            // então não conta para a altura) — assim a linha não "pula".
            openCell === cellKey ? "h-10 p-0" : "px-3 py-1.5",
          )}
          onClick={(e) =>
            cellAreaClick(e, () =>
              setOpenCell(openCell === cellKey ? null : cellKey),
            )
          }
        >
          {openCell === cellKey ? null : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-cell-menu-trigger
                onClick={() => setOpenCell(openCell === cellKey ? null : cellKey)}
                className="flex w-full items-center gap-1 overflow-hidden rounded pl-1 pr-2 py-1"
              >
                {current ? <Chip option={current} /> : null}
              </button>
              {openPageButton}
            </div>
          )}
          {openCell === cellKey ? (
            // Painel da célula: container posicionado e com largura fixa. Abre
            // para baixo e, quando não cabe até o rodapé fixo, **flipa para
            // cima** (a lista fica acima do campo) — sem criar barra de rolagem
            // e sem invadir a faixa "Nova linha"/"Calcular".
            <div
              data-cell-editor
              ref={cellPanelRef}
              className="absolute left-0 top-0 z-30 flex w-64 min-w-full flex-col"
              style={
                cellPanelFlip
                  ? undefined
                  : { maxHeight: cellPanelLayout?.max }
              }
            >
              {/* Linha do campo: topo do painel. Sem `border-t` de propósito (a
                  borda somaria 1px e a linha aumentaria ao abrir a célula). */}
              <div
                className={cn(
                  "flex flex-none flex-nowrap items-center gap-1 overflow-hidden border-x bg-popover px-3 py-1.5",
                  // Flip: o campo vira a parte de baixo da caixa.
                  cellPanelFlip ? "rounded-b-md border-b" : "rounded-t-md",
                )}
              >
                {current ? (
                  <span className="flex-none">
                    <Chip
                      option={current}
                      onRemove={() => updateCell(row.id, column.id, "")}
                    />
                  </span>
                ) : null}
                {/* Campo de criar opção ao lado da opção selecionada. */}
                <input
                  value={newOptionText}
                  onChange={(e) => setNewOptionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createOptionFromCell(row, column);
                    }
                  }}
                  aria-label={`Criar nova opção em ${column.name}`}
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm outline-none"
                />
                {openPageButton}
              </div>
              <div
                data-cell-menu
                className={cn(
                  "flex flex-col border-x bg-popover p-1 shadow-md",
                  cellPanelFlip
                    ? // Flip: a lista abre ACIMA do campo, ancorada na célula.
                      "absolute bottom-full left-0 w-full rounded-t-md border-t"
                    : "min-h-0 flex-1 rounded-b-md border-b",
                )}
                style={
                  cellPanelFlip
                    ? { maxHeight: cellPanelLayout?.max }
                    : undefined
                }
              >
              {/* Lista com altura máxima: mantém o menu compacto mesmo com
                  muitas opções (a rolagem é só vertical). O menu cresce para a
                  direita conforme o conteúdo (`w-max`), então o rótulo do chip
                  não é cortado. */}
              <div
                className={cn(
                  "min-h-0 max-h-64 overflow-x-hidden overflow-y-auto",
                  // `flex-1` só depois de medido: no 1º frame a lista fica com a
                  // altura natural, o que permite medir o painel corretamente.
                  cellPanelLayout ? "flex-1" : undefined,
                )}
              >
                {visibleOptions.map((opt) => (
                  <div
                    key={opt.id}
                    {...optionDropProps(column, opt.id)}
                    className={cn(
                      "relative flex items-center gap-1 rounded",
                      // Barra indicadora da posição de inserção (sem borda).
                      optionOver === opt.id &&
                        optionDrag?.optionId &&
                        optionDrag.optionId !== opt.id &&
                        OPTION_DROP_BAR,
                      optionDrag?.optionId === opt.id && "opacity-50",
                    )}
                  >
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => startOptionDrag(column.id, opt.id, e)}
                      onDragEnd={endOptionDrag}
                      aria-label={`Reordenar opção ${opt.label}`}
                      title="Arrastar para reordenar"
                      className="flex h-6 w-4 flex-none cursor-grab items-center justify-center text-faint-foreground active:cursor-grabbing"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateCell(row.id, column.id, opt.id);
                        setOpenCell(null);
                      }}
                      className="flex min-w-0 flex-1 items-center rounded px-1 py-1.5 text-left hover:bg-accent"
                    >
                      <Chip option={opt} />
                    </button>
                    {/* Seta: abre o popover com nome, cor e excluir da opção. */}
                    <OptionColorPopover
                      option={opt}
                      onSelect={(color) =>
                        patchColumnOption(column, opt.id, { color })
                      }
                      onRename={(label) =>
                        patchColumnOption(column, opt.id, { label })
                      }
                      onRemove={() => removeColumnOption(column, row, opt.id)}
                    />
                  </div>
                ))}
              </div>
              {/* Prévia da opção sendo digitada na célula: "Criar" + chip. */}
              {preview ? (
                <div className="mt-1 flex flex-none items-center gap-1 border-t pt-1">
                  <button
                    type="button"
                    onClick={() => createOptionFromCell(row, column)}
                    className="flex-none rounded px-2 py-1 text-xs font-medium text-primary hover:bg-accent"
                  >
                    Criar
                  </button>
                  <Chip option={preview} />
                </div>
              ) : null}
              </div>
            </div>
          ) : null}
        </td>
      );
    }

    if (column.type === "multi_select") {
      const options = optionsForColumn(column);
      const list = Array.isArray(value) ? value : [];
      const cellKey = `${row.id}:${column.id}`;
      /** Prévia da opção sendo digitada (mostrada no rodapé do popover). */
      const preview = cellOptionPreview(column);
      /** Opções filtradas pelo texto digitado no campo da célula. */
      const query = newOptionText.trim().toLowerCase();
      const visibleOptions = query
        ? options.filter((o) => o.label.toLowerCase().includes(query))
        : options;
      return (
        <td
          className={cn(
            "relative cursor-pointer",
            // Aberta: mantém a altura da célula fechada (o painel é posicionado,
            // então não conta para a altura) — assim a linha não "pula".
            openCell === cellKey ? "h-10 p-0" : "px-3 py-1.5",
          )}
          onClick={(e) =>
            cellAreaClick(e, () =>
              setOpenCell(openCell === cellKey ? null : cellKey),
            )
          }
        >
          {openCell === cellKey ? null : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-cell-menu-trigger
                onClick={() => setOpenCell(openCell === cellKey ? null : cellKey)}
                className="flex w-full flex-nowrap items-center gap-1 overflow-hidden rounded pl-1 pr-2 py-1"
              >
                {list.length === 0 ? null : (
                  list.map((optId) => {
                    const opt = options.find((o) => o.id === optId) ?? tagById(optId);
                    return opt ? <Chip key={optId} option={opt} /> : null;
                  })
                )}
              </button>
              {openPageButton}
            </div>
          )}
          {openCell === cellKey ? (
            // Painel da célula: container posicionado e com largura fixa. Abre
            // para baixo e, quando não cabe até o rodapé fixo, **flipa para
            // cima** (a lista fica acima do campo) — sem criar barra de rolagem
            // e sem invadir a faixa "Nova linha"/"Calcular".
            <div
              data-cell-editor
              ref={cellPanelRef}
              className="absolute left-0 top-0 z-30 flex w-64 min-w-full flex-col"
              style={
                cellPanelFlip
                  ? undefined
                  : { maxHeight: cellPanelLayout?.max }
              }
            >
              {/* Linha do campo: topo do painel. Sem `border-t` de propósito (a
                  borda somaria 1px e a linha aumentaria ao abrir a célula). */}
              <div
                className={cn(
                  "flex flex-none flex-nowrap items-center gap-1 overflow-hidden border-x bg-popover px-3 py-1.5",
                  // Flip: o campo vira a parte de baixo da caixa.
                  cellPanelFlip ? "rounded-b-md border-b" : "rounded-t-md",
                )}
              >
                {list.map((optId) => {
                  const opt = options.find((o) => o.id === optId) ?? tagById(optId);
                  return opt ? (
                    <span key={optId} className="flex-none">
                      <Chip
                        option={opt}
                        onRemove={() => toggleTag(row, column.id, optId)}
                      />
                    </span>
                  ) : null;
                })}
                {/* Campo de criar opção ao lado das opções selecionadas. */}
                <input
                  value={newOptionText}
                  onChange={(e) => setNewOptionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createOptionFromCell(row, column);
                    }
                  }}
                  aria-label={`Criar nova opção em ${column.name}`}
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm outline-none"
                />
                {openPageButton}
              </div>
              <div
                data-cell-menu
                className={cn(
                  "flex flex-col border-x bg-popover p-1 shadow-md",
                  cellPanelFlip
                    ? // Flip: a lista abre ACIMA do campo, ancorada na célula.
                      "absolute bottom-full left-0 w-full rounded-t-md border-t"
                    : "min-h-0 flex-1 rounded-b-md border-b",
                )}
                style={
                  cellPanelFlip
                    ? { maxHeight: cellPanelLayout?.max }
                    : undefined
                }
              >
              {/* Lista com altura máxima: mantém o menu compacto mesmo com
                  muitas opções (a rolagem é só vertical). O menu cresce para a
                  direita conforme o conteúdo (`w-max`), então o rótulo do chip
                  não é cortado. */}
              <div
                className={cn(
                  "min-h-0 max-h-64 overflow-x-hidden overflow-y-auto",
                  // `flex-1` só depois de medido: no 1º frame a lista fica com a
                  // altura natural, o que permite medir o painel corretamente.
                  cellPanelLayout ? "flex-1" : undefined,
                )}
              >
                {visibleOptions.map((opt) => (
                  <div
                    key={opt.id}
                    {...optionDropProps(column, opt.id)}
                    className={cn(
                      "relative flex items-center gap-1 rounded",
                      // Barra indicadora da posição de inserção (sem borda).
                      optionOver === opt.id &&
                        optionDrag?.optionId &&
                        optionDrag.optionId !== opt.id &&
                        OPTION_DROP_BAR,
                      optionDrag?.optionId === opt.id && "opacity-50",
                    )}
                  >
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => startOptionDrag(column.id, opt.id, e)}
                      onDragEnd={endOptionDrag}
                      aria-label={`Reordenar opção ${opt.label}`}
                      title="Arrastar para reordenar"
                      className="flex h-6 w-4 flex-none cursor-grab items-center justify-center text-faint-foreground active:cursor-grabbing"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleTag(row, column.id, opt.id)}
                      className="flex min-w-0 flex-1 items-center justify-between rounded px-1 py-1.5 text-left hover:bg-accent"
                    >
                      <Chip option={opt} />
                      {list.includes(opt.id) ? (
                        <span className="pl-1 text-xs text-primary">
                          selecionado
                        </span>
                      ) : null}
                    </button>
                    {/* Seta: abre o popover com nome, cor e excluir da opção. */}
                    <OptionColorPopover
                      option={opt}
                      onSelect={(color) =>
                        patchColumnOption(column, opt.id, { color })
                      }
                      onRename={(label) =>
                        patchColumnOption(column, opt.id, { label })
                      }
                      onRemove={() => removeColumnOption(column, row, opt.id)}
                    />
                  </div>
                ))}
              </div>
              {/* Prévia da opção sendo digitada na célula: "Criar" + chip. */}
              {preview ? (
                <div className="mt-1 flex flex-none items-center gap-1 border-t pt-1">
                  <button
                    type="button"
                    onClick={() => createOptionFromCell(row, column)}
                    className="flex-none rounded px-2 py-1 text-xs font-medium text-primary hover:bg-accent"
                  >
                    Criar
                  </button>
                  <Chip option={preview} />
                </div>
              ) : null}
              </div>
            </div>
          ) : null}
        </td>
      );
    }

    if (column.type === "relation") {
      // Os vínculos vêm de `relation_links` (via hook), não mais de `values`.
      // Obs.: a busca textual do servidor casa os **ids** das linhas, não os
      // títulos das linhas alvo (follow-up).
      const ids = getTargets(row.id, column.id);
      const targetId = column.relationDatabaseId ?? null;
      const target = targetId ? databasesById.get(targetId) : undefined;
      const cellKey = `${row.id}:${column.id}`;

      // Sem alvo configurado (ou alvo excluído): clicar abre as configurações da
      // tabela para escolher o database de destino da relação.
      if (!targetId || !target) {
        return (
          <td className="px-3 py-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={openRelationSettings}
                title="Escolher o database da relação"
                className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {targetId ? "Database removido — escolher outro" : "Escolha um database"}
              </button>
              {openPageButton}
            </div>
          </td>
        );
      }

      /** Abre/fecha o seletor de itens, ancorado na célula. */
      const toggleEditor = (rect: DOMRect) => {
        const nextKey = openCell === cellKey ? null : cellKey;
        setOpenCell(nextKey);
        if (!nextKey) {
          setRelationCellPos(null);
          return;
        }
        // Mantém o popover dentro da viewport (tem ~22rem de altura): se não
        // houver espaço abaixo da célula, abre acima dela.
        const height = 352;
        const below = rect.bottom + 4;
        setRelationCellPos({
          top:
            below + height <= window.innerHeight
              ? below
              : Math.max(8, rect.top - height - 4),
          left: Math.min(
            Math.max(8, rect.left),
            Math.max(8, window.innerWidth - 300),
          ),
        });
      };

      return (
        <td
          data-relation-cell-trigger
          className="relative cursor-pointer px-3 py-1.5"
          onClick={(e) => {
            const t = e.target as HTMLElement | null;
            // Cliques nos chips abrem o item; em controles, não abrem o seletor.
            if (t?.closest("button, a, input, [data-relation-chip]")) return;
            toggleEditor(e.currentTarget.getBoundingClientRect());
          }}
        >
          <div className="flex items-center gap-1">
            <div className="flex w-full min-w-0 items-center rounded pl-1 pr-2 py-1">
              <RelationCell
                databaseId={targetId}
                columns={target.columns}
                ids={ids}
                onOpenItem={(rowId, anchorEl) => {
                  // Fecha o seletor da célula ao abrir o item referenciado.
                  setOpenCell(null);
                  setRelationCellPos(null);
                  setOpenItem({ databaseId: targetId, rowId, anchorEl });
                }}
                onRemove={(targetRowId) =>
                  toggleRelationLink(row.id, column.id, targetRowId, false)
                }
              />
            </div>
            {openPageButton}
          </div>
          {openCell === cellKey && relationCellPos
            ? createPortal(
                <div
                  data-cell-menu
                  data-relation-cell-popover
                  className="fixed z-50 max-h-[22rem] w-72 overflow-hidden rounded-md border bg-popover p-1 shadow-md"
                  style={{
                    top: relationCellPos.top,
                    left: relationCellPos.left,
                  }}
                >
                  <RelationSelect
                    databaseId={targetId}
                    columns={target.columns}
                    value={ids}
                    multiple={column.limit !== "one"}
                    onChange={(next) =>
                      applyRelationSelection(row.id, column.id, next)
                    }
                  />
                </div>,
                document.body,
              )
            : null}
        </td>
      );
    }

    if (column.type === "rollup") {
      const config = column.rollup;
      if (!config) {
        return (
          <td className="px-3 py-1.5">
            <div className="flex items-center gap-1">
              <span className="truncate pl-1 pr-2 py-1 text-sm text-muted-foreground">
                Configure o rollup
              </span>
              {openPageButton}
            </div>
          </td>
        );
      }
      const relationColumn = columns.find(
        (c) => c.id === config.relationPropertyId,
      );
      const targetDb = relationColumn?.relationDatabaseId
        ? databasesById.get(relationColumn.relationDatabaseId)
        : undefined;
      const targetColumn = targetDb?.columns.find(
        (c) => c.id === config.targetPropertyId,
      );
      const raw = getRollupValue(row.id, column.id);
      let display: string;
      let empty = false;
      if (raw === null) {
        display = "…";
      } else if (Array.isArray(raw)) {
        empty = raw.length === 0;
        display = empty ? "—" : raw.join(", ");
      } else if (raw === "") {
        empty = true;
        display = "—";
      } else if (config.fn === "percent_checked") {
        display = `${raw}%`;
      } else if (targetColumn?.type === "number") {
        const n = parseNumberValue(raw);
        display = n === null ? String(raw) : formatNumberByColumn(n, targetColumn);
      } else {
        display = String(raw);
      }
      return (
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1">
            <span
              title={display}
              className={cn(
                "truncate pl-1 pr-2 py-1 text-sm",
                empty && "text-muted-foreground",
              )}
            >
              {display}
            </span>
            {openPageButton}
          </div>
        </td>
      );
    }

    if (column.type === "date") {
      const dateValue = typeof value === "string" && value ? value : "";
      return (
        <td
          className="cursor-pointer px-3 py-1.5"
          onClick={(e) =>
            cellAreaClick(e, () => {
              const input =
                e.currentTarget.querySelector<HTMLInputElement>('input[type="date"]');
              if (!input) return;
              input.focus();
              const withPicker = input as HTMLInputElement & {
                showPicker?: () => void;
              };
              try {
                withPicker.showPicker?.();
              } catch {
                /* showPicker pode lançar se não partir de gesto do usuário */
              }
            })
          }
        >
          <div className="flex items-center gap-1">
            {/* O input nativo de data cobre toda a célula (transparente) para que
                o clique em qualquer ponto abra o seletor de data do navegador.
                A versão anterior usava `sr-only`, que impedia abrir o seletor. */}
            <div className="relative flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded pl-1 pr-2 py-1 text-sm">
              <span className={cn("truncate", !dateValue && "text-muted-foreground")}>
                {dateValue ? formatShortDate(dateValue) : ""}
              </span>
              <input
                type="date"
                value={dateValue}
                onChange={(e) => updateCell(row.id, column.id, e.target.value)}
                onClick={(e) => {
                  // Garante a abertura do seletor em navegadores que exigem gesto.
                  const input = e.currentTarget as HTMLInputElement & {
                    showPicker?: () => void;
                  };
                  try {
                    input.showPicker?.();
                  } catch {
                    /* showPicker pode lançar se não partir de gesto do usuário */
                  }
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`Alterar ${column.name}`}
              />
            </div>
            {openPageButton}
          </div>
        </td>
      );
    }

    if (column.type === "checkbox") {
      const checked = value === "true" || value === "1";
      return (
        <td
          className="cursor-pointer px-3 py-1.5"
          onClick={(e) =>
            cellAreaClick(e, () =>
              updateCell(row.id, column.id, checked ? "" : "true"),
            )
          }
        >
          <div className="flex items-center gap-1">
            <label className="flex w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded pl-1 pr-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  updateCell(row.id, column.id, e.target.checked ? "true" : "")
                }
                className="h-4 w-4 flex-none cursor-pointer rounded border-input accent-primary"
                aria-label={`Marcar ${column.name}`}
              />
            </label>
            {openPageButton}
          </div>
        </td>
      );
    }

    if (column.type === "number") {
      return (
        <td
          className="cursor-text px-3 py-1.5"
          onClick={(e) =>
            cellAreaClick(e, () =>
              e.currentTarget.querySelector("input")?.focus(),
            )
          }
        >
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            <NumberCellInput
              value={value}
              column={column}
              onChange={(next) => updateCell(row.id, column.id, next)}
            />
            {openPageButton}
          </div>
        </td>
      );
    }

    // url ? input de link (texto editável) + botão para abrir em nova aba
    if (column.type === "url") {
      const urlValue = Array.isArray(value) ? value.join("") : value ?? "";
      const href = linkHref(urlValue);
      return (
        <td
          className="cursor-text px-3 py-1.5"
          onClick={(e) =>
            cellAreaClick(e, () =>
              e.currentTarget.querySelector("input")?.focus(),
            )
          }
        >
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            <input
              type="text"
              value={urlValue}
              onChange={(e) => updateCell(row.id, column.id, e.target.value)}
              className={cn(
                "w-full min-w-0 rounded bg-transparent pl-1 pr-2 py-1 outline-none focus:outline-none",
                // Estilo de link só quando o texto já é um endereço válido.
                href && "text-primary underline underline-offset-2",
              )}
            />
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir link"
                title={href}
                className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
            {openPageButton}
          </div>
        </td>
      );
    }

    // text | person ? input simples
    const textValue = Array.isArray(value) ? value.join(", ") : value ?? "";
    return (
      <td
        className="cursor-text px-3 py-1.5"
        onClick={(e) =>
          cellAreaClick(e, () =>
            e.currentTarget.querySelector("input")?.focus(),
          )
        }
      >
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          <input
            type="text"
            value={textValue}
            onChange={(e) => updateCell(row.id, column.id, e.target.value)}
            className="w-full min-w-0 rounded bg-transparent pl-1 pr-2 py-1 outline-none focus:outline-none"
          />
          {openPageButton}
        </div>
      </td>
    );
  }

  /**
   * Linha do modal da página do item: usa a já carregada (Tabela/Kanban) ou
   * busca pelo id (`fetchRowById`), já que as linhas não vêm todas de uma vez.
   */
  const [openRow, setOpenRow] = useState<DbRow | null>(null);
  useEffect(() => {
    if (!openRowPage) {
      setOpenRow(null);
      return;
    }
    const loaded =
      tableRows.find((r) => r.id === openRowPage) ??
      allRows.find((r) => r.id === openRowPage);
    if (loaded) {
      setOpenRow(loaded);
      return;
    }
    let cancelled = false;
    void fetchRowById(openRowPage).then((row) => {
      if (!cancelled) setOpenRow(row);
    });
    return () => {
      cancelled = true;
    };
  }, [openRowPage, tableRows, allRows]);

  /** Título do card do Kanban: primeira coluna de texto/pessoa (senão "Sem título"). */
  function cardTitle(row: DbRow): string {
    const titleColumn = titleColumnOf(columns);
    if (!titleColumn) return "Sem título";
    const value = cellOf(row, titleColumn.id);
    const text = Array.isArray(value) ? value.join(", ") : value;
    return text.trim() || "Sem título";
  }

  /**
   * Renderiza, em modo leitura, o valor de uma propriedade para o rodapé do
   * card do Kanban (chips para select/status/multi_select, data formatada,
   * texto simples para os demais). Retorna `null` quando a célula está vazia.
   */
  function renderCardProperty(row: DbRow, column: Column) {
    const value = cellOf(row, column.id);
    if (value === "" || (Array.isArray(value) && value.length === 0)) return null;
    // Relação e rollup não são exibidos no card do Kanban (não são categoria
    // nem valor de célula).
    if (column.type === "relation" || column.type === "rollup") return null;

    if (column.type === "select" || column.type === "status") {
      const options = optionsForColumn(column);
      const current = options.find((o) => o.id === value);
      if (!current) return null;
      return <Chip option={current} />;
    }
    if (column.type === "multi_select") {
      const options = optionsForColumn(column);
      const list = Array.isArray(value) ? value : [];
      const chips = list
        .map((optId) => options.find((o) => o.id === optId) ?? tagById(optId))
        .filter((o): o is SelectOption => Boolean(o))
        .map((opt) => <Chip key={opt.id} option={opt} />);
      return chips.length > 0 ? <div className="flex flex-wrap gap-1">{chips}</div> : null;
    }
    if (column.type === "date") {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          {formatShortDate(String(value))}
        </span>
      );
    }
    if (column.type === "checkbox") {
      const checked = value === "true" || value === "1";
      if (!checked) return null;
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <CheckSquare className="h-3 w-3" />
          {column.name}
        </span>
      );
    }
    const text = Array.isArray(value) ? value.join(", ") : String(value);
    if (column.type === "number") {
      return (
        <span className="text-xs text-muted-foreground">
          {formatNumberValue(value, column)}
        </span>
      );
    }
    return <span className="text-xs text-muted-foreground">{text}</span>;
  }

  return (
    <>
      {/* Sem card: o database ocupa toda a área ao lado da sidebar (o `bg-card`
          é mantido para a superfície combinar com o cabeçalho/rodapé sticky). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
        {/* Barra de título do database (estilo Notion) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="relative" ref={titleIconAnchorRef}>
              <button
                type="button"
                onClick={() => setOpenTitleIconPicker((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={openTitleIconPicker}
                aria-label="Escolher ícone do database"
                title="Escolher ícone"
                className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-primary/10 hover:bg-primary/20"
              >
                <TitleIcon className="h-4 w-4 text-primary" />
              </button>
              {openTitleIconPicker ? (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setOpenTitleIconPicker(false)}
                    role="presentation"
                  />
                  <div
                    data-icon-picker
                    role="menu"
                    className="absolute left-0 top-full z-50 mt-1 max-h-[60vh] w-64 overflow-y-auto rounded-md border bg-popover p-2 shadow-md"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateIcon(viewId, null);
                        setOpenTitleIconPicker(false);
                      }}
                      className={cn(
                        "mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                        !icon ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <Table2 className="h-4 w-4" />
                      Padrão
                    </button>
                    <div className="grid grid-cols-6 gap-1">
                      {ICON_OPTIONS.map((option) => {
                        const OptionIcon = option.icon;
                        const isActive = icon === option.name;
                        return (
                          <button
                            key={option.name}
                            type="button"
                            title={option.name}
                            aria-label={option.name}
                            aria-pressed={isActive}
                            onClick={() => {
                              onUpdateIcon(viewId, option.name);
                              setOpenTitleIconPicker(false);
                            }}
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded hover:bg-accent",
                              isActive
                                ? "bg-accent text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            <OptionIcon className="h-4 w-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-w-0 rounded bg-transparent px-1 text-lg font-semibold outline-none focus:bg-accent"
              aria-label="Título do database"
            />
            {/* Link para o database relacionado: aparece assim que este database
                tem uma coluna de relação configurada e leva ao destino dela. */}
            {linkedDatabase ? (
              <button
                type="button"
                onClick={() => onOpenDatabase(linkedDatabase.id)}
                title={`Ir para o database relacionado: ${linkedDatabase.name}`}
                aria-label={`Ir para o database relacionado ${linkedDatabase.name}`}
                className="flex min-w-0 flex-none items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Link className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[160px] truncate">
                  {linkedDatabase.name}
                </span>
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {/* Busca recolhida: só o ícone de lupa; clicar abre (e foca) o input. */}
            {searchOpen ? (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => {
                    // Ao mudar a busca, as linhas "fixadas" voltam a ser
                    // avaliadas pelo filtro normalmente.
                    setPinnedRowIds(new Set());
                    setQuery(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Escape") return;
                    // Esc: limpa a busca; sem texto, recolhe de volta à lupa.
                    if (query) {
                      setPinnedRowIds(new Set());
                      setQuery("");
                    } else {
                      setSearchOpen(false);
                    }
                  }}
                  onBlur={() => {
                    // Recolhe ao sair do campo, mas só sem texto (não esconde
                    // uma busca ativa).
                    if (!query.trim()) setSearchOpen(false);
                  }}
                  placeholder="Buscar..."
                  aria-label="Buscar na tabela"
                  className="w-44 pl-8"
                />
              </div>
            ) : (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSearchOpen(true)}
                aria-label="Buscar na tabela"
                title="Buscar"
              >
                <Search className="h-4 w-4" />
              </Button>
            )}
            <div className="relative" ref={filterAnchorRef}>
              <Button
                variant="outline"
                size="icon"
                data-filter-trigger
                onClick={() => {
                  // Sem filtros: abre a lista para escolher propriedades.
                  // Com filtros: minimiza/expande a barra de filtros.
                  if (filterColumnIds.length === 0) {
                    setIsFilterOpen((v) => !v);
                  } else {
                    setFiltersCollapsed((v) => !v);
                  }
                }}
                title={
                  filterColumnIds.length === 0
                    ? "Filtrar por propriedade"
                    : filtersCollapsed
                      ? "Mostrar filtros"
                      : "Minimizar filtros"
                }
                aria-label={
                  filterColumnIds.length === 0
                    ? "Filtrar por propriedade"
                    : filtersCollapsed
                      ? "Mostrar filtros"
                      : "Minimizar filtros"
                }
                aria-haspopup={filterColumnIds.length === 0 ? "menu" : undefined}
                aria-expanded={
                  filterColumnIds.length === 0 ? isFilterOpen : !filtersCollapsed
                }
                className={cn(
                  filterColumnIds.length > 0 &&
                    "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive",
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
              {isFilterOpen ? (
                <div
                  data-filter-popover
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border bg-popover p-1 text-sm shadow-md"
                >
                  {renderFilterPropertyList(() => setIsFilterOpen(false))}
                </div>
              ) : null}
            </div>
            <div className="relative" ref={templateAnchorRef}>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsTemplateDialogOpen(true)}
                title="Criar modelo de página"
                aria-label="Criar modelo de página"
                data-template-popover-trigger
              >
                <LayoutTemplate className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative" ref={settingsAnchorRef}>
              <Button
                variant="outline"
                size="icon"
                aria-label="Configurações da tabela"
                title="Configurações da tabela"
                onClick={() => {
                  setSettingsInitialView("menu");
                  setIsSettingsOpen((v) => !v);
                }}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Abas de view (visualizações criadas pelo usuário) */}
        <div
          ref={viewTabsBarRef}
          className="relative flex items-center gap-1 border-b px-3 pt-2"
        >
          {/* Camada invisível: mede a largura natural das abas (overflow). */}
          <div
            data-views-measure
            aria-hidden
            className="pointer-events-none invisible absolute inset-0 overflow-hidden"
          >
            <div
              ref={viewTabsMeasureRef}
              className="absolute left-0 top-0 flex w-max items-center gap-1 whitespace-nowrap"
            >
              {views.map((view) => {
                const MeasureIcon = viewTypeMeta(view.type).icon;
                return (
                  <span key={view.id} className="flex flex-none items-center">
                    <span className="flex max-w-[10rem] flex-none items-center gap-1.5 rounded-t border-b-2 border-transparent px-3 py-1.5 text-sm font-medium">
                      <MeasureIcon className="h-3.5 w-3.5 flex-none" />
                      <span className="min-w-0 truncate">{view.name}</span>
                    </span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Abas visíveis no cabeçalho. Só as que cabem inteiras são exibidas
              (a próxima nunca fica cortada); as demais ficam no botão "Mais". */}
          <div
            ref={viewTabsListRef}
            className="flex min-w-0 items-center gap-1 overflow-hidden"
          >
          {visibleViews.map((view) => {
            const meta = viewTypeMeta(view.type);
            const ViewIcon = meta.icon;
            const isActive = view.id === activeView.id;
            const isRenaming = renamingViewId === view.id;
            const isDragging = draggingViewId === view.id;
            const showDropBefore =
              draggingViewId !== null &&
              draggingViewId !== view.id &&
              viewDropBeforeId === view.id;
            return (
              <Fragment key={view.id}>
                {/* Indicador da posição de inserção durante o arraste */}
                {showDropBefore ? (
                  <div className="h-6 w-0.5 flex-none rounded-full bg-primary" />
                ) : null}
                <div
                  draggable={!isRenaming}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", view.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingViewId(view.id);
                  }}
                  onDragEnd={() => {
                    setDraggingViewId(null);
                    setViewDropBeforeId(null);
                  }}
                  onDragOver={(event) => {
                    if (!draggingViewId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    // Soltar na metade direita da aba = inserir depois dela.
                    const rect = event.currentTarget.getBoundingClientRect();
                    const after = event.clientX - rect.left > rect.width / 2;
                    const nextBefore = after
                      ? (views[views.indexOf(view) + 1]?.id ?? null)
                      : view.id;
                    setViewDropBeforeId((current) =>
                      current === nextBefore ? current : nextBefore,
                    );
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId =
                      event.dataTransfer.getData("text/plain") || draggingViewId;
                    const beforeId = viewDropBeforeId;
                    setDraggingViewId(null);
                    setViewDropBeforeId(null);
                    if (draggedId) moveView(draggedId, beforeId);
                  }}
                  className={cn(
                    "group/view relative flex flex-none items-center",
                    isDragging && "opacity-40",
                  )}
                >
                  {isRenaming ? (
                  <span
                    className={cn(
                      "flex max-w-[10rem] items-center gap-1.5 whitespace-nowrap rounded-t border-b-2 px-3 py-1.5 text-sm font-medium",
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground",
                    )}
                  >
                    <ViewIcon className="h-3.5 w-3.5 flex-none" />
                    {/* O nome invisível reserva a largura da aba; o input fica
                        sobreposto a ele, sem alterar o tamanho nem empurrar as
                        demais visualizações. */}
                    <span className="relative min-w-0">
                      <span className="invisible block truncate">
                        {view.name}
                      </span>
                      <input
                        autoFocus
                        defaultValue={view.name}
                        onFocus={(e) => e.currentTarget.select()}
                        onBlur={(e) => renameView(view.id, e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            renameView(view.id, e.currentTarget.value);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setRenamingViewId(null);
                          }
                        }}
                        aria-label="Nome da visualização"
                        className="absolute inset-0 w-full rounded bg-transparent text-sm text-foreground outline-none"
                      />
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      // Clique na aba já selecionada abre o menu (renomear/excluir).
                      if (isActive) {
                        toggleViewMenu(view.id, event.currentTarget);
                      } else {
                        setActiveViewId(view.id);
                      }
                    }}
                    aria-pressed={isActive}
                    aria-haspopup={isActive ? "menu" : undefined}
                    aria-expanded={isActive ? viewMenuId === view.id : undefined}
                    title="Clique para abrir opções"
                    className={cn(
                      "flex max-w-[10rem] items-center gap-1.5 whitespace-nowrap rounded-t border-b-2 px-3 py-1.5 text-sm font-medium",
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <ViewIcon className="h-3.5 w-3.5 flex-none" />
                    <span className="min-w-0 truncate">{view.name}</span>
                  </button>
                )}
                </div>
              </Fragment>
            );
          })}
          </div>

          {!viewsCollapsed ? (
            <div className="relative flex-none">
              <button
                type="button"
                data-views-menu-trigger
                onClick={() => setViewsMenuOpen((open) => !open)}
                className="ml-0.5 flex items-center gap-1 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                aria-label="Nova visualização"
                title="Nova visualização"
                aria-expanded={viewsMenuOpen}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>

              {viewsMenuOpen ? (
                <div
                  data-views-menu
                  className="absolute left-0 top-full z-30 mt-1 w-44 rounded-md border bg-popover p-1 shadow-md"
                >
                  <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Nova visualização
                  </div>
                  {VIEW_TYPES.map((option) => {
                    const OptionIcon = option.icon;
                    return (
                      <button
                        key={option.type}
                        type="button"
                        onClick={() => createView(option.type)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        <OptionIcon className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Popover "Mais" flutuante: renderizado via portal, fora do container
              rolável, para não ser recortado pelas bordas da tabela. */}
          {overflowViewsOpen && overflowViewsPos
            ? createPortal(
                <>
                  <div
                    className="fixed inset-0 z-[60]"
                    onClick={() => {
                      setOverflowViewsOpen(false);
                      setOverflowNewOpen(false);
                    }}
                    role="presentation"
                  />
                  <div
                    role="menu"
                    style={{
                      top: overflowViewsPos.top,
                      left: overflowViewsPos.left,
                    }}
                    className="fixed z-[70] max-h-[70vh] w-56 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
                  >
                    <div className="p-1">
                      <input
                        autoFocus
                        value={overflowViewsQuery}
                        onChange={(e) => setOverflowViewsQuery(e.target.value)}
                        placeholder="Buscar visualização..."
                        aria-label="Buscar visualização"
                        className="h-[30px] w-full rounded-md border bg-background px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <button
                      ref={overflowNewBtnRef}
                      type="button"
                      onClick={toggleOverflowNew}
                      aria-haspopup="menu"
                      aria-expanded={overflowNewOpen}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium hover:bg-accent"
                    >
                      <Plus className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                      Nova visualização
                    </button>
                    <div className="my-1 border-t" />
                    <div className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Visualizações
                    </div>
                    <ul className="space-y-0.5">
                      {filteredOverflowViews.map((view) => {
                        const OptionIcon = viewTypeMeta(view.type).icon;
                        const isActive = view.id === activeView.id;
                        return (
                          <li key={view.id}>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setActiveViewId(view.id);
                                setOverflowViewsOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                                isActive && "bg-accent",
                              )}
                            >
                              <OptionIcon className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate">
                                {view.name}
                              </span>
                              {isActive ? (
                                <Check className="h-3.5 w-3.5 flex-none text-primary" />
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {filteredOverflowViews.length === 0 ? (
                      <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                        Nenhuma visualização encontrada.
                      </p>
                    ) : null}
                  </div>
                </>,
                document.body,
              )
            : null}

          {/* Submenu "Nova visualização" (abre à esquerda do botão, dentro do
              popover "Mais"). Renderizado via portal para não ser recortado. */}
          {overflowNewOpen && overflowNewPos
            ? createPortal(
                <>
                  <div
                    className="fixed inset-0 z-[75]"
                    onClick={() => setOverflowNewOpen(false)}
                    role="presentation"
                  />
                  <div
                    role="menu"
                    style={{ top: overflowNewPos.top, left: overflowNewPos.left }}
                    className="fixed z-[80] w-44 rounded-lg border bg-popover p-1 shadow-lg"
                  >
                    {VIEW_TYPES.map((option) => {
                      const OptionIcon = option.icon;
                      return (
                        <button
                          key={option.type}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            createView(option.type);
                            setOverflowNewOpen(false);
                            setOverflowViewsOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                          <OptionIcon className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </>,
                document.body,
              )
            : null}

          {/* Menu da aba ativa (clique na aba selecionada): renomear/excluir. */}
          {viewMenuId && viewMenuPos
            ? createPortal(
                <>
                  <div
                    className="fixed inset-0 z-[60]"
                    onClick={() => setViewMenuId(null)}
                    role="presentation"
                  />
                  <div
                    role="menu"
                    style={{ top: viewMenuPos.top, left: viewMenuPos.left }}
                    className="fixed z-[70] w-52 rounded-lg border bg-popover p-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setRenamingViewId(viewMenuId);
                        setViewMenuId(null);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Pencil className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                      Renomear
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={views.length <= 1}
                      onClick={() => {
                        removeView(viewMenuId);
                        setViewMenuId(null);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 flex-none" />
                      Excluir visualização
                    </button>
                  </div>
                </>,
                document.body,
              )
            : null}

          {/* Controle à direita: botão "Mais" (visualizações que não cabem). */}
          <div className="ml-auto flex items-center gap-1">
            {viewsCollapsed ? (
              <button
                ref={overflowViewsBtnRef}
                type="button"
                onClick={toggleOverflowViews}
                aria-haspopup="menu"
                aria-expanded={overflowViewsOpen}
                title="Mais visualizações"
                className="flex flex-none items-center gap-1.5 rounded px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Mais
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-foreground">
                  {hiddenViewsCount}
                </span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Barra de filtros: botões das propriedades escolhidas no "Filtrar".
            Pode ser minimizada pelo botão "Filtrar" do cabeçalho (filtros seguem
            ativos, apenas a barra fica oculta). */}
        {filterColumnIds.length > 0 && !filtersCollapsed ? (
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            {filterColumnIds.map((id) => {
              const column = columns.find((c) => c.id === id);
              if (!column) return null;
              const Icon = columnIcon(column);
              /** Operador + valor normalizados deste filtro. */
              const normalizedChipFilter = normalizeFilter(
                filterOperators[id],
                filterValues[id],
              );
              // Relação: converte o operador genérico (inclusive o de filtros
              // salvos antes dos operadores de relação) para `relation_*`.
              const chipFilter =
                column.type === "relation"
                  ? {
                      ...normalizedChipFilter,
                      operator: relationFilterOperator(normalizedChipFilter.operator),
                    }
                  : normalizedChipFilter;
              const isEmptyOperator =
                chipFilter.operator === "is_empty" ||
                chipFilter.operator === "is_not_empty" ||
                chipFilter.operator === "relation_is_empty" ||
                chipFilter.operator === "relation_is_not_empty";
              /** Operadores deste tipo de coluna (multi_select = "contém"). */
              const operatorOptions = filterOperatorsFor(column);
              // Filtro configurado (com valor — inclusive "" p/ Desmarcadas — ou
              // operador de vazio) fica vermelho.
              const active = isEmptyOperator || chipFilter.value !== null;
              /** Rótulo do operador (é/não é/contém/não contém/está vazio...). */
              const operatorLabel =
                operatorOptions.find((o) => o.value === chipFilter.operator)
                  ?.label ?? "";
              /** Rótulo do valor (opção resolvida pelo id, ou "Marcado"). */
              const valueLabel = (() => {
                if (isEmptyOperator || chipFilter.value === null) return "";
                if (column.type === "checkbox")
                  return chipFilter.value === "true"
                    ? "Marcadas"
                    : "Desmarcadas";
                // Relação: o valor é o id de uma linha alvo (título é assíncrono).
                if (column.type === "relation") return "";
                const option =
                  optionsForColumn(column).find(
                    (o) => o.id === chipFilter.value,
                  ) ?? tagById(chipFilter.value);
                return option ? option.label : chipFilter.value;
              })();
              /** Database alvo quando a propriedade filtrada é uma relação. */
              const relationTarget =
                column.type === "relation" && column.relationDatabaseId
                  ? databasesById.get(column.relationDatabaseId)
                  : undefined;
              /** Texto do chip: ex. "é Em andamento" ou "está vazio". */
              const chipLabel = isEmptyOperator
                ? operatorLabel
                : valueLabel
                  ? `${operatorLabel} ${valueLabel}`
                  : "";
              return (
                <span key={id} className="relative">
                  <button
                    type="button"
                    data-filter-chip-trigger
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setFilterChipId(filterChipId === id ? null : id);
                      setFilterChipPos({
                        top: rect.bottom + 4,
                        left: rect.left,
                      });
                    }}
                    aria-label={`Filtrar ${column.name}`}
                    title="Filtrar"
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                      active
                        ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                        : "bg-accent/40 text-foreground hover:bg-destructive/10 hover:text-destructive",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5 flex-none",
                        active ? "text-destructive" : "text-muted-foreground",
                      )}
                    />
                    {column.name}
                    {column.type === "relation" &&
                    !isEmptyOperator &&
                    chipFilter.value ? (
                      <span
                        className={cn(
                          "flex items-center gap-1",
                          active
                            ? "text-destructive/80"
                            : "text-muted-foreground",
                        )}
                      >
                        · {operatorLabel}
                        {relationTarget ? (
                          <RelationTitle
                            databaseId={relationTarget.id}
                            columns={relationTarget.columns}
                            rowId={chipFilter.value}
                          />
                        ) : (
                          <span>database removido</span>
                        )}
                      </span>
                    ) : chipLabel ? (
                      <span
                        className={cn(
                          active
                            ? "text-destructive/80"
                            : "text-muted-foreground",
                        )}
                      >
                        · {chipLabel}
                      </span>
                    ) : null}
                  </button>
                  {filterChipId === id && filterChipPos ? (
                    <div
                      data-filter-chip-popover
                      className={cn(
                        "fixed z-50 rounded-md border bg-popover p-1 text-left text-sm shadow-md",
                        column.type === "relation" ? "w-64" : "w-44",
                      )}
                      style={{
                        top: filterChipPos.top,
                        left: filterChipPos.left,
                      }}
                    >
                      {/* Cabeçalho: nome da propriedade + seletor de operador. */}
                      <div className="relative flex items-center gap-1 border-b px-1 pb-1">
                        <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium text-muted-foreground">
                          {column.name}
                        </span>
                        <button
                          type="button"
                          data-filter-operator-trigger
                          onClick={() =>
                            setFilterOperatorChipId((cur) =>
                              cur === id ? null : id,
                            )
                          }
                          aria-haspopup="menu"
                          aria-expanded={filterOperatorChipId === id}
                          className="flex flex-none items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          {operatorLabel || "é"}
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        {filterOperatorChipId === id ? (
                          <div
                            data-filter-operator-popover
                            role="menu"
                            className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border bg-popover p-1 shadow-md"
                          >
                            {operatorOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setFilterOperators((prev) => ({
                                    ...prev,
                                    [id]: option.value,
                                  }));
                                  setFilterOperatorChipId(null);
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent",
                                  chipFilter.operator === option.value
                                    ? "text-foreground"
                                    : "text-muted-foreground",
                                )}
                              >
                                {option.label}
                                {chipFilter.operator === option.value ? (
                                  <Check className="ml-auto h-3.5 w-3.5 flex-none" />
                                ) : null}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      {/* Valores (só faz sentido em "é"/"não é"). */}
                      {isEmptyOperator ? null : (
                        <div className="py-1">
                          {column.type === "checkbox" ? (
                            <>
                              {[
                                { label: "Marcadas", value: "true" },
                                { label: "Desmarcadas", value: "" },
                              ].map((option) => (
                                <button
                                  key={option.value || "__empty"}
                                  type="button"
                                  onClick={() => {
                                    setFilterValues((v) => ({
                                      ...v,
                                      [id]: option.value,
                                    }));
                                    setFilterChipId(null);
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent",
                                    chipFilter.value === option.value
                                      ? "text-foreground"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {option.label}
                                  {chipFilter.value === option.value ? (
                                    <Check className="ml-auto h-3.5 w-3.5 flex-none" />
                                  ) : null}
                                </button>
                              ))}
                            </>
                          ) : column.type === "select" ||
                            column.type === "status" ||
                            column.type === "multi_select" ? (
                            optionsForColumn(column).length === 0 ? (
                              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                Nenhuma opção.
                              </p>
                            ) : (
                              optionsForColumn(column).map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => {
                                    setFilterValues((v) => ({
                                      ...v,
                                      [id]: opt.id,
                                    }));
                                    setFilterChipId(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                                >
                                  <Chip option={opt} />
                                  {chipFilter.value === opt.id ? (
                                    <Check className="ml-auto h-3.5 w-3.5 flex-none" />
                                  ) : null}
                                </button>
                              ))
                            )
                          ) : column.type === "relation" ? (
                            column.relationDatabaseId ? (
                              relationTarget ? (
                                <RelationSelect
                                  databaseId={relationTarget.id}
                                  columns={relationTarget.columns}
                                  value={
                                    chipFilter.value ? [chipFilter.value] : []
                                  }
                                  multiple={false}
                                  onChange={(next) => {
                                    setFilterValues((v) => {
                                      const updated = { ...v };
                                      if (next.length === 0) delete updated[id];
                                      else updated[id] = next[0];
                                      return updated;
                                    });
                                    setFilterChipId(null);
                                  }}
                                />
                              ) : (
                                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                  Database removido.
                                </p>
                              )
                            ) : (
                              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                Escolha um database na propriedade.
                              </p>
                            )
                          ) : (
                            <input
                              value={chipFilter.value ?? ""}
                              onChange={(e) =>
                                setFilterValues((v) => ({
                                  ...v,
                                  [id]: e.target.value,
                                }))
                              }
                              placeholder="Valor…"
                              aria-label={`Valor do filtro de ${column.name}`}
                              className="w-full rounded bg-transparent px-2 py-1.5 text-sm text-foreground outline-none focus:bg-accent"
                            />
                          )}
                        </div>
                      )}

                      {/* Limpar: aparece quando o filtro está configurado. */}
                      {chipFilter.value || isEmptyOperator ? (
                        <div className="mt-1 border-t pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setFilterValues((v) => {
                                const next = { ...v };
                                delete next[id];
                                return next;
                              });
                              setFilterOperators((prev) => {
                                const next = { ...prev };
                                delete next[id];
                                return next;
                              });
                              setFilterChipId(null);
                            }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            Limpar
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </span>
              );
            })}
            {/* Botão "+" para adicionar mais propriedades ao filtro. */}
            <div className="relative">
              <button
                type="button"
                data-filter-bar-trigger
                onClick={() => setIsFilterBarOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={isFilterBarOpen}
                aria-label="Adicionar propriedade ao filtro"
                title="Adicionar filtro"
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
              {isFilterBarOpen ? (
                <div
                  data-filter-bar-popover
                  role="menu"
                  className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border bg-popover p-1 text-sm shadow-md"
                >
                  {renderFilterPropertyList(() => setIsFilterBarOpen(false))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Área rolável: tabela */}
        {/* `overflow-auto` (e não `scroll`): a barra horizontal só aparece quando
            as colunas passam da largura visível. O espaço dela é reservado pelo
            espaçador logo abaixo, então o conteúdo não "sobe" quando ela surge. */}
        <div
          ref={tableScrollRef}
          className="min-h-0 flex-1 overflow-auto"
        >
        {/* Tabela */}
        {/* Coluna flex com altura mínima da área visível: a tabela cresce e o
            rodapé "Calcular" fica colado na base, acima da barra de rolagem
            horizontal, mesmo quando há poucas linhas. */}
        {activeView.type === "table" ? (
        <div className="flex min-h-full flex-col">
          <DndContext
            sensors={sensors}
            modifiers={[dragAxisModifier]}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
          <div className="flex-1">
          <table
            data-database-table
            className="w-max table-fixed border-collapse text-sm"
            onFocus={handleTableFocus}
            onBlur={handleTableBlur}
            style={{
              /* Largura fixa em px (soma das colunas + ações + a coluna fantasma
                 calculada por `tableSpacerWidth`), e não min-width/100%, para que
                 `table-fixed` NÃO redistribua as larguras das colunas: cada uma
                 mantém o seu tamanho e a fantasma absorve o resto da tela. */
              width: tableWidth,
            }}
          >
            <colgroup>
              <col style={{ width: ROW_GUTTER_WIDTH }} />
              {orderedVisibleColumns.map((column) => (
                <col
                  key={column.id}
                style={{ width: effectiveColumnWidth(column) }}
                />
              ))}
              <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
              {/* Coluna fantasma: absorve o espaço restante do container
                  (calculado em `tableSpacerWidth`) para as linhas horizontais
                  irem até o fim da tela. Vale 0 quando há rolagem horizontal. */}
              <col style={{ width: tableSpacerWidth }} />
            </colgroup>
            <thead ref={tableHeadRef} className="sticky top-0 z-10 bg-card">
              <tr className="text-left text-xs text-muted-foreground">
                {/* Coluna gutter: checkbox "selecionar tudo" (aparece só quando há
                    ao menos uma linha selecionada), alinhado à direita para casar
                    com o checkbox das linhas. */}
                <th className="border-b px-1 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    {selectedRowIds.size > 0 ? (
                      <>
                        {/* Contador de linhas marcadas. */}
                        <span
                          aria-live="polite"
                          className="text-[11px] font-medium tabular-nums text-muted-foreground"
                        >
                          {selectedRowIds.size}
                        </span>
                        {/* Excluir as linhas marcadas (pede confirmação). */}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSelectedOpen(true)}
                          aria-label="Excluir linhas selecionadas"
                          title="Excluir linhas selecionadas"
                          className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="checkbox"
                          checked={selectedRowIds.size === tableRows.length}
                          ref={(el) => {
                            if (el) {
                              el.indeterminate =
                                selectedRowIds.size < tableRows.length;
                            }
                          }}
                          onChange={toggleAllRowsSelection}
                          aria-label="Selecionar todas as linhas"
                          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        />
                      </>
                    ) : null}
                  </div>
                </th>
                {orderedVisibleColumns.map((column) => {
                  const Icon = columnIcon(column);
                  return (
                    <ColumnHeaderCell
                      key={column.id}
                      columnId={column.id}
                      isAnchor={openColumnEditor === column.id}
                      anchorRef={columnHeaderRef}
                      className="relative border-b px-3 py-2 font-medium transition-colors hover:bg-accent"
                    >
                      <button
                        type="button"
                        data-column-editor-trigger
                        onClick={() => {
                          setOpenColumnEditor(
                            openColumnEditor === column.id ? null : column.id,
                          );
                          setOpenHeaderTypeMenu(null);
                          setOpenIconPicker(null);
                        }}
                        className={cn(
                          // Cursor padrão (a mãozinha comum, igual às abas de
                          // visualização) — o arraste continua funcionando.
                          "flex w-full items-center gap-1.5 overflow-hidden rounded px-1 py-0.5 text-left",
                          // O título fica sempre à esquerda (inclusive nas
                          // colunas numéricas); o que fica à direita é o valor
                          // na célula, não o nome da propriedade.
                        )}
                        title="Editar propriedade (arraste para reordenar)"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 truncate">{column.name}</span>
                        <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>

                      {openColumnEditor === column.id && columnEditorPos ? (
                        <div
                          data-column-editor
                          // Não deixa o dnd-kit capturar interações do popover
                          // (clicar/rolar as opções não pode virar arraste).
                          onPointerDown={(event) => event.stopPropagation()}
                          className={cn(
                            "fixed z-30 rounded-md border bg-popover p-3 text-left font-normal text-foreground shadow-md",
                            column.type === "status" ? "w-72" : "w-64",
                          )}
                          style={{
                            top: columnEditorPos.top,
                            left: columnEditorPos.left,
                          }}
                        >
                          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
                            Nome
                          </label>
                          <div className="relative mb-3 flex items-center gap-2">
                            <button
                              type="button"
                              data-icon-picker-trigger
                              onClick={() => {
                                setOpenIconPicker(
                                  openIconPicker === column.id ? null : column.id,
                                );
                              }}
                              aria-haspopup="menu"
                              aria-expanded={openIconPicker === column.id}
                              title="Escolher ícone da propriedade"
                              aria-label="Escolher ícone da propriedade"
                              className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <Icon className="h-4 w-4" />
                            </button>
                            <Input
                              value={column.name}
                              onChange={(e) =>
                                updateColumn(column.id, { name: e.target.value })
                              }
                              className="h-8 flex-1"
                              aria-label="Nome da propriedade"
                            />

                            {openIconPicker === column.id ? (
                              <div
                                data-icon-picker
                                // Abre sempre para BAIXO, com altura fixa e
                                // rolagem: a lista tem 100 ícones e, com o
                                // flip, ela "pulava" para cima e estourava a
                                // tela.
                                className="absolute left-0 top-full z-40 mt-1 h-80 w-64 overflow-y-auto rounded-md border bg-popover p-2 shadow-md"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateColumn(column.id, { icon: undefined });
                                    setOpenIconPicker(null);
                                  }}
                                  className={cn(
                                    "mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                                    !column.icon
                                      ? "text-foreground"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  <CircleDashed className="h-4 w-4" />
                                  Automático
                                </button>
                                <div className="grid grid-cols-6 gap-1">
                                  {ICON_OPTIONS.map((option) => {
                                    const OptionIcon = option.icon;
                                    const isActive = column.icon === option.name;
                                    return (
                                      <button
                                        key={option.name}
                                        type="button"
                                        title={option.name}
                                        aria-label={option.name}
                                        aria-pressed={isActive}
                                        onClick={() => {
                                          updateColumn(column.id, {
                                            icon: option.name,
                                          });
                                          setOpenIconPicker(null);
                                        }}
                                        className={cn(
                                          "flex h-8 w-8 items-center justify-center rounded hover:bg-accent",
                                          isActive
                                            ? "bg-accent text-foreground"
                                            : "text-muted-foreground",
                                        )}
                                      >
                                        <OptionIcon className="h-4 w-4" />
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </div>

                          <div className="relative">
                            <button
                              type="button"
                              data-header-type-menu-trigger
                              onClick={() => {
                                setOpenHeaderTypeMenu(
                                  openHeaderTypeMenu === column.id
                                    ? null
                                    : column.id,
                                );
                                setOpenPropEditMenu(null);
                                setOpenNumberFormatMenu(null);
                                setOpenDecimalsMenu(null);
                                setOpenCalcMenu(null);
                                setOpenIconPicker(null);
                              }}
                              aria-haspopup="menu"
                              aria-expanded={openHeaderTypeMenu === column.id}
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <ArrowLeftRight className="h-3.5 w-3.5" />
                              Alterar tipo
                              <ChevronDown className="ml-auto h-3.5 w-3.5" />
                            </button>

                            {openHeaderTypeMenu === column.id ? (
                              <div
                                data-header-type-menu
                                ref={headerTypeMenuSide.ref}
                                className={cn(
                                  "absolute z-40 w-64 min-w-max whitespace-nowrap rounded-md border bg-popover p-1 shadow-md",
                                  headerTypeMenuSide.className,
                                )}
                              >
                                {COLUMN_TYPES.map((option) => {
                                  const OptionIcon = option.icon;
                                  return (
                                    <button
                                      key={option.type}
                                      type="button"
                                      onClick={() => {
                                        updateColumn(column.id, {
                                          type: option.type,
                                        });
                                        // Fecha o menu e o editor da propriedade
                                        // (o fluxo termina ao escolher o tipo).
                                        setOpenColumnEditor(null);
                                        setOpenHeaderTypeMenu(null);
                                        setOpenPropEditMenu(null);
                                        setOpenNumberFormatMenu(null);
                                        setOpenDecimalsMenu(null);
                                        setOpenCalcMenu(null);
                                      }}
                                      className={cn(
                                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                                        column.type === option.type &&
                                          "bg-primary/10 text-primary",
                                      )}
                                    >
                                      <OptionIcon className="h-3.5 w-3.5" />
                                      {option.label}
                                      {column.type === option.type ? (
                                        <span className="ml-auto text-[10px] uppercase">
                                          atual
                                        </span>
                                      ) : null}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>

                          <div className="relative">
                            <button
                              type="button"
                              data-prop-edit-menu-trigger
                              data-select-options-trigger
                              onClick={() => {
                                if (column.type === "number") {
                                  // Propriedade numérica: abre o popover de edição
                                  // (com o botão "Formato de número"). Fecha o
                                  // submenu "Alterar tipo" (são mutuamente exclusivos).
                                  setOpenHeaderTypeMenu(null);
                                  setOpenPropEditMenu(
                                    openPropEditMenu === column.id
                                      ? null
                                      : column.id,
                                  );
                                  setOpenNumberFormatMenu(null);
                                  setOpenDecimalsMenu(null);
                                  setOpenCalcMenu(null);
                                  setOpenIconPicker(null);
                                  return;
                                }
                                if (column.type === "status") {
                                  // Propriedade status: abre um sub-popover
                                  // aninhado com as categorias
                                  // A fazer / Em andamento / Concluídos.
                                  setOpenHeaderTypeMenu(null);
                                  setOpenStatusOptions(
                                    openStatusOptions === column.id
                                      ? null
                                      : column.id,
                                  );
                                  setOpenSelectOptions(null);
                                  setOpenPropEditMenu(null);
                                  setOpenNumberFormatMenu(null);
                                  setOpenDecimalsMenu(null);
                                  setOpenCalcMenu(null);
                                  setOpenIconPicker(null);
                                  return;
                                }
                                if (
                                  column.type === "select" ||
                                  column.type === "multi_select"
                                ) {
                                  // Propriedade de seleção: abre um sub-popover
                                  // aninhado com a lista de "Opções" (adicionar,
                                  // renomear, recolorir e excluir).
                                  setOpenHeaderTypeMenu(null);
                                  setOpenSelectOptions(
                                    openSelectOptions === column.id
                                      ? null
                                      : column.id,
                                  );
                                  setOpenStatusOptions(null);
                                  setOpenPropEditMenu(null);
                                  setOpenNumberFormatMenu(null);
                                  setOpenDecimalsMenu(null);
                                  setOpenCalcMenu(null);
                                  setOpenIconPicker(null);
                                  return;
                                }
                                setSettingsInitialView("edit");
                                setIsSettingsOpen(true);
                                setOpenColumnEditor(null);
                                setOpenHeaderTypeMenu(null);
                                setOpenPropEditMenu(null);
                                setOpenNumberFormatMenu(null);
                                setOpenDecimalsMenu(null);
                                setOpenCalcMenu(null);
                                setOpenIconPicker(null);
                              }}
                              aria-haspopup={
                                column.type === "number" ||
                                column.type === "status" ||
                                column.type === "select" ||
                                column.type === "multi_select"
                                  ? "menu"
                                  : undefined
                              }
                              aria-expanded={
                                column.type === "number"
                                  ? openPropEditMenu === column.id
                                  : column.type === "status"
                                    ? openStatusOptions === column.id
                                    : column.type === "select" ||
                                        column.type === "multi_select"
                                      ? openSelectOptions === column.id
                                      : undefined
                              }
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                              Editar propriedade
                              {column.type === "number" ||
                              column.type === "status" ||
                              column.type === "select" ||
                              column.type === "multi_select" ? (
                                <ChevronDown className="ml-auto h-3.5 w-3.5" />
                              ) : null}
                            </button>

                            {openPropEditMenu === column.id &&
                            column.type === "number" ? (
                              <div
                                data-prop-edit-menu
                                ref={propEditMenuSide.ref}
                                className={cn(
                                  "absolute z-40 w-full min-w-[280px] rounded-md border bg-popover p-1 shadow-md",
                                  propEditMenuSide.className,
                                )}
                              >
                                <div className="relative">
                                  <button
                                    type="button"
                                    data-number-format-menu-trigger
                                    onClick={() => {
                                      setOpenNumberFormatMenu(
                                        openNumberFormatMenu === column.id
                                          ? null
                                          : column.id,
                                      );
                                      setOpenDecimalsMenu(null);
                                      setOpenCalcMenu(null);
                                    }}
                                    aria-haspopup="menu"
                                    aria-expanded={
                                      openNumberFormatMenu === column.id
                                    }
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                                  >
                                    Formato de número
                                    <span className="ml-auto truncate text-[11px] text-muted-foreground">
                                      {numberFormatLabel(column)}
                                    </span>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </button>

                                  {openNumberFormatMenu === column.id ? (
                                    <div
                                      data-number-format-menu
                                      ref={numberFormatMenuFlip.ref}
                                      className={cn(
                                        "absolute z-50 max-h-72 w-full min-w-[220px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md",
                                        numberFormatMenuFlip.className,
                                      )}
                                    >
                                      {NUMBER_FORMATS.map((option) => {
                                        const OptionIcon = option.icon;
                                        const isCurrent =
                                          column.numberFormat !==
                                            "currency" &&
                                          (column.numberFormat ?? "plain") ===
                                            option.value;
                                        return (
                                          <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => {
                                              updateColumn(column.id, {
                                                numberFormat: option.value,
                                              });
                                              setOpenNumberFormatMenu(null);
                                            }}
                                            className={cn(
                                              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                                              isCurrent &&
                                                "bg-primary/10 text-primary",
                                            )}
                                          >
                                            <OptionIcon className="h-3.5 w-3.5" />
                                            {option.label}
                                            {isCurrent ? (
                                              <span className="ml-auto text-[10px] uppercase">
                                                atual
                                              </span>
                                            ) : null}
                                          </button>
                                        );
                                      })}

                                      <div className="my-1 h-px bg-border" />

                                      <span className="flex items-center gap-2 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                        <Coins className="h-3.5 w-3.5" />
                                        Moedas
                                      </span>
                                      {CURRENCIES.map((currency) => {
                                        const isCurrent =
                                          column.numberFormat === "currency" &&
                                          currencyByCode(column.currency)
                                            .code === currency.code;
                                        return (
                                          <button
                                            key={currency.code}
                                            type="button"
                                            onClick={() => {
                                              updateColumn(column.id, {
                                                numberFormat: "currency",
                                                currency: currency.code,
                                              });
                                              setOpenNumberFormatMenu(null);
                                            }}
                                            className={cn(
                                              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                                              isCurrent &&
                                                "bg-primary/10 text-primary",
                                            )}
                                          >
                                            <span className="flex h-3.5 w-5 flex-none items-center justify-center text-xs">
                                              {currency.symbol}
                                            </span>
                                            <span className="truncate">
                                              {currency.name}
                                            </span>
                                            <span className="ml-auto text-[11px] text-muted-foreground">
                                              {currency.code}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="relative">
                                  <button
                                    type="button"
                                    data-decimals-menu-trigger
                                    onClick={() => {
                                      setOpenDecimalsMenu(
                                        openDecimalsMenu === column.id
                                          ? null
                                          : column.id,
                                      );
                                      setOpenNumberFormatMenu(null);
                                      setOpenCalcMenu(null);
                                    }}
                                    aria-haspopup="menu"
                                    aria-expanded={openDecimalsMenu === column.id}
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                                  >
                                    Casas decimais
                                    <span className="ml-auto truncate text-[11px] text-muted-foreground">
                                      {decimalsLabel(column)}
                                    </span>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </button>

                                  {openDecimalsMenu === column.id ? (
                                    <div
                                      data-decimals-menu
                                      ref={decimalsMenuFlip.ref}
                                      className={cn(
                                        "absolute z-50 w-full min-w-[220px] rounded-md border bg-popover p-1 shadow-md",
                                        decimalsMenuFlip.className,
                                      )}
                                    >
                                      {DECIMAL_OPTIONS.map((option) => {
                                        const isCurrent =
                                          (column.decimals ?? null) === option.value;
                                        return (
                                          <button
                                            key={option.label}
                                            type="button"
                                            onClick={() => {
                                              updateColumn(column.id, {
                                                decimals: option.value,
                                              });
                                              setOpenDecimalsMenu(null);
                                            }}
                                            className={cn(
                                              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                                              isCurrent &&
                                                "bg-primary/10 text-primary",
                                            )}
                                          >
                                            {option.label}
                                            {isCurrent ? (
                                              <span className="ml-auto text-[10px] uppercase">
                                                atual
                                              </span>
                                            ) : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>

                                <div className="relative">
                                  <button
                                    type="button"
                                    data-calc-menu-trigger
                                    onClick={() => {
                                      setOpenCalcMenu(
                                        openCalcMenu === column.id
                                          ? null
                                          : column.id,
                                      );
                                      setOpenNumberFormatMenu(null);
                                      setOpenDecimalsMenu(null);
                                    }}
                                    aria-haspopup="menu"
                                    aria-expanded={openCalcMenu === column.id}
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                                  >
                                    Calcular
                                    <span className="ml-auto truncate text-[11px] text-muted-foreground">
                                      {column.calculate
                                        ? calcFunctionLabel(column.calculate)
                                        : "Nenhum"}
                                    </span>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </button>

                                  {openCalcMenu === column.id ? (
                                    <div
                                      data-calc-menu
                                      ref={calcMenuFlip.ref}
                                      className={cn(
                                        "absolute z-50 max-h-72 w-full min-w-[220px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md",
                                        calcMenuFlip.className,
                                      )}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          updateColumn(column.id, {
                                            calculate: undefined,
                                          });
                                          setOpenCalcMenu(null);
                                        }}
                                        className={cn(
                                          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                                          !column.calculate &&
                                            "bg-primary/10 text-primary",
                                        )}
                                      >
                                        Nenhum
                                        {!column.calculate ? (
                                          <span className="ml-auto text-[10px] uppercase">
                                            atual
                                          </span>
                                        ) : null}
                                      </button>

                                      <div className="my-1 h-px bg-border" />

                                      {CALC_FUNCTIONS.map((option) => {
                                        const isCurrent =
                                          column.calculate === option.value;
                                        return (
                                          <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => {
                                              updateColumn(column.id, {
                                                calculate: option.value,
                                              });
                                              setOpenCalcMenu(null);
                                            }}
                                            className={cn(
                                              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                                              isCurrent &&
                                                "bg-primary/10 text-primary",
                                            )}
                                          >
                                            {option.label}
                                            {isCurrent ? (
                                              <span className="ml-auto text-[10px] uppercase">
                                                atual
                                              </span>
                                            ) : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>

                              </div>
                            ) : null}

                            {openStatusOptions === column.id &&
                            column.type === "status" ? (
                              <div
                                data-status-options
                                ref={statusOptionsSide.ref}
                                className={cn(
                                  "absolute top-0 z-40 max-h-[70vh] w-80 overflow-y-auto rounded-md border bg-popover p-3 text-left shadow-lg",
                                  statusOptionsSide.className,
                                )}
                              >
                                <StatusCategoryTabs
                                  options={editableOptionsForColumn(column)}
                                  onChange={(options) =>
                                    updateColumn(column.id, { options })
                                  }
                                />
                              </div>
                            ) : null}

                            {(column.type === "select" ||
                              column.type === "multi_select") &&
                            openSelectOptions === column.id ? (
                              <div
                                data-select-options
                                ref={selectOptionsSide.ref}
                                className={cn(
                                  "absolute top-0 z-40 max-h-[70vh] w-80 overflow-y-auto rounded-md border bg-popover p-3 text-left shadow-lg",
                                  selectOptionsSide.className,
                                )}
                              >
                                <SelectOptionsPopover
                                  options={editableOptionsForColumn(column)}
                                  onChange={(options) =>
                                    updateColumn(column.id, { options })
                                  }
                                />
                              </div>
                            ) : null}

                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              updateColumn(column.id, { hidden: true });
                              setOpenColumnEditor(null);
                              setOpenHeaderTypeMenu(null);
                            }}
                            className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <EyeOff className="h-3.5 w-3.5" />
                            Ocultar propriedade
                          </button>

                          <button
                            type="button"
                            onClick={() => removeColumn(column.id)}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir propriedade
                          </button>
                        </div>
                      ) : null}

                      {/* Alça para redimensionar a largura da coluna */}
                      <div
                        role="separator"
                        aria-label={`Redimensionar coluna ${column.name}`}
                        aria-orientation="vertical"
                        onPointerDown={(e) => {
                          // Não deixa o dnd-kit iniciar um arraste junto com o
                          // redimensionamento da coluna.
                          e.stopPropagation();
                          startColumnResize(e, column);
                        }}
                        onDoubleClick={() =>
                          setColumns((prev) =>
                            prev.map((c) =>
                              c.id === column.id
                                ? { ...c, width: DEFAULT_COLUMN_WIDTH }
                                : c,
                            ),
                          )
                        }
                        title="Arraste para redimensionar (duplo clique para redefinir)"
                        className={cn(
                          "absolute right-0 top-0 z-20 flex h-full w-1.5 cursor-col-resize touch-none select-none items-center justify-center",
                          resizing?.columnId === column.id
                            ? "bg-primary/40"
                            : "hover:bg-primary/30",
                        )}
                      />
                    </ColumnHeaderCell>
                  );
                })}

                {/* Botão para adicionar nova propriedade/coluna. */}
                <th className="sticky right-0 z-20 border-b bg-card px-2 py-2">
                  <button
                    type="button"
                    onClick={addColumn}
                    aria-label="Nova propriedade"
                    title="Nova propriedade"
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </th>

                {/* Célula fantasma: alinha com a coluna espacer para o `border-b`
                    do cabeçalho cobrir toda a largura da tabela. */}
                <th className="border-b" aria-hidden />
              </tr>
            </thead>
            <tbody>

              {/* Spacer superior: ocupa o espaço das linhas fora da área visível. */}
              {rowsPaddingTop > 0 ? (
                <TableSpacerRow
                  height={rowsPaddingTop}
                  colSpan={tableColumnCount}
                />
              ) : null}

              {virtualRows.map((virtualRow) => {
                const row = tableRows[virtualRow.index];
                if (!row) {
                  // Item extra no fim: indicador de carregamento da próxima página.
                  return (
                    <tr key={`__loading_${virtualRow.index}__`}>
                      <td
                        colSpan={tableColumnCount}
                        className="px-3 py-2 text-center text-xs text-muted-foreground"
                      >
                        {tableRowsError
                          ? "Falha ao carregar mais linhas."
                          : "Carregando…"}
                      </td>
                    </tr>
                  );
                }
                return (
                <DropRow
                  key={row.id}
                  rowId={row.id}
                  dropBefore={draggingRowId !== null && rowDropBeforeId === row.id}
                  className={cn(
                    "group border-b transition-colors hover:bg-accent/40",
                    selectedRowIds.has(row.id) && "bg-primary/5",
                  )}
                >
                  {/* Coluna gutter: controles da linha agrupados (adicionar abaixo,
                      arrastar, selecionar). Aparecem ao passar o mouse na linha. */}
                  <td data-row-gutter className="px-1 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          void addRow(undefined, row.id, true);
                        }}
                        aria-label="Adicionar linha abaixo"
                        title="Adicionar linha abaixo"
                        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <RowDragHandle rowId={row.id} />
                      <input
                        type="checkbox"
                        checked={selectedRowIds.has(row.id)}
                        onChange={() => toggleRowSelection(row.id)}
                        aria-label="Selecionar linha"
                        className={cn(
                          "h-4 w-4 flex-none cursor-pointer rounded border-input accent-primary transition-opacity opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                          selectedRowIds.has(row.id) && "opacity-100",
                        )}
                      />
                    </div>
                  </td>
                  {orderedVisibleColumns.map((column) => (
                    <Fragment key={column.id}>
                      {renderCell(row, column, column.id === firstVisibleId)}
                    </Fragment>
                  ))}

                  {/* Ações */}
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      aria-label="Excluir linha"
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>

                  {/* Célula fantasma: alinha com a coluna espacer para o `border-b`
                      da linha se estender até o fim da tela. */}
                  <td aria-hidden />
                </DropRow>
                );
              })}

              {/* Spacer inferior: completa a altura total da lista virtual. */}
              {rowsPaddingBottom > 0 ? (
                <TableSpacerRow
                  height={rowsPaddingBottom}
                  colSpan={tableColumnCount}
                />
              ) : null}

            </tbody>
          </table>
          </div>

          {/* Rodapé fixo na base da área rolável (acima da barra de rolagem
              horizontal): botão "Nova linha" + o agregado de cada coluna
              numérica com cálculo ("Calcular"), estilo Notion. Emite as mesmas
              larguras do `colgroup` (gutter + visíveis + ações + fantasma) para
              não desalinhar a grade.
              `z-40` de propósito: fica **acima** dos painéis da célula (z-30),
              então o popover de uma propriedade não cobre esta faixa. */}
          <div
            data-calc-footer
            className="sticky bottom-0 z-40 flex flex-none border-t bg-card"
            style={{ width: tableWidth }}
          >
            {/* Adicionar linha no fim da tabela: fica na faixa do rodapé,
                alinhado à coluna gutter (mesma faixa do "Calcular"). */}
            <div
              className="flex items-center py-1"
              style={{ width: ROW_GUTTER_WIDTH }}
            >
              <button
                type="button"
                onClick={() => {
                  void addRow(undefined, null, true);
                }}
                aria-label="Nova linha"
                title="Nova linha"
                className="flex h-6 max-w-full items-center gap-1 rounded px-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5 flex-none" />
                <span className="truncate">Nova linha</span>
              </button>
            </div>
            {orderedVisibleColumns.map((column) => (
              <div
                key={column.id}
                className={cn(
                  "px-3 py-2 text-xs font-medium text-foreground",
                  // Agregado de coluna numérica: alinhado à direita.
                  column.type === "number" && "text-right",
                )}
                style={{ width: effectiveColumnWidth(column) }}
              >
                <span className="block truncate whitespace-nowrap">
                  {column.calculate
                    ? formatCalcValue(getColumnAggregate(column.id), column)
                    : ""}
                </span>
              </div>
            ))}
            <div className="py-2" style={{ width: ACTIONS_COLUMN_WIDTH }} />
            <div className="py-2" style={{ width: tableSpacerWidth }} />
          </div>

          {/* Confirmação da exclusão em massa (botão de lixeira do cabeçalho
              da gutter). Renderizado em portal pelo `DialogContent`. */}
          <Dialog
            open={confirmDeleteSelectedOpen}
            onOpenChange={setConfirmDeleteSelectedOpen}
          >
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Excluir linhas</DialogTitle>
                <DialogDescription>
                  {selectedRowIds.size === 1
                    ? "Excluir 1 linha selecionada? Esta ação não pode ser desfeita."
                    : `Excluir ${selectedRowIds.size} linhas selecionadas? Esta ação não pode ser desfeita.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setConfirmDeleteSelectedOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfirmDeleteSelectedOpen(false);
                    removeSelectedRows();
                  }}
                >
                  Excluir
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Prévia que segue o cursor (dnd-kit): o cabeçalho da propriedade
              arrastada ou um cartão com o título da linha arrastada. */}
          <DragOverlay dropAnimation={null}>
            {draggingColumn ? (
              // Mesmo visual do cabeçalho em hover, ocupando **toda a largura**
              // da coluna (a célula inteira) e seguindo o cursor.
              <div
                className="flex items-center gap-1.5 border bg-accent px-3 py-2 text-xs font-medium text-foreground shadow-lg"
                style={{
                  width: draggingColumnBox?.width ?? columnWidth(draggingColumn),
                  height: draggingColumnBox?.height,
                }}
              >
                {DraggingColumnIcon ? (
                  <DraggingColumnIcon className="h-3.5 w-3.5 shrink-0" />
                ) : null}
                <span className="min-w-0 truncate">{draggingColumn.name}</span>
              </div>
            ) : draggingRow ? (
              <div className="flex items-center gap-2 rounded-md border bg-popover px-3 py-1.5 text-xs shadow-lg">
                <span className="max-w-[16rem] truncate">
                  {rowTitleOf(draggingRow, columns)}
                </span>
              </div>
            ) : null}
          </DragOverlay>
          </DndContext>
        </div>
        ) : activeView.type === "kanban" ? (
        <KanbanBoard
          columns={columns}
          rows={filtered}
          groupColumn={kanbanColumn}
          canGroup={kanbanColumns.length > 0}
          onOpenRow={(rowId) => setOpenRowPage(rowId)}
          onDeleteRow={(rowId) => removeRow(rowId)}
          onAddCard={(columnId, value) => {
            void addRow({ [columnId]: value });
          }}
          onMoveCard={moveCard}
          renderCardProperty={renderCardProperty}
          cardTitle={cardTitle}
          onUpdateColumn={updateColumn}
        />
        ) : (
        <ChartView
          columns={columns}
          rows={filtered}
          config={chartConfig}
          onConfigChange={updateChartConfig}
        />
        )}
        </div>
        {/* Reserva a altura da barra horizontal quando ela **não** está visível:
            sem isso o conteúdo (linhas + rodapé "Calcular") sobe ao aparecer a
            barra. Fica 0 em navegadores com barras "overlay" (que não ocupam
            espaço) — aí não há nada a reservar. Só vale na Tabela, que é quem
            rola na horizontal. */}
        {activeView.type === "table" &&
        !hasHorizontalOverflow &&
        hScrollbarHeight > 0 ? (
          <div
            aria-hidden="true"
            className="flex-none"
            style={{ height: hScrollbarHeight }}
          />
        ) : null}
        </div>
      </div>

      {openRow ? (
        <div
          className={cn(
            "inset-0 z-50 flex bg-black/40",
            // Como a página é aberta (preferência por database):
            // `full` fica **dentro da área do conteúdo** (a sidebar e o cabeçalho
            // do app continuam visíveis); `center` = painel flutuante no centro;
            // `right` = painel ancorado à direita. Os dois últimos cobrem a tela.
            pageLayout === "full" ? "absolute" : "fixed",
            pageLayout === "full" && "items-stretch justify-stretch p-0",
            pageLayout === "center" && "items-center justify-center p-4",
            pageLayout === "right" && "items-stretch justify-end p-0",
          )}
          onClick={() => setOpenRowPage(null)}
          role="presentation"
        >
          <div
            className={cn(
              "flex h-full w-full flex-col overflow-hidden border bg-card shadow-xl",
              pageLayout === "full" && "rounded-none border-0",
              pageLayout === "center" && "max-w-[60vw] rounded-lg",
              pageLayout === "right" &&
                "max-w-[44rem] rounded-none rounded-l-lg border-y-0 border-r-0",
            )}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <RowPageContent
              row={openRow}
              columns={columns}
              onClose={() => setOpenRowPage(null)}
              onChangeContent={updatePageContent}
              onReorderColumns={(orderedIds) => {
                setColumns((prev) => {
                  const byId = new Map(prev.map((c) => [c.id, c]));
                  const next = orderedIds
                    .map((id) => byId.get(id))
                    .filter((c): c is Column => Boolean(c));
                  for (const c of prev) {
                    if (!orderedIds.includes(c.id)) next.push(c);
                  }
                  return next;
                });
              }}
              onUpdateColumn={updateColumn}
              onRemoveColumn={removeColumn}
              onEditColumn={(columnId) => {
                // Fecha a página do item e abre o editor da propriedade no
                // cabeçalho da tabela (que fica atrás do modal).
                setOpenRowPage(null);
                setOpenColumnEditor(columnId);
              }}
              onUpdateCell={updateCell}
            />
          </div>
        </div>
      ) : null}

      {openItem ? (
        <DatabaseItemPopover
          databaseId={openItem.databaseId}
          rowId={openItem.rowId}
          anchorEl={openItem.anchorEl}
          onUpdated={() => invalidateRelatedRows([openItem.rowId])}
          onClose={() => setOpenItem(null)}
        />
      ) : null}

      <PageTemplateDialog
        open={isTemplateDialogOpen}
        anchorEl={templateAnchorRef.current}
        templates={templates}
        columns={columns}
        onCreate={addTemplate}
        onDelete={removeTemplate}
        onApply={(tpl) => {
          onApplyTemplate(databaseId, tpl);
          setIsTemplateDialogOpen(false);
        }}
        onClose={() => setIsTemplateDialogOpen(false)}
      />

      <TableSettingsPopover
        open={isSettingsOpen}
        anchorEl={settingsAnchorRef.current}
        title={title}
        icon={icon}
        columns={columns}
        onRename={setTitle}
        onUpdateIcon={(next) => onUpdateIcon(viewId, next)}
        onUpdateColumn={updateColumn}
        onAddColumn={addColumn}
        onRemoveColumn={removeColumn}
        onDeleteDatabase={() => {
          setIsSettingsOpen(false);
          onDeleteDatabase(viewId);
        }}
        activeViewType={activeView.type}
        onChangeViewType={changeViewType}
        pageLayout={pageLayout}
        onChangePageLayout={setPageLayout}
        chartConfig={chartConfig}
        onChangeChartConfig={updateChartConfig}
        databases={allDatabases}
        currentDatabaseId={viewId}
        currentDatabaseName={title}
        onSaveRelation={(columnId, config) => {
          const column = columns.find((c) => c.id === columnId);
          if (column) saveRelationConfig(column, config);
        }}
        onSaveRollup={(columnId, config) => {
          const column = columns.find((c) => c.id === columnId);
          if (column) saveRollupConfig(column, config);
        }}
        initialView={settingsInitialView}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}

/* PageTemplateDialog, SelectOptionsPopover e TableSettingsPopover foram
   extraídos para seus próprios arquivos (ver cabeçalho do módulo acima). */


/**
 * Tela do app "Database".
 * Mostra a lista de databases e, ao abrir um, a tabela correspondente.
 * Os dados são persistidos no Supabase (por usuário, via RLS) com atualizações
 * otimistas: o estado local é atualizado na hora e a escrita roda em background,
 * com refetch para reverter em caso de erro.
 */
export function DatabaseView({ userName }: { userName?: string }) {
  const [databases, setDatabases] = useState<DatabaseModel[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  /** Categorias de projetos do usuário (compartilhadas e ordenadas por `position`). */
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Flag: a navegação salva entre databases abertos (chips + database ativo) já
   * foi restaurada. Enquanto `false`, o auto-open do primeiro database fica
   * bloqueado para não sobrepor o estado salvo.
   */
  const [restoredOpenDatabases, setRestoredOpenDatabases] = useState(false);
  /**
   * Navegação entre databases abertos carregada do servidor (tabela
   * `workspace_open_databases`). É restaurada assim que a lista de databases
   * carrega, para não abrir outro database no lugar do salvo. `null` = sem
   * estado salvo (primeiro uso), quando o auto-open do primeiro database vale.
   */
  const [persistedOpenDatabases, setPersistedOpenDatabases] =
    useState<OpenDatabasesState | null>(null);
  /**
   * O usuário fechou a última aba: impede o auto-open de reabrir um database
   * logo em seguida (volta a valer ao abrir um database ou trocar de projeto).
   */
  const closedAllTabsRef = useRef(false);
  /**
   * Última navegação conhecida pelo servidor (restaurada ou salva). Evita
   * reescrever no banco um estado que já está lá.
   */
  const lastSavedOpenDatabasesRef = useRef<string | null>(null);

  // Projeto ativo no Workspace. `null` = tela de projetos; id = databases do projeto.
  const activeProjectId = useCalendarStore((s) => s.activeProjectId);
  const setActiveProjectId = useCalendarStore((s) => s.setActiveProjectId);
  // Pedido pendente para a tela de database vindo da sidebar do calendário
  // (ex.: "Adicionar database" com criação ou abertura de um existente).
  const pendingDatabaseRequest = useCalendarStore((s) => s.pendingDatabaseRequest);
  const consumeDatabaseRequest = useCalendarStore((s) => s.consumeDatabaseRequest);
  const requestOpenDatabase = useCalendarStore((s) => s.requestOpenDatabase);
  /**
   * Foco pendente a aplicar na Tabela após abrir um database pela paleta de
   * busca global (aba/propriedade/item/modelos). Limpo depois de aplicado.
   */
  const [focusRequest, setFocusRequest] = useState<DatabaseFocusRequest | null>(
    null,
  );
  // Mantém a lista fixada na sidebar do calendário sincronizada com delete/rename.
  // Um database só entra na sidebar se for adicionado pelo botão "Adicionar
  // database" (na própria sidebar) — criar pela tela de database NÃO o fixa.
  const sidebarDatabases = useCalendarStore((s) => s.sidebarDatabases);
  const addSidebarDatabase = useCalendarStore((s) => s.addSidebarDatabase);
  const updateSidebarDatabase = useCalendarStore((s) => s.updateSidebarDatabase);
  const removeSidebarDatabase = useCalendarStore((s) => s.removeSidebarDatabase);

  const selected = useMemo(
    () => databases.find((d) => d.id === selectedId) ?? null,
    [databases, selectedId],
  );

  /**
   * Database efetivo passado à Tabela. Numa **visão vinculada**, colunas, linhas
   * e templates vêm da **origem** (ao vivo); a identidade (nome/ícone/abas) é da
   * visão. Por isso o objeto usa o `id` da origem e recebe o nome/ícone da visão
   * — e a Tabela recebe `viewId` (identidade) e `linkedDatabaseId` (origem).
   */
  const tableDatabase = useMemo(() => {
    if (!selected) return null;
    if (!selected.linkedDatabaseId) return selected;
    const source = databases.find((d) => d.id === selected.linkedDatabaseId);
    if (!source) return selected;
    return {
      ...source,
      name: selected.name,
      icon: selected.icon,
      linkedDatabaseId: selected.linkedDatabaseId,
    };
  }, [selected, databases]);

  // Projeto ativo resolvido: só é válido se existir na lista carregada. Se o
  // id salvo em localStorage apontar para um projeto removido, volta à lista.
  const resolvedProjectId = useMemo(
    () => (projects.some((p) => p.id === activeProjectId) ? activeProjectId : null),
    [projects, activeProjectId],
  );

  /*
   * Não existe mais uma tela de "selecionar projeto": quando nenhum projeto
   * está ativo (primeiro uso ou id removido), seleciona automaticamente o
   * primeiro projeto da lista para ir direto à lista de databases dele.
   */
  useEffect(() => {
    if (resolvedProjectId) return;
    const first = projects[0];
    if (first) setActiveProjectId(first.id);
  }, [resolvedProjectId, projects, setActiveProjectId]);

  /** Databases do projeto ativo, na ordem de criação. */
  const projectDatabases = useMemo(
    () => databases.filter((d) => d.projectId === resolvedProjectId),
    [databases, resolvedProjectId],
  );

  /*
   * Com um projeto ativo e nenhum database aberto, abre automaticamente o
   * primeiro database do projeto. Assim o Workspace não fica parado no cartão
   * de "criar database" quando o projeto já tem databases — o cartão só aparece
   * para projeto **sem nenhum** database. Só roda depois de restaurar a
   * navegação salva (para não abrir outro database no lugar do salvo) e não
   * reabre quando o usuário acabou de fechar a última aba.
   */
  useEffect(() => {
    if (
      !restoredOpenDatabases ||
      selectedId ||
      !resolvedProjectId ||
      closedAllTabsRef.current
    ) {
      return;
    }
    const first = databases.find((d) => d.projectId === resolvedProjectId);
    if (first) setSelectedId(first.id);
  }, [restoredOpenDatabases, selectedId, resolvedProjectId, databases]);

  // Resumo dos projetos para a tela de projetos, com a contagem de databases.
  const projectSummaries = useMemo(
    () =>
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        color: p.color,
        databaseCount: databases.filter((d) => d.projectId === p.id).length,
      })),
    [projects, databases],
  );

  /**
   * Databases abertos como **abas** na faixa, em ordem fixa (nunca se
   * reordenam). O database aberto entra automaticamente ao final quando não
   * estiver na lista.
   */
  const [openDatabaseIds, setOpenDatabaseIds] = useState<string[]>([]);

  // Mantém o database aberto na lista de abas (acrescentado ao final, para as
  // abas existentes nunca mudarem de posição).
  useEffect(() => {
    if (!selectedId) return;
    // Abrir um database volta a permitir o auto-open (caso o usuário tenha
    // fechado todas as abas antes).
    closedAllTabsRef.current = false;
    setOpenDatabaseIds((prev) =>
      prev.includes(selectedId) ? prev : [...prev, selectedId],
    );
  }, [selectedId]);

  // Restaura a navegação salva (chips + database aberto) assim que a lista
  // carrega. Um pedido pendente da sidebar do calendário tem prioridade.
  useEffect(() => {
    if (loading || restoredOpenDatabases) return;
    setRestoredOpenDatabases(true);
    if (pendingDatabaseRequest) return;
    const saved = persistedOpenDatabases;
    // Sem estado salvo (primeiro uso): deixa o auto-open abrir o primeiro
    // database do projeto, como antes.
    if (!saved) return;
    const known = new Set(databases.map((d) => d.id));
    const ids = saved.ids.filter((id) => known.has(id));
    const savedSelectedId =
      saved.selectedId && known.has(saved.selectedId) ? saved.selectedId : null;
    if (ids.length > 0) setOpenDatabaseIds(ids);
    if (savedSelectedId) setSelectedId(savedSelectedId);
    // Existe estado salvo (mesmo vazio: o usuário fechou todas as abas): bloqueia
    // o auto-open para não reabrir o primeiro database ao recarregar. O efeito
    // de `selectedId` libera de novo assim que um database é aberto.
    closedAllTabsRef.current = true;
    // O que foi restaurado já está no servidor: não reescreve ao abrir.
    lastSavedOpenDatabasesRef.current = JSON.stringify({
      ids,
      selectedId: savedSelectedId,
    });
  }, [
    loading,
    restoredOpenDatabases,
    pendingDatabaseRequest,
    databases,
    persistedOpenDatabases,
  ]);

  // Persiste a navegação no servidor (com debounce). Só roda depois de
  // restaurada, para não sobrescrever o que estava salvo com o estado inicial.
  useEffect(() => {
    if (!restoredOpenDatabases) return;
    const payload = { ids: openDatabaseIds, selectedId };
    const key = JSON.stringify(payload);
    if (key === lastSavedOpenDatabasesRef.current) return;
    const timer = setTimeout(() => {
      lastSavedOpenDatabasesRef.current = key;
      void saveOpenDatabases(payload).catch((err) => {
        setError((err as Error).message || "Falha ao salvar a navegação");
      });
    }, OPEN_DATABASES_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [restoredOpenDatabases, openDatabaseIds, selectedId]);

  /** Acrescenta um database como aba (escolhido no seletor do "+"). */
  const handleSelectDatabaseChip = useCallback((id: string) => {
    setOpenDatabaseIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  /**
   * Fecha a aba de um database (não o exclui). Se era a aba ativa, abre a
   * vizinha (à direita; sem ela, a da esquerda). Fechar a última aba deixa o
   * Workspace sem database aberto, sem reabrir um automaticamente.
   */
  const handleCloseDatabase = useCallback(
    (id: string) => {
      const index = openDatabaseIds.indexOf(id);
      const next = openDatabaseIds.filter((openId) => openId !== id);
      setOpenDatabaseIds(next);
      if (next.length === 0) closedAllTabsRef.current = true;
      setSelectedId((current) =>
        current === id ? next[index] ?? next[index - 1] ?? null : current,
      );
    },
    [openDatabaseIds],
  );

  // Espelho sempre atualizado da lista de databases. Usado para ler os valores
  // atuais de uma linha de forma síncrona ao persistir edições de célula
  // (o updater do setState roda depois e não pode alimentar variáveis externas).
  const databasesRef = useRef<DatabaseModel[]>(databases);
  useEffect(() => {
    databasesRef.current = databases;
  }, [databases]);

  /** Aplica um patch local a um database. */
  const patchDatabase = useCallback(
    (
      id: string,
      patch: Partial<DatabaseModel> | ((db: DatabaseModel) => Partial<DatabaseModel>),
    ) => {
      setDatabases((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, ...(typeof patch === "function" ? patch(d) : patch) }
            : d,
        ),
      );
    },
    [],
  );

  /** Recarrega todos os databases, projetos e categorias (mount e reversão de erros). */
  const reload = useCallback(async () => {
    try {
      const [data, projectList, categoryList] = await Promise.all([
        fetchDatabases(),
        fetchProjects(),
        fetchProjectCategories(),
      ]);
      setDatabases(data);
      setProjects(projectList);
      setCategories(categoryList);
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Falha ao carregar databases");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [data, projectList, categoryList, openState] = await Promise.all([
          fetchDatabases(),
          fetchProjects(),
          fetchProjectCategories(),
          // Conveniência de UI: uma falha aqui não deve derrubar o carregamento.
          // Sem estado salvo (`null`), o auto-open do primeiro database vale.
          fetchOpenDatabases().catch(() => null),
        ]);
        if (cancelled) return;
        setDatabases(data);
        setProjects(projectList);
        setCategories(categoryList);
        setPersistedOpenDatabases(openState);
        setError(null);
        // Libera a tela assim que os dados básicos chegam. A geração automática
        // dos itens recorrentes que "venceram" (idempotente) roda em seguida,
        // **sem bloquear** o carregamento: ela faz uma requisição por ocorrência
        // devida (uma por item), o que pode demorar bastante e antes prendia a
        // tela em "Carregando databases...".
        setLoading(false);
        const generated = await runAutoTemplates(data);
        if (cancelled || generated.length === 0) return;
        // Aplica os databases alterados sobre o estado **atual** (e não sobre
        // `data`), para não descartar mudanças feitas enquanto gerava.
        setDatabases((prev) =>
          prev.map((db) => {
            const change = generated.find((g) => g.databaseId === db.id);
            return change ? change.database : db;
          }),
        );
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || "Falha ao carregar databases");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Executa uma escrita em background. Em erro, mostra a mensagem e aplica o
   * `rollback` local — **sem** refetch, que zeraria o cursor e o scroll da
   * Tabela paginada.
   */
  const persist = useCallback(
    (action: () => Promise<unknown>, rollback?: () => void) => {
      void action().catch((err) => {
        setError((err as Error).message || "Falha ao salvar");
        rollback?.();
      });
    },
    [],
  );


  /* ----------------------------- Databases ----------------------------- */

  const handleCreate = useCallback(
    async (
      input?: {
        name?: string;
        icon?: string | null;
        /**
         * Cria o database como **visão vinculada** deste (mesmas propriedades e
         * itens, ao vivo).
         */
        linkedDatabaseId?: string | null;
      },
      pinToSidebar = false,
      projectId: string | null = activeProjectId,
    ) => {
      try {
        // Sem projeto explícito (ex.: criação pela sidebar do calendário),
        // garante o projeto padrão "Geral" para o database não ficar órfão.
        let targetProject = projectId;
        if (!targetProject) {
          targetProject = await ensureDefaultProject();
          // Reflete o projeto recém-garantido na lista local, se ainda não estiver.
          setProjects((prev) => {
            if (prev.some((p) => p.id === targetProject)) return prev;
            return [
              ...prev,
              {
                id: targetProject as string,
                name: DEFAULT_PROJECT_NAME,
                category: null,
                color: null,
                position: prev.length,
              },
            ];
          });
          // Mantém o Workspace apontando para o projeto padrão para que o database
          // criado fique visível na página de databases.
          setActiveProjectId(targetProject);
        }
        const name = input?.name?.trim() || "Novo database";
        // "Espelhar database…" no popover: cria uma **visão vinculada** (exibe as
        // mesmas propriedades e itens da origem, ao vivo). Sem vínculo, cria um
        // database próprio em branco.
        const linkedDatabaseId = input?.linkedDatabaseId ?? null;
        const created = linkedDatabaseId
          ? await createLinkedDatabase(
              linkedDatabaseId,
              name,
              input?.icon ?? null,
              targetProject,
            )
          : await createDatabase(name, input?.icon ?? null, targetProject);

        setDatabases((prev) => [...prev, created]);
        setSelectedId(created.id);
        // Só fixa na sidebar do calendário quando a criação partiu do botão
        // "Adicionar database" da própria sidebar. Criar pela tela de database
        // não deve injetar o item na sidebar do calendário.
        if (pinToSidebar)
          addSidebarDatabase({ id: created.id, name: created.name, icon: created.icon });
      } catch (err) {
        setError((err as Error).message || "Falha ao criar database");
      }
    },
    [activeProjectId, addSidebarDatabase, setActiveProjectId],
  );

  /**
   * Cria um database **no projeto informado** (popover de databases do projeto
   * na sidebar): ativa o projeto e delega ao fluxo de criação existente, que já
   * abre o database criado. Não fixa na sidebar do calendário.
   */
  const handleCreateDatabase = useCallback(
    (projectId: string, input: NewDatabaseInput) => {
      setActiveProjectId(projectId);
      void handleCreate(input, false, projectId);
    },
    [handleCreate, setActiveProjectId],
  );

  // Atende o pedido disparado pela sidebar do calendário assim que a tela de
  // database estiver pronta (lista inicial carregada): cria um novo database ou
  // abre um existente, e limpa o pedido (evita repetir a cada render).
  useEffect(() => {
    if (!pendingDatabaseRequest || loading) return;
    consumeDatabaseRequest();
    if (pendingDatabaseRequest.type === "create") {
      // Veio do botão "Adicionar database" da sidebar: fixa o novo database lá.
      void handleCreate(undefined, true);
    } else {
      // Abre um database existente: garante que o Workspace aponte para o
      // projeto ao qual ele pertence, para que a tela de databases o exiba.
      const target = databases.find((d) => d.id === pendingDatabaseRequest.id);
      if (target) setActiveProjectId(target.projectId);
      setSelectedId(pendingDatabaseRequest.id);
      // A paleta de busca pode pedir foco (aba/propriedade/item/modelos).
      const { viewId, editColumnId, rowId, openTemplates } =
        pendingDatabaseRequest;
      setFocusRequest(
        viewId || editColumnId || rowId || openTemplates
          ? { viewId, editColumnId, rowId, openTemplates }
          : null,
      );
    }
  }, [
    pendingDatabaseRequest,
    loading,
    consumeDatabaseRequest,
    handleCreate,
    databases,
    setActiveProjectId,
  ]);

  const handleDelete = useCallback(
    (id: string) => {
      setDatabases((prev) =>
        prev
          // Visões vinculadas à origem são removidas junto (cascade no banco).
          .filter((d) => d.id !== id && d.linkedDatabaseId !== id)
          .map((d) => {
            // Remove as colunas espelho que apontavam para o database excluído.
            if (!d.columns.some((c) => c.relationDatabaseId === id)) return d;
            return {
              ...d,
              columns: d.columns.filter((c) => c.relationDatabaseId !== id),
            };
          }),
      );
      setSelectedId((current) => (current === id ? null : current));
      removeSidebarDatabase(id);
      // Remove da sidebar e da navegação (chips) as visões vinculadas que saíram.
      const removedIds = new Set<string>([id]);
      for (const d of databasesRef.current) {
        if (d.linkedDatabaseId === id) {
          removedIds.add(d.id);
          removeSidebarDatabase(d.id);
        }
      }
      setOpenDatabaseIds((prev) =>
        prev.filter((openId) => !removedIds.has(openId)),
      );
      invalidateRelationLinks();
      invalidateRollupValues();
      persist(async () => {
        // Limpa espelhos/vínculos em outras databases antes de excluir.
        await cleanupRelationsForDatabase(id);
        await deleteDatabase(id);
      });
    },
    [persist, removeSidebarDatabase],
  );

  /* ----------------------------- Projetos ------------------------------ */

  /** Abre um projeto: passa a exibir os databases daquele projeto. */
  const handleOpenProject = useCallback(
    (id: string) => {
      // Limpa a seleção para que o primeiro database do projeto seja aberto
      // automaticamente (quando houver algum). Trocar de projeto volta a
      // permitir o auto-open, mesmo depois de o usuário fechar a última aba.
      closedAllTabsRef.current = false;
      setSelectedId(null);
      setActiveProjectId(id);
    },
    [setActiveProjectId],
  );

  /**
   * Abre um resultado da paleta de busca global. Projetos navegam direto;
   * databases/propriedades/abas/modelos/itens abrem o database com o foco
   * correspondente (categorias são resolvidas na própria sidebar).
   */
  const handleSearchResult = useCallback(
    (result: WorkspaceSearchResult) => {
      switch (result.kind) {
        case "project":
          // Trocar de projeto volta a permitir o auto-open do primeiro database.
          closedAllTabsRef.current = false;
          setSelectedId(null);
          setActiveProjectId(result.projectId);
          return;
        case "category":
          // Tratada na sidebar (expande o grupo); não deveria chegar aqui.
          return;
        case "database":
          requestOpenDatabase(result.databaseId, result.projectId);
          return;
        case "column":
          requestOpenDatabase(result.databaseId, result.projectId, {
            editColumnId: result.columnId,
          });
          return;
        case "view":
          requestOpenDatabase(result.databaseId, result.projectId, {
            viewId: result.viewId,
          });
          return;
        case "template":
          requestOpenDatabase(result.databaseId, result.projectId, {
            openTemplates: true,
          });
          return;
        case "item":
          requestOpenDatabase(result.databaseId, result.projectId, {
            rowId: result.rowId,
          });
          return;
      }
    },
    [requestOpenDatabase, setActiveProjectId],
  );

  /**
   * Cria um projeto com os dados informados (nome, categoria e cor) e entra nele
   * imediatamente, de modo que a página de databases daquele projeto (vazia,
   * inicialmente) é exibida.
   */
  const handleCreateProject = useCallback(
    async (input: NewProjectInput) => {
      try {
        // Garante que a categoria usada exista na tabela de categorias do usuário
        // (com a ordem persistida). Não bloqueia a criação do projeto em caso de erro.
        if (input.category) {
          void createProjectCategory(input.category, input.color)
            .then(setCategories)
            .catch(() => {});
        }
        const project = await createProject(
          input.name.trim() || "Novo projeto",
          input.category,
          input.color,
        );
        setProjects((prev) => [...prev, project]);
        setSelectedId(null);
        setActiveProjectId(project.id);
      } catch (err) {
        setError((err as Error).message || "Falha ao criar projeto");
      }
    },
    [setActiveProjectId],
  );

  /**
   * Cria (idempotente) uma categoria de projetos e atualiza a lista local. Usado
   * quando o usuário confirma uma categoria no popover, para que ela persista com
   * a ordem escolhida.
   */
  const handleCreateCategory = useCallback(async (name: string) => {
    try {
      const list = await createProjectCategory(name);
      setCategories(list);
    } catch (err) {
      setError((err as Error).message || "Falha ao criar categoria");
    }
  }, []);

  /**
   * Persiste a nova ordem das categorias após um arraste (drag & drop). Faz uma
   * atualização otimista local e grava `position` em background.
   */
  const handleReorderCategories = useCallback((orderedNames: string[]) => {
    const byName = new Map(categories.map((c) => [c.name, c]));
    const reordered = orderedNames
      .map((name) => byName.get(name))
      .filter((c): c is ProjectCategory => Boolean(c));
    if (reordered.length !== orderedNames.length) return;
    setCategories(
      reordered.map((c, index) => ({ ...c, position: index })),
    );
    void reorderProjectCategories(orderedNames).catch((err) => {
      setError((err as Error).message || "Falha ao salvar a ordem");
      void reload();
    });
  }, [categories, reload]);

  /**
   * Persiste a nova ordem dos projetos após um arraste (drag & drop) na sidebar.
   * Faz uma atualização otimista local (reordena `projects`) e grava `position`
   * em background.
   */
  const handleReorderProjects = useCallback(
    (orderedIds: string[]) => {
      // Atualiza de forma FUNCIONAL e reordena apenas os ids presentes na lista
      // atual. Ids ausentes (ex.: projeto recem-criado cujo estado ainda nao
      // chegou, ou filtrado) NAO abortam mais o reorder — antes um unico id
      // faltante fazia `return` silencioso e a ordem so aparecia no reload.
      setProjects((prev) => {
        const byId = new Map(prev.map((p) => [p.id, p]));
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((p): p is Project => Boolean(p));
        const seen = new Set(reordered.map((p) => p.id));
        // Projetos que existem localmente mas nao estao em `orderedIds`.
        const rest = prev.filter((p) => !seen.has(p.id));
        return [
          ...reordered.map((p, index) => ({ ...p, position: index })),
          ...rest,
        ];
      });
      // Persiste a ordem completa (o servidor conhece todos os ids). So grava
      // `position` para os ids que existem; o resto volta na proxima carga.
      void reorderProjects(orderedIds).catch((err) => {
        setError((err as Error).message || "Falha ao salvar a ordem");
        void reload();
      });
    },
    [reload],
  );

  /**
   * Move um projeto para dentro/fora de uma categoria (arraste na sidebar).
   * Atualiza a lista local de forma otimista e persiste a nova `category`.
   */
  const handleUpdateProject = useCallback(
    (id: string, patch: { category: string | null }) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, category: patch.category } : p)),
      );
      void updateProject(id, patch).catch((err) => {
        setError((err as Error).message || "Falha ao mover o projeto");
        void reload();
      });
    },
    [reload],
  );

  /**
   * Renomeia e/ou recolore uma categoria de projetos. A gravação acontece no
   * servidor e devolve a lista atualizada (com o novo nome propagado aos
   * projetos). Em caso de erro (ex.: nome duplicado), recarrega o estado.
   */
  const handleUpdateCategory = useCallback(
    (id: string, patch: { name?: string; color?: string | null }) => {
      void updateProjectCategory(id, patch)
        .then((list) => {
          setCategories(list);
          // Renomear a categoria muda o nome exibido nos projetos.
          if (patch.name !== undefined) void reload();
        })
        .catch((err) => {
          setError((err as Error).message || "Falha ao atualizar categoria");
          void reload();
        });
    },
    [reload],
  );

  /** Exclui uma categoria de projetos (os projetos que a usavam ficam sem categoria). */
  const handleDeleteCategory = useCallback(
    (id: string) => {
      // Otimista: já move os projetos dessa categoria para "Sem categoria".
      const removedName = categories.find((c) => c.id === id)?.name ?? null;
      if (removedName) {
        setProjects((prev) =>
          prev.map((p) =>
            p.category === removedName ? { ...p, category: null } : p,
          ),
        );
      }
      void deleteProjectCategory(id)
        .then((list) => {
          setCategories(list);
          void reload();
        })
        .catch((err) => {
          setError((err as Error).message || "Falha ao excluir categoria");
          void reload();
        });
    },
    [categories, reload],
  );


  const handleDeleteProject = useCallback(
    (id: string) => {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      // Os databases do projeto são removidos em cascata no banco.
      setDatabases((prev) => prev.filter((d) => d.projectId !== id));
      if (activeProjectId === id) setActiveProjectId(null);
      persist(() => deleteProject(id));
    },
    [activeProjectId, persist, setActiveProjectId],
  );

  /* ------------------------------- Ações ------------------------------- */

  const handleRename = useCallback(
    (id: string, name: string) => {
      patchDatabase(id, { name });
      // Renomear reflete na sidebar apenas se o database já estiver fixado lá.
      // Nunca adiciona um database novo à sidebar por causa de um rename.
      if (sidebarDatabases.some((d) => d.id === id)) {
        const current = sidebarDatabases.find((d) => d.id === id);
        updateSidebarDatabase({ id, name, icon: current?.icon });
      }
      persist(() => updateDatabaseName(id, name));
    },
    [patchDatabase, persist, sidebarDatabases, updateSidebarDatabase],
  );

  /** Define (ou limpa) o ícone escolhido do database, refletindo na sidebar. */
  const handleUpdateIcon = useCallback(
    (id: string, icon: string | null) => {
      patchDatabase(id, { icon });
      // Atualiza a sidebar apenas se o database já estiver fixado lá.
      if (sidebarDatabases.some((d) => d.id === id)) {
        const current = sidebarDatabases.find((d) => d.id === id);
        if (current) updateSidebarDatabase({ ...current, icon });
      }
      persist(() => updateDatabaseIcon(id, icon));
    },
    [patchDatabase, persist, sidebarDatabases, updateSidebarDatabase],
  );

  const handleUpdateColumns = useCallback(
    (id: string, columns: Column[]) => {
      patchDatabase(id, { columns });
      persist(() => updateDatabaseColumns(id, columns));
    },
    [patchDatabase, persist],
  );

  const handleAddRow = useCallback(
    async (
      id: string,
      initialValues?: Record<string, CellValue>,
      afterRowId?: string | null,
      position?: number | null,
    ): Promise<DbRow | null> => {
      const db = databases.find((d) => d.id === id);
      if (!db) return null;
      const values = emptyValuesFor(db.columns);
      if (db.templates[0]) values[PAGE_CONTENT_KEY] = ensureHtml(db.templates[0].content);
      if (initialValues) {
        for (const [key, val] of Object.entries(initialValues)) {
          values[key] = val;
        }
      }
      // A `position` vem da Tabela (calculada entre os vizinhos carregados, com
      // os gaps de 1000) — o wrapper não tem mais a lista completa de linhas.
      try {
        const row =
          typeof position === "number"
            ? await createRow(id, values, position)
            : await createRowAtEnd(id, values);
        patchDatabase(id, (d) => {
          const nextRows = [...d.rows];
          const at = afterRowId
            ? nextRows.findIndex((r) => r.id === afterRowId)
            : -1;
          nextRows.splice(at === -1 ? nextRows.length : at + 1, 0, row);
          return { rows: nextRows };
        });
        return row;
      } catch (err) {
        setError((err as Error).message || "Falha ao adicionar linha");
        return null;
      }
    },
    [databases, patchDatabase],
  );

  const handleApplyTemplate = useCallback(
    (id: string, template: PageTemplate) => {
      const db = databases.find((d) => d.id === id);
      if (!db) return;
      const values = emptyValuesFor(db.columns);
      // Usa o nome do modelo como título (primeira coluna) quando for texto.
      const first = db.columns[0];
      if (first && (first.type === "text" || first.type === "person")) {
        values[first.id] = template.name;
      }
      // Aplica o conteúdo do modelo (com recorrência) à página do novo item.
      values[PAGE_CONTENT_KEY] = templateContentHtml(template);
      persist(async () => {
        const row = await createRowAtEnd(id, values);
        patchDatabase(id, (d) => ({ rows: [...d.rows, row] }));
      });
    },
    [databases, patchDatabase, persist],
  );

  const handleUpdateCell = useCallback(
    async (
      databaseId: string,
      rowId: string,
      columnId: string,
      value: CellValue,
    ) => {
      // Não depende de `db.rows` (a Tabela é paginada): a escrita faz **merge**
      // no servidor e a Tabela aplica/reverte o patch local na lista carregada.
      patchDatabase(databaseId, (d) => ({
        rows: d.rows.map((r) =>
          r.id === rowId ? { ...r, values: { ...r.values, [columnId]: value } } : r,
        ),
      }));
      try {
        await updateRowCell(rowId, columnId, value);
      } catch (err) {
        setError((err as Error).message || "Falha ao salvar");
        throw err;
      }
    },
    [patchDatabase],
  );

  const handleDeleteRow = useCallback(
    async (databaseId: string, rowId: string) => {
      patchDatabase(databaseId, (d) => ({
        rows: d.rows.filter((r) => r.id !== rowId),
      }));
      // Os vínculos da linha (e o espelho) são removidos em cascade no banco;
      // invalida os caches para refletir a exclusão nas células de relação.
      invalidateRelationLinks([rowId]);
      invalidateRollupValues([rowId]);
      // A Tabela reverte a lista carregada em caso de erro (ela tem os dados).
      try {
        await deleteRow(rowId);
      } catch (err) {
        setError((err as Error).message || "Falha ao excluir");
        throw err;
      }
    },
    [patchDatabase],
  );

  /**
   * Reordena as linhas de um database conforme a lista de ids recebida (usada
   * pelo arraste de cards no Kanban). Atualiza a ordem local imediatamente e
   * grava a nova `position` de cada linha no Supabase.
   */
  const handleReorderRows = useCallback(
    (databaseId: string, orderedIds: string[]) => {
      const db = databasesRef.current.find((d) => d.id === databaseId);
      if (!db) return;
      const byId = new Map(db.rows.map((r) => [r.id, r]));
      const nextRows = orderedIds
        .map((id) => byId.get(id))
        .filter((r): r is DbRow => Boolean(r));
      // Garante que nenhuma linha seja perdida caso orderedIds esteja incompleta.
      for (const r of db.rows) {
        if (!orderedIds.includes(r.id)) nextRows.push(r);
      }
      patchDatabase(databaseId, { rows: nextRows });
      persist(() =>
        updateRowPositions(nextRows.map((r, index) => ({ id: r.id, position: index }))),
      );
    },
    [patchDatabase, persist],
  );

  /**
   * Aplica novas `position` a um subconjunto de linhas (keyset/gaps). É o
   * caminho de **1 write** da reordenação por arraste na Tabela: o chamador
   * calcula a posição entre os vizinhos carregados. Reordena a cópia local e
   * persiste; em erro, reverte para a ordem anterior (sem refetch).
   */
  const handleRowsReordered = useCallback(
    (databaseId: string, updates: { id: string; position: number }[]) => {
      if (updates.length === 0) return;
      const byId = new Map(updates.map((u) => [u.id, u.position]));
      const applyPositions = (rows: DbRow[]): DbRow[] => {
        const next = rows.map((r) =>
          byId.has(r.id) ? { ...r, position: byId.get(r.id) } : r,
        );
        next.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        return next;
      };
      const previous =
        databasesRef.current.find((d) => d.id === databaseId)?.rows ?? [];
      databasesRef.current = databasesRef.current.map((d) =>
        d.id !== databaseId ? d : { ...d, rows: applyPositions(d.rows) },
      );
      patchDatabase(databaseId, (d) => ({ rows: applyPositions(d.rows) }));
      persist(
        () => updateRowPositions(updates),
        () => {
          databasesRef.current = databasesRef.current.map((d) =>
            d.id !== databaseId ? d : { ...d, rows: previous },
          );
          patchDatabase(databaseId, () => ({ rows: previous }));
        },
      );
    },
    [patchDatabase, persist],
  );

  const handleAddTemplate = useCallback(
    (
      databaseId: string,
      name: string,
      content: string,
      recurrence: Recurrence | null,
    ) => {
      const db = databases.find((d) => d.id === databaseId);
      if (!db) return;
      persist(async () => {
        const tpl = await createTemplate(
          databaseId,
          name,
          content,
          recurrence,
          db.templates.length,
        );
        patchDatabase(databaseId, (d) => ({ templates: [...d.templates, tpl] }));
      });
    },
    [databases, patchDatabase, persist],
  );

  const handleDeleteTemplate = useCallback(
    (databaseId: string, templateId: string) => {
      patchDatabase(databaseId, (d) => ({
        templates: d.templates.filter((t) => t.id !== templateId),
      }));
      persist(() => deleteTemplate(templateId));
    },
    [patchDatabase, persist],
  );

  /**
   * Abre outro database pelo id (link "database relacionado"). Ativa o projeto
   * do database alvo para manter a sidebar em sincronia quando ele pertence a
   * outro projeto.
   */
  const handleOpenDatabase = useCallback(
    (id: string) => {
      const target = databases.find((d) => d.id === id);
      if (target?.projectId) setActiveProjectId(target.projectId);
      setSelectedId(id);
    },
    [databases, setActiveProjectId],
  );

  /**
   * Aviso de erro visível (o estado `error` só era exibido quando não havia
   * nenhum database, o que escondia falhas ao criar/relacionar databases).
   */
  const errorNotice = error ? (
    <div
      role="alert"
      className="pointer-events-auto fixed right-4 top-4 z-[60] flex max-w-sm items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-md"
    >
      <span className="min-w-0 flex-1">{error}</span>
      <button
        type="button"
        onClick={() => setError(null)}
        aria-label="Fechar aviso"
        className="flex h-5 w-5 flex-none items-center justify-center rounded hover:bg-destructive/20"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 text-sm text-muted-foreground">
        Carregando databases...
      </div>
    );
  }

  if (error && databases.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-3 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  /*
   * Sem projeto ativo: quando há projetos, o efeito acima seleciona o primeiro e
   * a tela passa a listar os databases dele. Quando NÃO há nenhum projeto (conta
   * nova), a área principal antes ficava em branco — agora mostra o cartão de
   * boas-vindas com as ações de criação.
   */
  if (!resolvedProjectId) {
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ProjectsSidebar
          projects={projectSummaries}
          categories={categories}
          databases={databases}
          activeProjectId={resolvedProjectId}
          onOpenProject={handleOpenProject}
          onOpenSearchResult={handleSearchResult}
          onCreateDatabase={handleCreateDatabase}
          onDeleteDatabase={handleDelete}
          onCreateProject={handleCreateProject}
          onCreateCategory={handleCreateCategory}
          onReorderCategories={handleReorderCategories}
          onReorderProjects={handleReorderProjects}
          onUpdateProject={handleUpdateProject}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
          onDeleteProject={handleDeleteProject}
        />
        <WorkspaceEmptyState
          variant="no-projects"
          userName={userName}
          categories={categories}
          databases={databases}
          onCreateProject={handleCreateProject}
          onCreateCategory={handleCreateCategory}
          onCreateDatabase={(input) => void handleCreate(input)}
        />
      </div>
    );
  }

  // Com projeto ativo e nenhum database selecionado: a sidebar continua à
  // esquerda (a lista de databases vive no popover do projeto). Quando o projeto
  // **não tem nenhum** database, o cartão de criação aparece; quando tem, o
  // primeiro é aberto automaticamente (efeito acima) — este ramo com databases
  // só é alcançado se o usuário fechar todas as abas (ou restaurar esse estado),
  // e mostra o cartão de "nenhum database aberto" com o seletor.
  if (!selected) {
    const projectHasDatabases = projectDatabases.length > 0;
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ProjectsSidebar
          projects={projectSummaries}
          categories={categories}
          databases={databases}
          activeProjectId={resolvedProjectId}
          onOpenProject={handleOpenProject}
          onOpenSearchResult={handleSearchResult}
          onCreateDatabase={handleCreateDatabase}
          onDeleteDatabase={handleDelete}
          onCreateProject={handleCreateProject}
          onCreateCategory={handleCreateCategory}
          onReorderCategories={handleReorderCategories}
          onReorderProjects={handleReorderProjects}
          onUpdateProject={handleUpdateProject}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
          onDeleteProject={handleDeleteProject}
        />
        {projectHasDatabases ? (
          <WorkspaceEmptyState
            variant="no-open-database"
            userName={userName}
            projectName={projects.find((p) => p.id === resolvedProjectId)?.name}
            categories={categories}
            databases={databases}
            projects={projects}
            onOpenDatabase={handleOpenDatabase}
            onCreateProject={handleCreateProject}
            onCreateCategory={handleCreateCategory}
            onCreateDatabase={(input) => void handleCreate(input)}
          />
        ) : (
          <WorkspaceEmptyState
            variant="no-database"
            userName={userName}
            projectName={projects.find((p) => p.id === resolvedProjectId)?.name}
            categories={categories}
            databases={databases}
            onCreateProject={handleCreateProject}
            onCreateCategory={handleCreateCategory}
            onCreateDatabase={(input) => void handleCreate(input)}
          />
        )}
        {errorNotice}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ProjectsSidebar
        projects={projectSummaries}
        categories={categories}
        databases={databases}
        activeProjectId={resolvedProjectId}
        onOpenProject={handleOpenProject}
        onOpenSearchResult={handleSearchResult}
        onCreateDatabase={handleCreateDatabase}
        onDeleteDatabase={handleDelete}
        onCreateProject={handleCreateProject}
        onCreateCategory={handleCreateCategory}
        onReorderCategories={handleReorderCategories}
        onReorderProjects={handleReorderProjects}
        onUpdateProject={handleUpdateProject}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
        onDeleteProject={handleDeleteProject}
      />
      {/* Área do conteúdo (ao lado da sidebar). É `relative` para o layout
          "Página inteira" ancorar a página do item aqui dentro, mantendo a
          sidebar e o cabeçalho do app visíveis. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <OpenDatabaseBar
          currentDatabaseId={selected.id}
          databases={databases}
          projects={projects}
          openDatabaseIds={openDatabaseIds}
          onSelectDatabase={handleSelectDatabaseChip}
          onOpenDatabase={handleOpenDatabase}
          onCloseDatabase={handleCloseDatabase}
        />
        <DatabaseTable
          key={selected.id}
          database={tableDatabase ?? selected}
          viewId={selected.id}
          linkedDatabaseId={selected.linkedDatabaseId ?? null}
          allDatabases={databases}
          onRename={handleRename}
          onUpdateIcon={handleUpdateIcon}
          onUpdateColumns={handleUpdateColumns}
          onAddRow={handleAddRow}
          onUpdateCell={handleUpdateCell}
          onDeleteRow={handleDeleteRow}
          onReorderRows={handleReorderRows}
          onRowsReordered={handleRowsReordered}
          onAddTemplate={handleAddTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onApplyTemplate={handleApplyTemplate}
          onDeleteDatabase={handleDelete}
          onOpenDatabase={handleOpenDatabase}
          onError={setError}
          onPatchDatabase={patchDatabase}
          focusRequest={focusRequest}
          onFocusApplied={() => setFocusRequest(null)}
        />
      </div>
      {errorNotice}
    </div>
  );
}

