import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

import { OpenDatabaseBar } from "./OpenDatabaseBar";

const ATUAL: Database = {
  id: "db1",
  name: "Tarefas",
  icon: null,
  projectId: null,
  linkedDatabaseId: null,
  columns: [],
  rows: [],
  templates: [],
};

const NOTAS: Database = {
  id: "db2",
  name: "Notas",
  icon: null,
  projectId: null,
  linkedDatabaseId: null,
  columns: [],
  rows: [],
  templates: [],
};

/** Nome acessível de cada botão (rótulo explícito ou o texto da aba). */
function buttonNames(): string[] {
  return screen
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
}

function setup(overrides: Partial<ComponentProps<typeof OpenDatabaseBar>> = {}) {
  const onSelectDatabase = vi.fn();
  const onOpenDatabase = vi.fn();
  const onCloseDatabase = vi.fn();

  render(
    <OpenDatabaseBar
      currentDatabaseId="db1"
      databases={[ATUAL, NOTAS]}
      projects={[]}
      openDatabaseIds={["db1", "db2"]}
      onSelectDatabase={onSelectDatabase}
      onOpenDatabase={onOpenDatabase}
      onCloseDatabase={onCloseDatabase}
      {...overrides}
    />,
  );

  return { onSelectDatabase, onOpenDatabase, onCloseDatabase };
}

describe("OpenDatabaseBar", () => {
  it("mostra as abas (com fechar) em ordem fixa e destaca a ativa", () => {
    setup();

    expect(buttonNames()).toEqual([
      "Tarefas",
      "Fechar Tarefas",
      "Notas",
      "Fechar Notas",
      "Abrir outro database",
    ]);
    expect(screen.getByRole("button", { name: "Tarefas" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("clicar em uma aba abre o database sem mudar a ordem", () => {
    const { onOpenDatabase } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Notas" }));

    expect(onOpenDatabase).toHaveBeenCalledWith("db2");
    expect(buttonNames()).toEqual([
      "Tarefas",
      "Fechar Tarefas",
      "Notas",
      "Fechar Notas",
      "Abrir outro database",
    ]);
  });

  it("o botão de fechar fecha a aba do database", () => {
    const { onCloseDatabase } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Fechar Notas" }));

    expect(onCloseDatabase).toHaveBeenCalledWith("db2");
  });

  it("o botão + abre o seletor e acrescenta o database escolhido como aba", () => {
    const { onSelectDatabase } = setup();

    fireEvent.click(
      screen.getByRole("button", { name: "Abrir outro database" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Abrir database" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Notas" }));

    expect(onSelectDatabase).toHaveBeenCalledWith("db2");
    expect(
      screen.queryByRole("dialog", { name: "Abrir database" }),
    ).not.toBeInTheDocument();
  });
});
