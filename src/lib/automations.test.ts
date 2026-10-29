import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import {
  createAutomation,
  deleteAutomation,
  fetchAutomations,
  reorderAutomations,
  updateAutomation,
} from "@/lib/automations";

const createClientMock = vi.mocked(createClient);
type AnyFn = ReturnType<typeof vi.fn>;

/**
 * Nó "fluente" que aceita qualquer encadeamento (`.select().eq().order()...`) e
 * resolve para `result` quando aguardado — o suficiente para testar a camada de
 * dados sem um Supabase real.
 */
function fluent(result: unknown): Record<string, unknown> {
  const node: Record<string, unknown> = {};
  const self = () => node;
  for (const method of [
    "select",
    "eq",
    "order",
    "insert",
    "update",
    "delete",
    "single",
    "maybeSingle",
  ]) {
    node[method] = vi.fn(self);
  }
  node.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return node;
}

describe("camada de dados das automações", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("mapeia as regras do database (snake_case → domínio)", async () => {
    const query = fluent({
      data: [
        {
          id: "a1",
          database_id: "db1",
          name: "Concluir",
          enabled: true,
          position: 0,
          trigger: { kind: "row_created" },
          actions: [{ kind: "set_value", columnId: "done", valueFrom: "today" }],
          last_run_at: null,
        },
      ],
      error: null,
    });
    createClientMock.mockReturnValue({ from: vi.fn(() => query) } as never);

    const rules = await fetchAutomations("db1");

    expect(rules).toEqual([
      {
        id: "a1",
        databaseId: "db1",
        name: "Concluir",
        enabled: true,
        position: 0,
        trigger: { kind: "row_created" },
        actions: [{ kind: "set_value", columnId: "done", valueFrom: "today" }],
        lastRunAt: null,
      },
    ]);
    expect(query.eq as AnyFn).toHaveBeenCalledWith("database_id", "db1");
  });

  it("propaga o erro da consulta", async () => {
    const query = fluent({ data: null, error: new Error("boom") });
    createClientMock.mockReturnValue({ from: vi.fn(() => query) } as never);

    await expect(fetchAutomations("db1")).rejects.toThrow("boom");
  });

  it("cria na última posição enviando gatilho e ações", async () => {
    const positions = fluent({
      data: [{ position: 2 }, { position: 0 }],
      error: null,
    });
    const inserted = fluent({
      data: {
        id: "a2",
        database_id: "db1",
        name: "Nova",
        enabled: true,
        position: 3,
        trigger: { kind: "row_created" },
        actions: [],
        last_run_at: null,
      },
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(positions)
      .mockReturnValueOnce(inserted);
    createClientMock.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from,
    } as never);

    const rule = await createAutomation("db1", {
      name: "Nova",
      trigger: { kind: "row_created" },
      actions: [{ kind: "set_value", columnId: "x", value: "1" }],
    });

    expect(inserted.insert as AnyFn).toHaveBeenCalledWith({
      user_id: "u1",
      database_id: "db1",
      name: "Nova",
      enabled: true,
      position: 3,
      trigger: { kind: "row_created" },
      actions: [{ kind: "set_value", columnId: "x", value: "1" }],
    });
    expect(rule.id).toBe("a2");
  });

  it("exige usuário autenticado ao criar", async () => {
    createClientMock.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: vi.fn(),
    } as never);

    await expect(
      createAutomation("db1", { trigger: { kind: "row_created" }, actions: [] }),
    ).rejects.toThrow("not-authenticated");
  });

  it("atualiza o patch informado", async () => {
    const query = fluent({ data: null, error: null });
    createClientMock.mockReturnValue({ from: vi.fn(() => query) } as never);

    await updateAutomation("a1", { enabled: false });

    expect(query.update as AnyFn).toHaveBeenCalledWith({ enabled: false });
    expect(query.eq as AnyFn).toHaveBeenCalledWith("id", "a1");
  });

  it("exclui pelo id", async () => {
    const query = fluent({ data: null, error: null });
    createClientMock.mockReturnValue({ from: vi.fn(() => query) } as never);

    await deleteAutomation("a1");

    expect(query.delete as AnyFn).toHaveBeenCalled();
    expect(query.eq as AnyFn).toHaveBeenCalledWith("id", "a1");
  });

  it("reordena gravando position pelo índice (e ignora lista vazia)", async () => {
    const query = fluent({ data: null, error: null });
    const from = vi.fn(() => query);
    createClientMock.mockReturnValue({ from } as never);

    await reorderAutomations([]);
    expect(from).not.toHaveBeenCalled();

    await reorderAutomations(["b", "a"]);
    expect(query.update as AnyFn).toHaveBeenCalledWith({ position: 0 });
    expect(query.update as AnyFn).toHaveBeenCalledWith({ position: 1 });
  });
});
