import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database")>();
  return { ...actual, fetchRowsByIds: vi.fn() };
});

import { fetchRowsByIds } from "@/lib/database";
import type { Column, DbRow } from "@/types/database";

import { invalidateRelatedRows, useRelatedRows } from "./use-related-rows";

const fetchByIds = vi.mocked(fetchRowsByIds);

const COLUMNS: Column[] = [{ id: "name", name: "Nome", type: "text" }];

function row(id: string, name: string): DbRow {
  return { id, values: { name }, position: 0 };
}

describe("useRelatedRows", () => {
  beforeEach(() => {
    invalidateRelatedRows();
    fetchByIds.mockReset();
  });

  it("busca só os ids não resolvidos (deduplicados) e resolve o título", async () => {
    fetchByIds.mockResolvedValue(new Map([["a", row("a", "Alpha")]]));
    const { result } = renderHook(() =>
      useRelatedRows("db", ["a", "a", "b"], COLUMNS),
    );

    await waitFor(() =>
      expect(result.current.resolve("a")).toEqual({
        status: "ready",
        title: "Alpha",
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchByIds).toHaveBeenCalledTimes(1);
    expect(fetchByIds).toHaveBeenCalledWith(["a", "b"]);
    // "b" não voltou da consulta → referência órfã.
    expect(result.current.resolve("b")).toEqual({ status: "missing" });
  });

  it("reaproveita o cache entre hooks montados (não rebusca)", async () => {
    fetchByIds.mockResolvedValue(new Map([["a", row("a", "Alpha")]]));
    const first = renderHook(() => useRelatedRows("db", ["a"], COLUMNS));
    await waitFor(() =>
      expect(first.result.current.resolve("a").status).toBe("ready"),
    );

    fetchByIds.mockClear();
    const second = renderHook(() => useRelatedRows("db", ["a"], COLUMNS));
    await waitFor(() =>
      expect(second.result.current.resolve("a")).toEqual({
        status: "ready",
        title: "Alpha",
      }),
    );
    expect(fetchByIds).not.toHaveBeenCalled();
  });

  it("recarrega o título quando o cache é invalidado", async () => {
    fetchByIds.mockResolvedValueOnce(new Map([["a", row("a", "Alpha")]]));
    const { result } = renderHook(() => useRelatedRows("db", ["a"], COLUMNS));
    await waitFor(() =>
      expect(result.current.resolve("a")).toEqual({
        status: "ready",
        title: "Alpha",
      }),
    );

    fetchByIds.mockResolvedValueOnce(new Map([["a", row("a", "Beta")]]));
    act(() => invalidateRelatedRows(["a"]));
    await waitFor(() =>
      expect(result.current.resolve("a")).toEqual({
        status: "ready",
        title: "Beta",
      }),
    );
  });

  it("não consulta quando não há database alvo", async () => {
    const { result } = renderHook(() => useRelatedRows(null, ["a"], COLUMNS));
    expect(fetchByIds).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resolve("a")).toEqual({ status: "missing" });
  });

  it("descarta a resposta de uma requisição antiga", async () => {
    let resolveFirst: (rows: Map<string, DbRow>) => void = () => {};
    fetchByIds.mockReturnValueOnce(
      new Promise<Map<string, DbRow>>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    fetchByIds.mockResolvedValueOnce(new Map([["z", row("z", "Zeta")]]));

    const { result, rerender } = renderHook(
      ({ ids }) => useRelatedRows("db", ids, COLUMNS),
      { initialProps: { ids: ["a"] } },
    );
    rerender({ ids: ["z"] });

    await waitFor(() =>
      expect(result.current.resolve("z")).toEqual({
        status: "ready",
        title: "Zeta",
      }),
    );

    await act(async () => {
      resolveFirst(new Map([["a", row("a", "Alpha")]]));
    });
    // A resposta atrasada não popula o cache.
    expect(result.current.resolve("a").status).toBe("missing");
  });
});
