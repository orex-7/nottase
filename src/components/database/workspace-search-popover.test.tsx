import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  buildWorkspaceIndex,
  type WorkspaceSearchProject,
} from "@/components/database/workspace-search";

import { WorkspaceSearchPopover } from "./WorkspaceSearchPopover";

const PROJECTS: WorkspaceSearchProject[] = [
  { id: "p1", name: "Projeto Alpha", category: null },
];

const INDEX = buildWorkspaceIndex({
  projects: PROJECTS,
  categories: [],
  databases: [],
});

/** Cria um âncora avulso (o popover só usa o elemento para posicionar). */
function makeAnchor(): HTMLElement {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  return anchor;
}

function setup(
  overrides: Partial<ComponentProps<typeof WorkspaceSearchPopover>> = {},
) {
  const onOpenResult = vi.fn();
  const onClose = vi.fn();
  const onQueryChange = vi.fn();

  render(
    <WorkspaceSearchPopover
      anchorEl={makeAnchor()}
      query=""
      onQueryChange={onQueryChange}
      index={INDEX}
      databases={[]}
      onOpenResult={onOpenResult}
      onClose={onClose}
      {...overrides}
    />,
  );

  return { onOpenResult, onClose, onQueryChange };
}

describe("WorkspaceSearchPopover", () => {
  it("mostra a seção de projetos e abre o resultado ao clicar", () => {
    const { onOpenResult } = setup({ query: "proj" });

    expect(screen.getByText("Projetos")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Projeto Alpha" }));

    expect(onOpenResult).toHaveBeenCalledTimes(1);
    expect(onOpenResult.mock.calls[0][0]).toMatchObject({
      kind: "project",
      projectId: "p1",
    });
  });

  it("sem busca mostra a dica de navegação", () => {
    setup({ query: "" });

    expect(
      screen.getByText(
        "Busque por projetos, databases, propriedades, abas, modelos e itens.",
      ),
    ).toBeInTheDocument();
  });

  it("fecha com Esc", () => {
    const { onClose } = setup({ query: "proj" });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
