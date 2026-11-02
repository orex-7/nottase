import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { defaultChartConfig } from "@/components/database/database-chart";
import { TableSettingsPopover } from "@/components/database/TableSettingsPopover";
import type { Column } from "@/types/database";

const COLUMNS: Column[] = [{ id: "name", name: "Nome", type: "text" }];

/** Props mínimas do popover de configurações (callbacks como mocks). */
function makeProps(open: boolean) {
  return {
    open,
    anchorEl: null,
    title: "Tarefas",
    icon: null,
    columns: COLUMNS,
    onRename: vi.fn(),
    onUpdateIcon: vi.fn(),
    onUpdateColumn: vi.fn(),
    onAddColumn: vi.fn(),
    onRemoveColumn: vi.fn(),
    onDeleteDatabase: vi.fn(),
    activeViewType: "table" as const,
    onChangeViewType: vi.fn(),
    pageLayout: "center" as const,
    onChangePageLayout: vi.fn(),
    chartConfig: defaultChartConfig(COLUMNS),
    onChangeChartConfig: vi.fn(),
    databases: [{ id: "db1", name: "Tarefas", columns: COLUMNS }],
    currentDatabaseId: "db1",
    currentDatabaseName: "Tarefas",
    onSaveRelation: vi.fn(),
    onSaveRollup: vi.fn(),
    onClose: vi.fn(),
  };
}

describe("TableSettingsPopover — editar propriedades", () => {
  const COLUMNS: Column[] = [
    { id: "name", name: "Nome", type: "text" },
    { id: "tags", name: "Tags", type: "multi_select", options: [] },
  ];

  it("lista as propriedades, filtra pela busca e abre as configurações", () => {
    const props = makeProps(true);
    render(
      <TableSettingsPopover {...props} columns={COLUMNS} initialView="edit" />,
    );

    // Busca no topo + lista com as propriedades criadas.
    const search = screen.getByLabelText("Buscar propriedade");
    expect(screen.getByRole("button", { name: "Nome" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tags" })).toBeInTheDocument();
    // "Adicionar propriedade" fica no rodapé, acima de "Excluir tabela".
    const addButton = screen.getByRole("button", {
      name: "Adicionar propriedade",
    });
    const deleteButton = screen.getByRole("button", { name: "Excluir tabela" });
    expect(
      addButton.compareDocumentPosition(deleteButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // A busca filtra a lista.
    fireEvent.change(search, { target: { value: "tags" } });
    expect(
      screen.queryByRole("button", { name: "Nome" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tags" })).toBeInTheDocument();

    // Clicar na propriedade abre as configurações dela: ícone, nome (input) e,
    // logo abaixo, as opções já visíveis.
    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    expect(
      screen.getByRole("button", { name: "Ícone da propriedade Tags" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nome da propriedade Tags")).toBeInTheDocument();
    // "Alterar tipo" abaixo do input, rótulo "Opções" e opções logo abaixo.
    expect(
      screen.getByRole("button", { name: "Alterar tipo da propriedade Tags" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Opções")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar opção" }),
    ).toBeInTheDocument();
    // O rodapé exclui a propriedade (não a tabela).
    expect(
      screen.queryByRole("button", { name: "Excluir tabela" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Excluir propriedade" }),
    ).toBeInTheDocument();

    // O botão "Voltar" retorna para a lista de propriedades.
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByLabelText("Buscar propriedade")).toBeInTheDocument();
  });

  it("exclui a propriedade pelo rodapé e volta para a lista", () => {
    const props = makeProps(true);
    render(
      <TableSettingsPopover {...props} columns={COLUMNS} initialView="edit" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir propriedade" }));

    expect(props.onRemoveColumn).toHaveBeenCalledWith("tags");
    // Volta para a lista de propriedades.
    expect(screen.getByLabelText("Buscar propriedade")).toBeInTheDocument();
  });
});

describe("TableSettingsPopover — sub-popovers", () => {
  it("fecha o seletor de ícone ao fechar e reabrir as configurações", () => {
    const { rerender } = render(<TableSettingsPopover {...makeProps(true)} />);

    // Abre o seletor de ícone (botão ao lado do nome da tabela).
    fireEvent.click(screen.getByTitle("Escolher icone"));
    expect(
      document.querySelector("[data-table-icon-picker]"),
    ).not.toBeNull();

    // Fecha e reabre: o seletor (que é um portal) não pode reaparecer aberto.
    rerender(<TableSettingsPopover {...makeProps(false)} />);
    rerender(<TableSettingsPopover {...makeProps(true)} />);

    expect(document.querySelector("[data-table-icon-picker]")).toBeNull();
  });
});
