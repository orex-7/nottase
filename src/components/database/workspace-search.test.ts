import { beforeEach, describe, expect, it } from "vitest";

import {
  SEARCH_SECTION_LIMIT,
  buildWorkspaceIndex,
  itemResultFor,
  normalizeSearchTerm,
  searchWorkspace,
  type WorkspaceSearchCategory,
  type WorkspaceSearchDatabase,
  type WorkspaceSearchProject,
} from "@/components/database/workspace-search";
import type { Column, PageTemplate } from "@/types/database";

/** Chave de localStorage das visualizações de um database (database-views.ts). */
function viewsKey(databaseId: string): string {
  return `calendar:dbViews:${databaseId}`;
}

function persistViews(databaseId: string, names: string[]): void {
  const views = names.map((name, index) => ({
    id: `v${index + 1}`,
    type: "table" as const,
    name,
  }));
  window.localStorage.setItem(
    viewsKey(databaseId),
    JSON.stringify({
      views,
      activeViewId: views[0]?.id ?? "",
      kanbanColumnId: null,
    }),
  );
}

const COLUMNS: Column[] = [
  { id: "name", name: "Nome", type: "text" },
  { id: "valor", name: "Valor pago", type: "number" },
];

const TEMPLATES: PageTemplate[] = [
  { id: "t1", name: "Reunião semanal", content: "<p>pauta</p>" },
];

const PROJECTS: WorkspaceSearchProject[] = [
  { id: "p1", name: "Finanças", category: "Pessoal" },
  { id: "p2", name: "Trabalho", category: null },
];

const CATEGORIES: WorkspaceSearchCategory[] = [
  { id: "c1", name: "Pessoal" },
  { id: "c2", name: "Estudos" },
];

function makeDatabase(
  overrides: Partial<WorkspaceSearchDatabase> = {},
): WorkspaceSearchDatabase {
  return {
    id: "db1",
    name: "Despesas",
    projectId: "p1",
    columns: COLUMNS,
    templates: TEMPLATES,
    ...overrides,
  };
}

function flatten(index: ReturnType<typeof buildWorkspaceIndex>, query: string) {
  return searchWorkspace(index, query).flatMap((section) => section.results);
}

describe("normalizeSearchTerm", () => {
  it("remove acentos e coloca em minúsculas", () => {
    expect(normalizeSearchTerm("Finanças")).toBe("financas");
    expect(normalizeSearchTerm("REUNIÃO")).toBe("reuniao");
  });
});

describe("buildWorkspaceIndex + searchWorkspace", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("não devolve seções quando a busca está vazia", () => {
    const index = buildWorkspaceIndex({
      projects: PROJECTS,
      categories: CATEGORIES,
      databases: [makeDatabase()],
    });
    expect(searchWorkspace(index, "   ")).toEqual([]);
  });

  it("encontra projetos ignorando caixa e acentos", () => {
    const index = buildWorkspaceIndex({
      projects: PROJECTS,
      categories: CATEGORIES,
      databases: [],
    });
    const results = flatten(index, "financas");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: "project",
      label: "Finanças",
      projectId: "p1",
    });
  });

  it("encontra categorias, databases, propriedades e modelos", () => {
    const index = buildWorkspaceIndex({
      projects: PROJECTS,
      categories: CATEGORIES,
      databases: [makeDatabase()],
    });

    // "Estudos" não é categoria de nenhum projeto: só a categoria casa.
    expect(flatten(index, "estudos")[0]).toMatchObject({
      kind: "category",
      name: "Estudos",
    });
    expect(flatten(index, "despesas")[0]).toMatchObject({
      kind: "database",
      databaseId: "db1",
      projectId: "p1",
    });
    expect(flatten(index, "valor pago")[0]).toMatchObject({
      kind: "column",
      columnId: "valor",
      databaseId: "db1",
    });
    expect(flatten(index, "reuniao")[0]).toMatchObject({
      kind: "template",
      databaseId: "db1",
      projectId: "p1",
    });
  });

  it("indexa as abas persistidas e ignora databases sem abas salvas", () => {
    persistViews("db1", ["Visão geral", "Por mês"]);
    const index = buildWorkspaceIndex({
      projects: PROJECTS,
      categories: CATEGORIES,
      databases: [makeDatabase(), makeDatabase({ id: "db2", name: "Notas" })],
    });

    const views = flatten(index, "visao").filter((r) => r.kind === "view");
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      kind: "view",
      viewId: "v1",
      databaseId: "db1",
    });
    // `db2` não tem abas persistidas → nenhum resultado de visualização.
    expect(flatten(index, "notas").some((r) => r.kind === "view")).toBe(false);
  });

  it("limita os resultados por seção", () => {
    const projects = Array.from({ length: SEARCH_SECTION_LIMIT + 3 }, (_, i) => ({
      id: `p${i}`,
      name: `Projeto ${i}`,
      category: null,
    }));
    const index = buildWorkspaceIndex({
      projects,
      categories: [],
      databases: [],
    });
    const sections = searchWorkspace(index, "projeto");
    expect(sections).toHaveLength(1);
    expect(sections[0].results).toHaveLength(SEARCH_SECTION_LIMIT);
  });

  it("devolve as seções na ordem fixa (projeto → database → propriedade)", () => {
    const index = buildWorkspaceIndex({
      projects: [{ id: "pz", name: "Zeta", category: null }],
      categories: [],
      databases: [
        makeDatabase({
          name: "Zeta dados",
          columns: [{ id: "z", name: "Zeta campo", type: "text" }],
          templates: [],
        }),
      ],
    });
    const kinds = searchWorkspace(index, "zeta").map((section) => section.kind);
    expect(kinds).toEqual(["project", "database", "column"]);
  });
});

describe("itemResultFor", () => {
  it("resolve o nome do database e o projectId a partir da lista", () => {
    const result = itemResultFor(
      { databaseId: "db1", rowId: "r1", label: "Aluguel" },
      [makeDatabase()],
    );
    expect(result).toEqual({
      kind: "item",
      id: "db1:r1",
      label: "Aluguel",
      sublabel: "Despesas",
      databaseId: "db1",
      rowId: "r1",
      projectId: "p1",
    });
  });

  it("não quebra quando o database não está carregado", () => {
    const result = itemResultFor(
      { databaseId: "desconhecido", rowId: "r1", label: "Órfão" },
      [makeDatabase()],
    );
    expect(result.sublabel).toBeUndefined();
    expect(result.projectId).toBeNull();
  });
});
