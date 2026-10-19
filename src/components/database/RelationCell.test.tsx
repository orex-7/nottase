import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database")>();
  return { ...actual, fetchRowsByIds: vi.fn() };
});

import { fetchRowsByIds } from "@/lib/database";
import type { Column, DbRow } from "@/types/database";

import { RelationCell } from "./RelationCell";
import { invalidateRelatedRows } from "./use-related-rows";

const fetchByIds = vi.mocked(fetchRowsByIds);

const COLUMNS: Column[] = [{ id: "name", name: "Nome", type: "text" }];

function row(id: string, name: string): DbRow {
  return { id, values: { name }, position: 0 };
}

describe("RelationCell", () => {
  beforeEach(() => {
    invalidateRelatedRows();
    fetchByIds.mockReset();
  });

  it("exibe o título resolvido e abre o item ao clicar no chip", async () => {
    fetchByIds.mockResolvedValue(new Map([["a", row("a", "Alpha")]]));
    const onOpenItem = vi.fn();

    render(
      <RelationCell
        databaseId="db"
        columns={COLUMNS}
        ids={["a"]}
        onOpenItem={onOpenItem}
      />,
    );

    const chip = await screen.findByRole("button", { name: "Alpha" });
    fireEvent.click(chip);
    expect(onOpenItem).toHaveBeenCalledWith("a", expect.anything());
  });

  it("mostra 'linha removida' para referências órfãs", async () => {
    fetchByIds.mockResolvedValue(new Map());

    render(
      <RelationCell
        databaseId="db"
        columns={COLUMNS}
        ids={["x"]}
        onOpenItem={vi.fn()}
      />,
    );

    expect(await screen.findByText("linha removida")).toBeInTheDocument();
  });

  it("remove o vínculo ao clicar no 'x' do chip", async () => {
    fetchByIds.mockResolvedValue(new Map([["a", row("a", "Alpha")]]));
    const onRemove = vi.fn();

    render(
      <RelationCell
        databaseId="db"
        columns={COLUMNS}
        ids={["a"]}
        onOpenItem={vi.fn()}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Remover Alpha" }));
    expect(onRemove).toHaveBeenCalledWith("a");
  });
});
