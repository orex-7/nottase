import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { ROW_SEARCH_LIMIT, searchDatabaseRows } from "@/lib/database";

const createClientMock = vi.mocked(createClient);

describe("searchDatabaseRows", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("não consulta a RPC quando o termo está vazio", async () => {
    const rpc = vi.fn();
    createClientMock.mockReturnValue({ rpc } as never);

    expect(await searchDatabaseRows("   ")).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("envia p_search/p_limit e mapeia databaseId + row", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    const client = {
      rpc: (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return Promise.resolve({
          data: [
            {
              id: "r1",
              database_id: "db1",
              values: { name: "Aluguel" },
              position: 1000,
            },
            { id: "r2", database_id: "db2", values: { name: "Luz" }, position: 0 },
          ],
          error: null,
        });
      },
    };
    createClientMock.mockReturnValue(client as never);

    const hits = await searchDatabaseRows("alu", 5);

    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("database_rows_search");
    expect(calls[0].args).toEqual({ p_search: "alu", p_limit: 5 });
    expect(hits).toEqual([
      {
        databaseId: "db1",
        row: { id: "r1", values: { name: "Aluguel" }, position: 1000 },
      },
      {
        databaseId: "db2",
        row: { id: "r2", values: { name: "Luz" }, position: 0 },
      },
    ]);
  });

  it("usa o limite padrão e faz trim do termo", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    createClientMock.mockReturnValue({ rpc } as never);

    await searchDatabaseRows("  casa  ");

    expect(rpc).toHaveBeenCalledWith("database_rows_search", {
      p_search: "casa",
      p_limit: ROW_SEARCH_LIMIT,
    });
  });

  it("propaga o erro da RPC", async () => {
    const client = {
      rpc: () => Promise.resolve({ data: null, error: new Error("boom") }),
    };
    createClientMock.mockReturnValue(client as never);

    await expect(searchDatabaseRows("x")).rejects.toThrow("boom");
  });
});
