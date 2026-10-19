import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import {
  RELATION_LINKS_CHUNK,
  ROWS_BY_IDS_CHUNK,
  createLinkedDatabase,
  duplicateDatabase,
  emptyValuesFor,
  fetchRelationLinksForRows,
  fetchRowsByIds,
} from "@/lib/database";
import type { Column } from "@/types/database";

const createClientMock = vi.mocked(createClient);

interface FakeRow {
  id: string;
  values: Record<string, string>;
  position: number;
}

/** Cliente Supabase falso que registra os blocos de ids consultados. */
function makeClient(rows: FakeRow[]) {
  const calls: string[][] = [];
  const client = {
    from: () => ({
      select: () => ({
        in: (_column: string, ids: string[]) => {
          calls.push(ids);
          const found = rows.filter((row) => ids.includes(row.id));
          return Promise.resolve({ data: found, error: null });
        },
      }),
    }),
  };
  return { client, calls };
}

describe("fetchRowsByIds", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("não consulta nada quando a lista de ids está vazia", async () => {
    const { client, calls } = makeClient([]);
    createClientMock.mockReturnValue(client as never);

    const result = await fetchRowsByIds([]);
    expect(result.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("deduplica os ids e devolve um mapa por id", async () => {
    const { client, calls } = makeClient([
      { id: "a", values: { name: "Alpha" }, position: 1000 },
    ]);
    createClientMock.mockReturnValue(client as never);

    const result = await fetchRowsByIds(["a", "a", "b"]);
    expect(calls[0]).toEqual(["a", "b"]);
    expect(result.get("a")?.values.name).toBe("Alpha");
    expect(result.get("a")?.position).toBe(1000);
  });

  it("omite do mapa os ids inexistentes (referências órfãs)", async () => {
    const { client } = makeClient([
      { id: "a", values: { name: "Alpha" }, position: 0 },
    ]);
    createClientMock.mockReturnValue(client as never);

    const result = await fetchRowsByIds(["a", "inexistente"]);
    expect(result.has("a")).toBe(true);
    expect(result.has("inexistente")).toBe(false);
  });

  it("busca em blocos de ROWS_BY_IDS_CHUNK", async () => {
    const { client, calls } = makeClient([]);
    createClientMock.mockReturnValue(client as never);

    const ids = Array.from(
      { length: ROWS_BY_IDS_CHUNK + 1 },
      (_, index) => `id-${index}`,
    );
    await fetchRowsByIds(ids);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toHaveLength(ROWS_BY_IDS_CHUNK);
    expect(calls[1]).toHaveLength(1);
  });

  it("propaga o erro da consulta", async () => {
    const client = {
      from: () => ({
        select: () => ({
          in: () => Promise.resolve({ data: null, error: new Error("boom") }),
        }),
      }),
    };
    createClientMock.mockReturnValue(client as never);

    await expect(fetchRowsByIds(["a"])).rejects.toThrow("boom");
  });
});

describe("emptyValuesFor", () => {
  it("inicia seleção múltipla com lista vazia e relação/rollup sem valor", () => {
    const columns: Column[] = [
      { id: "name", name: "Nome", type: "text" },
      { id: "tags", name: "Tags", type: "multi_select" },
      { id: "rel", name: "Projetos", type: "relation" },
      { id: "sum", name: "Soma", type: "rollup" },
    ];
    // Relação (vínculos em `relation_links`) e rollup (calculado) não são mais
    // gravados em `values` — começam vazios.
    expect(emptyValuesFor(columns)).toEqual({
      name: "",
      tags: [],
      rel: "",
      sum: "",
    });
  });
});

describe("fetchRelationLinksForRows", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("não consulta nada quando a lista de ids está vazia", async () => {
    const rpc = vi.fn();
    createClientMock.mockReturnValue({ rpc } as never);

    const result = await fetchRelationLinksForRows([]);
    expect(result).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("mapeia os vínculos e busca em blocos de RELATION_LINKS_CHUNK", async () => {
    const calls: string[][] = [];
    const client = {
      rpc: (_fn: string, args: { p_row_ids: string[] }) => {
        calls.push(args.p_row_ids);
        return Promise.resolve({
          data: [
            {
              property_id: "rel",
              source_item_id: args.p_row_ids[0],
              target_item_id: "t1",
            },
          ],
          error: null,
        });
      },
    };
    createClientMock.mockReturnValue(client as never);

    const ids = Array.from(
      { length: RELATION_LINKS_CHUNK + 1 },
      (_, index) => `row-${index}`,
    );
    const result = await fetchRelationLinksForRows(ids);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toHaveLength(RELATION_LINKS_CHUNK);
    expect(calls[1]).toHaveLength(1);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      propertyId: "rel",
      sourceItemId: "row-0",
      targetItemId: "t1",
    });
  });

  it("propaga o erro da RPC", async () => {
    const client = {
      rpc: () => Promise.resolve({ data: null, error: new Error("boom") }),
    };
    createClientMock.mockReturnValue(client as never);

    await expect(fetchRelationLinksForRows(["a"])).rejects.toThrow("boom");
  });
});

interface DuplicateFixture {
  columns: Column[];
  sourceRows: { id: string; values: Record<string, string>; position: number }[];
}

/** Cliente Supabase falso para `duplicateDatabase` (captura o que foi inserido). */
function makeDuplicateClient({ columns, sourceRows }: DuplicateFixture) {
  const inserted: Record<string, unknown>[] = [];
  let dbInsert: Record<string, unknown> | null = null;

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      if (table === "databases") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "src",
                  name: "Origem",
                  icon: null,
                  project_id: null,
                  columns,
                },
                error: null,
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            dbInsert = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "new-db", ...payload },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      if (table === "database_rows") {
        return {
          insert: async (
            payload: Record<string, unknown> | Record<string, unknown>[],
          ) => {
            inserted.push(...(Array.isArray(payload) ? payload : [payload]));
            return { error: null };
          },
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
    rpc: async () => ({ data: sourceRows, error: null }),
  };

  return { client, inserted, dbInsert: () => dbInsert };
}

