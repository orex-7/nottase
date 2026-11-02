import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { defaultChartConfig } from "@/components/database/database-chart";
import { OPTION_COLORS } from "@/components/database/database-fields";
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
  const WITH_OPTIONS: Column[] = [
    { id: "name", name: "Nome", type: "text" },
    {
      id: "tags",
      name: "Tags",
      type: "multi_select",
      options: [{ id: "o1", label: "Urgente", color: OPTION_COLORS[0] }],
    },
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

  it("com opções criadas, o adicionar vira ícone ao lado de Opções", () => {
    render(
      <TableSettingsPopover
        {...makeProps(true)}
        columns={WITH_OPTIONS}
        initialView="edit"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tags" }));

    // O botão de adicionar é só o ícone (sem o texto "Adicionar opção").
    const add = screen.getByRole("button", { name: "Adicionar opção" });
    expect(add.textContent).toBe("");
  });

  it("abre o popover da opção com nome, excluir e cores", () => {
    const props = makeProps(true);
    render(
      <TableSettingsPopover
        {...props}
        columns={WITH_OPTIONS}
        initialView="edit"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    // A "seta" da opção abre o mesmo popover da célula (cor + nome).
    fireEvent.click(
      screen.getByRole("button", { name: "Cor da opção Urgente" }),
    );

    expect(screen.getByLabelText("Nome da opção Urgente")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Excluir opção Urgente" }),
    ).toBeInTheDocument();
    // Cores nomeadas (quadrado + nome).
    expect(screen.getByText("Vermelho")).toBeInTheDocument();
  });

  it("volta a mostrar o botão Adicionar opção ao excluir a última opção", () => {
    const WITH_ONE: Column[] = [
      { id: "name", name: "Nome", type: "text" },
      {
        id: "priority",
        name: "Prioridade",
        type: "multi_select",
        options: [{ id: "o1", label: "Urgente", color: OPTION_COLORS[0] }],
      },
    ];
    const props = makeProps(true);
    const { rerender } = render(
      <TableSettingsPopover {...props} columns={WITH_ONE} initialView="edit" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Prioridade" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Cor da opção Urgente" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Excluir opção Urgente" }),
    );
    expect(props.onUpdateColumn).toHaveBeenCalledWith("priority", {
      options: [],
    });

    // Sem opções, o botão "Adicionar opção" (com texto) volta a aparecer.
    rerender(
      <TableSettingsPopover
        {...props}
        columns={[
          { id: "name", name: "Nome", type: "text" },
          {
            id: "priority",
            name: "Prioridade",
            type: "multi_select",
            options: [],
          },
        ]}
        initialView="edit"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Adicionar opção" }).textContent,
    ).toContain("Adicionar opção");
  });

  it("abre a lista de tipos na própria aba e aplica a escolha", () => {
    const props = makeProps(true);
    render(
      <TableSettingsPopover {...props} columns={COLUMNS} initialView="edit" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Nome" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Alterar tipo da propriedade Nome" }),
    );

    // A lista de tipos abre na própria aba (sem o botão "Excluir tabela").
    expect(
      screen.queryByRole("button", { name: "Excluir tabela" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Número" }));
    expect(props.onUpdateColumn).toHaveBeenCalledWith("name", {
      type: "number",
    });
    expect(
      screen.getByRole("button", { name: "Alterar tipo da propriedade Nome" }),
    ).toBeInTheDocument();
  });

  it("abre um input ao adicionar opção e cria com Enter", () => {
    const EMPTY_COLUMNS: Column[] = [
      { id: "name", name: "Nome", type: "text" },
      { id: "priority", name: "Prioridade", type: "multi_select", options: [] },
    ];
    const props = makeProps(true);
    render(
      <TableSettingsPopover
        {...props}
        columns={EMPTY_COLUMNS}
        initialView="edit"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Prioridade" }));
    expect(screen.getByText("Nenhuma opção ainda.")).toBeInTheDocument();

    // O input substitui a mensagem de vazio.
    fireEvent.click(screen.getByRole("button", { name: "Adicionar opção" }));
    const input = screen.getByLabelText("Nova opção");
    expect(
      screen.queryByText("Nenhuma opção ainda."),
    ).not.toBeInTheDocument();

    // Digitar + Enter cria a opção e mantém o input aberto.
    fireEvent.change(input, { target: { value: "Urgente" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onUpdateColumn).toHaveBeenCalledWith(
      "priority",
      expect.objectContaining({
        options: expect.arrayContaining([
          expect.objectContaining({ label: "Urgente" }),
        ]),
      }),
    );
    expect(screen.getByLabelText("Nova opção")).toBeInTheDocument();
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
