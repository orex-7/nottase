import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database")>();
  return {
    ...actual,
    fetchDatabases: vi.fn(),
    fetchProjects: vi.fn(),
    fetchProjectCategories: vi.fn(),
    fetchDatabaseRowsPage: vi.fn(),
    fetchOpenDatabases: vi.fn(),
    saveOpenDatabases: vi.fn(),
  };
});

vi.mock("@/lib/database-recurrence", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/database-recurrence")>();
  return { ...actual, runAutoTemplates: vi.fn() };
});

import {
  fetchDatabaseRowsPage,
  fetchDatabases,
  fetchOpenDatabases,
  fetchProjects,
  fetchProjectCategories,
  saveOpenDatabases,
} from "@/lib/database";
import { runAutoTemplates } from "@/lib/database-recurrence";
import { useCalendarStore } from "@/store/useCalendarStore";
import type { Database, Project } from "@/types/database";

import { DatabaseView } from "./DatabaseView";

const fetchDatabasesMock = vi.mocked(fetchDatabases);
const fetchProjectsMock = vi.mocked(fetchProjects);
const fetchProjectCategoriesMock = vi.mocked(fetchProjectCategories);
const fetchRowsMock = vi.mocked(fetchDatabaseRowsPage);
const fetchOpenDatabasesMock = vi.mocked(fetchOpenDatabases);
const saveOpenDatabasesMock = vi.mocked(saveOpenDatabases);
const runAutoTemplatesMock = vi.mocked(runAutoTemplates);

const PROJECT: Project = {
  id: "p1",
  name: "Geral",
  category: null,
  color: null,
  position: 0,
};

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

const DATABASE2: Database = {
  id: "db2",
  name: "Notas",
  icon: null,
  projectId: "p1",
  linkedDatabaseId: null,
  columns: [{ id: "name", name: "Nome", type: "text" }],
  rows: [],
  templates: [],
};

describe("DatabaseView — estado vazio", () => {
  beforeEach(() => {
    fetchDatabasesMock.mockReset().mockResolvedValue([]);
    fetchProjectsMock.mockReset().mockResolvedValue([]);
    fetchProjectCategoriesMock.mockReset().mockResolvedValue([]);
    fetchRowsMock
      .mockReset()
      .mockResolvedValue({ rows: [], nextCursor: null, hasMore: false });
    runAutoTemplatesMock.mockReset().mockResolvedValue([]);
    // Navegação entre databases abertos (persistida por usuário no Supabase).
    fetchOpenDatabasesMock
      .mockReset()
      .mockResolvedValue({ ids: [], selectedId: null });
    saveOpenDatabasesMock.mockReset().mockResolvedValue(undefined);
    // O store é um singleton: limpa o projeto ativo entre os testes.
    useCalendarStore.setState({ activeProjectId: null });
  });

  it("sai do carregamento e mostra o cartão de boas-vindas sem projetos", async () => {
    render(<DatabaseView userName="Lucas Silva" />);

    expect(screen.getByText("Carregando databases...")).toBeInTheDocument();
    expect(await screen.findByText("Bem-vindo, Lucas")).toBeInTheDocument();
    expect(
      screen.queryByText("Carregando databases..."),
    ).not.toBeInTheDocument();
  });

  it("não fica preso no carregamento enquanto gera itens recorrentes", async () => {
    // Geração automática que nunca termina (ex.: muitas ocorrências devidas, uma
    // requisição por item): a tela deve ser liberada assim mesmo.
    runAutoTemplatesMock.mockReturnValue(new Promise<never>(() => {}));

    render(<DatabaseView userName="Ana" />);

    expect(await screen.findByText("Bem-vindo, Ana")).toBeInTheDocument();
    expect(
      screen.queryByText("Carregando databases..."),
    ).not.toBeInTheDocument();
  });

  it("abre o primeiro database do projeto sem mostrar o cartão de criação", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([DATABASE]);

    render(<DatabaseView userName="Ana" />);

    // O database do projeto ativo é aberto automaticamente: a tabela dele é
    // montada (cabeçalho da coluna) e as linhas são buscadas para o id certo.
    expect(await screen.findByText("Nome")).toBeInTheDocument();
    expect(fetchRowsMock).toHaveBeenCalled();
    expect(fetchRowsMock.mock.calls[0][0]).toBe("db1");

    // A faixa do database aberto mostra o nome e o botão "+" (seletor).
    expect((await screen.findAllByText("Tarefas")).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Abrir outro database" }),
    ).toBeInTheDocument();

    // E o cartão de criação de database não aparece.
    expect(screen.queryByText("Nenhum database ainda")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Criar database" }),
    ).not.toBeInTheDocument();
  });

  it("restaura a navegação salva entre databases abertos", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([DATABASE, DATABASE2]);
    // Estado salvo na conta: "Notas" (db2) aberto e "Tarefas" (db1) ao lado.
    fetchOpenDatabasesMock.mockResolvedValue({
      ids: ["db2", "db1"],
      selectedId: "db2",
    });

    render(<DatabaseView userName="Ana" />);

    // O database salvo é aberto (não o primeiro da lista) e o outro volta como
    // aba ao lado dele, na mesma ordem salva.
    expect(await screen.findByText("Notas")).toBeInTheDocument();
    expect(fetchRowsMock.mock.calls[0][0]).toBe("db2");
    expect(screen.getByRole("button", { name: "Tarefas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notas" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("fecha a aba do database e não reabre outro automaticamente", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([DATABASE, DATABASE2]);

    render(<DatabaseView userName="Ana" />);

    // O primeiro database é aberto automaticamente; a sua aba tem o fechar.
    fireEvent.click(
      await screen.findByRole("button", { name: "Fechar Tarefas" }),
    );

    // Sem abas, o Workspace fica sem database aberto (não reabre o primeiro).
    expect(
      await screen.findByText(
        "Escolha um database na barra lateral para abri-lo.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Fechar Tarefas" }),
    ).not.toBeInTheDocument();
  });
});
