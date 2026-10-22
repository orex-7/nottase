import { loadPersistedViews } from "@/components/database/database-views";
import type { Column, PageTemplate } from "@/types/database";

/**
 * Índice puro (sem React) da **paleta de busca global** do Workspace: projetos,
 * categorias, databases, propriedades, visualizações e modelos. Os **itens**
 * (linhas) não entram aqui — vêm de uma RPC à parte (`searchDatabaseRows`) e são
 * convertidos em resultado por `itemResultFor`.
 *
 * A normalização é a mesma já usada no filtro de projetos da sidebar (minúsculas
 * + remoção de acentos) com correspondência por `includes` — não há fuzzy no
 * projeto.
 */

export type WorkspaceSearchKind =
  | "project"
  | "category"
  | "database"
  | "column"
  | "view"
  | "template"
  | "item";

interface SearchResultBase {
  /** Id estável do resultado (para keys de lista). */
  id: string;
  /** Texto principal exibido. */
  label: string;
  /** Contexto (ex.: nome do database/projeto). Opcional. */
  sublabel?: string;
}

export interface ProjectSearchResult extends SearchResultBase {
  kind: "project";
  projectId: string;
}

export interface CategorySearchResult extends SearchResultBase {
  kind: "category";
  /** Nome da categoria (a navegação expande o grupo correspondente). */
  name: string;
}

export interface DatabaseSearchResult extends SearchResultBase {
  kind: "database";
  databaseId: string;
  projectId: string | null;
}

export interface ColumnSearchResult extends SearchResultBase {
  kind: "column";
  databaseId: string;
  columnId: string;
  projectId: string | null;
}

export interface ViewSearchResult extends SearchResultBase {
  kind: "view";
  databaseId: string;
  viewId: string;
  projectId: string | null;
}

export interface TemplateSearchResult extends SearchResultBase {
  kind: "template";
  databaseId: string;
  projectId: string | null;
}

export interface ItemSearchResult extends SearchResultBase {
  kind: "item";
  databaseId: string;
  rowId: string;
  projectId: string | null;
}

export type WorkspaceSearchResult =
  | ProjectSearchResult
  | CategorySearchResult
  | DatabaseSearchResult
  | ColumnSearchResult
  | ViewSearchResult
  | TemplateSearchResult
  | ItemSearchResult;

/** Um resultado já indexado com o texto normalizado usado na busca. */
export interface WorkspaceIndexEntry {
  result: WorkspaceSearchResult;
  /** `label` + `sublabel` + extras, normalizados (minúsculas, sem acentos). */
  haystack: string;
}

export interface WorkspaceSearchIndex {
  entries: WorkspaceIndexEntry[];
}

/** Entrada mínima de projeto (aceita `Project` e `ProjectSummary`). */
export interface WorkspaceSearchProject {
  id: string;
  name: string;
  category: string | null;
}

/** Entrada mínima de categoria (aceita `ProjectCategory`). */
export interface WorkspaceSearchCategory {
  id: string;
  name: string;
}

/** Entrada mínima de database (aceita `Database`). */
export interface WorkspaceSearchDatabase {
  id: string;
  name: string;
  projectId: string | null;
  columns: Column[];
  templates: PageTemplate[];
}

export interface BuildWorkspaceIndexInput {
  projects: WorkspaceSearchProject[];
  categories: WorkspaceSearchCategory[];
  databases: WorkspaceSearchDatabase[];
}

/** Máximo de resultados por seção em memória (a paleta não deve crescer). */
export const SEARCH_SECTION_LIMIT = 5;

/** Máximo de itens (RPC) exibidos na paleta. */
export const SEARCH_ITEM_LIMIT = 10;

/** Minúsculas + remoção de acentos (mesma normalização do filtro da sidebar). */
export function normalizeSearchTerm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function makeEntry(
  result: WorkspaceSearchResult,
  extra: string[] = [],
): WorkspaceIndexEntry {
  const parts = [result.label, result.sublabel ?? "", ...extra].filter(
    (p) => p.length > 0,
  );
  return { result, haystack: normalizeSearchTerm(parts.join(" ")) };
}

/**
 * Constrói o índice a partir dos dados já carregados no cliente. As abas vêm de
 * `loadPersistedViews(dbId)` (uma leitura por database); databases sem abas
 * persistidas não geram resultados de visualização (os defaults não contam).
 */
