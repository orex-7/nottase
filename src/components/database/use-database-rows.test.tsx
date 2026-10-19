import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RowsPage } from "@/lib/database";

vi.mock("@/lib/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database")>();
  return { ...actual, fetchDatabaseRowsPage: vi.fn() };
});

import { fetchDatabaseRowsPage } from "@/lib/database";

import { useDatabaseRows } from "./use-database-rows";

const fetchPage = vi.mocked(fetchDatabaseRowsPage);

/** Página de teste com cursor derivado do último item. */
function makePage(ids: string[], hasMore: boolean, start = 0): RowsPage {
  const rows = ids.map((id) => ({ id, values: {} }));
  return {
    rows,
    nextCursor: ids.length
      ? { position: start + ids.length - 1, id: ids[ids.length - 1] }
      : null,
    hasMore,
  };
}

describe("useDatabaseRows", () => {
  beforeEach(() => {
    fetchPage.mockReset();
  });

  it("carrega a 1ª página ao montar", async () => {
    fetchPage.mockResolvedValueOnce(makePage(["a", "b"], true));
    const { result } = renderHook(() => useDatabaseRows({ databaseId: "db" }));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.loading).toBe(false);
    expect(result.current.hasMore).toBe(true);
    expect(fetchPage).toHaveBeenCalledWith(
      "db",
      expect.objectContaining({ cursor: null }),
    );
  });

  it("anexa a próxima página usando o cursor da anterior", async () => {
    fetchPage.mockResolvedValueOnce(makePage(["a", "b"], true));
    fetchPage.mockResolvedValueOnce(makePage(["c"], false, 2));
    const { result } = renderHook(() => useDatabaseRows({ databaseId: "db" }));

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    act(() => {
      result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result.current.hasMore).toBe(false);
    expect(fetchPage).toHaveBeenLastCalledWith(
      "db",
      expect.objectContaining({ cursor: { position: 1, id: "b" } }),
    );
  });

  it("não busca mais quando hasMore=false", async () => {
    fetchPage.mockResolvedValueOnce(makePage(["a"], false));
    const { result } = renderHook(() => useDatabaseRows({ databaseId: "db" }));

    await waitFor(() => expect(result.current.hasMore).toBe(false));
    act(() => {
      result.current.fetchNextPage();
    });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("reseta e recarrega a 1ª página ao mudar a busca", async () => {
    fetchPage.mockResolvedValueOnce(makePage(["a", "b"], true));
    fetchPage.mockResolvedValueOnce(makePage(["z"], false));
    const { result, rerender } = renderHook(
      ({ search }) => useDatabaseRows({ databaseId: "db", search }),
      { initialProps: { search: "" } },
    );

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    rerender({ search: "z" });
    await waitFor(() =>
      expect(result.current.rows.map((r) => r.id)).toEqual(["z"]),
    );
    expect(fetchPage).toHaveBeenLastCalledWith(
      "db",
      expect.objectContaining({ cursor: null, search: "z" }),
    );
  });

  it("descarta a resposta de uma requisição antiga (troca rápida de filtro)", async () => {
    let resolveFirst: (page: RowsPage) => void = () => {};
    fetchPage.mockReturnValueOnce(
      new Promise<RowsPage>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    fetchPage.mockResolvedValueOnce(makePage(["novo"], false));

    const { result, rerender } = renderHook(
      ({ search }) => useDatabaseRows({ databaseId: "db", search }),
      { initialProps: { search: "" } },
    );
    rerender({ search: "novo" });
    await waitFor(() =>
      expect(result.current.rows.map((r) => r.id)).toEqual(["novo"]),
    );

    await act(async () => {
      resolveFirst(makePage(["antigo"], false));
    });
    // A resposta atrasada não sobrescreve a lista atual.
    expect(result.current.rows.map((r) => r.id)).toEqual(["novo"]);
  });

  it("expõe o erro e permite retry sem perder o já carregado", async () => {
    fetchPage.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useDatabaseRows({ databaseId: "db" }));

    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.loading).toBe(false);

    fetchPage.mockResolvedValueOnce(makePage(["a"], false));
    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.error).toBeNull();
  });

  it("aplica patch local nas linhas carregadas", async () => {
    fetchPage.mockResolvedValueOnce(makePage(["a", "b"], false));
    const { result } = renderHook(() => useDatabaseRows({ databaseId: "db" }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    act(() => {
      result.current.patchRows((rows) => rows.filter((r) => r.id !== "a"));
    });
    expect(result.current.rows.map((r) => r.id)).toEqual(["b"]);
  });
});
