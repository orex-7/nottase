import { ChartColumn, SquareKanban, Table2 } from "lucide-react";

import { kanbanGroupColumns } from "@/components/database/database-fields";
import { isChartConfig, type ChartConfig } from "@/components/database/database-chart";
import type { Column } from "@/types/database";

/** Tipo de visualização de um database (estilo "view" do Notion). */
export type DbViewType = "table" | "kanban" | "chart";

/** Uma visualização criada pelo usuário sobre o mesmo database. */
export interface DbView {
  id: string;
  type: DbViewType;
  name: string;
  /** Filtros da visualização (independentes por visualização). */
  filters?: {
    columnIds: string[];
    values: Record<string, string>;
    /** Operador por propriedade (is | is_not | is_empty | is_not_empty). */
    operators?: Record<string, string>;
  };
  /** Configuração do gráfico (independente por visualização; só p/ tipo chart). */
  chart?: ChartConfig;
}

/** Gera um id único para uma nova visualização criada no cliente. */
export function newViewId(): string {
  return `view_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Referências vazias estáveis (evitam recriar arrays/objetos a cada render). */
export const EMPTY_FILTER_IDS: string[] = [];
export const EMPTY_FILTER_VALUES: Record<string, string> = {};

/** ícone e rótulo padrão de cada tipo de visualização. */
export const VIEW_TYPES: {
  type: DbViewType;
  label: string;
  icon: typeof Table2;
}[] = [
  { type: "table", label: "Tabela", icon: Table2 },
  { type: "kanban", label: "Kanban", icon: SquareKanban },
  { type: "chart", label: "Gráfico", icon: ChartColumn },
];

/** Metadados (ícone/rótulo) de um tipo de visualização. */
export function viewTypeMeta(type: DbViewType) {
  return VIEW_TYPES.find((v) => v.type === type) ?? VIEW_TYPES[0];
}

/**
 * Cria a lista inicial de visualizações de um database: uma tabela por padrão,
 * além de um Kanban se já existir alguma coluna agrupável (select/status).
 */
export function initialViews(columns: Column[]): DbView[] {
  const views: DbView[] = [{ id: newViewId(), type: "table", name: "Tabela" }];
  if (kanbanGroupColumns(columns).length > 0) {
    views.push({ id: newViewId(), type: "kanban", name: "Kanban" });
  }
  return views;
}

/** Estado persistido das visualizações de um database. */
export interface PersistedViews {
  views: DbView[];
  activeViewId: string;
  kanbanColumnId: string | null;
  /** Configuração da visualização "Gráfico" (opcional; usa padrão quando ausente). */
  chart?: ChartConfig;
}

/** Chave de localStorage onde as visualizações de um database são guardadas. */
function viewsStorageKey(databaseId: string): string {
  return `calendar:dbViews:${databaseId}`;
}

/** Valida, de forma defensiva, se um valor lido é uma visualização. */
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
 * Lê as visualizações salvas de um database em localStorage. Devolve `null`
 * quando não há nada válido salvo (aí o chamador usa `initialViews`).
 */
export function loadPersistedViews(databaseId: string): PersistedViews | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(viewsStorageKey(databaseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const data = parsed as Partial<PersistedViews>;
    if (!Array.isArray(data.views) || data.views.length === 0) return null;
    const views = data.views.filter(isDbView).map((v) => {
      const f = v.filters;
      return {
        ...v,
        filters:
          f && typeof f === "object"
            ? {
                columnIds: Array.isArray(f.columnIds) ? f.columnIds : [],
                values:
                  f.values && typeof f.values === "object" ? f.values : {},
                operators:
                  f.operators && typeof f.operators === "object"
                    ? f.operators
                    : {},
              }
            : undefined,
        chart: isChartConfig(v.chart) ? v.chart : undefined,
      };
    });
    if (views.length === 0) return null;
    const active =
      typeof data.activeViewId === "string" &&
      views.some((v) => v.id === data.activeViewId)
        ? data.activeViewId
        : views[0].id;
    const kanbanColumnId =
      typeof data.kanbanColumnId === "string" ? data.kanbanColumnId : null;
    // Compatibilidade: a configuração de gráfico antiga (global) migra para a
    // visualização ativa quando ela ainda não tem uma própria.
    const legacyChart = isChartConfig(data.chart) ? data.chart : undefined;
    if (legacyChart) {
      const activeView = views.find((v) => v.id === active);
      if (activeView && !activeView.chart) activeView.chart = legacyChart;
    }
    return { views, activeViewId: active, kanbanColumnId };
  } catch {
    return null;
  }
}

/** Persiste as visualizações de um database em localStorage (best-effort). */
export function savePersistedViews(databaseId: string, data: PersistedViews): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(viewsStorageKey(databaseId), JSON.stringify(data));
  } catch {
    /* ignora falhas de quota/privacidade — a UI segue com o estado em memória */
  }
}

/**
 * Copia as visualizações persistidas de um database para outro (mesmo conteúdo,
 * nova chave de localStorage). Usado ao **duplicar** um database, para que a
 * cópia já abra com as mesmas abas/filtros/gráficos. Best-effort.
 */
export function copyPersistedViews(
  fromDatabaseId: string,
  toDatabaseId: string,
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(viewsStorageKey(fromDatabaseId));
    if (!raw) return;
    window.localStorage.setItem(viewsStorageKey(toDatabaseId), raw);
  } catch {
    /* ignora falhas de quota/privacidade */
  }
}
