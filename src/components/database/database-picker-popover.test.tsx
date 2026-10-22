import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

import { DatabasePickerPopover } from "./DatabasePickerPopover";

function makeDatabase(
  id: string,
  name: string,
  projectId: string | null,
): Database {
  return {
    id,
    name,
    icon: null,
    projectId,
    linkedDatabaseId: null,
    columns: [],
    rows: [],
    templates: [],
  };
}

const DATABASES: Database[] = [
  makeDatabase("db1", "Tarefas", "p1"),
  makeDatabase("db2", "Notas", "p1"),
  makeDatabase("db3", "Finanças", null),
];

const PROJECTS = [{ id: "p1", name: "Geral" }];

/** Cria um elemento de referência avulso (só usado para posicionar). */
function makeAnchor(): HTMLElement {
  const anchor = document.createElement("div");
  document.body.appendChild(anchor);
  return anchor;
}

function setup(
  overrides: Partial<ComponentProps<typeof DatabasePickerPopover>> = {},
) {
  const onSelect = vi.fn();
  const onClose = vi.fn();

  render(
    <DatabasePickerPopover
      anchorEl={makeAnchor()}
      databases={DATABASES}
      projects={PROJECTS}
      currentDatabaseId="db1"
      onSelect={onSelect}
      onClose={onClose}
      {...overrides}
    />,
  );

  return { onSelect, onClose };
}

describe("DatabasePickerPopover", () => {
  it("lista todos os databases e marca o que já está aberto", () => {
    setup();

    expect(screen.getByRole("button", { name: /Notas/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Finanças/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tarefas/ })).toBeDisabled();
  });

  it("filtra pelo nome (sem acento) e pelo projeto", () => {
    setup();

    const input = screen.getByRole("textbox", { name: "Buscar database" });

    fireEvent.change(input, { target: { value: "financ" } });
    expect(
      screen.getByRole("button", { name: /Finanças/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Notas/ }),
    ).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "geral" } });
    expect(screen.getByRole("button", { name: /Notas/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Finanças/ }),
    ).not.toBeInTheDocument();
  });

  it("escolher um database chama onSelect", () => {
    const { onSelect } = setup();

    fireEvent.click(screen.getByRole("button", { name: /Finanças/ }));

    expect(onSelect).toHaveBeenCalledWith("db3");
  });

  it("fecha com Esc", () => {
    const { onClose } = setup();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
