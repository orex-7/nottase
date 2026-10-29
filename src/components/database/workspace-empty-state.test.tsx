import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PROJECT_COLOR } from "@/lib/database";
import type { Database } from "@/types/database";

import { WorkspaceEmptyState } from "./WorkspaceEmptyState";

const DATABASE: Database = {
  id: "db1",
  name: "Tarefas",
  icon: null,
  projectId: "p1",
  linkedDatabaseId: null,
  columns: [{ id: "name", name: "Nome", type: "text" }],
  rows: [],
  templates: [],
};

/** Renderiza o cartão com os callbacks mockados e devolve os spies. */
function setup(
  props: Partial<ComponentProps<typeof WorkspaceEmptyState>> = {},
) {
  const onCreateProject = vi.fn();
  const onCreateCategory = vi.fn();
  const onCreateDatabase = vi.fn();

  render(
    <WorkspaceEmptyState
      variant="no-projects"
      categories={[]}
      databases={[]}
      onCreateProject={onCreateProject}
      onCreateCategory={onCreateCategory}
      onCreateDatabase={onCreateDatabase}
      {...props}
    />,
  );

  return { onCreateProject, onCreateCategory, onCreateDatabase };
}

describe("WorkspaceEmptyState", () => {
  it("saúda com o primeiro nome na variante sem projetos", () => {
    setup({ variant: "no-projects", userName: "Lucas Silva" });

    expect(screen.getByText("Bem-vindo, Lucas")).toBeInTheDocument();
  });

  it("usa o título genérico quando o usuário não tem nome", () => {
    setup({ variant: "no-projects" });

    expect(
      screen.getByText("Bem-vindo ao seu Workspace"),
    ).toBeInTheDocument();
  });

  it("cria o primeiro projeto pelo popover ancorado ao botão", () => {
    const { onCreateProject } = setup({
      variant: "no-projects",
      userName: "Ana",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Criar meu primeiro projeto" }),
    );
    fireEvent.change(screen.getByLabelText("Nome do projeto"), {
      target: { value: "Meu projeto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onCreateProject).toHaveBeenCalledWith({
      name: "Meu projeto",
      category: null,
      color: DEFAULT_PROJECT_COLOR,
    });
  });

  it("cria um database no projeto ativo pelo popover", () => {
    const { onCreateDatabase } = setup({
      variant: "no-database",
      projectName: "Trabalho",
    });

    expect(screen.getByText(/Trabalho/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Criar database" }));
    fireEvent.change(screen.getByLabelText("Nome do database"), {
      target: { value: "Itens" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    expect(onCreateDatabase).toHaveBeenCalledWith({
      name: "Itens",
      icon: null,
      linkedDatabaseId: null,
    });
  });

  it("abre um database pelo seletor na variante sem database aberto", () => {
    const onOpenDatabase = vi.fn();
    setup({
      variant: "no-open-database",
      projectName: "Trabalho",
      databases: [DATABASE],
      projects: [{ id: "p1", name: "Trabalho" }],
      onOpenDatabase,
    });

    expect(screen.getByText("Nenhum database aberto")).toBeInTheDocument();
    expect(
      screen.getByText('Abra um database de "Trabalho" para começar.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Abrir database" }));

    const dialog = screen.getByRole("dialog", { name: "Abrir database" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Tarefas/ }));

    expect(onOpenDatabase).toHaveBeenCalledWith("db1");
  });
});
