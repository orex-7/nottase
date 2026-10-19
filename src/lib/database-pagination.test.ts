import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROWS_PAGE_SIZE,
  buildRowsPageArgs,
  toRowsPage,
} from "@/lib/database";

describe("buildRowsPageArgs", () => {
  it("usa os padrões quando não há cursor, busca nem filtros", () => {
    expect(buildRowsPageArgs("db")).toEqual({
      p_database_id: "db",
      p_limit: DEFAULT_ROWS_PAGE_SIZE,
      p_cursor_position: null,
      p_cursor_id: null,
      p_search: null,
      p_filters: null,
    });
  });

  it("monta o cursor (position, id) e limita o limit a 1..1000", () => {
    const args = buildRowsPageArgs("db", {
      cursor: { position: 3000, id: "row-abc" },
      limit: 5000,
    });
    expect(args.p_cursor_position).toBe(3000);
    expect(args.p_cursor_id).toBe("row-abc");
    expect(args.p_limit).toBe(1000);
    expect(buildRowsPageArgs("db", { limit: 0 }).p_limit).toBe(1);
  });

  it("apara a busca e a omite quando vazia", () => {
    expect(buildRowsPageArgs("db", { search: "   " }).p_search).toBeNull();
    expect(buildRowsPageArgs("db", { search: "  item " }).p_search).toBe("item");
  });

  it("omite os filtros quando vazios e os repassa quando há", () => {
    expect(buildRowsPageArgs("db", { filters: [] }).p_filters).toBeNull();
    const filters = [{ columnId: "c1", operator: "is" as const, value: "true" }];
    expect(buildRowsPageArgs("db", { filters }).p_filters).toEqual(filters);
  });
});

describe("toRowsPage", () => {
  it("usa (position, id) da última linha como cursor, mesmo com position repetida", () => {
    const page = toRowsPage(
      [
        { id: "b", position: 1000, values: {} },
        { id: "a", position: 1000, values: {} },
      ],
      2,
    );
    expect(page.nextCursor).toEqual({ position: 1000, id: "a" });
    expect(page.hasMore).toBe(true);
    expect(page.rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("hasMore=false quando a página vem incompleta", () => {
    const page = toRowsPage([{ id: "a", position: 0, values: {} }], 300);
    expect(page.hasMore).toBe(false);
  });

  it("página vazia não tem cursor nem mais páginas", () => {
    expect(toRowsPage([], 300)).toEqual({
      rows: [],
      nextCursor: null,
      hasMore: false,
    });
  });
});
