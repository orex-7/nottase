import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database")>();
  return { ...actual, fetchRollupValues: vi.fn() };
});

import {
  fetchRollupValues,
  type RollupValueRequest,
} from "@/lib/database";
import type { CellValue } from "@/types/database";

import { invalidateRollupValues, useRollupValues } from "./use-rollup-values";

const fetchRollups = vi.mocked(fetchRollupValues);

const CONFIG: RollupValueRequest = {
  propertyId: "sum",
  relationPropertyId: "rel",
  targetPropertyId: "amount",
  fn: "sum",
  targetType: "number",
};

describe("useRollupValues", () => {
  beforeEach(() => {
    invalidateRollupValues();
    fetchRollups.mockReset();
  });

  it("calcula em lote e resolve o valor por linha/coluna", async () => {
    fetchRollups.mockResolvedValue(new Map([["a|sum", "42"]]));

    const { result } = renderHook(() =>
      useRollupValues(["a", "b"], [CONFIG]),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchRollups).toHaveBeenCalledWith([CONFIG], ["a", "b"]);
    expect(result.current.getValue("a", "sum")).toBe("42");
    // "b" não voltou no mapa → sem valor (vazio).
    expect(result.current.getValue("b", "sum")).toBe("");
  });

  it("não calcula quando não há linhas ou configs", () => {
    const { result } = renderHook(() => useRollupValues([], [CONFIG]));
    expect(fetchRollups).not.toHaveBeenCalled();
    expect(result.current.getValue("a", "sum")).toBeNull();
  });

  it("devolve null enquanto o valor não foi carregado", async () => {
    let resolve: (map: Map<string, CellValue>) => void = () => {};
    fetchRollups.mockReturnValueOnce(
      new Promise<Map<string, CellValue>>((r) => {
        resolve = r;
      }),
    );

    const { result } = renderHook(() => useRollupValues(["a"], [CONFIG]));
    expect(result.current.getValue("a", "sum")).toBeNull();

    await act(async () => {
      resolve(new Map([["a|sum", "7"]]));
    });
    expect(result.current.getValue("a", "sum")).toBe("7");
  });

  it("não resolve colunas sem configuração", async () => {
    fetchRollups.mockResolvedValue(new Map());
    const { result } = renderHook(() => useRollupValues(["a"], [CONFIG]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.getValue("a", "outra")).toBeNull();
  });
});