describe("duplicateDatabase", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("copia as colunas e as linhas da origem para o novo database", async () => {
    const columns: Column[] = [
      { id: "name", name: "Nome", type: "text" },
      { id: "rel", name: "Projetos", type: "relation", relationDatabaseId: "p" },
    ];
    const { client, inserted, dbInsert } = makeDuplicateClient({
      columns,
      sourceRows: [
        { id: "r1", values: { name: "A" }, position: 1000 },
        { id: "r2", values: { name: "B" }, position: 2000 },
      ],
    });
    createClientMock.mockReturnValue(client as never);

    const db = await duplicateDatabase("src", "Cópia", "Folder", "proj");

    expect(db.id).toBe("new-db");
    expect(db.name).toBe("Cópia");
    expect(db.columns).toEqual(columns);
    expect(db.rows).toEqual([]);
    expect(dbInsert()).toMatchObject({
      name: "Cópia",
      icon: "Folder",
      project_id: "proj",
      columns,
    });
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({
      database_id: "new-db",
      values: { name: "A" },
      position: 1000,
    });
    expect(inserted[1]).toMatchObject({
      database_id: "new-db",
      values: { name: "B" },
      position: 2000,
    });
  });

  it("cria uma linha em branco quando a origem não tem linhas", async () => {
    const columns: Column[] = [{ id: "name", name: "Nome", type: "text" }];
    const { client, inserted } = makeDuplicateClient({
      columns,
      sourceRows: [],
    });
    createClientMock.mockReturnValue(client as never);

    await duplicateDatabase("src", "Cópia");

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ database_id: "new-db", position: 0 });
    expect(inserted[0].values).toEqual({ name: "" });
  });
});

describe("createLinkedDatabase", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("cria a visão vinculada (sem colunas nem linhas próprias)", async () => {
    const insertedRows: unknown[] = [];
    let dbInsert: Record<string, unknown> | null = null;
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: (table: string) => {
        if (table === "databases") {
          return {
            insert: (payload: Record<string, unknown>) => {
              dbInsert = payload;
              return {
                select: () => ({
                  single: async () => ({
                    data: { id: "view-db", ...payload },
                    error: null,
                  }),
                }),
              };
            },
          };
        }
        if (table === "database_rows") {
          return {
            insert: async (payload: unknown) => {
              insertedRows.push(payload);
              return { error: null };
            },
          };
        }
        throw new Error(`tabela inesperada: ${table}`);
      },
    };
    createClientMock.mockReturnValue(client as never);

    const db = await createLinkedDatabase("src", "Espelho", "Folder", "proj");

    expect(db).toMatchObject({
      id: "view-db",
      name: "Espelho",
      icon: "Folder",
      projectId: "proj",
      linkedDatabaseId: "src",
      columns: [],
      rows: [],
    });
    expect(dbInsert).toMatchObject({
      name: "Espelho",
      icon: "Folder",
      project_id: "proj",
      columns: [],
      linked_database_id: "src",
    });
    // Visão vinculada não cria linha própria (as linhas vêm da origem).
    expect(insertedRows).toHaveLength(0);
  });
});
