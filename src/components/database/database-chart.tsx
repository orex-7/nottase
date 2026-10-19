import { useMemo } from "react";
import {
  ChartArea,
  ChartColumn,
  ChartLine,
  ChartPie,
  Radar as RadarIcon,
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
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatNumberByColumn } from "@/lib/number-format";
import { cellOf, optionsForColumn } from "@/components/database/database-fields";
import type { CellValue, Column, DbRow, SelectOption } from "@/types/database";

/* -------------------------------------------------------------------------- */
/* Tipos e helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Formato de gráfico suportado pela visualização "Gráfico". */
export type ChartKind = "bar" | "line" | "area" | "pie" | "radar";

/** Como agregação dos itens por categoria (contagem ou funções numéricas). */
export type ChartAggregate = "count" | "sum" | "avg";

/** Valor usado no eixo de agregação: uma coluna numérica ou a contagem. */
export const CHART_COUNT = "__count__";

/** Configuração da visualização "Gráfico" persistida por database. */
export interface ChartConfig {
  /** Formato do gráfico (barras, linha, área ou pizza). */
  kind: ChartKind;
  /** Id da coluna usada nas categorias (eixo X / fatias). `null` = sem dados. */
  groupColumnId: string | null;
  /** Coluna numérica agregada por categoria, ou `CHART_COUNT` para contar itens. */
  valueColumnId: string;
  /** Operação aplicada aos valores de cada categoria. */
  aggregate: ChartAggregate;
}

/** Metadados (ícone/rótulo) de cada formato de gráfico. */
export const CHART_KINDS: {
  kind: ChartKind;
  label: string;
  icon: typeof ChartColumn;
}[] = [
  { kind: "bar", label: "Barras", icon: ChartColumn },
  { kind: "line", label: "Linha", icon: ChartLine },
  { kind: "area", label: "área", icon: ChartArea },
  { kind: "pie", label: "Pizza", icon: ChartPie },
  { kind: "radar", label: "Radar", icon: RadarIcon },
];

/** Rótulo das agregações disponíveis (contagem/soma/média). */
export const CHART_AGGREGATES: { value: ChartAggregate; label: string }[] = [
  { value: "count", label: "Contagem" },
  { value: "sum", label: "Soma" },
  { value: "avg", label: "Média" },
];

