"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  AlignLeft,
  ArrowLeft,
  ArrowLeftRight,
  Bell,
  Bookmark,
  CalendarDays,
  ChartArea,
  ChartColumn,
  ChartLine,
  ChartPie,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock,
  Coins,
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
import { DatabasesScreen } from "@/components/database/DatabasesScreen";
import type { NewProjectInput } from "@/components/database/ProjectsScreen";
import { ProjectsSidebar } from "@/components/database/ProjectsSidebar";
import { PageEditor } from "@/components/database/PageEditor";
import { useCalendarStore } from "@/store/useCalendarStore";
import { cn } from "@/lib/utils";
import { ensureHtml } from "@/lib/markdown";
import { todayISO } from "@/lib/database-recurrence";
import { runAutoTemplates } from "@/lib/database-recurrence";
import { CURRENCIES, currencyByCode } from "@/lib/currencies";
import { ICON_OPTIONS, ICON_BY_NAME, databaseIcon } from "@/lib/database-icons";
import {
  formatNumberByColumn,
  formatNumberValue,
} from "@/lib/number-format";
import {
  createDatabase,
  createProject,
  createProjectCategory,
  createRow,
  createTemplate,
  deleteDatabase,
  deleteProject,
  deleteProjectCategory,
  deleteRow,
  deleteTemplate,
  emptyValuesFor,
  ensureDefaultProject,
  fetchDatabases,
  fetchProjectCategories,
  fetchProjects,
  reorderProjectCategories,
  reorderProjects,
  updateDatabaseColumns,
  updateDatabaseIcon,
  updateDatabaseName,
  updateProjectCategory,
  updateProject,
  updateRowPositions,
  updateRowValues,
  DEFAULT_PROJECT_NAME,
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
  SelectOption,
  StatusCategory,
} from "@/types/database";
import {
  PAGE_CONTENT_KEY,
  WEEKDAY_LABELS,
  recurrenceOccurrences,
} from "@/types/database";

/** Larguras (px) das colunas: padr´┐¢o, m´┐¢nimo e m´┐¢ximo redimension´┐¢vel. */
const DEFAULT_COLUMN_WIDTH = 220;
const MIN_COLUMN_WIDTH = 96;
/**
 * M´┐¢nimo (px) para colunas de caixa de sele´┐¢´┐¢o: permite reduzir a coluna at´┐¢
 * que reste apenas o ´┐¢cone da propriedade no cabe´┐¢alho (nome truncado).
 */
const CHECKBOX_MIN_COLUMN_WIDTH = 52;
const MAX_COLUMN_WIDTH = 640;
/** Largura da coluna final que guarda as a´┐¢´┐¢es (excluir linha). */
const ACTIONS_COLUMN_WIDTH = 44;

/** Largura efetiva de uma coluna (respeita o valor persistido, se houver). */
function columnWidth(column: Column): number {
  return column.width ?? DEFAULT_COLUMN_WIDTH;
}

/**
 * Largura m´┐¢nima redimension´┐¢vel de uma coluna. Colunas de caixa de sele´┐¢´┐¢o
 * podem encolher mais que as demais: o m´┐¢nimo ´┐¢ suficiente para exibir apenas
 * o ´┐¢cone da propriedade (o nome ´┐¢ truncado/oculto).
 */
function minColumnWidth(column: Column): number {
  return column.type === "checkbox" ? CHECKBOX_MIN_COLUMN_WIDTH : MIN_COLUMN_WIDTH;
}

const COLUMN_TYPES: {
  type: ColumnType;
  label: string;
  icon: typeof AlignLeft;
}[] = [
  { type: "text", label: "Texto", icon: AlignLeft },
  { type: "number", label: "N´┐¢mero", icon: Hash },
  { type: "select", label: "Sele´┐¢´┐¢o", icon: List },
  { type: "status", label: "Status", icon: CircleDashed },
  { type: "multi_select", label: "Sele´┐¢´┐¢o m´┐¢ltipla", icon: Tags },
  { type: "date", label: "Data", icon: CalendarDays },
  { type: "checkbox", label: "Caixa de sele´┐¢´┐¢o", icon: CheckSquare },
  { type: "person", label: "Pessoa", icon: User },
];

function columnTypeMeta(type: ColumnType) {
  return COLUMN_TYPES.find((t) => t.type === type) ?? COLUMN_TYPES[0];
}

/**
 * Resolve o ´┐¢cone exibido para uma propriedade: o escolhido pelo usu´┐¢rio
 * (`column.icon`), ou o ´┐¢cone padr´┐¢o do tipo quando ausente/"Autom´┐¢tico".
 */
function columnIcon(column: Column) {
  if (column.icon) {
    const custom = ICON_BY_NAME[column.icon];
    if (custom) return custom;
  }
  return columnTypeMeta(column.type).icon;
}

/**
 * Op´┐¢´┐¢es de formato de n´┐¢mero (estilo Notion). A quarta op´┐¢´┐¢o, "Moedas", abre a
 * lista de 30 moedas em vez de ser um valor de `NumberFormat` pr´┐¢prio.
 */
const NUMBER_FORMATS: {
  value: NumberFormat;
  label: string;
  icon: typeof Hash;
}[] = [
  { value: "plain", label: "N´┐¢mero", icon: Hash },
  { value: "separators", label: "N´┐¢mero com separadores", icon: ListOrdered },
  { value: "percent", label: "Percentual", icon: Percent },
];

/** R´┐¢tulo curto do formato de n´┐¢mero atual de uma coluna (ex.: "Moedas ´┐¢ R$"). */
function numberFormatLabel(column: Column): string {
  if (column.numberFormat === "separators") return "N´┐¢mero com separadores";
  if (column.numberFormat === "percent") return "Percentual";
  if (column.numberFormat === "currency") {
    const currency = currencyByCode(column.currency);
    return `Moedas ´┐¢ ${currency.symbol} ${currency.code}`;
  }
  return "N´┐¢mero";
}

/**
 * Op´┐¢´┐¢es de casas decimais exibidas por uma coluna num´┐¢rica. `null` = "Padr´┐¢o"
 * (mostra o m´┐¢nimo de casas que represente o valor, at´┐¢ 2 decimais).
 */
const DECIMAL_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Padr´┐¢o" },
  { value: 0, label: "0" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
];

/** R´┐¢tulo do n´┐¢mero de casas decimais atual (ex.: "2" ou "Padr´┐¢o"). */
function decimalsLabel(column: Column): string {
  const decimals = column.decimals ?? null;
  if (decimals === null) return "Padr´┐¢o";
  return String(decimals);
}

/**
 * Input de uma c´┐¢lula num´┐¢rica. Enquanto **n´┐¢o est´┐¢ em foco**, exibe o valor com
 * o formato escolhido (separadores/percentual/moeda ´┐¢ estilo Notion) por cima do
 * input transparente; ao focar, revela o valor cru edit´┐¢vel. Sem isso o usu´┐¢rio
 * n´┐¢o conseguiria digitar (o formato atrapalharia a edi´┐¢´┐¢o).
 */
