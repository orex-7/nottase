import { beforeEach, describe, expect, it } from "vitest";

import {
  copyPersistedViews,
  loadPageLayout,
  loadPersistedViews,
  savePageLayout,
  savePersistedViews,
} from "./database-views";

const SOURCE = "db-src";
const TARGET = "db-dst";

describe("copyPersistedViews", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("copia as visualizações persistidas para a nova chave", () => {
    savePersistedViews(SOURCE, {
      views: [
        { id: "v1", type: "table", name: "Tabela" },
        { id: "v2", type: "kanban", name: "Kanban" },
      ],
      activeViewId: "v2",
      kanbanColumnId: "status",
    });

    copyPersistedViews(SOURCE, TARGET);

    const copied = loadPersistedViews(TARGET);
    expect(copied?.views.map((v) => v.name)).toEqual(["Tabela", "Kanban"]);
    expect(copied?.activeViewId).toBe("v2");
    expect(copied?.kanbanColumnId).toBe("status");
    // A origem permanece intacta.
    expect(loadPersistedViews(SOURCE)?.views).toHaveLength(2);
  });

  it("não cria nada quando a origem não tem visualizações salvas", () => {
    copyPersistedViews(SOURCE, TARGET);
    expect(loadPersistedViews(TARGET)).toBeNull();
  });
});

describe("preferência de abertura da página", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("usa 'center' por padrão", () => {
    expect(loadPageLayout("db1")).toBe("center");
  });

  it("guarda e relê a escolha por database", () => {
    savePageLayout("db1", "right");
    savePageLayout("db2", "full");

    expect(loadPageLayout("db1")).toBe("right");
    expect(loadPageLayout("db2")).toBe("full");
  });

  it("ignora valor inválido salvo", () => {
    window.localStorage.setItem("calendar:dbPageLayout:db1", "diagonal");
    expect(loadPageLayout("db1")).toBe("center");
  });

  it("a cópia do database também herda a abertura da página", () => {
    savePersistedViews(SOURCE, {
      views: [{ id: "v1", type: "table", name: "Tabela" }],
      activeViewId: "v1",
      kanbanColumnId: null,
    });
    savePageLayout(SOURCE, "right");

    copyPersistedViews(SOURCE, TARGET);

    expect(loadPageLayout(TARGET)).toBe("right");
  });
});
