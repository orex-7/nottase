import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database")>();
  return { ...actual, fetchDatabaseRowsPage: vi.fn() };
});

import { fetchDatabaseRowsPage, type RowsPage } from "@/lib/database";
import type { Column } from "@/types/database";

import { RelationSelect } from "./RelationSelect";

const fetchPage = vi.mocked(fetchDatabaseRowsPage);

const COLUMNS: Column[] = [{ id: "name", name: "Nome", type: "text" }];

function makePage(names: Record<string, string>, hasMore = false): RowsPage {
  const rows = Object.entries(names).map(([id, name]) => ({
    id,
    values: { name },
  }));
  return { rows, nextCursor: null, hasMore };
}

describe("RelationSelect", () => {
  beforeEach(() => {
    fetchPage.mockReset();
  });

  it("lista os itens do database alvo e alterna a seleção múltipla", async () => {
    fetchPage.mockResolvedValue(makePage({ a: "Alpha", b: "Beta" }));
    const onChange = vi.fn();

    render(
      <RelationSelect
        databaseId="db"
        columns={COLUMNS}
        value={[]}
        multiple
        onChange={onChange}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Alpha/ }));
    expect(onChange).toHaveBeenCalledWith(["a"]);
  });

  it("remove um item já selecionado na seleção múltipla", async () => {
    fetchPage.mockResolvedValue(makePage({ a: "Alpha", b: "Beta" }));
    const onChange = vi.fn();

    render(
      <RelationSelect
        databaseId="db"
        columns={COLUMNS}
        value={["a"]}
        multiple
        onChange={onChange}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Alpha/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("em modo único escolhe uma linha", async () => {
    fetchPage.mockResolvedValue(makePage({ a: "Alpha", b: "Beta" }));
    const onChange = vi.fn();

    render(
      <RelationSelect
        databaseId="db"
        columns={COLUMNS}
        value={[]}
        multiple={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Beta/ }));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("limpa a seleção atual", async () => {
    fetchPage.mockResolvedValue(makePage({ a: "Alpha" }));
    const onChange = vi.fn();

    render(
      <RelationSelect
        databaseId="db"
        columns={COLUMNS}
        value={["a"]}
        multiple
        onChange={onChange}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Limpar" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("mostra mensagem quando o database alvo não tem itens", async () => {
    fetchPage.mockResolvedValue(makePage({}));

    render(
      <RelationSelect
        databaseId="db"
        columns={COLUMNS}
        value={[]}
        multiple
        onChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("Nenhum item.")).toBeInTheDocument();
  });
});