function NumberCellInput({
  value,
  column,
  onChange,
}: {
  value: CellValue;
  column: Column;
  onChange: (next: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const textValue = Array.isArray(value) ? value.join(", ") : (value ?? "");
  const display = formatNumberValue(value, column);
  // S´┐¢ usa o overlay quando h´┐¢ algo formatado diferente do valor cru (evita
  // esconder o cursor de digita´┐¢´┐¢o desnecessariamente).
  const showOverlay = !focused && display !== "" && display !== textValue;

  return (
    <div className="relative flex w-full min-w-0 items-center">
      <input
        type="text"
        inputMode="decimal"
        value={textValue}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={column.name}
        className={cn(
          "w-full min-w-0 rounded bg-transparent pl-1 pr-2 py-1 outline-none focus:outline-none",
          showOverlay && "text-transparent caret-transparent",
        )}
      />
      {showOverlay ? (
        <span className="pointer-events-none absolute inset-y-0 left-1 flex items-center truncate pr-2 text-foreground">
          {display}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Detecta se um popover cabe abaixo/´┐¢ direita do seu ponto de ancoragem; caso
 * contr´┐¢rio, o "flipa" (estilo Notion) para cima e/ou para a esquerda. Mede o
 * tamanho real do popover ap´┐¢s montar (e a cada mudan´┐¢a de conte´┐¢do/tamanho da
 * janela) e devolve as classes de posicionamento e o ref que deve ser aplicado
 * ao elemento do popover.
 *
 * O popover deve ter `position: absolute` e vir ancorado por padr´┐¢o em `top-full`
 * e `left-0`; o hook alterna para `bottom-full` e `right-0` quando falta espa´┐¢o.
 */
function useFlipPopover<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [flipY, setFlipY] = useState(false);
  const [flipX, setFlipX] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      // Espaco disponivel tomando o popover ja renderizado como referencia.
      const spaceBelow = window.innerHeight - rect.top;
      const spaceRight = window.innerWidth - rect.left;
      const hasScrollbarX = window.innerWidth - document.documentElement.clientWidth;
      // 8px de respiro para nao colar nas bordas.
      setFlipY((prev) => {
        const next = rect.height + 8 > spaceBelow;
        return prev === next ? prev : next;
      });
      setFlipX((prev) => {
        const next = rect.width + 8 > spaceRight - hasScrollbarX;
        return prev === next ? prev : next;
      });
    };

    measure();
    // Reavalia quando o proprio popover muda de tamanho (ex.: lista carregada).
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, []);

  return {
    ref,
    /** Classe de posicionamento vertical (abre para baixo ou flipa para cima). */
    yClass: flipY ? "bottom-full mb-1" : "top-full mt-1",
    /** Classe de posicionamento horizontal (alinhado ´┐¢ esquerda ou flipa ´┐¢ direita). */
    xClass: flipX ? "right-0" : "left-0",
    /** Classe combinada pronta para uso no `className` do popover. */
    className: `${flipY ? "bottom-full mb-1" : "top-full mt-1"} ${
      flipX ? "right-0" : "left-0"
    }`,
  };
}

/**
 * Posiciona um submenu popover **ao lado** (´┐¢ direita) do seu gatilho, no estilo
 * Notion dos submenus do cabe´┐¢alho de propriedade. Se n´┐¢o houver espa´┐¢o ´┐¢ direita
 * (coluna pr´┐¢xima ´┐¢ borda direita da tela), o submenu "flipa" para a esquerda.
 *
 * O submenu deve ter `position: absolute`; o hook devolve a classe
 * `left-full ml-1 top-0` (´┐¢ direita) ou `right-full mr-1 top-0` (´┐¢ esquerda) e o
 * ref que deve ser aplicado ao elemento.
 */
function useFlipSide<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [flipLeft, setFlipLeft] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const parent = element.parentElement;
      if (!parent) return;
      // Posi´┐¢´┐¢o da ´┐¢ncora (container `relative` do gatilho) na viewport, mais a
      // largura de layout do submenu ´┐¢ est´┐¢vel mesmo antes do posicionamento.
      const anchorRect = parent.getBoundingClientRect();
      const spaceRight = window.innerWidth - anchorRect.right;
      const width = element.offsetWidth;
      // 8px de respiro para n´┐¢o colar na borda direita.
      setFlipLeft((prev) => {
        const next = width + 8 > spaceRight;
        return prev === next ? prev : next;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, []);

  return {
    ref,
    className: flipLeft ? "right-full mr-1 top-0" : "left-full ml-1 top-0",
  };
}

/** Op´┐¢´┐¢es de frequ´┐¢ncia da recorr´┐¢ncia (estilo RRULE). */
const RECURRENCE_FREQUENCIES: {
  value: RecurrenceFrequency;
  label: string;
  noun: string;
}[] = [
  { value: "daily", label: "Diariamente", noun: "dia" },
  { value: "weekly", label: "Semanalmente", noun: "semana" },
  { value: "monthly", label: "Mensalmente", noun: "m´┐¢s" },
  { value: "yearly", label: "Anualmente", noun: "ano" },
];

/** Op´┐¢´┐¢es de t´┐¢rmino da recorr´┐¢ncia. */
const RECURRENCE_ENDS: { value: RecurrenceEnd; label: string }[] = [
  { value: "never", label: "Nunca" },
  { value: "on", label: "Em uma data" },
  { value: "after", label: "Ap´┐¢s" },
];

/** Recorr´┐¢ncia padr´┐¢o de um novo modelo (sem recorr´┐¢ncia ativa). */
function emptyRecurrence(): Recurrence {
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

/** Descreve uma recorr´┐¢ncia em texto leg´┐¢vel (ex.: "a cada 2 semanas"). */
function describeRecurrence(rec: Recurrence): string {
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
  if (rec.end === "on" && rec.endDate) text += ` at´┐¢ ${rec.endDate}`;
  else if (rec.end === "after" && rec.endCount) text += `, ${rec.endCount}x`;
  if (rec.time) text += ` ´┐¢s ${rec.time}`;
  return text;
}

/**
 * Monta a se´┐¢´┐¢o HTML de recorr´┐¢ncia (descri´┐¢´┐¢o + pr´┐¢ximas datas) para anexar ao
 * conte´┐¢do da p´┐¢gina ao aplicar um modelo. Retorna string vazia se n´┐¢o houver
 * recorr´┐¢ncia ou datas geradas.
 */
function recurrenceHtmlSection(rec: Recurrence, fromISO: string): string {
  const dates = recurrenceOccurrences(rec, fromISO, 12);
  const items = dates.map((d) => `<li>${formatRecurrenceDate(d)}</li>`).join("");
  return (
    `<h3>Recorr´┐¢ncia</h3>` +
    `<p><strong>${describeRecurrence(rec)}</strong></p>` +
    (items ? `<p>Pr´┐¢ximas datas:</p><ul>${items}</ul>` : "")
  );
}

/** Formata uma data ISO em "dd/mm/aaaa". */
function formatRecurrenceDate(key: string): string {
  const [y, m, d] = key.split("-");
  if (!y || !m || !d) return key;
  return `${d}/${m}/${y}`;
}

/**
 * Monta o HTML aplicado ´┐¢ p´┐¢gina do item ao usar um modelo: o conte´┐¢do do
 * modelo (convertido para HTML) seguido da se´┐¢´┐¢o de recorr´┐¢ncia, quando houver.
 */
function templateContentHtml(tpl: PageTemplate): string {
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

const STATUS_OPTIONS: SelectOption[] = [
  // N´┐¢o iniciado (cinza) ? Em andamento (azul) ? Conclu´┐¢do (verde)
  { id: "todo", label: "N´┐¢o iniciado", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300", category: "todo" },
  { id: "doing", label: "Em andamento", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300", category: "doing" },
  { id: "done", label: "Conclu´┐¢do", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", category: "done" },
];

/**
 * Categorias de status (estilo Notion), na ordem exibida no editor: as op´┐¢´┐¢es
 * de uma propriedade `status` s´┐¢o agrupadas sob cada um destes t´┐¢tulos, com um
 * bot´┐¢o "+" para adicionar uma nova op´┐¢´┐¢o j´┐¢ na categoria correspondente.
 */
const STATUS_CATEGORIES: { key: StatusCategory; label: string }[] = [
  { key: "todo", label: "A fazer" },
  { key: "doing", label: "Em andamento" },
  { key: "done", label: "Conclu´┐¢dos" },
];

const TAG_OPTIONS: SelectOption[] = [
  { id: "design", label: "Design", color: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  { id: "dev", label: "Dev", color: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  { id: "marketing", label: "Marketing", color: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  { id: "pessoal", label: "Pessoal", color: "bg-pink-500/15 text-pink-700 dark:text-pink-300" },
];

/** Converte "yyyy-MM-dd" em "dd MMM" curto (pt-BR), sem depender de timezone. */
function formatShortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  const months = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  return `${d} ${months[m - 1]}`;
}

/** Gera um id ´┐¢nico para colunas criadas no cliente (chave em `DbRow.values`). */
function newColumnId(): string {
  return `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Busca a op´┐¢´┐¢o (status/tag) pelo id, para exibir chips em modo leitura. */
function tagById(id: string): SelectOption | undefined {
  return TAG_OPTIONS.find((t) => t.id === id);
}

/** Paleta de cores dispon´┐¢veis para as op´┐¢´┐¢es (chips estilo Notion). */
const OPTION_COLORS: string[] = [
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

/** Gera um id ´┐¢nico para uma op´┐¢´┐¢o criada no cliente. */
function newOptionId(): string {
  return `opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Op´┐¢´┐¢es dispon´┐¢veis para uma coluna do tipo select/multi_select.
 * Colunas `select`/`multi_select` criadas pelo usu´┐¢rio come´┐¢am **vazias**
 * (sem op´┐¢´┐¢es) at´┐¢ que o usu´┐¢rio as cadastre. Apenas `status` (categorias
 * fixas) e a coluna legada `tags` t´┐¢m uma lista base pr´┐¢-definida.
 */
function optionsForColumn(column: Column): SelectOption[] {
  if (
    column.type !== "select" &&
    column.type !== "status" &&
    column.type !== "multi_select"
  )
    return [];
  // Op´┐¢´┐¢es configuradas na coluna t´┐¢m prioridade (colunas customizadas).
  if (column.options && column.options.length > 0) return column.options;
  // Colunas de status usam as categorias fixas (A fazer/Em andamento/Conclu´┐¢do).
  if (column.id === "status" || column.type === "status") return STATUS_OPTIONS;
  // Coluna legada de tags reutiliza a lista base por id.
  if (column.id === "tags") return TAG_OPTIONS;
  // Propriedades de sele´┐¢´┐¢o/sele´┐¢´┐¢o m´┐¢ltipla come´┐¢am vazias por padr´┐¢o.
  return [];
}

/**
 * Op´┐¢´┐¢es que podem ser editadas na tela "Editar propriedades".
 * Para colunas select/multi_select sempre devolve uma lista (mesmo que base),
 * de modo que o usu´┐¢rio possa adicionar/renomear/excluir a partir dela.
 */
function editableOptionsForColumn(column: Column): SelectOption[] {
  if (
    column.type !== "select" &&
    column.type !== "status" &&
    column.type !== "multi_select"
  )
    return [];
  return optionsForColumn(column);
}

/** Valor de uma c´┐¢lula (nunca undefined ´┐¢ usa "" como padr´┐¢o). */
function cellOf(row: DbRow, columnId: string): CellValue {
  return row.values[columnId] ?? "";
}

/**
 * Permite que **toda a ´┐¢rea** de um `<td>` responda ao clique ´┐¢ e n´┐¢o apenas o
 * conte´┐¢do interno (input/bot´┐¢o/label) ´┐¢, executando a a´┐¢´┐¢o principal da c´┐¢lula
 * mesmo quando o clique cai no padding/´┐¢rea vazia do `td`.
 *
 * Ignora cliques que j´┐¢ est´┐¢o sobre controles interativos, para n´┐¢o duplicar a
 * a´┐¢´┐¢o de quem j´┐¢ trata o evento (ex.: o pr´┐¢prio input/bot´┐¢o/chip).
 */
function cellAreaClick(
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
 * sele´┐¢´┐¢o/status, cujas op´┐¢´┐¢es viram as colunas do quadro. `multi_select`
 * fica de fora por n´┐¢o ter um ´┐¢nico valor por linha.
 */
function kanbanGroupColumns(columns: Column[]): Column[] {
  return columns.filter((c) => c.type === "select" || c.type === "status");
}

/**
 * Escolhe a coluna padr´┐¢o de agrupamento do Kanban: prefere status, depois
 * sele´┐¢´┐¢o; cai para a primeira op´┐¢´┐¢o dispon´┐¢vel. Devolve `null` se n´┐¢o houver
 * nenhuma coluna agrup´┐¢vel.
 */
function defaultKanbanColumnId(columns: Column[]): string | null {
  const candidates = kanbanGroupColumns(columns);
  if (candidates.length === 0) return null;
  const status = candidates.find((c) => c.type === "status");
  return (status ?? candidates[0]).id;
}

/** Formato de gr´┐¢fico suportado pela visualiza´┐¢´┐¢o "Gr´┐¢fico". */
type ChartKind = "bar" | "line" | "area" | "pie";

/** Como agrega´┐¢´┐¢o dos itens por categoria (contagem ou fun´┐¢´┐¢es num´┐¢ricas). */
type ChartAggregate = "count" | "sum" | "avg";

/** Valor usado no eixo de agrega´┐¢´┐¢o: uma coluna num´┐¢rica ou a contagem. */
const CHART_COUNT = "__count__";

/** Configura´┐¢´┐¢o da visualiza´┐¢´┐¢o "Gr´┐¢fico" persistida por database. */
interface ChartConfig {
  /** Formato do gr´┐¢fico (barras, linha, ´┐¢rea ou pizza). */
  kind: ChartKind;
  /** Id da coluna usada nas categorias (eixo X / fatias). `null` = sem dados. */
  groupColumnId: string | null;
  /** Coluna num´┐¢rica agregada por categoria, ou `CHART_COUNT` para contar itens. */
  valueColumnId: string;
  /** Opera´┐¢´┐¢o aplicada aos valores de cada categoria. */
  aggregate: ChartAggregate;
}

/** Metadados (´┐¢cone/r´┐¢tulo) de cada formato de gr´┐¢fico. */
const CHART_KINDS: { kind: ChartKind; label: string; icon: typeof ChartColumn }[] = [
  { kind: "bar", label: "Barras", icon: ChartColumn },
  { kind: "line", label: "Linha", icon: ChartLine },
  { kind: "area", label: "´┐¢rea", icon: ChartArea },
  { kind: "pie", label: "Pizza", icon: ChartPie },
];

/** R´┐¢tulo das agrega´┐¢´┐¢es dispon´┐¢veis (contagem/soma/m´┐¢dia). */
const CHART_AGGREGATES: { value: ChartAggregate; label: string }[] = [
  { value: "count", label: "Contagem" },
  { value: "sum", label: "Soma" },
  { value: "avg", label: "M´┐¢dia" },
];

/** Paleta fixa (hex) para as s´┐¢ries/fatias do gr´┐¢fico. */
const CHART_COLORS: string[] = [
  "#6366f1", // indigo
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
];

/**
 * Colunas que podem servir de categoria no gr´┐¢fico: sele´┐¢´┐¢o/status (chips),
 * caixa de sele´┐¢´┐¢o e data. Multi-select fica de fora por n´┐¢o ter valor ´┐¢nico.
 */
function chartGroupColumns(columns: Column[]): Column[] {
  return columns.filter(
    (c) =>
      !c.hidden &&
      (c.type === "select" ||
        c.type === "status" ||
        c.type === "checkbox" ||
        c.type === "date"),
  );
}

/** Colunas num´┐¢ricas que podem ser agregadas (soma/m´┐¢dia) no gr´┐¢fico. */
function chartNumberColumns(columns: Column[]): Column[] {
  return columns.filter((c) => !c.hidden && c.type === "number");
}

/**
 * Escolhe colunas padr´┐¢o para o gr´┐¢fico: prefere uma coluna de status/sele´┐¢´┐¢o
 * para categorias e a primeira coluna num´┐¢rica para o valor (sen´┐¢o contagem).
 */
function defaultChartConfig(columns: Column[]): ChartConfig {
  const groupColumns = chartGroupColumns(columns);
  const numberColumns = chartNumberColumns(columns);
  return {
    kind: "bar",
    groupColumnId: groupColumns[0]?.id ?? null,
    valueColumnId: numberColumns[0]?.id ?? CHART_COUNT,
    aggregate: numberColumns.length > 0 ? "sum" : "count",
  };
}

/** Valida, de forma defensiva, a configura´┐¢´┐¢o do gr´┐¢fico lida do storage. */
function isChartConfig(value: unknown): value is ChartConfig {
  if (typeof value !== "object" || value === null) return false;
  const c = value as ChartConfig;
  return (
    (c.kind === "bar" ||
      c.kind === "line" ||
      c.kind === "area" ||
      c.kind === "pie") &&
    (typeof c.groupColumnId === "string" || c.groupColumnId === null) &&
    typeof c.valueColumnId === "string" &&
    (c.aggregate === "count" || c.aggregate === "sum" || c.aggregate === "avg")
  );
}

/** R´┐¢tulo leg´┐¢vel de uma categoria (op´┐¢´┐¢o, data ou caixa de sele´┐¢´┐¢o). */
function chartCategoryLabel(
  row: DbRow,
  column: Column,
  options: SelectOption[],
): string {
  const value = cellOf(row, column.id);
  if (column.type === "checkbox") {
    const checked = value === "true" || value === "1";
    return checked ? "Conclu´┐¢do" : "N´┐¢o marcado";
  }
  if (column.type === "select" || column.type === "status") {
    const raw = Array.isArray(value) ? value[0] : value;
    const option = options.find((o) => o.id === raw);
    return option ? option.label : "Sem valor";
  }
  const text = Array.isArray(value) ? value.join(", ") : value;
  return text.trim() || "Sem valor";
}

/** Converte o valor de uma c´┐¢lula em n´┐¢mero (vazio/n´┐¢o num´┐¢rico ? null). */
function cellNumber(value: CellValue): number | null {
  if (Array.isArray(value)) return null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const n = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Uma linha j´┐¢ agregada, pronta para o gr´┐¢fico (`{ label, value }`). */
interface ChartPoint {
  label: string;
  value: number;
}

/**
 * Agrupa as linhas por categoria e calcula o valor de cada grupo conforme a
 * configura´┐¢´┐¢o (contagem, soma ou m´┐¢dia). Categorias sem valor num´┐¢rico s´┐¢o
 * ignoradas nas somas/m´┐¢dias; em contagem todas contam.
 */
function buildChartData(
  rows: DbRow[],
  column: Column,
  config: ChartConfig,
  valueColumn: Column | null,
  options: SelectOption[],
): ChartPoint[] {
  const buckets = new Map<
    string,
    { label: string; count: number; sum: number; numeric: number }
  >();

  for (const row of rows) {
    const label = chartCategoryLabel(row, column, options);
    let bucket = buckets.get(label);
    if (!bucket) {
      bucket = { label, count: 0, sum: 0, numeric: 0 };
      buckets.set(label, bucket);
    }
    bucket.count += 1;
    if (config.aggregate !== "count" && valueColumn) {
      const n = cellNumber(cellOf(row, valueColumn.id));
      if (n !== null) {
        bucket.sum += n;
        bucket.numeric += 1;
      }
    }
  }

  const points: ChartPoint[] = [];
  for (const bucket of buckets.values()) {
    let value: number;
    if (config.aggregate === "count") value = bucket.count;
    else if (config.aggregate === "sum") value = bucket.sum;
    else value = bucket.numeric > 0 ? bucket.sum / bucket.numeric : 0;
    points.push({ label: bucket.label, value });
  }
  return points;
}

/** Tipo de visualiza´┐¢´┐¢o de um database (estilo "view" do Notion). */
type DbViewType = "table" | "kanban" | "chart";

/** Uma visualiza´┐¢´┐¢o criada pelo usu´┐¢rio sobre o mesmo database. */
interface DbView {
  id: string;
  type: DbViewType;
  name: string;
}

/** Gera um id ´┐¢nico para uma nova visualiza´┐¢´┐¢o criada no cliente. */
function newViewId(): string {
  return `view_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** ´┐¢cone e r´┐¢tulo padr´┐¢o de cada tipo de visualiza´┐¢´┐¢o. */
const VIEW_TYPES: { type: DbViewType; label: string; icon: typeof Table2 }[] = [
  { type: "table", label: "Tabela", icon: Table2 },
  { type: "kanban", label: "Kanban", icon: SquareKanban },
  { type: "chart", label: "Gr´┐¢fico", icon: ChartColumn },
];

/** Metadados (´┐¢cone/r´┐¢tulo) de um tipo de visualiza´┐¢´┐¢o. */
function viewTypeMeta(type: DbViewType) {
  return VIEW_TYPES.find((v) => v.type === type) ?? VIEW_TYPES[0];
}

/**
 * Cria a lista inicial de visualiza´┐¢´┐¢es de um database: uma tabela por padr´┐¢o,
 * al´┐¢m de um Kanban se j´┐¢ existir alguma coluna agrup´┐¢vel (select/status).
 */
function initialViews(columns: Column[]): DbView[] {
  const views: DbView[] = [{ id: newViewId(), type: "table", name: "Tabela" }];
  if (kanbanGroupColumns(columns).length > 0) {
    views.push({ id: newViewId(), type: "kanban", name: "Kanban" });
  }
  return views;
}

/** Estado persistido das visualiza´┐¢´┐¢es de um database. */
interface PersistedViews {
  views: DbView[];
  activeViewId: string;
  kanbanColumnId: string | null;
  /** Configura´┐¢´┐¢o da visualiza´┐¢´┐¢o "Gr´┐¢fico" (opcional; usa padr´┐¢o quando ausente). */
  chart?: ChartConfig;
}

/** Chave de localStorage onde as visualiza´┐¢´┐¢es de um database s´┐¢o guardadas. */
function viewsStorageKey(databaseId: string): string {
  return `calendar:dbViews:${databaseId}`;
}

/** Valida, de forma defensiva, se um valor lido ´┐¢ uma visualiza´┐¢´┐¢o. */
function isDbView(value: unknown): value is DbView {
  if (typeof value !== "object" || value === null) return false;
  const v = value as DbView;
  return (
    typeof v.id === "string" &&
    (v.type === "table" || v.type === "kanban" || v.type === "chart") &&
    typeof v.name === "string"
  );
}

/**
 * L´┐¢ as visualiza´┐¢´┐¢es salvas de um database em localStorage. Devolve `null`
 * quando n´┐¢o h´┐¢ nada v´┐¢lido salvo (a´┐¢ o chamador usa `initialViews`).
 */
function loadPersistedViews(databaseId: string): PersistedViews | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(viewsStorageKey(databaseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const data = parsed as Partial<PersistedViews>;
    if (!Array.isArray(data.views) || data.views.length === 0) return null;
    const views = data.views.filter(isDbView);
    if (views.length === 0) return null;
    const active =
      typeof data.activeViewId === "string" &&
      views.some((v) => v.id === data.activeViewId)
        ? data.activeViewId
        : views[0].id;
    const kanbanColumnId =
      typeof data.kanbanColumnId === "string" ? data.kanbanColumnId : null;
    const chart = isChartConfig(data.chart) ? data.chart : undefined;
    return { views, activeViewId: active, kanbanColumnId, chart };
  } catch {
    return null;
  }
}

/** Persiste as visualiza´┐¢´┐¢es de um database em localStorage (best-effort). */
function savePersistedViews(databaseId: string, data: PersistedViews): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(viewsStorageKey(databaseId), JSON.stringify(data));
  } catch {
    /* ignora falhas de quota/privacidade ´┐¢ a UI segue com o estado em mem´┐¢ria */
  }
}


/** Chip colorido usado para status e tags. */
function Chip({ option, onRemove }: { option: SelectOption; onRemove?: () => void }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
        option.color,
      )}
    >
      {option.label}
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Remover ${option.label}`}>
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

interface RowPageContentProps {
  row: DbRow;
  columns: Column[];
  /** Fecha o modal da p´┐¢gina. */
  onClose: () => void;
  /** Persiste o conte´┐¢do da p´┐¢gina de uma linha. */
  onChangeContent: (rowId: string, content: string) => void;
}

/**
 * Conte´┐¢do da "p´┐¢gina" de um item (estilo Notion) ´┐¢ usado no modal flutuante.
 *
 * Importante: este componente vive no n´┐¢vel de m´┐¢dulo (e n´┐¢o dentro de
 * `DatabaseTable`) de prop´┐¢sito. Componentes definidos no corpo de outro
 * componente ganham uma nova identidade a cada render do pai, o que obriga o
 * React a desmontar/remontar a sub´┐¢rvore inteira ´┐¢ destruindo o foco e o cursor
 * do `PageEditor` a cada digita´┐¢´┐¢o (a cada autosave o pai re-renderiza).
 */
function RowPageContent({
  row,
  columns,
  onClose,
  onChangeContent,
}: RowPageContentProps) {
  const rowTitle = (() => {
    const first = columns[0];
    const raw = first ? cellOf(row, first.id) : "";
    const text = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
    return text.trim() || "Sem t´┐¢tulo";
  })();

  const content = (() => {
    const raw = row.values[PAGE_CONTENT_KEY];
    return typeof raw === "string" ? ensureHtml(raw) : "";
  })();

  return (
    <>
      <div className="mb-3 flex items-center gap-2 border-b py-3 pl-[3.75rem] pr-5">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-base font-semibold">{rowTitle}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar p´┐¢gina"
          className="ml-auto flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">
      <div className="flex flex-col divide-y pl-[2.5rem] pr-[2.5rem]">
        {columns.map((column) => {
          const raw = cellOf(row, column.id);
          const isList = Array.isArray(raw);
          return (
            <div key={column.id} className="flex items-start gap-2 py-2 text-sm">
              <span className="w-32 flex-none text-muted-foreground">
                {column.name}
              </span>
              {isList ? (
                <span className="flex flex-wrap items-center gap-1">
                  {raw.map((id) => {
                    const opt =
                      optionsForColumn(column).find((o) => o.id === id) ??
                      tagById(id);
                    return opt ? <Chip key={id} option={opt} /> : null;
                  })}
                </span>
              ) : (
                <span className="min-w-0 break-words">
                  {column.type === "date" && raw
                    ? formatShortDate(String(raw))
                    : column.type === "checkbox"
                      ? raw === "true" || raw === "1"
                        ? <CheckSquare className="h-4 w-4 text-emerald-600" />
                        : null
                      : String(raw ?? "")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col space-y-3">
        <PageEditor
          value={content}
          onChange={(v) => onChangeContent(row.id, v)}
          placeholder="Clique aqui para come´┐¢ar a escrever..."
          ariaLabel="Conte´┐¢do da p´┐¢gina"
        />
      </div>
      </div>
    </>
  );
}



interface KanbanBoardProps {
  /** Todas as colunas (para escolher as propriedades exibidas no card). */
  columns: Column[];
  /** Linhas j´┐¢ filtradas (busca) que devem aparecer no quadro. */
  rows: DbRow[];
  /** Coluna select/status usada para agrupar (null = sem coluna agrup´┐¢vel). */
  groupColumn: Column | null;
  /** Se existe alguma coluna agrup´┐¢vel (select/status). */
  canGroup: boolean;
  onOpenRow: (rowId: string) => void;
  onDeleteRow: (rowId: string) => void;
  /** Cria um card j´┐¢ atribu´┐¢do a uma op´┐¢´┐¢o de uma coluna (agrupamento). */
  onAddCard: (columnId: string, value: CellValue) => void;
  /** Move um card para uma coluna/posi´┐¢´┐¢o, atualizando valor de grupo e ordem. */
  onMoveCard: (
    rowId: string,
    columnId: string,
    value: CellValue,
    beforeRowId: string | null,
  ) => void;
  /** Renderiza o valor de uma propriedade no rodap´┐¢ do card (modo leitura). */
  renderCardProperty: (row: DbRow, column: Column) => React.ReactNode;
  /** Extrai o t´┐¢tulo do card (primeira coluna de texto/pessoa). */
  cardTitle: (row: DbRow) => string;
}

/**
 * Quadro Kanban (estilo Notion): as linhas viram cards distribu´┐¢dos em colunas
 * conforme o valor de uma coluna select/status ("Agrupar por"). Cada coluna
 * lista seus cards e permite criar um novo j´┐¢ com aquele valor atribu´┐¢do. Os
 * cards podem ser arrastados entre colunas (e reordenados dentro de uma coluna),
 * atualizando o valor de grupo e a ordem; uma linha indica onde o card vai cair.
 */
function KanbanBoard({
  columns,
  rows,
  groupColumn,
  canGroup,
  onOpenRow,
  onDeleteRow,
  onAddCard,
  onMoveCard,
  renderCardProperty,
  cardTitle,
}: KanbanBoardProps) {
  /** Coluna atualmente real´┐¢ada durante um arraste (alvo do drop). */
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  /**
   * Posi´┐¢´┐¢o de inser´┐¢´┐¢o durante o arraste: em qual coluna e antes de qual card
   * (null = no fim). Usada para desenhar a linha indicadora onde o card vai cair.
   */
  const [dropTarget, setDropTarget] = useState<{
    groupId: string;
    beforeRowId: string | null;
  } | null>(null);
  /** Id do card sendo arrastado (para n´┐¢o desenhar a linha sobre ele mesmo). */
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  /** Colunas cujas propriedades aparecem no rodap´┐¢ do card (exceto a de grupo). */
  const propColumns = useMemo(
    () =>
      columns.filter(
        (c) => !c.hidden && c.id !== groupColumn?.id,
      ),
    [columns, groupColumn],
  );

  if (!canGroup || !groupColumn) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <SquareKanban className="h-8 w-8 opacity-60" />
        <p className="max-w-xs">
          O quadro Kanban agrupa os itens por uma propriedade de sele´┐¢´┐¢o ou
          status. Crie uma coluna desses tipos (em ´┐¢Configura´┐¢´┐¢es da tabela´┐¢)
          para usar esta visualiza´┐¢´┐¢o.
        </p>
      </div>
    );
  }

  const options = optionsForColumn(groupColumn);
  // Cada op´┐¢´┐¢o vira uma coluna do quadro; itens sem valor caem em "Sem valor".
  const groups = [
    ...options.map((option) => ({
      id: option.id,
      option,
      rows: rows.filter((r) => cellOf(r, groupColumn.id) === option.id),
    })),
    {
      id: "__none__",
      option: null as SelectOption | null,
      rows: rows.filter((r) => {
        const value = cellOf(r, groupColumn.id);
        return value === "" || (Array.isArray(value) && value.length === 0);
      }),
    },
  ];

  return (
    <div className="flex h-full min-h-0 items-stretch gap-3 overflow-x-auto p-3">
      {groups.map((group) => (
        <div
          key={group.id}
          className="flex w-72 flex-none flex-col rounded-lg border bg-muted/20"
        >
          {/* Cabe´┐¢alho da coluna: chip da op´┐¢´┐¢o + contagem */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            {group.option ? (
              <Chip option={group.option} />
            ) : (
              <span className="text-xs font-medium text-muted-foreground">
                Sem valor
              </span>
            )}
            <span className="ml-auto rounded-full bg-background px-2 text-xs text-muted-foreground">
              {group.rows.length}
            </span>
          </div>

          {/* Lista de cards (tamb´┐¢m ´┐¢ a zona de soltar do arraste) */}
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors",
              dragOverGroupId === group.id && "bg-accent/40",
            )}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("text/plain")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (dragOverGroupId !== group.id) setDragOverGroupId(group.id);
              // Soltar no espa´┐¢o vazio da coluna = mover para o fim.
              setDropTarget({ groupId: group.id, beforeRowId: null });
            }}
            onDragLeave={(event) => {
              // S´┐¢ limpa quando o ponteiro sai de fato da coluna (n´┐¢o ao entrar num filho).
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDragOverGroupId((current) => (current === group.id ? null : current));
              setDropTarget((current) =>
                current?.groupId === group.id ? null : current,
              );
            }}
            onDrop={(event) => {
              event.preventDefault();
              const rowId = event.dataTransfer.getData("text/plain");
              const target = dropTarget;
              setDragOverGroupId(null);
              setDropTarget(null);
              setDraggingRowId(null);
              if (!rowId) return;
              const beforeRowId =
                target?.groupId === group.id ? target.beforeRowId : null;
              onMoveCard(
                rowId,
                groupColumn.id,
                group.option ? group.option.id : "",
                beforeRowId,
              );
            }}
          >
            {group.rows.map((row) => {
              const isDragging = draggingRowId === row.id;
              const showLineBefore =
                dropTarget?.groupId === group.id &&
                dropTarget.beforeRowId === row.id &&
                !isDragging;
              return (
                <Fragment key={row.id}>
                  {/* Linha indicadora da posi´┐¢´┐¢o de inser´┐¢´┐¢o */}
                  {showLineBefore ? (
                    <div className="h-0.5 flex-none rounded-full bg-primary" />
                  ) : null}
                  <div
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", row.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDraggingRowId(row.id);
                    }}
                    onDragEnd={() => {
                      setDraggingRowId(null);
                      setDropTarget(null);
                      setDragOverGroupId(null);
                    }}
                    // Determina soltar acima ou abaixo deste card pela metade.
                    onDragOver={(event) => {
                      if (!event.dataTransfer.types.includes("text/plain")) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverGroupId(group.id);
                      const rect = event.currentTarget.getBoundingClientRect();
                      const after = event.clientY - rect.top > rect.height / 2;
                      const nextBefore = after
                        ? (group.rows[group.rows.indexOf(row) + 1]?.id ?? null)
                        : row.id;
                      if (
                        dropTarget?.beforeRowId !== nextBefore ||
                        dropTarget.groupId !== group.id
                      ) {
                        setDropTarget({ groupId: group.id, beforeRowId: nextBefore });
                      }
                    }}
                    className={cn(
                      "group/card cursor-grab rounded-md border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
                      isDragging && "opacity-40",
                    )}
                  >
                    <div className="flex items-start gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenRow(row.id)}
                        className="min-w-0 flex-1 text-left text-sm font-medium hover:underline"
                      >
                        <span className="line-clamp-2">{cardTitle(row)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteRow(row.id)}
                        aria-label="Excluir item"
                        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/card:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Propriedades (chips/data/texto) das demais colunas */}
                    {propColumns.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {propColumns.map((column) => (
                          <Fragment key={column.id}>
                            {renderCardProperty(row, column)}
                          </Fragment>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Fragment>
              );
            })}

            {/* Linha indicadora no fim da coluna */}
            {dropTarget?.groupId === group.id && dropTarget.beforeRowId === null ? (
              <div className="h-0.5 flex-none rounded-full bg-primary" />
            ) : null}

            {/* Criar novo card j´┐¢ com o valor desta coluna */}
            <button
              type="button"
              onClick={() =>
                onAddCard(groupColumn.id, group.option ? group.option.id : "")
              }
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

interface ChartViewProps {
  columns: Column[];
  rows: DbRow[];
  config: ChartConfig;
  /** Atualiza (e persiste) a configura´┐¢´┐¢o do gr´┐¢fico. */
  onConfigChange: (patch: Partial<ChartConfig>) => void;
}

/**
 * Visualiza´┐¢´┐¢o "Gr´┐¢fico" (estilo Notion): agrega as linhas por uma propriedade
 * de categoria e desenha barras, linha, ´┐¢rea ou pizza. A configura´┐¢´┐¢o (formato,
 * eixo de categoria, valor e agrega´┐¢´┐¢o) ´┐¢ escolhida na barra do topo e
 * persistida no pai. Usa Recharts (SVG responsivo) para a renderiza´┐¢´┐¢o.
 */
function ChartView({ columns, rows, config, onConfigChange }: ChartViewProps) {
  /** Colunas que podem servir de categoria (select/status/checkbox/data). */
  const groupColumns = useMemo(() => chartGroupColumns(columns), [columns]);
  /** Colunas num´┐¢ricas dispon´┐¢veis para somar/m´┐¢dia. */
  const numberColumns = useMemo(() => chartNumberColumns(columns), [columns]);

  /** Coluna de categoria efetiva (fallback para a primeira dispon´┐¢vel). */
  const groupColumn = useMemo(() => {
    const current = groupColumns.find((c) => c.id === config.groupColumnId);
    return current ?? groupColumns[0] ?? null;
  }, [groupColumns, config.groupColumnId]);

  /** Coluna de valor efetiva: num´┐¢rica escolhida ou `null` (contagem). */
  const valueColumn = useMemo(() => {
    if (config.valueColumnId === CHART_COUNT) return null;
    return numberColumns.find((c) => c.id === config.valueColumnId) ?? null;
  }, [numberColumns, config.valueColumnId]);

  /** Dados agregados prontos para o Recharts. */
  const data = useMemo(() => {
    if (!groupColumn) return [];
    const options = optionsForColumn(groupColumn);
    return buildChartData(rows, groupColumn, config, valueColumn, options);
  }, [rows, groupColumn, config, valueColumn]);

  // Sem coluna de categoria: nada a plotar ´┐¢ orienta o usu´┐¢rio a criar uma.
  if (!groupColumn) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <ChartColumn className="h-8 w-8 opacity-60" />
        <p className="max-w-sm">
          O gr´┐¢fico agrupa os itens por uma propriedade de sele´┐¢´┐¢o, status, data
          ou caixa de sele´┐¢´┐¢o. Crie uma coluna desses tipos (em ´┐¢Configura´┐¢´┐¢es da
          tabela´┐¢) para usar esta visualiza´┐¢´┐¢o.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <ChartConfigBar
        config={config}
        groupColumns={groupColumns}
        numberColumns={numberColumns}
        groupColumn={groupColumn}
        valueColumn={valueColumn}
        onConfigChange={onConfigChange}
      />
      <div className="min-h-0 flex-1">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Nenhum dado para exibir. Adicione itens ´┐¢ tabela para ver o gr´┐¢fico.
          </div>
        ) : (
          <ChartRenderer kind={config.kind} data={data} valueColumn={valueColumn} />
        )}
      </div>
    </div>
  );
}

interface ChartConfigBarProps {
  config: ChartConfig;
  groupColumns: Column[];
  numberColumns: Column[];
  groupColumn: Column;
  valueColumn: Column | null;
  onConfigChange: (patch: Partial<ChartConfig>) => void;
}

/** Barra de controles do gr´┐¢fico: formato, categoria, valor e agrega´┐¢´┐¢o. */
function ChartConfigBar({
  config,
  groupColumns,
  numberColumns,
  groupColumn,
  valueColumn,
  onConfigChange,
}: ChartConfigBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {/* Formato do gr´┐¢fico */}
      <div className="flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5">
        {CHART_KINDS.map((option) => {
          const Icon = option.icon;
          const isActive = option.kind === config.kind;
          return (
            <button
              key={option.kind}
              type="button"
              onClick={() => onConfigChange({ kind: option.kind })}
              aria-pressed={isActive}
              title={option.label}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Categoria (eixo X / fatias) */}
      <label className="flex items-center gap-1.5">
        Categoria
        <select
          value={groupColumn.id}
          onChange={(e) => onConfigChange({ groupColumnId: e.target.value })}
          className="rounded border bg-background px-1.5 py-1 text-xs text-foreground outline-none"
          aria-label="Coluna de categoria do gr´┐¢fico"
        >
          {groupColumns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </select>
      </label>

      {/* Valor (coluna num´┐¢rica ou contagem) */}
      <label className="flex items-center gap-1.5">
        Valor
        <select
          value={config.valueColumnId}
          onChange={(e) => onConfigChange({ valueColumnId: e.target.value })}
          className="rounded border bg-background px-1.5 py-1 text-xs text-foreground outline-none"
          aria-label="Coluna de valor do gr´┐¢fico"
        >
          <option value={CHART_COUNT}>Contagem</option>
          {numberColumns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </select>
      </label>

      {/* Agrega´┐¢´┐¢o (s´┐¢ faz sentido para colunas num´┐¢ricas) */}
      {valueColumn ? (
        <label className="flex items-center gap-1.5">
          Agregar
          <select
            value={config.aggregate}
            onChange={(e) =>
              onConfigChange({ aggregate: e.target.value as ChartAggregate })
            }
            className="rounded border bg-background px-1.5 py-1 text-xs text-foreground outline-none"
            aria-label="Agrega´┐¢´┐¢o do gr´┐¢fico"
          >
            {CHART_AGGREGATES.filter((a) => a.value !== "count").map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

/**
 * Renderiza o gr´┐¢fico escolhido (barras/linha/´┐¢rea/pizza) com Recharts, num
 * cont´┐¢iner responsivo. Cores saem da paleta fixa (`CHART_COLORS`), ciclando
 * quando h´┐¢ mais categorias que cores.
 */
function ChartRenderer({
  kind,
  data,
  valueColumn,
}: {
  kind: ChartKind;
  data: ChartPoint[];
  /** Coluna que originou os valores (formata o eixo e o tooltip). */
  valueColumn: Column | null;
}) {
  const axisProps = {
    tick: { fontSize: 11 },
    stroke: "hsl(var(--muted-foreground))",
  } as const;
  const gridStroke = "hsl(var(--border))";
  const tooltipStyle = {
    borderRadius: 8,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    fontSize: 12,
  } as const;

  /** Formata um valor agregado usando o formato de n´┐¢mero da coluna de valor. */
  const formatValue = (value: number) => formatNumberByColumn(value, valueColumn);
  /** Formata os r´┐¢tulos do eixo Y (evita poluir com decimais). */
  const tickFormatter = (value: number) => formatValue(value);
  /** Formata o conte´┐¢do do tooltip do Recharts (nome + valor). */
  const tooltipFormatter = (
    value: string | number | readonly (string | number)[] | undefined,
    name: string | number | undefined,
  ): [string, string] => [
    formatValue(Number(value)),
    name === "value" || name === undefined ? "Valor" : String(name),
  ];
  /**
   * Percentual e moeda podem ter casas decimais; demais formatos (e contagem) s´┐¢
   * fazem sentido como inteiros no eixo.
   */
  const allowDecimals = valueColumn?.numberFormat === "percent";

  return (
    <ResponsiveContainer width="100%" height="100%">
      {kind === "bar" ? (
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} allowDecimals={allowDecimals} tickFormatter={tickFormatter} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: gridStroke }}
            formatter={tooltipFormatter}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((point, index) => (
              <Cell
                key={point.label}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      ) : kind === "line" ? (
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} allowDecimals={allowDecimals} tickFormatter={tickFormatter} />
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      ) : kind === "area" ? (
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id="chart-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.35} />
              <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} allowDecimals={allowDecimals} tickFormatter={tickFormatter} />
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            fill="url(#chart-area-fill)"
          />
        </AreaChart>
      ) : (
        <PieChart>
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius="70%"
            innerRadius="0%"
            paddingAngle={1}
          >
            {data.map((point, index) => (
              <Cell
                key={point.label}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>
        </PieChart>
      )}
    </ResponsiveContainer>
  );
}

interface DatabaseTableProps {
  database: DatabaseModel;
  /** A´┐¢´┐¢es de persist´┐¢ncia (aplicam otimisticamente no pai e persistem no Supabase). */
  onRename: (id: string, name: string) => void;
  onUpdateColumns: (id: string, columns: Column[]) => void;
  onAddRow: (id: string, initialValues?: Record<string, CellValue>) => void;
  onUpdateCell: (
    databaseId: string,
    rowId: string,
    columnId: string,
    value: CellValue,
  ) => void;
  onDeleteRow: (databaseId: string, rowId: string) => void;
  /** Aplica uma nova ordem (por id) ´┐¢s linhas do database, persistindo posi´┐¢´┐¢es. */
  onReorderRows: (databaseId: string, orderedIds: string[]) => void;
  onAddTemplate: (
    databaseId: string,
    name: string,
    content: string,
    recurrence: Recurrence | null,
  ) => void;
  onDeleteTemplate: (databaseId: string, templateId: string) => void;
  /** Cria um novo item (linha) no database a partir de um modelo de p´┐¢gina. */
  onApplyTemplate: (databaseId: string, template: PageTemplate) => void;
  /** Exclui o database inteiro (tabela e suas linhas). */
  onDeleteDatabase: (id: string) => void;
  /** Define (ou limpa, com `null`) o ├¡cone escolhido do database. */
  onUpdateIcon: (id: string, icon: string | null) => void;
  /** Volta para a lista de databases. */
  onBack: () => void;
}

function DatabaseTable({
  database,
  onRename,
  onUpdateIcon,
  onUpdateColumns,
  onAddRow,
  onUpdateCell,
  onDeleteRow,
  onReorderRows,
  onAddTemplate,
  onDeleteTemplate,
  onApplyTemplate,
  onDeleteDatabase,
  onBack,
}: DatabaseTableProps) {
  const { id: databaseId, columns, rows, name: title, icon, templates } = database;
  const TitleIcon = databaseIcon(icon);
  const setColumns = useCallback(
    (updater: Column[] | ((prev: Column[]) => Column[])) => {
      const next = typeof updater === "function" ? updater(columns) : updater;
      onUpdateColumns(databaseId, next);
    },
    [databaseId, columns, onUpdateColumns],
  );
  const setTitle = useCallback(
    (value: string) => {
      onRename(databaseId, value);
    },
    [databaseId, onRename],
  );
  const [query, setQuery] = useState("");
  const [openCell, setOpenCell] = useState<string | null>(null);
  /** Texto do campo "criar op´┐¢´┐¢o" dentro do menu de uma c´┐¢lula select/multi_select. */
  const [newOptionText, setNewOptionText] = useState("");
  /** Id da coluna com o editor de propriedade aberto. */
  const [openColumnEditor, setOpenColumnEditor] = useState<string | null>(null);
  /**
   * Id da coluna cujo popover "Alterar tipo" est´┐¢ aberto no cabe´┐¢alho (topo da
   * tabela), na propriedade Status.
   */
  const [openHeaderTypeMenu, setOpenHeaderTypeMenu] = useState<string | null>(
    null,
  );
  /**
   * Id da coluna cujo popover "Editar propriedade" (n´┐¢vel 1, aberto para
   * propriedades do tipo n´┐¢mero) est´┐¢ aberto no cabe´┐¢alho.
   */
  const [openPropEditMenu, setOpenPropEditMenu] = useState<string | null>(null);
  /**
   * Id da coluna cujo submenu "Formato de n´┐¢mero" (n´┐¢vel 2) est´┐¢ aberto, com as
   * op´┐¢´┐¢es N´┐¢mero / N´┐¢mero com separadores / Percentual / Moedas.
   */
  const [openNumberFormatMenu, setOpenNumberFormatMenu] = useState<string | null>(
    null,
  );
  /**
   * Id da coluna cujo submenu "Casas decimais" (n´┐¢vel 2) est´┐¢ aberto, com as
   * op´┐¢´┐¢es Padr´┐¢o / 0 / 1 / 2 / 3 / 4 / 5.
   */
  const [openDecimalsMenu, setOpenDecimalsMenu] = useState<string | null>(null);
  /**
   * Id da coluna cujo seletor de ´┐¢cone est´┐¢ aberto (bot´┐¢o ´┐¢ esquerda do nome no
   * popover "Editar propriedade").
   */
  const [openIconPicker, setOpenIconPicker] = useState<string | null>(null);
  /** Controla o seletor de ├¡cone do pr├│prio database (bot├úo ├á esquerda do t├¡tulo). */
  const [openTitleIconPicker, setOpenTitleIconPicker] = useState(false);
  /**
   * Id da coluna cujo sub-popover de "Op´┐¢´┐¢es de status" est´┐¢ aberto (bot´┐¢o
   * dentro do popover "Editar propriedade", para colunas do tipo status).
   */
  const [openStatusOptions, setOpenStatusOptions] = useState<string | null>(null);
  /**
   * Id da coluna cujo sub-popover de "Op´┐¢´┐¢es" est´┐¢ aberto (bot´┐¢o dentro do
   * popover "Editar propriedade", para colunas do tipo sele´┐¢´┐¢o).
   */
  const [openSelectOptions, setOpenSelectOptions] = useState<string | null>(null);
  /** Posicionamento (abre para baixo/cima e esquerda/direita) dos submenus internos. */
  const numberFormatMenuFlip = useFlipPopover<HTMLDivElement>();
  const decimalsMenuFlip = useFlipPopover<HTMLDivElement>();
  const iconPickerFlip = useFlipPopover<HTMLDivElement>();
  /**
   * Submenus do cabe´┐¢alho ("Alterar tipo", "Editar propriedade" e "Op´┐¢´┐¢es de
   * status") abrem ao lado direito do popover da propriedade e flipam para a
   * esquerda quando n´┐¢o h´┐¢ espa´┐¢o ´┐¢ direita (coluna pr´┐¢xima ´┐¢ borda da tela).
   */
  const headerTypeMenuSide = useFlipSide<HTMLDivElement>();
  const propEditMenuSide = useFlipSide<HTMLDivElement>();
  const statusOptionsSide = useFlipSide<HTMLDivElement>();
  const selectOptionsSide = useFlipSide<HTMLDivElement>();
  /** Id da linha com a p´┐¢gina aberta (modal flutuante). */
  const [openRowPage, setOpenRowPage] = useState<string | null>(null);
  /** Controla a abertura do di´┐¢logo de cria´┐¢´┐¢o/gest´┐¢o de modelos de p´┐¢gina. */
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  /** ´┐¢ncora do bot´┐¢o "Criar modelo" ´┐¢ usada para ancorar o popover da lista. */
  const templateAnchorRef = useRef<HTMLDivElement>(null);
  /** ´┐¢ncora do bot´┐¢o de configura´┐¢´┐¢es ´┐¢ usada para ancorar o popover abaixo dele. */
  const settingsAnchorRef = useRef<HTMLDivElement>(null);
  /** ´┐¢ncora do bot´┐¢o de ´┐¢cone do database ´┐¢ usada para ancorar o seletor abaixo. */
  const titleIconAnchorRef = useRef<HTMLDivElement>(null);
  /** Container rol´┐¢vel da tabela ´┐¢ usado para medir a largura dispon´┐¢vel. */
  const tableScrollRef = useRef<HTMLDivElement>(null);
  /** Controla a abertura do popover de configura´┐¢´┐¢es da tabela. */
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  /**
   * Largura (px) da coluna "fantasma" da tabela. Ela absorve o espa´┐¢o restante
   * do container rol´┐¢vel para esticar a tabela at´┐¢ o fim da tela (as linhas
   * horizontais passam a cobrir toda a largura). Vale 0 quando a soma das
   * colunas j´┐¢ ultrapassa o container (caso em que h´┐¢ rolagem horizontal).
   */
  const [tableSpacerWidth, setTableSpacerWidth] = useState(0);
  /** Tela inicial do popover de configura´┐¢´┐¢es ao ser aberto (menu ou edi´┐¢´┐¢o). */
  const [settingsInitialView, setSettingsInitialView] = useState<
    "menu" | "edit" | "visibility"
  >("menu");
  /** Largura (px) de preview durante o arraste de redimensionamento de uma coluna. */
  const [resizing, setResizing] = useState<{ columnId: string; width: number } | null>(
    null,
  );
  /** Visualiza´┐¢´┐¢es criadas pelo usu´┐¢rio sobre este database (tabela/kanban). */
  const [views, setViews] = useState<DbView[]>(
    () => loadPersistedViews(databaseId)?.views ?? initialViews(columns),
  );
  /** Id da visualiza´┐¢´┐¢o ativa (aba selecionada). */
  const [activeViewId, setActiveViewId] = useState<string>(
    () => loadPersistedViews(databaseId)?.activeViewId ?? views[0].id,
  );
  /** Controla o menu do bot´┐¢o "+" (criar nova visualiza´┐¢´┐¢o). */
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false);
  /** Id da visualiza´┐¢´┐¢o sendo renomeada (inline no r´┐¢tulo da aba). */
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
  /** Coluna usada para agrupar os itens no Kanban (select/status). */
  const [kanbanColumnId, setKanbanColumnId] = useState<string | null>(
    () => loadPersistedViews(databaseId)?.kanbanColumnId ?? defaultKanbanColumnId(columns),
  );
  /** Configura´┐¢´┐¢o da visualiza´┐¢´┐¢o "Gr´┐¢fico" (formato, categoria, valor, agrega´┐¢´┐¢o). */
  const [chartConfig, setChartConfig] = useState<ChartConfig>(
    () => loadPersistedViews(databaseId)?.chart ?? defaultChartConfig(columns),
  );

  /**
   * Persiste as visualiza´┐¢´┐¢es (lista, ativa, agrupamento e gr´┐¢fico) sempre que
   * mudarem, para que a ´┐¢ltima configura´┐¢´┐¢o seja restaurada ao reabrir.
   */
  useEffect(() => {
    savePersistedViews(databaseId, {
      views,
      activeViewId,
      kanbanColumnId,
      chart: chartConfig,
    });
  }, [databaseId, views, activeViewId, kanbanColumnId, chartConfig]);

  /**
   * Mant´┐¢m a configura´┐¢´┐¢o do gr´┐¢fico coerente com as colunas existentes: se a
   * categoria/valor escolhidos deixarem de existir, cai para valores v´┐¢lidos.
   */
  useEffect(() => {
    setChartConfig((prev) => {
      const groupOk =
        prev.groupColumnId !== null &&
        chartGroupColumns(columns).some((c) => c.id === prev.groupColumnId);
      const valueOk =
        prev.valueColumnId === CHART_COUNT ||
        chartNumberColumns(columns).some((c) => c.id === prev.valueColumnId);
      if (groupOk && valueOk) return prev;
      return {
        ...prev,
        groupColumnId: groupOk
          ? prev.groupColumnId
          : defaultChartConfig(columns).groupColumnId,
        valueColumnId: valueOk
          ? prev.valueColumnId
          : defaultChartConfig(columns).valueColumnId,
      };
    });
  }, [columns]);

  /**
   * Fecha o popup do editor de propriedade e o menu de c´┐¢lula ao clicar fora.
   * Ignora cliques na pr´┐¢pria al´┐¢a de abertura (data-*-trigger) e no popup
   * (data-column-editor / data-cell-menu), para n´┐¢o brigar com o toggle.
   */
  useEffect(() => {
    if (!openColumnEditor && !openCell && !viewsMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
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
        target.closest("[data-icon-picker-trigger]") ||
        target.closest("[data-icon-picker]") ||
        target.closest("[data-status-options-trigger]") ||
        target.closest("[data-status-options]") ||
        target.closest("[data-select-options-trigger]") ||
        target.closest("[data-select-options]") ||
        target.closest("[data-option-color-palette]") ||
        target.closest("[data-cell-menu-trigger]") ||
        target.closest("[data-cell-menu]") ||
        target.closest("[data-views-menu-trigger]") ||
        target.closest("[data-views-menu]")
      ) {
        return;
      }
      setOpenColumnEditor(null);
      setOpenHeaderTypeMenu(null);
      setOpenPropEditMenu(null);
      setOpenNumberFormatMenu(null);
      setOpenDecimalsMenu(null);
      setOpenIconPicker(null);
      setOpenCell(null);
      setViewsMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openColumnEditor, openCell, viewsMenuOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      Object.values(r.values).some((v) =>
        (Array.isArray(v) ? v.join(" ") : String(v ?? ""))
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [rows, query]);
  /** Colunas vis´┐¢veis na tabela (respeita a visibilidade definida pelo usu´┐¢rio). */
  const visibleColumns = useMemo(
    () => columns.filter((c) => !c.hidden),
    [columns],
  );

  /**
   * Calcula a largura da coluna "fantasma" da tabela: o espa´┐¢o que sobra no
   * container rol´┐¢vel depois de descontar a soma das colunas vis´┐¢veis (e a
   * coluna de a´┐¢´┐¢es). Isso estica a tabela at´┐¢ o fim da tela ´┐¢ as linhas
   * horizontais passam a cobrir toda a largura ´┐¢ sem distorcer as colunas.
   * Quando as colunas j´┐¢ ultrapassam o container, a fantasma fica com 0 e o
   * `overflow-auto` exibe a rolagem horizontal normalmente.
   */
  useEffect(() => {
    const container = tableScrollRef.current;
    if (!container) return;

    const measure = () => {
      const columnsWidth = visibleColumns.reduce(
        (sum, c) => sum + columnWidth(c),
        0,
      );
      const used = columnsWidth + ACTIONS_COLUMN_WIDTH;
      /*
       * `clientWidth` exclui a barra de rolagem vertical ´┐¢ mede o espa´┐¢o ´┐¢til.
       * Subtra´┐¢mos 1px de folga: com `border-collapse`, o Chromium arredonda a
       * largura renderizada da tabela para cima (ex.: `width: 1230px` vira
       * 1230.5px), o que geraria 1px de overflow e uma barra de rolagem
       * horizontal mesmo quando as colunas cabem na tela.
       */
      setTableSpacerWidth(Math.max(0, container.clientWidth - used - 1));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
    // Recalcula quando as colunas mudam (add/remover/ocultar/redimensionar).
    // `resizing?.width` entra para acompanhar o arraste em tempo real.
  }, [visibleColumns, columns, resizing]);

  /** Colunas agrup´┐¢veis do Kanban (select/status), na ordem das colunas. */
  const kanbanColumns = useMemo(() => kanbanGroupColumns(columns), [columns]);
  /** Coluna efetivamente usada no agrupamento (fallback para a padr´┐¢o). */
  const kanbanColumn = useMemo(() => {
    const current = kanbanColumns.find((c) => c.id === kanbanColumnId);
    if (current) return current;
    const fallbackId = defaultKanbanColumnId(columns);
    return kanbanColumns.find((c) => c.id === fallbackId) ?? null;
  }, [kanbanColumns, kanbanColumnId, columns]);

  /**
   * Mant´┐¢m `kanbanColumnId` apontando para uma coluna v´┐¢lida: se a coluna
   * escolhida for removida (ou trocada de tipo), volta para a padr´┐¢o.
   */
  useEffect(() => {
    if (kanbanColumnId && kanbanColumns.some((c) => c.id === kanbanColumnId)) return;
    setKanbanColumnId(defaultKanbanColumnId(columns));
  }, [kanbanColumnId, kanbanColumns, columns]);

  /** Visualiza´┐¢´┐¢o ativa (fallback para a primeira se o id n´┐¢o existir mais). */
  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? views[0],
    [views, activeViewId],
  );

  function updateCell(rowId: string, columnId: string, value: CellValue) {
    onUpdateCell(databaseId, rowId, columnId, value);
  }

  /** Aplica um patch na configura´┐¢´┐¢o do gr´┐¢fico (formato/categoria/valor). */
  function updateChartConfig(patch: Partial<ChartConfig>) {
    setChartConfig((prev) => ({ ...prev, ...patch }));
  }

  /**
   * Move um card no Kanban: atualiza o valor da coluna de agrupamento e recoloca
   * a linha na ordem global (logo antes de `beforeRowId`, ou no fim quando null).
   * A nova ordem ´┐¢ persistida como `position` de cada linha.
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
  }

  function removeColumn(id: string) {
    setColumns((prev) => prev.filter((c) => c.id !== id));
    // Zera os valores da coluna removida em todas as linhas (persiste cada uma).
    for (const row of rows) {
      if (!(id in row.values)) continue;
      onUpdateCell(databaseId, row.id, id, "");
    }
    setOpenColumnEditor(null);
  }

  /**
   * Redimensiona uma coluna arrastando a al´┐¢a na borda do cabe´┐¢alho.
   * Durante o arraste s´┐¢ atualiza o preview local; ao soltar, persiste a largura
   * junto da defini´┐¢´┐¢o de colunas (mesmo fluxo de `onUpdateColumns`).
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

  function addRow(initialValues?: Record<string, CellValue>) {
    onAddRow(databaseId, initialValues);
  }

  function removeRow(id: string) {
    onDeleteRow(databaseId, id);
  }

  /**
   * Cria uma nova visualiza´┐¢´┐¢o do database (do tipo escolhido no menu "+"),
   * d´┐¢ um nome ´┐¢nico ("Tabela 2", "Kanban 2"...) e a ativa em seguida.
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

  /** Remove uma visualiza´┐¢´┐¢o criada (nunca a ´┐¢ltima restante). */
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

  /** Renomeia uma visualiza´┐¢´┐¢o (nome vazio cai de volta para o r´┐¢tulo do tipo). */
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

  /** Cria e adiciona um novo modelo de p´┐¢gina. */
  function addTemplate(name: string, content: string, recurrence: Recurrence | null) {
    onAddTemplate(
      databaseId,
      name.trim() || "Modelo sem t´┐¢tulo",
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
   * Cria uma nova op´┐¢´┐¢o para uma coluna select/multi_select e persiste na coluna.
   * Retorna a op´┐¢´┐¢o criada (ou a j´┐¢ existente com o mesmo r´┐¢tulo) para uso imediato.
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
      // Novas op´┐¢´┐¢es de status entram na primeira categoria ("A fazer").
      ...(column.type === "status" ? { category: "todo" as StatusCategory } : {}),
    };
    setColumns((prev) =>
      prev.map((c) =>
        c.id === column.id ? { ...c, options: [...base, option] } : c,
      ),
    );
    return option;
  }

  /** Cria a op´┐¢´┐¢o digitada no menu da c´┐¢lula e j´┐¢ a aplica (select/multi_select). */
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


  /** Renderiza a c´┐¢lula de uma linha conforme o tipo da coluna. */
  function renderCell(row: DbRow, column: Column, isFirst: boolean) {
    const value = cellOf(row, column.id);
    const pageOpen = openRowPage === row.id;

    /** Bot´┐¢o "abrir p´┐¢gina" (aparece no hover, na primeira coluna). */
    const openPageButton = isFirst ? (
      <button
        type="button"
        onClick={() => setOpenRowPage(pageOpen ? null : row.id)}
        aria-label={pageOpen ? "Fechar p´┐¢gina" : "Abrir p´┐¢gina"}
        title={pageOpen ? "Fechar p´┐¢gina" : "Abrir p´┐¢gina"}
        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
    ) : null;

    if (column.type === "select" || column.type === "status") {
      const options = optionsForColumn(column);
      const current = options.find((o) => o.id === value) ?? null;
      const cellKey = `${row.id}:${column.id}`;
      return (
        <td
          className="relative cursor-pointer px-3 py-1.5"
          onClick={(e) =>
            cellAreaClick(e, () =>
              setOpenCell(openCell === cellKey ? null : cellKey),
            )
          }
        >
          <div className="flex items-center gap-1">
            {openPageButton}
            <button
              type="button"
              data-cell-menu-trigger
              onClick={() => setOpenCell(openCell === cellKey ? null : cellKey)}
              className="flex w-full items-center gap-1 overflow-hidden rounded pl-1 pr-2 py-1"
            >
              {current ? (
                <Chip option={current} />
              ) : null}
            </button>
          </div>
          {openCell === cellKey ? (
            <div
              data-cell-menu
              className="absolute left-3 top-full z-20 w-48 rounded-md border bg-popover p-1 shadow-md"
            >
              {options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    updateCell(row.id, column.id, opt.id);
                    setOpenCell(null);
                  }}
                  className="flex w-full items-center rounded px-2 py-1.5 text-left hover:bg-accent"
                >
                  <Chip option={opt} />
                </button>
              ))}
              <div className="mt-1 border-t pt-1">
                <input
                  value={newOptionText}
                  onChange={(e) => setNewOptionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createOptionFromCell(row, column);
                    }
                  }}
                  placeholder="Criar op´┐¢´┐¢o´┐¢"
                  aria-label={`Criar nova op´┐¢´┐¢o em ${column.name}`}
                  className="w-full rounded bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:bg-accent"
                />
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
      return (
        <td
          className="relative cursor-pointer px-3 py-1.5"
          onClick={(e) =>
            cellAreaClick(e, () =>
              setOpenCell(openCell === cellKey ? null : cellKey),
            )
          }
        >
          <div className="flex items-center gap-1">
            {openPageButton}
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
          </div>
          {openCell === cellKey ? (
            <div
              data-cell-menu
              className="absolute left-3 top-full z-20 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md"
            >
              {options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleTag(row, column.id, opt.id)}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-accent"
                >
                  <Chip option={opt} />
                  {list.includes(opt.id) ? (
                    <span className="text-xs text-primary">selecionado</span>
                  ) : null}
                </button>
              ))}
              <div className="mt-1 border-t pt-1">
                <input
                  value={newOptionText}
                  onChange={(e) => setNewOptionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createOptionFromCell(row, column);
                    }
                  }}
                  placeholder="Criar op´┐¢´┐¢o´┐¢"
                  aria-label={`Criar nova op´┐¢´┐¢o em ${column.name}`}
                  className="w-full rounded bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:bg-accent"
                />
              </div>
            </div>
          ) : null}
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
                /* showPicker pode lan´┐¢ar se n´┐¢o partir de gesto do usu´┐¢rio */
              }
            })
          }
        >
          <div className="flex items-center gap-1">
            {openPageButton}
            {/* O input nativo de data cobre toda a c´┐¢lula (transparente) para que
                o clique em qualquer ponto abra o seletor de data do navegador.
                A vers´┐¢o anterior usava `sr-only`, que impedia abrir o seletor. */}
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
                    /* showPicker pode lan´┐¢ar se n´┐¢o partir de gesto do usu´┐¢rio */
                  }
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`Alterar ${column.name}`}
              />
            </div>
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
            {openPageButton}
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
            {openPageButton}
            <NumberCellInput
              value={value}
              column={column}
              onChange={(next) => updateCell(row.id, column.id, next)}
            />
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
          {openPageButton}
          <input
            type="text"
            value={textValue}
            onChange={(e) => updateCell(row.id, column.id, e.target.value)}
            className="w-full min-w-0 rounded bg-transparent pl-1 pr-2 py-1 outline-none focus:outline-none"
          />
        </div>
      </td>
    );
  }

  /** Modal flutuante (centro da tela) com a p´┐¢gina do item aberto. */
  const openRow = rows.find((r) => r.id === openRowPage) ?? null;

  /** T´┐¢tulo do card do Kanban: primeira coluna de texto/pessoa (sen´┐¢o "Sem t´┐¢tulo"). */
  function cardTitle(row: DbRow): string {
    const titleColumn =
      columns.find((c) => c.type === "text") ??
      columns.find((c) => c.type === "person");
    if (!titleColumn) return "Sem t´┐¢tulo";
    const value = cellOf(row, titleColumn.id);
    const text = Array.isArray(value) ? value.join(", ") : value;
    return text.trim() || "Sem t´┐¢tulo";
  }

  /**
   * Renderiza, em modo leitura, o valor de uma propriedade para o rodap´┐¢ do
   * card do Kanban (chips para select/status/multi_select, data formatada,
   * texto simples para os demais). Retorna `null` quando a c´┐¢lula est´┐¢ vazia.
   */
  function renderCardProperty(row: DbRow, column: Column) {
    const value = cellOf(row, column.id);
    if (value === "" || (Array.isArray(value) && value.length === 0)) return null;

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
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        {/* Barra de t´┐¢tulo do database (estilo Notion) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              aria-label="Voltar para a lista de databases"
              title="Voltar"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="relative" ref={titleIconAnchorRef}>
              <button
                type="button"
                onClick={() => setOpenTitleIconPicker((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={openTitleIconPicker}
                aria-label="Escolher ´┐¢cone do database"
                title="Escolher ´┐¢cone"
                className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 hover:bg-primary/20"
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
                    className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border bg-popover p-2 shadow-md"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateIcon(databaseId, null);
                        setOpenTitleIconPicker(false);
                      }}
                      className={cn(
                        "mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                        !icon ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <Table2 className="h-4 w-4" />
                      Padr´┐¢o
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
                              onUpdateIcon(databaseId, option.name);
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
              aria-label="T´┐¢tulo do database"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="h-8 w-44 pl-8"
              />
            </div>
            <div className="relative" ref={templateAnchorRef}>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setIsTemplateDialogOpen(true)}
                title="Criar modelo de p´┐¢gina"
                data-template-popover-trigger
              >
                <LayoutTemplate className="h-4 w-4" />
                Criar modelo
              </Button>
            </div>
            <div className="relative" ref={settingsAnchorRef}>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Configura´┐¢´┐¢es da tabela"
                title="Configura´┐¢´┐¢es da tabela"
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

        {/* ´┐¢rea rol´┐¢vel: tabela */}
        <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-auto">
        {/* Abas de view (visualiza´┐¢´┐¢es criadas pelo usu´┐¢rio) */}
        <div className="flex items-center gap-1 border-b px-3 pt-2">
          {views.map((view) => {
            const meta = viewTypeMeta(view.type);
            const ViewIcon = meta.icon;
            const isActive = view.id === activeView.id;
            const isRenaming = renamingViewId === view.id;
            return (
              <div key={view.id} className="group/view relative flex items-center">
                {isRenaming ? (
                  <span
                    className={cn(
                      "flex items-center gap-1.5 rounded-t border-b-2 px-3 py-1 text-sm font-medium",
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground",
                    )}
                  >
                    <ViewIcon className="h-3.5 w-3.5 flex-none" />
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
                      aria-label="Nome da visualiza├º├úo"
                      className="w-24 rounded border bg-background px-1 py-0.5 text-sm text-foreground outline-none"
                    />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveViewId(view.id)}
                    onDoubleClick={() => {
                      setActiveViewId(view.id);
                      setRenamingViewId(view.id);
                    }}
                    aria-pressed={isActive}
                    title="Clique duplo para renomear"
                    className={cn(
                      "flex items-center gap-1.5 rounded-t border-b-2 px-3 py-1.5 text-sm font-medium",
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <ViewIcon className="h-3.5 w-3.5" />
                    {view.name}
                  </button>
                )}
                {/* Remove a view (oculto quando h´┐¢ s´┐¢ uma). */}
                {views.length > 1 && !isRenaming ? (
                  <button
                    type="button"
                    onClick={() => removeView(view.id)}
                    aria-label={`Remover visualiza´┐¢´┐¢o ${view.name}`}
                    title="Remover visualiza´┐¢´┐¢o"
                    className="mr-0.5 flex h-4 w-4 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive group-hover/view:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            );
          })}

          {/* Bot´┐¢o "+" para criar uma nova visualiza´┐¢´┐¢o */}
          <div className="relative">
            <button
              type="button"
              data-views-menu-trigger
              onClick={() => setViewsMenuOpen((open) => !open)}
              className="ml-0.5 flex items-center gap-1 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              aria-label="Nova visualiza´┐¢´┐¢o"
              title="Nova visualiza´┐¢´┐¢o"
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
                  Nova visualiza´┐¢´┐¢o
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

          {/* Seletor da coluna de agrupamento do Kanban (s´┐¢ no modo Kanban). */}
          {activeView.type === "kanban" && kanbanColumns.length > 0 ? (
            <label className="ml-auto flex items-center gap-1.5 pb-1 text-xs text-muted-foreground">
              Agrupar por
              <select
                value={kanbanColumn?.id ?? ""}
                onChange={(e) => setKanbanColumnId(e.target.value)}
                className="rounded border bg-background px-1.5 py-1 text-xs text-foreground outline-none"
                aria-label="Coluna de agrupamento do Kanban"
              >
                {kanbanColumns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {/* Tabela */}
        {activeView.type === "table" ? (
        <div className="min-h-0">
          <table
            data-database-table
            className="w-max table-fixed border-collapse text-sm"
            style={{
              /* Largura fixa em px (soma das colunas + a´┐¢´┐¢es + a coluna fantasma
                 calculada por `tableSpacerWidth`), e n´┐¢o min-width/100%, para que
                 `table-fixed` N´┐¢O redistribua as larguras das colunas: cada uma
                 mant´┐¢m o seu tamanho e a fantasma absorve o resto da tela. */
              width:
                visibleColumns.reduce((sum, c) => sum + columnWidth(c), 0) +
                ACTIONS_COLUMN_WIDTH +
                tableSpacerWidth,
            }}
          >
            <colgroup>
              {visibleColumns.map((column) => (
                <col
                  key={column.id}
                  style={{
                    width:
                      resizing?.columnId === column.id
                        ? resizing.width
                        : columnWidth(column),
                  }}
                />
              ))}
              <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
              {/* Coluna fantasma: absorve o espa´┐¢o restante do container
                  (calculado em `tableSpacerWidth`) para as linhas horizontais
                  irem at´┐¢ o fim da tela. Vale 0 quando h´┐¢ rolagem horizontal. */}
              <col style={{ width: tableSpacerWidth }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="text-left text-xs text-muted-foreground">
                {visibleColumns.map((column) => {
                  const Icon = columnIcon(column);
                  return (
                    <th
                      key={column.id}
                      className="relative border-b px-3 py-2 font-medium"
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
                        className="flex w-full items-center gap-1.5 overflow-hidden rounded px-1 py-0.5 text-left"
                        title="Editar propriedade"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 truncate">{column.name}</span>
                        <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>

                      {openColumnEditor === column.id ? (
                        <div
                          data-column-editor
                          className={cn(
                            "absolute left-3 top-full z-30 mt-1 rounded-md border bg-popover p-3 text-left font-normal text-foreground shadow-md",
                            column.type === "status" ? "w-72" : "w-64",
                          )}
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
                              title="Escolher ´┐¢cone da propriedade"
                              aria-label="Escolher ´┐¢cone da propriedade"
                              className="flex h-8 w-8 flex-none items-center justify-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground"
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
                                ref={iconPickerFlip.ref}
                                className={cn(
                                  "absolute z-40 w-56 rounded-md border bg-popover p-2 shadow-md",
                                  iconPickerFlip.className,
                                )}
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
                                  Autom´┐¢tico
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
                                        setOpenHeaderTypeMenu(null);
                                        setOpenPropEditMenu(null);
                                        setOpenNumberFormatMenu(null);
                                        setOpenDecimalsMenu(null);
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
                                  // Propriedade num´┐¢rica: abre o popover de edi´┐¢´┐¢o
                                  // (com o bot´┐¢o "Formato de n´┐¢mero"). Fecha o
                                  // submenu "Alterar tipo" (s´┐¢o mutuamente exclusivos).
                                  setOpenHeaderTypeMenu(null);
                                  setOpenPropEditMenu(
                                    openPropEditMenu === column.id
                                      ? null
                                      : column.id,
                                  );
                                  setOpenNumberFormatMenu(null);
                                  setOpenDecimalsMenu(null);
                                  setOpenIconPicker(null);
                                  return;
                                }
                                if (column.type === "status") {
                                  // Propriedade status: abre um sub-popover
                                  // aninhado com as categorias
                                  // A fazer / Em andamento / Conclu´┐¢dos.
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
                                  setOpenIconPicker(null);
                                  return;
                                }
                                if (
                                  column.type === "select" ||
                                  column.type === "multi_select"
                                ) {
                                  // Propriedade de sele´┐¢´┐¢o: abre um sub-popover
                                  // aninhado com a lista de "Op´┐¢´┐¢es" (adicionar,
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
                                    onClick={() =>
                                      setOpenNumberFormatMenu(
                                        openNumberFormatMenu === column.id
                                          ? null
                                          : column.id,
                                      )
                                    }
                                    aria-haspopup="menu"
                                    aria-expanded={
                                      openNumberFormatMenu === column.id
                                    }
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                                  >
                                    Formato de n´┐¢mero
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
                                    onClick={() =>
                                      setOpenDecimalsMenu(
                                        openDecimalsMenu === column.id
                                          ? null
                                          : column.id,
                                      )
                                    }
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

                      {/* Al´┐¢a para redimensionar a largura da coluna */}
                      <div
                        role="separator"
                        aria-label={`Redimensionar coluna ${column.name}`}
                        aria-orientation="vertical"
                        onPointerDown={(e) => startColumnResize(e, column)}
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
                    </th>
                  );
                })}

                {/* Bot´┐¢o para adicionar nova propriedade/coluna */}
                <th className="border-b px-2 py-2">
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

                {/* C´┐¢lula fantasma: alinha com a coluna espacer para o `border-b`
                    do cabe´┐¢alho cobrir toda a largura da tabela. */}
                <th className="border-b" aria-hidden />
              </tr>
            </thead>
            <tbody>

              {filtered.map((row) => (
                <tr key={row.id} className="group border-b transition-colors hover:bg-accent/40">
                  {visibleColumns.map((column, index) => (
                    <Fragment key={column.id}>
                      {renderCell(row, column, index === 0)}
                    </Fragment>
                  ))}

                  {/* A´┐¢´┐¢es */}
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

                  {/* C´┐¢lula fantasma: alinha com a coluna espacer para o `border-b`
                      da linha se estender at´┐¢ o fim da tela. */}
                  <td aria-hidden />
                </tr>
              ))}

            </tbody>
          </table>

          {/* Nova linha */}
          <button
            type="button"
            onClick={() => addRow()}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-accent/40"
          >
            <Plus className="h-4 w-4" />
            Nova linha
          </button>
        </div>
        ) : activeView.type === "kanban" ? (
        <KanbanBoard
          columns={columns}
          rows={filtered}
          groupColumn={kanbanColumn}
          canGroup={kanbanColumns.length > 0}
          onOpenRow={(rowId) => setOpenRowPage(rowId)}
          onDeleteRow={(rowId) => removeRow(rowId)}
          onAddCard={(columnId, value) => addRow({ [columnId]: value })}
          onMoveCard={moveCard}
          renderCardProperty={renderCardProperty}
          cardTitle={cardTitle}
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
        </div>
      </div>

      {openRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpenRowPage(null)}
          role="presentation"
        >
          <div
            className="flex h-full w-full max-w-[60vw] flex-col overflow-hidden rounded-lg border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <RowPageContent
              row={openRow}
              columns={columns}
              onClose={() => setOpenRowPage(null)}
              onChangeContent={updatePageContent}
            />
          </div>
        </div>
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
        columns={columns}
        onRename={setTitle}
        onUpdateColumn={updateColumn}
        onAddColumn={addColumn}
        onRemoveColumn={removeColumn}
        onDeleteDatabase={() => {
          setIsSettingsOpen(false);
          onDeleteDatabase(databaseId);
        }}
        initialView={settingsInitialView}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}

interface PageTemplateDialogProps {
  open: boolean;
  /** Elemento ao qual o popover da lista fica ancorado (bot´┐¢o "Criar modelo"). */
  anchorEl?: HTMLElement | null;
  templates: PageTemplate[];
  /** Propriedades da tabela (somente leitura) mostradas no modelo. */
  columns: Column[];
  onCreate: (name: string, content: string, recurrence: Recurrence | null) => void;
  onDelete: (id: string) => void;
  /** Cria um novo item no database a partir do modelo selecionado. */
  onApply: (template: PageTemplate) => void;
  onClose: () => void;
}

/**
 * Modal para criar e gerenciar modelos de p´┐¢gina (estilo Notion).
 * Segue o mesmo padr´┐¢o visual da p´┐¢gina do item: overlay centralizado,
 * cabe´┐¢alho fixo e corpo com scroll. As propriedades exibidas s´┐¢o as da pr´┐¢pria
 * tabela (somente leitura) ´┐¢ o modelo guarda apenas o nome, o conte´┐¢do e a
 * recorr´┐¢ncia. Componente de n´┐¢vel de m´┐¢dulo para preservar o estado dos campos
 * entre renders.
 */
function PageTemplateDialog({
  open,
  anchorEl,
  templates,
  columns,
  onCreate,
  onDelete,
  onApply,
  onClose,
}: PageTemplateDialogProps) {
  const [mode, setMode] = useState<"list" | "create">("list");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  /** Recorr´┐¢ncia habilitada para o modelo. */
  const [recEnabled, setRecEnabled] = useState(false);
  /** Configura´┐¢´┐¢o de recorr´┐¢ncia (frequ´┐¢ncia, intervalo, dias, t´┐¢rmino). */
  const [recurrence, setRecurrence] = useState<Recurrence>(() =>
    emptyRecurrence(),
  );
  /** Quando true, o modelo gera itens automaticamente conforme a recorr´┐¢ncia. */
  const [autoEnabled, setAutoEnabled] = useState(false);

  // Sempre que o di´┐¢logo abre, volta para a lista e limpa o formul´┐¢rio.
  useEffect(() => {
    if (open) {
      setMode("list");
      setName("");
      setContent("");
      setRecEnabled(false);
      setRecurrence(emptyRecurrence());
      setAutoEnabled(false);
    }
  }, [open]);

  /** Posi´┐¢´┐¢o (top/right) do popover da lista, ancorado ao bot´┐¢o "Criar modelo". */
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Posiciona o popover da lista logo abaixo do bot´┐¢o ´┐¢ncora, alinhado ´┐¢ direita.
  useLayoutEffect(() => {
    if (!open || mode !== "list" || !anchorEl) {
      setPos(null);
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }, [open, mode, anchorEl]);

  if (!open) return null;

  const resetForm = () => {
    setName("");
    setContent("");
    setRecEnabled(false);
    setRecurrence(emptyRecurrence());
    setAutoEnabled(false);
  };

  const handleCreate = () => {
    if (!name.trim() && !content.trim()) return;
    const rec =
      recEnabled
        ? {
            ...recurrence,
            // Marca a data de in´┐¢cio quando a automa´┐¢´┐¢o est´┐¢ ligada; ´┐¢ a partir
            // dela que os itens passam a ser criados automaticamente.
            startDate: autoEnabled ? todayISO() : null,
            lastGenerated: null,
          }
        : null;
    onCreate(name, content, rec);
    resetForm();
    setMode("list");
  };

  /** Atualiza parcialmente a configura´┐¢´┐¢o de recorr´┐¢ncia. */
  const patchRecurrence = (patch: Partial<Recurrence>) => {
    setRecurrence((prev) => ({ ...prev, ...patch }));
  };

  /** Liga/desliga um dia da semana na recorr´┐¢ncia semanal. */
  const toggleWeekday = (day: number) => {
    setRecurrence((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort((a, b) => a - b),
    }));
  };

  // Modo "list": popover pequeno ancorado abaixo do bot´┐¢o "Criar modelo".
  // Modo "create": p´┐¢gina centralizada (overlay escuro + modal).
  if (mode === "list") {
    return (
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="absolute w-72 rounded-lg border bg-popover p-1 shadow-lg"
          style={pos ? { top: pos.top, right: pos.right } : { top: -9999, right: 0 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Modelos de p´┐¢gina"
        >
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <LayoutTemplate className="h-3.5 w-3.5" />
            Modelos de p´┐¢gina
          </div>
          <div className="max-h-64 overflow-y-auto">
            {templates.length > 0 ? (
              <ul className="space-y-0.5">
                {templates.map((tpl) => (
                  <li key={tpl.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onApply(tpl)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onApply(tpl);
                        }
                      }}
                      title="Criar um item no database a partir deste modelo"
                      className="group/tpl flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <LayoutTemplate className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{tpl.name}</span>
                      {tpl.recurrence ? (
                        <span className="flex-none rounded-full bg-accent px-2 py-0.5 text-[11px] text-muted-foreground">
                          {describeRecurrence(tpl.recurrence)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(tpl.id);
                        }}
                        aria-label={`Excluir modelo ${tpl.name}`}
                        title="Excluir modelo"
                        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                      <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                Voc´┐¢ ainda n´┐¢o tem modelos.
              </p>
            )}
          </div>
          <div className="mt-0.5 border-t pt-1">
            <Button
              className="w-full"
              size="sm"
              variant="ghost"
              onClick={() => setMode("create")}
            >
              <Plus />
              Criar modelo
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-full w-full max-w-[60vw] flex-col overflow-hidden rounded-lg border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Criar modelo"
      >
        <div className="flex items-center gap-2 border-b px-5 py-3">
          <button
            type="button"
            onClick={() => setMode("list")}
            aria-label="Voltar para a lista de modelos"
            title="Voltar"
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-base font-semibold">Criar modelo</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {/* Corpo com scroll ´┐¢nico (mesmo padr´┐¢o da p´┐¢gina do item): nome,
              propriedades, recorr´┐¢ncia e conte´┐¢do rolam juntos. */}
          <div className="flex flex-col space-y-4 pt-4">
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                Nome do modelo
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Tarefa padr´┐¢o"
              />
            </div>

            {/* Propriedades da tabela (somente leitura, mesmo estilo da p´┐¢gina do item) */}
            <div className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Propriedades
              </span>
              <div className="flex flex-col divide-y rounded border">
                {columns.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    A tabela ainda n´┐¢o tem propriedades.
                  </p>
                ) : (
                  columns.map((column) => {
                    const meta = columnTypeMeta(column.type);
                    const TypeIcon = columnIcon(column);
                    return (
                      <div
                        key={column.id}
                        className="flex items-center gap-2 px-2 py-1.5"
                      >
                        <TypeIcon className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {column.name}
                        </span>
                        <span className="flex-none text-xs text-muted-foreground">
                          {meta.label}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {/* Recorr´┐¢ncia (estilo RRULE): frequ´┐¢ncia, intervalo, dias e t´┐¢rmino */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Recorr´┐¢ncia
                </span>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={recEnabled}
                    onChange={(e) => setRecEnabled(e.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Repetir
                </label>
              </div>

              {recEnabled ? (
                <div className="space-y-2 rounded border p-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Repetir a cada</span>
                    <Input
                      type="number"
                      min={1}
                      value={recurrence.interval}
                      onChange={(e) =>
                        patchRecurrence({
                          interval: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="h-7 w-16"
                      aria-label="Intervalo da recorr´┐¢ncia"
                    />
                    <select
                      value={recurrence.frequency}
                      onChange={(e) =>
                        patchRecurrence({
                          frequency: e.target.value as RecurrenceFrequency,
                        })
                      }
                      className="h-7 rounded border bg-background px-2 text-sm"
                      aria-label="Frequ´┐¢ncia da recorr´┐¢ncia"
                    >
                      {RECURRENCE_FREQUENCIES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.noun}
                          {recurrence.interval > 1 ? "s" : ""} ´┐¢{" "}
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {recurrence.frequency === "weekly" ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Dias</span>
                      <div className="flex gap-1">
                        {WEEKDAY_LABELS.map((label, day) => {
                          const active = recurrence.weekdays.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => toggleWeekday(day)}
                              aria-pressed={active}
                              aria-label={`Dia ${day}`}
                              className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-full border text-xs",
                                active
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:bg-accent",
                              )}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Termina</span>
                    <select
                      value={recurrence.end}
                      onChange={(e) =>
                        patchRecurrence({ end: e.target.value as RecurrenceEnd })
                      }
                      className="h-7 rounded border bg-background px-2 text-sm"
                      aria-label="T´┐¢rmino da recorr´┐¢ncia"
                    >
                      {RECURRENCE_ENDS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {recurrence.end === "on" ? (
                      <Input
                        type="date"
                        value={recurrence.endDate ?? ""}
                        onChange={(e) =>
                          patchRecurrence({ endDate: e.target.value })
                        }
                        className="h-7 w-36"
                        aria-label="Data final da recorr´┐¢ncia"
                      />
                    ) : null}
                    {recurrence.end === "after" ? (
                      <span className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          value={recurrence.endCount ?? 1}
                          onChange={(e) =>
                            patchRecurrence({
                              endCount: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="h-7 w-16"
                          aria-label="N´┐¢mero de ocorr´┐¢ncias"
                        />
                        <span className="text-muted-foreground">ocorr´┐¢ncias</span>
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {describeRecurrence(recurrence)}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Hor´┐¢rio</span>
                    <Input
                      type="time"
                      value={recurrence.time ?? ""}
                      onChange={(e) =>
                        patchRecurrence({ time: e.target.value || null })
                      }
                      className="h-7 w-28"
                      aria-label="Hor´┐¢rio da recorr´┐¢ncia"
                    />
                    {recurrence.time ? null : (
                      <span className="text-xs text-muted-foreground">
                        (vazio = dia inteiro)
                      </span>
                    )}
                  </div>

                  <label className="flex cursor-pointer items-start gap-2 rounded border bg-muted/30 p-2 text-xs">
                    <input
                      type="checkbox"
                      checked={autoEnabled}
                      onChange={(e) => setAutoEnabled(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 accent-primary"
                    />
                    <span className="text-muted-foreground">
                      Criar itens automaticamente. Ao abrir o app, um item novo ´┐¢
                      criado no database para cada ocorr´┐¢ncia que "venceu",
                      usando este modelo. {autoEnabled ? "Ativo desde hoje." : ""}
                    </span>
                  </label>
                </div>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col space-y-1">
              <label className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                Conte´┐¢do da p´┐¢gina
              </label>
              <PageEditor
                value={content}
                onChange={setContent}
                placeholder="Escreva o conte´┐¢do que ser´┐¢ aplicado ´┐¢ p´┐¢gina do item..."
                ariaLabel="Conte´┐¢do do modelo"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode("list")}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={handleCreate}>
                <Plus />
                Criar modelo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Editor das op´┐¢´┐¢es de uma propriedade Sele´┐¢´┐¢o/Sele´┐¢´┐¢o m´┐¢ltipla.
 * Permite adicionar, renomear, recolorir e excluir op´┐¢´┐¢es (estilo Notion).
 */
function SelectOptionsEditor({
  options,
  onChange,
}: {
  options: SelectOption[];
  onChange: (options: SelectOption[]) => void;
}) {
  /** Id da op´┐¢´┐¢o cuja paleta de cores est´┐¢ aberta. */
  const [colorFor, setColorFor] = useState<string | null>(null);

  function addOption() {
    onChange([
      ...options,
      {
        id: newOptionId(),
        label: "Nova op´┐¢´┐¢o",
        color: OPTION_COLORS[options.length % OPTION_COLORS.length],
      },
    ]);
  }

  function updateOption(id: string, patch: Partial<SelectOption>) {
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function removeOption(id: string) {
    onChange(options.filter((o) => o.id !== id));
  }

  return (
    <div className="space-y-1.5 rounded border bg-muted/30 p-2">
      {options.length === 0 ? (
        <p className="px-1 py-1 text-xs text-muted-foreground">Nenhuma op´┐¢´┐¢o ainda.</p>
      ) : (
        <ul className="space-y-1">
          {options.map((option) => (
            <li key={option.id} className="flex items-center gap-1.5">
              <Chip option={option} />
              <Input
                value={option.label}
                onChange={(e) => updateOption(option.id, { label: e.target.value })}
                className="h-7 min-w-0 flex-1 border-0 px-1 shadow-none"
                aria-label={`Nome da op´┐¢´┐¢o ${option.label}`}
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setColorFor((cur) => (cur === option.id ? null : option.id))}
                  aria-label={`Cor da op´┐¢´┐¢o ${option.label}`}
                  title="Alterar cor"
                  className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
                >
                  <span className={cn("h-3.5 w-3.5 rounded-full", option.color)} />
                </button>
                {colorFor === option.id ? (
                  <div className="absolute right-0 top-8 z-20 grid w-28 grid-cols-5 gap-1 rounded-md border bg-popover p-2 shadow-lg">
                    {OPTION_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => {
                          updateOption(option.id, { color });
                          setColorFor(null);
                        }}
                        aria-label="Escolher cor"
                        className={cn(
                          "h-4 w-4 rounded-full ring-offset-1 hover:ring-2 hover:ring-ring",
                          color,
                          option.color === color && "ring-2 ring-ring",
                        )}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => removeOption(option.id)}
                aria-label={`Excluir op´┐¢´┐¢o ${option.label}`}
                title="Excluir op´┐¢´┐¢o"
                className="flex h-7 w-7 flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" className="h-7" onClick={addOption}>
        <Plus className="h-3.5 w-3.5" />
        Adicionar op´┐¢´┐¢o
      </Button>
    </div>
  );
}


/** Detalhes inline de uma op´┐¢´┐¢o de status: renomear, recolorir e excluir. */
function StatusOptionDetails({
  option,
  colorFor,
  setColorFor,
  onUpdate,
  onRemove,
}: {
  option: SelectOption;
  colorFor: string | null;
  setColorFor: (updater: (cur: string | null) => string | null) => void;
  onUpdate: (id: string, patch: Partial<SelectOption>) => void;
  onRemove: (id: string) => void;
}) {
  /** Bot´┐¢o da cor ´┐¢ usado para ancorar a paleta fora do container rol´┐¢vel. */
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  /**
   * Posi´┐¢´┐¢o (relativa ´┐¢ viewport) da paleta de cores, calculada ao abrir.
   * A paleta ´┐¢ renderizada num portal com `position: fixed` para N´┐¢O contar
   * como transbordamento rol´┐¢vel do popover. Sem isso, abrir a paleta dentro de
   * um sub-popover com `overflow-y-auto` faz aparecer uma barra de rolagem.
   */
  const [palettePos, setPalettePos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  /** Abre/fecha a paleta de cores, posicionando-a sobre o bot´┐¢o. */
  function togglePalette() {
    if (colorFor === option.id) {
      setColorFor(() => null);
      setPalettePos(null);
      return;
    }
    const rect = colorBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const paletteWidth = 128; // w-28
      const paletteHeight = 120;
      const left = Math.min(rect.left, window.innerWidth - paletteWidth - 8);
      const openUp = rect.bottom + paletteHeight > window.innerHeight;
      setPalettePos({
        top: openUp ? rect.top - paletteHeight : rect.bottom + 4,
        left: Math.max(8, left),
      });
    }
    setColorFor(() => option.id);
  }

  return (
    <div className="mb-1 ml-6 flex items-center gap-1.5 rounded border bg-muted/30 p-1.5">
      <button
        ref={colorBtnRef}
        type="button"
        onClick={togglePalette}
        aria-label={`Cor da op´┐¢´┐¢o ${option.label}`}
        aria-expanded={colorFor === option.id}
        title="Alterar cor"
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
      >
        <span className={cn("h-3.5 w-3.5 rounded-full", option.color)} />
      </button>
      {colorFor === option.id && palettePos
        ? createPortal(
            <div
              data-option-color-palette
              style={{ top: palettePos.top, left: palettePos.left }}
              className="fixed z-[60] grid w-28 grid-cols-5 gap-1 rounded-md border bg-popover p-2 shadow-lg"
            >
              {OPTION_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    onUpdate(option.id, { color });
                    setColorFor(() => null);
                    setPalettePos(null);
                  }}
                  aria-label="Escolher cor"
                  className={cn(
                    "h-4 w-4 rounded-full ring-offset-1 hover:ring-2 hover:ring-ring",
                    color,
                    option.color === color && "ring-2 ring-ring",
                  )}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
      <Input
        value={option.label}
        onChange={(e) => onUpdate(option.id, { label: e.target.value })}
        className="h-7 min-w-0 flex-1 border-0 px-1 shadow-none"
        aria-label={`Nome da op´┐¢´┐¢o ${option.label}`}
      />
      <button
        type="button"
        onClick={() => onRemove(option.id)}
        aria-label={`Excluir op´┐¢´┐¢o ${option.label}`}
        title="Excluir op´┐¢´┐¢o"
        className="flex h-7 w-7 flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Editor de status em **abas de categoria** (A fazer / Em andamento /
 * Conclu´┐¢dos). Cada aba lista as op´┐¢´┐¢es daquela categoria e permite
 * renomear, recolorir, excluir e adicionar novas op´┐¢´┐¢es ´┐¢ reutilizando os
 * mesmos controles do editor de status agrupado.
 */
function StatusCategoryTabs({
  options,
  onChange,
}: {
  options: SelectOption[];
  onChange: (options: SelectOption[]) => void;
}) {
  /** Aba (categoria) ativa. */
  const [active, setActive] = useState<StatusCategory>("todo");
  /** Id da op´┐¢´┐¢o com os detalhes (nome/cor) expandidos. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Id da op´┐¢´┐¢o cuja paleta de cores est´┐¢ aberta (dentro dos detalhes). */
  const [colorFor, setColorFor] = useState<string | null>(null);

  function categoryOf(option: SelectOption): StatusCategory {
    return option.category ?? "todo";
  }

  function addOption(category: StatusCategory) {
    onChange([
      ...options,
      {
        id: newOptionId(),
        label: "Nova op´┐¢´┐¢o",
        color: OPTION_COLORS[options.length % OPTION_COLORS.length],
        category,
      },
    ]);
  }

  function updateOption(id: string, patch: Partial<SelectOption>) {
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function removeOption(id: string) {
    onChange(options.filter((o) => o.id !== id));
  }

  const items = options.filter((o) => categoryOf(o) === active);

  return (
    <div className="space-y-2">
      <div
        role="tablist"
        aria-label="Categorias de status"
        className="flex gap-1 rounded-md bg-muted/50 p-1"
      >
        {STATUS_CATEGORIES.map((category) => {
          const isActive = active === category.key;
          return (
            <button
              key={category.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setActive(category.key);
                setEditingId(null);
                setColorFor(null);
              }}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center rounded px-1.5 py-1.5 text-center text-[11px] font-medium leading-tight",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {category.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-0.5">
        <ul className="space-y-0.5">
          {items.length === 0 ? (
            <li className="px-1 py-0.5 text-xs text-muted-foreground">
              Nenhuma op´┐¢´┐¢o.
            </li>
          ) : (
            items.map((option) => {
              const expanded = editingId === option.id;
              return (
                <li key={option.id} className="rounded">
                  <div className="flex items-center gap-1 rounded hover:bg-accent/60">
                    <GripVertical className="ml-1 h-3.5 w-3.5 flex-none text-muted-foreground/60" />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId((cur) =>
                          cur === option.id ? null : option.id,
                        );
                        setColorFor(null);
                      }}
                      aria-expanded={expanded}
                      aria-label={`Editar op´┐¢´┐¢o ${option.label}`}
                      title="Editar op´┐¢´┐¢o"
                      className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                    >
                      <Chip option={option} />
                      <ChevronRight
                        className={cn(
                          "ml-auto h-3.5 w-3.5 flex-none text-muted-foreground transition-transform",
                          expanded && "rotate-90",
                        )}
                      />
                    </button>
                  </div>
                  {expanded ? (
                    <StatusOptionDetails
                      option={option}
                      colorFor={colorFor}
                      setColorFor={setColorFor}
                      onUpdate={updateOption}
                      onRemove={removeOption}
                    />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>

        <button
          type="button"
          onClick={() => addOption(active)}
          aria-label={`Adicionar op´┐¢´┐¢o em ${STATUS_CATEGORIES.find((c) => c.key === active)?.label ?? ""}`}
          className="flex w-full items-center gap-2 rounded px-1 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova op´┐¢´┐¢o
        </button>
      </div>
    </div>
  );
}
/**
 * Popover de **Op´┐¢´┐¢es** de uma propriedade do tipo Sele´┐¢´┐¢o (estilo Notion),
 * aberto a partir do bot´┐¢o "Editar propriedade" no cabe´┐¢alho da coluna. Exibe um
 * cabe´┐¢alho "Op´┐¢´┐¢es" com um bot´┐¢o "+" e a lista de op´┐¢´┐¢es (chip colorido +
 * seta); ao clicar numa op´┐¢´┐¢o, expande os detalhes para renomear, recolorir e
 * excluir ´┐¢ reutilizando os mesmos controles do editor de status.
 */
function SelectOptionsPopover({
  options,
  onChange,
}: {
  options: SelectOption[];
  onChange: (options: SelectOption[]) => void;
}) {
  /** Id da op´┐¢´┐¢o com os detalhes (nome/cor) expandidos. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Id da op´┐¢´┐¢o cuja paleta de cores est´┐¢ aberta (dentro dos detalhes). */
  const [colorFor, setColorFor] = useState<string | null>(null);

  function addOption() {
    const created = {
      id: newOptionId(),
      label: "Nova op´┐¢´┐¢o",
      color: OPTION_COLORS[options.length % OPTION_COLORS.length],
    };
    onChange([...options, created]);
    // J´┐¢ abre os detalhes da op´┐¢´┐¢o rec´┐¢m-criada para edi´┐¢´┐¢o imediata.
    setEditingId(created.id);
    setColorFor(null);
  }

  function updateOption(id: string, patch: Partial<SelectOption>) {
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function removeOption(id: string) {
    onChange(options.filter((o) => o.id !== id));
    setEditingId((cur) => (cur === id ? null : cur));
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-muted-foreground">
          Op´┐¢´┐¢es
        </span>
        <button
          type="button"
          onClick={addOption}
          aria-label="Adicionar op´┐¢´┐¢o"
          title="Adicionar op´┐¢´┐¢o"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {options.length === 0 ? (
        <p className="px-1 py-1 text-xs text-muted-foreground">
          Nenhuma op´┐¢´┐¢o ainda.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {options.map((option) => {
            const expanded = editingId === option.id;
            return (
              <li key={option.id} className="rounded">
                <div
                  className={cn(
                    "flex items-center gap-1 rounded px-1 py-1 hover:bg-accent/60",
                    expanded && "bg-accent/60",
                  )}
                >
                  <GripVertical className="h-3.5 w-3.5 flex-none text-muted-foreground/60" />
                  <button
                    type="button"
                    onClick={() =>
                      setEditingId((cur) => (cur === option.id ? null : option.id))
                    }
                    aria-expanded={expanded}
                    aria-label={`Editar op´┐¢´┐¢o ${option.label}`}
                    title="Editar op´┐¢´┐¢o"
                    className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
                  >
                    <Chip option={option} />
                    <ChevronRight
                      className={cn(
                        "ml-auto h-3.5 w-3.5 flex-none text-muted-foreground transition-transform",
                        expanded && "rotate-90",
                      )}
                    />
                  </button>
                </div>
                {expanded ? (
                  <StatusOptionDetails
                    option={option}
                    colorFor={colorFor}
                    setColorFor={setColorFor}
                    onUpdate={updateOption}
                    onRemove={removeOption}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}



/**
 * Popover de configura´┐¢´┐¢es da tabela (database), ancorado logo abaixo do bot´┐¢o
 * de configura´┐¢´┐¢es. Permite renomear a tabela, gerenciar propriedades (colunas)
 * e excluir a tabela inteira.
 * Componente de n´┐¢vel de m´┐¢dulo para preservar o estado dos campos entre renders.
 */
interface TableSettingsPopoverProps {
  open: boolean;
  /** Elemento ao qual o popover fica ancorado (bot´┐¢o de configura´┐¢´┐¢es). */
  anchorEl?: HTMLElement | null;
  title: string;
  columns: Column[];
  /** Renomeia a tabela. */
  onRename: (name: string) => void;
  /** Atualiza nome/tipo de uma coluna. */
  onUpdateColumn: (id: string, patch: Partial<Column>) => void;
  /** Adiciona uma nova coluna. */
  onAddColumn: () => void;
  /** Remove uma coluna. */
  onRemoveColumn: (id: string) => void;
  /** Exclui a tabela inteira. */
  onDeleteDatabase: () => void;
  /** Tela exibida ao abrir o popover (padr´┐¢o: menu principal). */
  initialView?: "menu" | "edit" | "visibility";
  onClose: () => void;
}

function TableSettingsPopover({
  open,
  anchorEl,
  title,
  columns,
  onRename,
  onUpdateColumn,
  onAddColumn,
  onRemoveColumn,
  onDeleteDatabase,
  initialView = "menu",
  onClose,
}: TableSettingsPopoverProps) {
  /** Confirma´┐¢´┐¢o em duas etapas para excluir a tabela. */
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Id da coluna que est´┐¢ com o seletor de tipo aberto. */
  const [openTypeFor, setOpenTypeFor] = useState<string | null>(null);
  /** Tela interna ativa do popover. */
  const [view, setView] = useState<"menu" | "edit" | "visibility">("menu");
  /** Id da coluna cujo editor de op´┐¢´┐¢es (select/multi_select) est´┐¢ aberto. */
  const [openOptionsFor, setOpenOptionsFor] = useState<string | null>(null);

  // Volta para a tela inicial (menu ou edi´┐¢´┐¢o) sempre que o popover reabre.
  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);

  /** Posi´┐¢´┐¢o (top/right) do popover, ancorado abaixo do bot´┐¢o de configura´┐¢´┐¢es. */
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Posiciona o popover logo abaixo do bot´┐¢o ´┐¢ncora, alinhado ´┐¢ direita.
  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setPos(null);
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }, [open, anchorEl]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="absolute flex max-h-[80vh] w-96 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-lg border bg-popover shadow-xl"
        style={pos ? { top: pos.top, right: pos.right } : { top: -9999, right: 0 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Configura´┐¢´┐¢es da tabela"
      >
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          {view !== "menu" ? (
            <button
              type="button"
              onClick={() => setView("menu")}
              aria-label="Voltar"
              title="Voltar"
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Settings2 className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-base font-semibold">
            {view === "menu"
              ? "Configura´┐¢´┐¢es da tabela"
              : view === "edit"
                ? "Editar propriedades"
                : "Visibilidade de propriedades"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
          {view === "menu" ? (
            <>
              {/* Nome da tabela */}
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                  Nome da tabela
                </label>
                <Input
                  value={title}
                  onChange={(e) => onRename(e.target.value)}
                  placeholder="Nome da tabela"
                  aria-label="Nome da tabela"
                />
              </div>

              {/* A´┐¢´┐¢es de propriedades */}
              <div className="space-y-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Propriedades
                </span>
                <button
                  type="button"
                  onClick={() => setView("edit")}
                  className="flex w-full items-center gap-3 rounded border bg-background px-3 py-2.5 text-left hover:bg-accent"
                >
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">Editar propriedades</span>
                    <span className="block text-xs text-muted-foreground">
                      Renomear, alterar tipos ou excluir propriedades.
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => setView("visibility")}
                  className="flex w-full items-center gap-3 rounded border bg-background px-3 py-2.5 text-left hover:bg-accent"
                >
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">
                      Visibilidade de propriedades
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Escolha quais propriedades aparecem na tabela.
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </>
          ) : view === "edit" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Propriedades
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7"
                  onClick={onAddColumn}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar propriedade
                </Button>
              </div>
              <ul className="space-y-1.5">
              {columns.map((column) => {
                const meta = columnTypeMeta(column.type);
                const TypeIcon = columnIcon(column);
                const isTypeOpen = openTypeFor === column.id;
                return (
                  <li
                    key={column.id}
                    className="flex flex-wrap items-center gap-2 rounded border bg-background px-2 py-1.5"
                  >
                    <TypeIcon className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                    <Input
                      value={column.name}
                      onChange={(e) => onUpdateColumn(column.id, { name: e.target.value })}
                      className="h-7 min-w-0 flex-1 border-0 px-1 shadow-none"
                      aria-label={`Nome da propriedade ${column.name}`}
                    />
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenTypeFor((cur) => (cur === column.id ? null : column.id))
                        }
                        className="flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={`Tipo da propriedade ${column.name}`}
                        title="Alterar tipo"
                      >
                        {meta.label}
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      {isTypeOpen ? (
                        <div className="absolute right-0 top-8 z-10 w-48 overflow-hidden rounded-md border bg-popover py-1 shadow-lg">
                          {COLUMN_TYPES.map((t) => {
                            const OptIcon = t.icon;
                            return (
                              <button
                                key={t.type}
                                type="button"
                                onClick={() => {
                                  onUpdateColumn(column.id, { type: t.type });
                                  setOpenTypeFor(null);
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent",
                                  column.type === t.type && "bg-accent",
                                )}
                              >
                                <OptIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                {t.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    {column.type === "select" ||
                    column.type === "status" ||
                    column.type === "multi_select" ? (
                      <button
                        type="button"
                        onClick={() =>
                          setOpenOptionsFor((cur) => (cur === column.id ? null : column.id))
                        }
                        aria-label={`Editar op´┐¢´┐¢es de ${column.name}`}
                        aria-expanded={openOptionsFor === column.id}
                        title="Editar op´┐¢´┐¢es"
                        className={cn(
                          "flex h-7 flex-none items-center gap-1 rounded px-2 text-xs hover:bg-accent hover:text-foreground",
                          openOptionsFor === column.id
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <Tags className="h-3.5 w-3.5" />
                        Op´┐¢´┐¢es
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onUpdateColumn(column.id, { hidden: !column.hidden })}
                      aria-label={`${column.hidden ? "Mostrar" : "Ocultar"} propriedade ${column.name}`}
                      aria-pressed={!column.hidden}
                      title={column.hidden ? "Mostrar propriedade" : "Ocultar propriedade"}
                      className={cn(
                        "flex h-7 w-7 flex-none items-center justify-center rounded hover:bg-accent",
                        column.hidden ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {column.hidden ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveColumn(column.id)}
                      aria-label={`Excluir propriedade ${column.name}`}
                      title="Excluir propriedade"
                      className="flex h-7 w-7 flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {openOptionsFor === column.id ? (
                      <div className="basis-full">
                        <SelectOptionsEditor
                          options={editableOptionsForColumn(column)}
                          onChange={(options) => onUpdateColumn(column.id, { options })}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            </div>
          ) : (
            <div className="space-y-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Propriedades
              </span>
              <ul className="space-y-1.5">
                {columns.map((column) => {
                  const TypeIcon = columnIcon(column);
                  return (
                    <li
                      key={column.id}
                      className="flex items-center gap-2 rounded border bg-background px-2 py-1.5"
                    >
                      <TypeIcon className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                      <span className="flex-1 truncate text-sm">{column.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateColumn(column.id, { hidden: !column.hidden })
                        }
                        aria-label={`${column.hidden ? "Mostrar" : "Ocultar"} propriedade ${column.name}`}
                        aria-pressed={!column.hidden}
                        title={column.hidden ? "Mostrar propriedade" : "Ocultar propriedade"}
                        className={cn(
                          "flex h-7 w-7 flex-none items-center justify-center rounded hover:bg-accent",
                          column.hidden ? "text-muted-foreground" : "text-foreground",
                        )}
                      >
                        {column.hidden ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {/* Zona de perigo: excluir tabela */}
          <div className="space-y-2 rounded border border-destructive/30 bg-destructive/5 px-3 py-3">
            <span className="block text-[11px] uppercase tracking-wide text-destructive">
              Zona de perigo
            </span>
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Excluir a tabela e todos os itens? Essa a´┐¢´┐¢o ´┐¢ permanente.
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7"
                    onClick={onDeleteDatabase}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir tabela
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Excluir esta tabela definitivamente.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir tabela
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={onClose}>
              Conclu´┐¢do
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


/**
 * Tela do app "Database".
 * Mostra a lista de databases e, ao abrir um, a tabela correspondente.
 * Os dados s´┐¢o persistidos no Supabase (por usu´┐¢rio, via RLS) com atualiza´┐¢´┐¢es
 * otimistas: o estado local ´┐¢ atualizado na hora e a escrita roda em background,
 * com refetch para reverter em caso de erro.
 */
export function DatabaseView() {
  const [databases, setDatabases] = useState<DatabaseModel[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  /** Categorias de projetos do usu´┐¢rio (compartilhadas e ordenadas por `position`). */
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Projeto ativo no Workspace. `null` = tela de projetos; id = databases do projeto.
  const activeProjectId = useCalendarStore((s) => s.activeProjectId);
  const setActiveProjectId = useCalendarStore((s) => s.setActiveProjectId);
  // Pedido pendente para a tela de database vindo da sidebar do calend´┐¢rio
  // (ex.: "Adicionar database" com cria´┐¢´┐¢o ou abertura de um existente).
  const pendingDatabaseRequest = useCalendarStore((s) => s.pendingDatabaseRequest);
  const consumeDatabaseRequest = useCalendarStore((s) => s.consumeDatabaseRequest);
  // Mant´┐¢m a lista fixada na sidebar do calend´┐¢rio sincronizada com delete/rename.
  // Um database s´┐¢ entra na sidebar se for adicionado pelo bot´┐¢o "Adicionar
  // database" (na pr´┐¢pria sidebar) ´┐¢ criar pela tela de database N´┐¢O o fixa.
  const sidebarDatabases = useCalendarStore((s) => s.sidebarDatabases);
  const addSidebarDatabase = useCalendarStore((s) => s.addSidebarDatabase);
  const updateSidebarDatabase = useCalendarStore((s) => s.updateSidebarDatabase);
  const removeSidebarDatabase = useCalendarStore((s) => s.removeSidebarDatabase);

  const selected = useMemo(
    () => databases.find((d) => d.id === selectedId) ?? null,
    [databases, selectedId],
  );

  // Projeto ativo resolvido: s´┐¢ ´┐¢ v´┐¢lido se existir na lista carregada. Se o
  // id salvo em localStorage apontar para um projeto removido, volta ´┐¢ lista.
  const resolvedProjectId = useMemo(
    () => (projects.some((p) => p.id === activeProjectId) ? activeProjectId : null),
    [projects, activeProjectId],
  );

  /*
   * N´┐¢o existe mais uma tela de "selecionar projeto": quando nenhum projeto
   * est´┐¢ ativo (primeiro uso ou id removido), seleciona automaticamente o
   * primeiro projeto da lista para ir direto ´┐¢ lista de databases dele.
   */
  useEffect(() => {
    if (resolvedProjectId) return;
    const first = projects[0];
    if (first) setActiveProjectId(first.id);
  }, [resolvedProjectId, projects, setActiveProjectId]);

  // Databases vis´┐¢veis na tela atual: quando h´┐¢ um projeto ativo, mostra apenas
  // os databases daquele projeto.
  const projectDatabases = useMemo(
    () => databases.filter((d) => d.projectId === resolvedProjectId),
    [databases, resolvedProjectId],
  );

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

  // Espelho sempre atualizado da lista de databases. Usado para ler os valores
  // atuais de uma linha de forma s´┐¢ncrona ao persistir edi´┐¢´┐¢es de c´┐¢lula
  // (o updater do setState roda depois e n´┐¢o pode alimentar vari´┐¢veis externas).
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

  /** Recarrega todos os databases, projetos e categorias (mount e revers´┐¢o de erros). */
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
        const [data, projectList, categoryList] = await Promise.all([
          fetchDatabases(),
          fetchProjects(),
          fetchProjectCategories(),
        ]);
        if (cancelled) return;
        // Gera automaticamente os itens recorrentes que "venceram" (idempotente),
        // garantindo que o database mostre os itens mesmo sem abrir o calend´┐¢rio.
        const generated = await runAutoTemplates(data);
        if (cancelled) return;
        const merged = data.map((db) => {
          const change = generated.find((g) => g.databaseId === db.id);
          return change ? change.database : db;
        });
        setDatabases(merged);
        setProjects(projectList);
        setCategories(categoryList);
        setError(null);
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

  /** Executa uma escrita em background revertendo via refetch em caso de erro. */
  const persist = useCallback(
    (action: () => Promise<unknown>) => {
      void action().catch((err) => {
        setError((err as Error).message || "Falha ao salvar");
        void reload();
      });
    },
    [reload],
  );


  /* ----------------------------- Databases ----------------------------- */

  const handleCreate = useCallback(
    async (
      input?: { name?: string; icon?: string | null },
      pinToSidebar = false,
      projectId: string | null = activeProjectId,
    ) => {
      try {
        // Sem projeto expl´┐¢cito (ex.: cria´┐¢´┐¢o pela sidebar do calend´┐¢rio),
        // garante o projeto padr´┐¢o "Geral" para o database n´┐¢o ficar ´┐¢rf´┐¢o.
        let targetProject = projectId;
        if (!targetProject) {
          targetProject = await ensureDefaultProject();
          // Reflete o projeto rec´┐¢m-garantido na lista local, se ainda n´┐¢o estiver.
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
          // Mant´┐¢m o Workspace apontando para o projeto padr´┐¢o para que o database
          // criado fique vis´┐¢vel na p´┐¢gina de databases.
          setActiveProjectId(targetProject);
        }
        const db = await createDatabase(
          input?.name?.trim() || "Novo database",
          input?.icon ?? null,
          targetProject,
        );
        setDatabases((prev) => [...prev, db]);
        setSelectedId(db.id);
        // S´┐¢ fixa na sidebar do calend´┐¢rio quando a cria´┐¢´┐¢o partiu do bot´┐¢o
        // "Adicionar database" da pr´┐¢pria sidebar. Criar pela tela de database
        // n´┐¢o deve injetar o item na sidebar do calend´┐¢rio.
        if (pinToSidebar) addSidebarDatabase({ id: db.id, name: db.name, icon: db.icon });
      } catch (err) {
        setError((err as Error).message || "Falha ao criar database");
      }
    },
    [activeProjectId, addSidebarDatabase, setActiveProjectId],
  );

  // Atende o pedido disparado pela sidebar do calend´┐¢rio assim que a tela de
  // database estiver pronta (lista inicial carregada): cria um novo database ou
  // abre um existente, e limpa o pedido (evita repetir a cada render).
  useEffect(() => {
    if (!pendingDatabaseRequest || loading) return;
    consumeDatabaseRequest();
    if (pendingDatabaseRequest.type === "create") {
      // Veio do bot´┐¢o "Adicionar database" da sidebar: fixa o novo database l´┐¢.
      void handleCreate(undefined, true);
    } else {
      // Abre um database existente: garante que o Workspace aponte para o
      // projeto ao qual ele pertence, para que a tela de databases o exiba.
      const target = databases.find((d) => d.id === pendingDatabaseRequest.id);
      if (target) setActiveProjectId(target.projectId);
      setSelectedId(pendingDatabaseRequest.id);
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
      setDatabases((prev) => prev.filter((d) => d.id !== id));
      setSelectedId((current) => (current === id ? null : current));
      removeSidebarDatabase(id);
      persist(() => deleteDatabase(id));
    },
    [persist, removeSidebarDatabase],
  );

  /* ----------------------------- Projetos ------------------------------ */

  /** Abre um projeto: passa a exibir os databases daquele projeto. */
  const handleOpenProject = useCallback(
    (id: string) => {
      setSelectedId(null);
      setActiveProjectId(id);
    },
    [setActiveProjectId],
  );

  /**
   * Cria um projeto com os dados informados (nome, categoria e cor) e entra nele
   * imediatamente, de modo que a p´┐¢gina de databases daquele projeto (vazia,
   * inicialmente) ´┐¢ exibida.
   */
  const handleCreateProject = useCallback(
    async (input: NewProjectInput) => {
      try {
        // Garante que a categoria usada exista na tabela de categorias do usu´┐¢rio
        // (com a ordem persistida). N´┐¢o bloqueia a cria´┐¢´┐¢o do projeto em caso de erro.
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
   * quando o usu´┐¢rio confirma uma categoria no popover, para que ela persista com
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
   * Persiste a nova ordem das categorias ap´┐¢s um arraste (drag & drop). Faz uma
   * atualiza´┐¢´┐¢o otimista local e grava `position` em background.
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
   * Persiste a nova ordem dos projetos ap´┐¢s um arraste (drag & drop) na sidebar.
   * Faz uma atualiza´┐¢´┐¢o otimista local (reordena `projects`) e grava `position`
   * em background.
   */
  const handleReorderProjects = useCallback(
    (orderedIds: string[]) => {
      // Atualiza de forma FUNCIONAL e reordena apenas os ids presentes na lista
      // atual. Ids ausentes (ex.: projeto recem-criado cujo estado ainda nao
      // chegou, ou filtrado) NAO abortam mais o reorder ÔÇö antes um unico id
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
   * Renomeia e/ou recolore uma categoria de projetos. A grava´┐¢´┐¢o acontece no
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
    [reload],
  );


  const handleDeleteProject = useCallback(
    (id: string) => {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      // Os databases do projeto s´┐¢o removidos em cascata no banco.
      setDatabases((prev) => prev.filter((d) => d.projectId !== id));
      if (activeProjectId === id) setActiveProjectId(null);
      persist(() => deleteProject(id));
    },
    [activeProjectId, persist, setActiveProjectId],
  );

  /* ------------------------------- A´┐¢´┐¢es ------------------------------- */

  const handleRename = useCallback(
    (id: string, name: string) => {
      patchDatabase(id, { name });
      // Renomear reflete na sidebar apenas se o database j´┐¢ estiver fixado l´┐¢.
      // Nunca adiciona um database novo ´┐¢ sidebar por causa de um rename.
      if (sidebarDatabases.some((d) => d.id === id)) {
        const current = sidebarDatabases.find((d) => d.id === id);
        updateSidebarDatabase({ id, name, icon: current?.icon });
      }
      persist(() => updateDatabaseName(id, name));
    },
    [patchDatabase, persist, sidebarDatabases, updateSidebarDatabase],
  );

  /** Define (ou limpa) o ├¡cone escolhido do database, refletindo na sidebar. */
  const handleUpdateIcon = useCallback(
    (id: string, icon: string | null) => {
      patchDatabase(id, { icon });
      // Atualiza a sidebar apenas se o database j├í estiver fixado l├í.
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
    (id: string, initialValues?: Record<string, CellValue>) => {
      const db = databases.find((d) => d.id === id);
      if (!db) return;
      const values = emptyValuesFor(db.columns);
      if (db.templates[0]) values[PAGE_CONTENT_KEY] = ensureHtml(db.templates[0].content);
      if (initialValues) {
        for (const [key, val] of Object.entries(initialValues)) {
          values[key] = val;
        }
      }
      persist(async () => {
        const row = await createRow(id, values, db.rows.length);
        patchDatabase(id, (d) => ({ rows: [...d.rows, row] }));
      });
    },
    [databases, patchDatabase, persist],
  );

  const handleApplyTemplate = useCallback(
    (id: string, template: PageTemplate) => {
      const db = databases.find((d) => d.id === id);
      if (!db) return;
      const values = emptyValuesFor(db.columns);
      // Usa o nome do modelo como t´┐¢tulo (primeira coluna) quando for texto.
      const first = db.columns[0];
      if (first && (first.type === "text" || first.type === "person")) {
        values[first.id] = template.name;
      }
      // Aplica o conte´┐¢do do modelo (com recorr´┐¢ncia) ´┐¢ p´┐¢gina do novo item.
      values[PAGE_CONTENT_KEY] = templateContentHtml(template);
      persist(async () => {
        const row = await createRow(id, values, db.rows.length);
        patchDatabase(id, (d) => ({ rows: [...d.rows, row] }));
      });
    },
    [databases, patchDatabase, persist],
  );

  const handleUpdateCell = useCallback(
    (
      databaseId: string,
      rowId: string,
      columnId: string,
      value: CellValue,
    ) => {
      // L´┐¢ os valores atuais da linha de forma s´┐¢ncrona (antes do setState).
      const db = databasesRef.current.find((d) => d.id === databaseId);
      const currentRow = db?.rows.find((r) => r.id === rowId);
      if (!currentRow) return;

      const nextValues: Record<string, CellValue> = {
        ...currentRow.values,
        [columnId]: value,
      };

      // Atualiza o espelho imediatamente para que edi´┐¢´┐¢es r´┐¢pidas em sequ´┐¢ncia
      // (ex.: digita´┐¢´┐¢o) sempre partam do valor mais recente, sem depender do
      // commit/efeito do React.
      databasesRef.current = databasesRef.current.map((d) =>
        d.id !== databaseId
          ? d
          : {
              ...d,
              rows: d.rows.map((r) =>
                r.id === rowId ? { ...r, values: nextValues } : r,
              ),
            },
      );

      patchDatabase(databaseId, (d) => ({
        rows: d.rows.map((r) =>
          r.id === rowId ? { ...r, values: { ...r.values, [columnId]: value } } : r,
        ),
      }));

      persist(() => updateRowValues(rowId, nextValues));
    },
    [patchDatabase, persist],
  );

  const handleDeleteRow = useCallback(
    (databaseId: string, rowId: string) => {
      patchDatabase(databaseId, (d) => ({
        rows: d.rows.filter((r) => r.id !== rowId),
      }));
      persist(() => deleteRow(rowId));
    },
    [patchDatabase, persist],
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

  const handleBack = useCallback(() => setSelectedId(null), []);

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
   * Sem projeto ativo (instante inicial, antes da auto-sele´┐¢´┐¢o do primeiro
   * projeto): mostra apenas a sidebar. O efeito acima seleciona o primeiro
   * projeto e a tela passa a listar os databases dele.
   */
  if (!resolvedProjectId) {
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ProjectsSidebar
          projects={projectSummaries}
          categories={categories}
          activeProjectId={resolvedProjectId}
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
          onCreateCategory={handleCreateCategory}
          onReorderCategories={handleReorderCategories}
          onReorderProjects={handleReorderProjects}
          onUpdateProject={handleUpdateProject}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
          onDeleteProject={handleDeleteProject}
        />
      </div>
    );
  }

  // Com projeto ativo e nenhum database selecionado: lista os databases do projeto.
  if (!selected) {
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ProjectsSidebar
          projects={projectSummaries}
          categories={categories}
          activeProjectId={resolvedProjectId}
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
          onCreateCategory={handleCreateCategory}
          onReorderCategories={handleReorderCategories}
          onReorderProjects={handleReorderProjects}
          onUpdateProject={handleUpdateProject}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
          onDeleteProject={handleDeleteProject}
        />
        <DatabasesScreen
          databases={projectDatabases.map((d) => ({
            id: d.id,
            name: d.name,
            icon: d.icon,
            rowCount: d.rows.length,
            columnCount: d.columns.length,
          }))}
          onOpen={setSelectedId}
          onCreate={(input) => void handleCreate(input)}
          onDelete={handleDelete}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ProjectsSidebar
        projects={projectSummaries}
        categories={categories}
        activeProjectId={resolvedProjectId}
        onOpenProject={handleOpenProject}
        onCreateProject={handleCreateProject}
        onCreateCategory={handleCreateCategory}
        onReorderCategories={handleReorderCategories}
        onReorderProjects={handleReorderProjects}
        onUpdateProject={handleUpdateProject}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
        onDeleteProject={handleDeleteProject}
      />
      <DatabaseTable
        key={selected.id}
        database={selected}
        onRename={handleRename}
        onUpdateIcon={handleUpdateIcon}
        onUpdateColumns={handleUpdateColumns}
        onAddRow={handleAddRow}
        onUpdateCell={handleUpdateCell}
        onDeleteRow={handleDeleteRow}
        onReorderRows={handleReorderRows}
        onAddTemplate={handleAddTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onApplyTemplate={handleApplyTemplate}
        onDeleteDatabase={handleDelete}
        onBack={handleBack}
      />
    </div>
  );
}

