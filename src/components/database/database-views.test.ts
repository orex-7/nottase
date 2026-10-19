import { beforeEach, describe, expect, it } from "vitest";

import {
  copyPersistedViews,
  loadPersistedViews,
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