export function buildWorkspaceIndex({
  projects,
  categories,
  databases,
}: BuildWorkspaceIndexInput): WorkspaceSearchIndex {
  const entries: WorkspaceIndexEntry[] = [];
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  for (const project of projects) {
    entries.push(
      makeEntry({
        kind: "project",
        id: project.id,
        label: project.name,
        sublabel: project.category ?? undefined,
        projectId: project.id,
      }),
    );
  }

  for (const category of categories) {
    entries.push(
      makeEntry({
        kind: "category",
        id: category.id,
        label: category.name,
        name: category.name,
      }),
    );
  }

  for (const db of databases) {
    const projectId = db.projectId ?? null;
    const projectName = db.projectId
      ? projectNameById.get(db.projectId)
      : undefined;

    entries.push(
      makeEntry({
        kind: "database",
        id: db.id,
        label: db.name,
        sublabel: projectName,
        databaseId: db.id,
        projectId,
      }),
    );

    for (const column of db.columns) {
      if (!column.name.trim()) continue;
      entries.push(
        makeEntry({
          kind: "column",
          id: `${db.id}:${column.id}`,
          label: column.name,
          sublabel: db.name,
          databaseId: db.id,
          columnId: column.id,
          projectId,
        }),
      );
    }

    for (const template of db.templates) {
      if (!template.name.trim()) continue;
      entries.push(
        makeEntry({
          kind: "template",
          id: `${db.id}:${template.id}`,
          label: template.name,
          sublabel: db.name,
          databaseId: db.id,
          projectId,
        }),
      );
    }

    const persisted = loadPersistedViews(db.id);
    if (persisted) {
      for (const view of persisted.views) {
        if (!view.name.trim()) continue;
        entries.push(
          makeEntry({
            kind: "view",
            id: `${db.id}:${view.id}`,
            label: view.name,
            sublabel: db.name,
            databaseId: db.id,
            viewId: view.id,
            projectId,
          }),
        );
      }
    }
  }

  return { entries };
}

/** Uma seção da paleta: um tipo de resultado com a sua lista. */
export interface WorkspaceSearchSection {
  kind: Exclude<WorkspaceSearchKind, "item">;
  results: WorkspaceSearchResult[];
}

/** Ordem fixa das seções exibidas na paleta. */
export const WORKSPACE_SEARCH_SECTION_ORDER: Exclude<
  WorkspaceSearchKind,
  "item"
>[] = ["project", "category", "database", "column", "view", "template"];

/**
 * Filtra o índice pelo termo (vazio → nenhuma seção) e devolve as seções na
 * ordem fixa, limitando cada uma a `SEARCH_SECTION_LIMIT`.
 */
export function searchWorkspace(
  index: WorkspaceSearchIndex,
  query: string,
): WorkspaceSearchSection[] {
  const needle = normalizeSearchTerm(query.trim());
  if (!needle) return [];

  const byKind = new Map<
    Exclude<WorkspaceSearchKind, "item">,
    WorkspaceSearchResult[]
  >();

  for (const { result, haystack } of index.entries) {
    if (result.kind === "item") continue;
    if (!haystack.includes(needle)) continue;
    const list = byKind.get(result.kind) ?? [];
    if (list.length >= SEARCH_SECTION_LIMIT) continue;
    list.push(result);
    byKind.set(result.kind, list);
  }

  const sections: WorkspaceSearchSection[] = [];
  for (const kind of WORKSPACE_SEARCH_SECTION_ORDER) {
    const results = byKind.get(kind);
    if (results && results.length > 0) sections.push({ kind, results });
  }
  return sections;
}

/**
 * Converte um item (linha) vindo da RPC em resultado da paleta, resolvendo o
 * nome do database e o `projectId` a partir da lista carregada.
 */
export function itemResultFor(
  hit: { databaseId: string; rowId: string; label: string },
  databases: WorkspaceSearchDatabase[],
): ItemSearchResult {
  const db = databases.find((d) => d.id === hit.databaseId);
  return {
    kind: "item",
    id: `${hit.databaseId}:${hit.rowId}`,
    label: hit.label,
    sublabel: db?.name,
    databaseId: hit.databaseId,
    rowId: hit.rowId,
    projectId: db?.projectId ?? null,
  };
}