/** Paleta fixa (hex) para as séries/fatias do gráfico. */
export const CHART_COLORS: string[] = [
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
 * Colunas que podem servir de categoria no gráfico: seleção/status (chips),
 * caixa de seleção e data. Multi-select fica de fora por não ter valor único.
 */
export function chartGroupColumns(columns: Column[]): Column[] {
  return columns.filter(
    (c) =>
      !c.hidden &&
      (c.type === "select" ||
        c.type === "status" ||
        c.type === "checkbox" ||
        c.type === "date"),
  );
}

/** Colunas numéricas que podem ser agregadas (soma/média) no gráfico. */
export function chartNumberColumns(columns: Column[]): Column[] {
  return columns.filter((c) => !c.hidden && c.type === "number");
}

/**
 * Escolhe colunas padrão para o gráfico: prefere uma coluna de status/seleção
 * para categorias e a primeira coluna numérica para o valor (senão contagem).
 */
export function defaultChartConfig(columns: Column[]): ChartConfig {
  const groupColumns = chartGroupColumns(columns);
  const numberColumns = chartNumberColumns(columns);
  return {
    kind: "bar",
    groupColumnId: groupColumns[0]?.id ?? null,
    valueColumnId: numberColumns[0]?.id ?? CHART_COUNT,
    aggregate: numberColumns.length > 0 ? "sum" : "count",
  };
}

/** Valida, de forma defensiva, a configuração do gráfico lida do storage. */
export function isChartConfig(value: unknown): value is ChartConfig {
  if (typeof value !== "object" || value === null) return false;
  const c = value as ChartConfig;
  return (
    (c.kind === "bar" ||
      c.kind === "line" ||
      c.kind === "area" ||
      c.kind === "pie" ||
      c.kind === "radar") &&
    (typeof c.groupColumnId === "string" || c.groupColumnId === null) &&
    typeof c.valueColumnId === "string" &&
    (c.aggregate === "count" || c.aggregate === "sum" || c.aggregate === "avg")
  );
}

/** Rótulo legível de uma categoria (opção, data ou caixa de seleção). */
function chartCategoryLabel(
  row: DbRow,
  column: Column,
  options: SelectOption[],
): string {
  const value = cellOf(row, column.id);
  if (column.type === "checkbox") {
    const checked = value === "true" || value === "1";
    return checked ? "Concluído" : "Não marcado";
  }
  if (column.type === "select" || column.type === "status") {
    const raw = Array.isArray(value) ? value[0] : value;
    const option = options.find((o) => o.id === raw);
    return option ? option.label : "Sem valor";
  }
  const text = Array.isArray(value) ? value.join(", ") : value;
  return text.trim() || "Sem valor";
}

/** Converte o valor de uma célula em número (vazio/não numérico → null). */
function cellNumber(value: CellValue): number | null {
  if (Array.isArray(value)) return null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const n = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Uma linha já agregada, pronta para o gráfico (`{ label, value }`). */
interface ChartPoint {
  label: string;
  value: number;
}

/**
 * Agrupa as linhas por categoria e calcula o valor de cada grupo conforme a
 * configuração (contagem, soma ou média). Categorias sem valor numérico são
 * ignoradas nas somas/médias; em contagem todas contam.
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

/* -------------------------------------------------------------------------- */
/* Componentes                                                                 */
/* -------------------------------------------------------------------------- */

interface ChartViewProps {
  columns: Column[];
  rows: DbRow[];
  config: ChartConfig;
  /** Atualiza (e persiste) a configuração do gráfico. */
  onConfigChange: (patch: Partial<ChartConfig>) => void;
}

/**
 * Visualização "Gráfico" (estilo Notion): agrega as linhas por uma propriedade
 * de categoria e desenha barras, linha, área ou pizza. A configuração (formato,
 * eixo de categoria, valor e agregação) é escolhida na barra do topo e
 * persistida no pai. Usa Recharts (SVG responsivo) para a renderização.
 */
export function ChartView({ columns, rows, config, onConfigChange }: ChartViewProps) {
  /** Colunas que podem servir de categoria (select/status/checkbox/data). */
  const groupColumns = useMemo(() => chartGroupColumns(columns), [columns]);
  /** Colunas numéricas disponíveis para somar/média. */
  const numberColumns = useMemo(() => chartNumberColumns(columns), [columns]);

  /** Coluna de categoria efetiva (fallback para a primeira disponível). */
  const groupColumn = useMemo(() => {
    const current = groupColumns.find((c) => c.id === config.groupColumnId);
    return current ?? groupColumns[0] ?? null;
  }, [groupColumns, config.groupColumnId]);

  /** Coluna de valor efetiva: numérica escolhida ou `null` (contagem). */
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

  // Sem coluna de categoria: nada a plotar — orienta o usuário a criar uma.
  if (!groupColumn) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <ChartColumn className="h-8 w-8 opacity-60" />
        <p className="max-w-sm">
          O gráfico agrupa os itens por uma propriedade de seleção, status, data
          ou caixa de seleção. Crie uma coluna desses tipos (em &quot;Configurações da
          tabela&quot;) para usar esta visualização.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <ChartConfigBar
        config={config}
        valueColumn={valueColumn}
        onConfigChange={onConfigChange}
      />
      <div className="min-h-0 flex-1">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Nenhum dado para exibir. Adicione itens à tabela para ver o gráfico.
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
  valueColumn: Column | null;
  onConfigChange: (patch: Partial<ChartConfig>) => void;
}

/** Barra de controles do gráfico: agregação (soma/média).
 *  O formato (barras/linha/área/pizza/radar) é escolhido nas Configurações da
 *  tabela; categoria e valor são derivados automaticamente das colunas. */
function ChartConfigBar({ config, valueColumn, onConfigChange }: ChartConfigBarProps) {
  // Sem coluna numérica (contagem), não há agregação a configurar.
  if (!valueColumn) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <label className="flex items-center gap-1.5">
        Agregar
        <select
          value={config.aggregate}
          onChange={(e) =>
            onConfigChange({ aggregate: e.target.value as ChartAggregate })
          }
          className="rounded border bg-background px-1.5 py-1 text-xs text-foreground outline-none"
          aria-label="Agregação do gráfico"
        >
          {CHART_AGGREGATES.filter((a) => a.value !== "count").map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * Renderiza o gráfico escolhido (barras/linha/área/pizza/radar) com Recharts,
 * num contêiner responsivo. Cores saem da paleta fixa (`CHART_COLORS`), ciclando
 * quando há mais categorias que cores.
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

  /** Formata um valor agregado usando o formato de número da coluna de valor. */
  const formatValue = (value: number) => formatNumberByColumn(value, valueColumn);
  /** Formata os rótulos do eixo Y (evita poluir com decimais). */
  const tickFormatter = (value: number) => formatValue(value);
  /** Formata o conteúdo do tooltip do Recharts (nome + valor). */
  const tooltipFormatter = (
    value: string | number | readonly (string | number)[] | undefined,
    name: string | number | undefined,
  ): [string, string] => [
    formatValue(Number(value)),
    name === "value" || name === undefined ? "Valor" : String(name),
  ];
  /**
   * Percentual e moeda podem ter casas decimais; demais formatos (e contagem) só
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
      ) : kind === "radar" ? (
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={gridStroke} />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          />
          <PolarRadiusAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
          <Radar
            dataKey="value"
            stroke={CHART_COLORS[0]}
            fill={CHART_COLORS[0]}
            fillOpacity={0.35}
          />
        </RadarChart>
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
