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
