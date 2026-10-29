import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/automations", () => ({
  fetchAutomations: vi.fn(),
  createAutomation: vi.fn(),
  updateAutomation: vi.fn(),
  deleteAutomation: vi.fn(),
}));

import {
  createAutomation,
  deleteAutomation,
  fetchAutomations,
  updateAutomation,
} from "@/lib/automations";
import { AutomationsPanel } from "./AutomationsPanel";
import type { Column } from "@/types/database";
import type { AutomationRule } from "@shared/automation";

const fetchMock = vi.mocked(fetchAutomations);
const createMock = vi.mocked(createAutomation);
const updateMock = vi.mocked(updateAutomation);
const deleteMock = vi.mocked(deleteAutomation);

const COLUMNS: Column[] = [
  { id: "name", name: "Nome", type: "text" },
  {
    id: "status",
    name: "Status",
    type: "select",
    options: [{ id: "done", label: "Concluído", color: "bg-emerald-500" }],
  },
];

const DATABASES = [{ id: "db1", name: "Tarefas", columns: COLUMNS }];

const RULE: AutomationRule = {
  id: "a1",
  databaseId: "db1",
  name: "Concluir",
  enabled: true,
  position: 0,
  trigger: { kind: "row_created" },
  actions: [{ kind: "set_value", columnId: "status", value: "done" }],
  lastRunAt: null,
};

function renderPanel() {
  return render(
    <AutomationsPanel databaseId="db1" databases={DATABASES} columns={COLUMNS} />,
  );
}

describe("AutomationsPanel", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
  });

  it("mostra o estado vazio quando não há automações", async () => {
    fetchMock.mockResolvedValue([]);
    renderPanel();

    expect(
      await screen.findByText("Nenhuma automação ainda."),
    ).toBeInTheDocument();
  });

  it("lista as automações com o resumo do gatilho e das ações", async () => {
    fetchMock.mockResolvedValue([RULE]);
    renderPanel();

    expect(await screen.findByText("Concluir")).toBeInTheDocument();
    expect(screen.getByText(/Quando uma linha é criada/)).toBeInTheDocument();
    expect(screen.getByText(/Preencher "Status" = Concluído/)).toBeInTheDocument();
    expect(screen.getByText("Nunca executada")).toBeInTheDocument();
  });

  it("alterna ativar/desativar persistindo a mudança", async () => {
    fetchMock.mockResolvedValue([RULE]);
    updateMock.mockResolvedValue(undefined);
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Desativar automação Concluir",
      }),
    );

    expect(updateMock).toHaveBeenCalledWith("a1", { enabled: false });
    expect(
      await screen.findByRole("button", { name: "Ativar automação Concluir" }),
    ).toBeInTheDocument();
  });

  it("exclui uma automação", async () => {
    fetchMock.mockResolvedValue([RULE]);
    deleteMock.mockResolvedValue(undefined);
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir automação Concluir" }),
    );

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("a1"));
    expect(screen.queryByText("Concluir")).not.toBeInTheDocument();
  });

  it("cria uma automação pelo editor", async () => {
    fetchMock.mockResolvedValue([]);
    createMock.mockResolvedValue({ ...RULE, id: "a2" });
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: /Nova automação/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith(
      "db1",
      expect.objectContaining({
        name: "Nova automação",
        trigger: { kind: "row_created" },
      }),
    );
  });
});
