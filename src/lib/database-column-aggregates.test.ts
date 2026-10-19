import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { fetchColumnAggregates } from "@/lib/database";

const createClientMock = vi.mocked(createClient);

describe("fetchColumnAggregates", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("não chama a RPC quando não há configs", async () => {
    const rpc = vi.fn();
    createClientMock.mockReturnValue({ rpc } as never);

    const result = await fetchColumnAggregates("db", []);
    expect(result.size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("envia busca/filtros e mapeia o retorno por coluna", async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const client = {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return Promise.resolve({
          data: [
            { column_id: "amount", value: 150.5 },
            { column_id: "qty", value: 3 },
            { column_id: "vazio", value: null },
          ],
          error: null,
        });
      },
    };
    createClientMock.mockReturnValue(client as never);

    const result = await fetchColumnAggregates(
      "db",
      [
        { columnId: "amount", fn: "sum" },
        { columnId: "qty", fn: "count_all" },
      ],
      {
        search: "  foo  ",
        filters: [{ columnId: "status", operator: "is", value: "done" }],
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("database_column_aggregates");
    expect(calls[0].args).toEqual({
      p_database_id: "db",
      p_configs: [
        { columnId: "amount", fn: "sum" },
        { columnId: "qty", fn: "count_all" },
      ],
      p_search: "foo",
      p_filters: [{ columnId: "status", operator: "is", value: "done" }],
    });
    expect(result.get("amount")).toBe("150.5");
    expect(result.get("qty")).toBe("3");
    // `null` do servidor vira string vazia (o rodapé exibe "—").
    expect(result.get("vazio")).toBe("");
  });

  it("envia p_search/p_filters nulos quando vazios", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = {
      rpc: (_fn: string, args: Record<string, unknown>) => {
        calls.push(args);
        return Promise.resolve({ data: [], error: null });
      },
    };
    createClientMock.mockReturnValue(client as never);

    await fetchColumnAggregates("db", [{ columnId: "amount", fn: "avg" }], {
      search: "   ",
      filters: [],
    });

    expect(calls[0].p_search).toBeNull();
    expect(calls[0].p_filters).toBeNull();
  });

  it("propaga o erro da RPC", async () => {
    const client = {
      rpc: () => Promise.resolve({ data: null, error: new Error("boom") }),
    };
    createClientMock.mockReturnValue(client as never);

    await expect(
      fetchColumnAggregates("db", [{ columnId: "amount", fn: "sum" }]),
    ).rejects.toThrow("boom");
  });
});
