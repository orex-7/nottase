import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    createRowAtEnd: vi.fn(),
    updateDatabaseColumns: vi.fn(),
    updateRowCell: vi.fn(),
    deleteRow: vi.fn(),
  };
});

vi.mock("@/lib/database-recurrence", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/database-recurrence")>();
  return { ...actual, runAutoTemplates: vi.fn() };
});

// A tabela virtualiza as linhas com `@tanstack/react-virtual`, que depende de
// layout (altura do container) — indisponível no jsdom (sem layout e com o
// `ResizeObserver` "stubado"). Substituímos por um stub que renderiza TODAS as
// linhas, permitindo testar as interações da tabela.
vi.mock("@tanstack/react-virtual", () => ({
  defaultRangeExtractor: (range: { startIndex: number; endIndex: number }) =>
    Array.from(
      { length: range.endIndex - range.startIndex + 1 },
      (_, i) => range.startIndex + i,
    ),
  useVirtualizer: (options: {
    count: number;
    estimateSize: () => number;
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => {
        const size = options.estimateSize();
        return {
          index,
          key: index,
          start: index * size,
          end: (index + 1) * size,
          size,
          lane: 0,
        };
      }),
    getTotalSize: () => options.count * options.estimateSize(),
    scrollToIndex: () => {},
    scrollToOffset: () => {},
    measureElement: () => {},
  }),
}));

import {
  createRowAtEnd,
  deleteRow,
  fetchDatabaseRowsPage,
  fetchDatabases,
  fetchOpenDatabases,
  fetchProjects,
  fetchProjectCategories,
  saveOpenDatabases,
  updateDatabaseColumns,
  updateRowCell,
} from "@/lib/database";
import { runAutoTemplates } from "@/lib/database-recurrence";
import { useCalendarStore } from "@/store/useCalendarStore";
import type { Column, Database, Project } from "@/types/database";

import { OPTION_COLORS } from "./database-fields";
import { DatabaseView } from "./DatabaseView";

const fetchDatabasesMock = vi.mocked(fetchDatabases);
const fetchProjectsMock = vi.mocked(fetchProjects);
const fetchProjectCategoriesMock = vi.mocked(fetchProjectCategories);
const fetchRowsMock = vi.mocked(fetchDatabaseRowsPage);
const fetchOpenDatabasesMock = vi.mocked(fetchOpenDatabases);
const saveOpenDatabasesMock = vi.mocked(saveOpenDatabases);
const createRowAtEndMock = vi.mocked(createRowAtEnd);
const updateDatabaseColumnsMock = vi.mocked(updateDatabaseColumns);
const updateRowCellMock = vi.mocked(updateRowCell);
const deleteRowMock = vi.mocked(deleteRow);
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

const MULTI_SELECT_DATABASE: Database = {
  id: "db1",
  name: "Tarefas",
  icon: null,
  projectId: "p1",
  linkedDatabaseId: null,
  columns: [{ id: "tags", name: "Tags", type: "multi_select", options: [] }],
  rows: [],
  templates: [],
};

/** Database com uma propriedade de link (URL). */
const URL_DATABASE: Database = {
  id: "db1",
  name: "Links",
  icon: null,
  projectId: "p1",
  linkedDatabaseId: null,
  columns: [{ id: "site", name: "Site", type: "url" }],
  rows: [],
  templates: [],
};

const TAGS_DATABASE: Database = {
  ...MULTI_SELECT_DATABASE,
  columns: [
    {
      id: "tags",
      name: "Tags",
      type: "multi_select",
      options: [
        { id: "o1", label: "Urgente", color: OPTION_COLORS[0] },
        { id: "o2", label: "Backlog", color: OPTION_COLORS[1] },
      ],
    },
  ],
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
    // `null` = nunca salvo (primeiro uso), quando o auto-open do primeiro
    // database do projeto vale.
    fetchOpenDatabasesMock.mockReset().mockResolvedValue(null);
    saveOpenDatabasesMock.mockReset().mockResolvedValue(undefined);
    createRowAtEndMock
      .mockReset()
      .mockResolvedValue({ id: "row-novo", values: {}, position: 0 });
    updateDatabaseColumnsMock.mockReset().mockResolvedValue(undefined);
    updateRowCellMock.mockReset().mockResolvedValue(undefined);
    deleteRowMock.mockReset().mockResolvedValue(undefined);
    // O store é um singleton: limpa o projeto ativo entre os testes.
    useCalendarStore.setState({ activeProjectId: null });
    // Visualizações salvas (localStorage) não vazam de um teste para o outro.
    window.localStorage.removeItem("calendar:dbViews:db1");
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

    // Sem abas, o Workspace mostra o cartão de "nenhum database aberto" (não
    // reabre o primeiro).
    expect(
      await screen.findByText("Nenhum database aberto"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Abrir database" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Fechar Tarefas" }),
    ).not.toBeInTheDocument();
  });

  it("fecha o editor da propriedade ao escolher o tipo", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([DATABASE]);
    render(<DatabaseView userName="Ana" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Nova propriedade" }),
    );
    expect(
      await screen.findByLabelText("Nome da propriedade"),
    ).toBeInTheDocument();

    // Abre o submenu "Alterar tipo" e escolhe um tipo (o `pointerdown` precede o
    // clique, como no navegador).
    fireEvent.click(screen.getByRole("button", { name: "Alterar tipo" }));
    const option = await screen.findByRole("button", { name: "Seleção" });
    fireEvent.pointerDown(option);
    fireEvent.click(option);

    // O menu de tipos fecha e o editor da propriedade também.
    expect(
      screen.queryByRole("button", { name: "Seleção" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Nome da propriedade"),
    ).not.toBeInTheDocument();
  });

  it("adiciona uma linha pelo botão fixo no rodapé da tabela", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([DATABASE]);

    render(<DatabaseView userName="Ana" />);

    // O rodapé fixo (mesma faixa do "Calcular") traz o botão "Nova linha".
    fireEvent.click(await screen.findByRole("button", { name: "Nova linha" }));

    expect(createRowAtEndMock).toHaveBeenCalledWith("db1", expect.any(Object));
  });

  it("cria a linha já com os valores do filtro da visão ativa", async () => {
    // Visão ativa com filtro: "Tags é Urgente" (id da opção: o1).
    window.localStorage.setItem(
      "calendar:dbViews:db1",
      JSON.stringify({
        views: [
          {
            id: "v-filtro",
            type: "table",
            name: "Urgentes",
            filters: {
              columnIds: ["tags"],
              values: { tags: "o1" },
              operators: { tags: "is" },
            },
          },
        ],
        activeViewId: "v-filtro",
        kanbanColumnId: null,
      }),
    );
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([TAGS_DATABASE]);

    render(<DatabaseView userName="Ana" />);

    fireEvent.click(await screen.findByRole("button", { name: "Nova linha" }));

    // A linha nasce casando com o filtro (multi_select → lista), então aparece
    // também nas outras visões em vez de sumir ao trocar de visão.
    expect(createRowAtEndMock).toHaveBeenCalledWith(
      "db1",
      expect.objectContaining({ tags: ["o1"] }),
    );
  });

  it("cria uma opção pelo botão no menu da célula de seleção múltipla", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([MULTI_SELECT_DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [{ id: "r1", values: {} }],
      nextCursor: null,
      hasMore: false,
    });

    const { container } = render(<DatabaseView userName="Ana" />);

    // Abre o menu da célula (primeira célula de dados da tabela).
    const trigger = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(
        "[data-cell-menu-trigger]",
      );
      expect(el).not.toBeNull();
      return el as HTMLButtonElement;
    });
    fireEvent.click(trigger);

    const input = screen.getByLabelText("Criar nova opção em Tags");
    // O campo de criar opção fica na célula, ao lado das opções selecionadas
    // (o popover abaixo só lista as opções).
    expect(input.closest("[data-cell-editor]")).not.toBeNull();
    expect(input.closest("[data-cell-menu]")).toBeNull();

    fireEvent.change(input, { target: { value: "Urgente" } });

    // Enquanto digita (e a opção ainda não existe), o rodapé do popover mostra
    // a prévia da opção com o botão "Criar" ao lado.
    expect(screen.getByText("Urgente")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    // A opção é criada e aplicada à linha: aparece na célula com um "x" para
    // remover, e também na lista do popover.
    expect(await screen.findByLabelText("Remover Urgente")).toBeInTheDocument();
    expect(await screen.findAllByText("Urgente")).not.toHaveLength(0);
  });

  it("renomeia a opção pelo popover de cor no menu da célula", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([TAGS_DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [{ id: "r1", values: { tags: ["o1"] } }],
      nextCursor: null,
      hasMore: false,
    });

    const { container } = render(<DatabaseView userName="Ana" />);

    const trigger = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(
        "[data-cell-menu-trigger]",
      );
      expect(el).not.toBeNull();
      return el as HTMLButtonElement;
    });
    fireEvent.click(trigger);

    // A seta da opção abre o popover com o campo de nome e o botão de excluir.
    fireEvent.click(
      screen.getByRole("button", { name: "Cor da opção Urgente" }),
    );
    const nameInput = screen.getByLabelText("Nome da opção Urgente");
    expect(nameInput).toHaveValue("Urgente");
    expect(
      screen.getByRole("button", { name: "Excluir opção Urgente" }),
    ).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: "Urgentíssimo" } });

    await waitFor(() => expect(updateDatabaseColumnsMock).toHaveBeenCalled());
    const calls = updateDatabaseColumnsMock.mock.calls;
    const next = calls[calls.length - 1][1];
    expect(next.find((c) => c.id === "tags")?.options?.[0]?.label).toBe(
      "Urgentíssimo",
    );
  });

  it("exclui a opção pelo popover de cor e limpa o valor da célula", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([TAGS_DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [{ id: "r1", values: { tags: ["o1"] } }],
      nextCursor: null,
      hasMore: false,
    });

    const { container } = render(<DatabaseView userName="Ana" />);

    const trigger = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(
        "[data-cell-menu-trigger]",
      );
      expect(el).not.toBeNull();
      return el as HTMLButtonElement;
    });
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole("button", { name: "Cor da opção Urgente" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Excluir opção Urgente" }),
    );

    // A opção sai da coluna...
    await waitFor(() => expect(updateDatabaseColumnsMock).toHaveBeenCalled());
    const calls = updateDatabaseColumnsMock.mock.calls;
    const next = calls[calls.length - 1][1];
    expect(next.find((c) => c.id === "tags")?.options).toHaveLength(1);
    // ...e o valor dela é limpo na linha (a opção não existe mais).
    await waitFor(() =>
      expect(updateRowCellMock).toHaveBeenCalledWith("r1", "tags", []),
    );
  });

  it("filtra as opções conforme o texto digitado no campo da célula", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([TAGS_DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [{ id: "r1", values: {} }],
      nextCursor: null,
      hasMore: false,
    });

    const { container } = render(<DatabaseView userName="Ana" />);

    const trigger = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(
        "[data-cell-menu-trigger]",
      );
      expect(el).not.toBeNull();
      return el as HTMLButtonElement;
    });
    fireEvent.click(trigger);

    // Sem texto digitado, as duas opções aparecem.
    expect(screen.getByText("Urgente")).toBeInTheDocument();
    expect(screen.getByText("Backlog")).toBeInTheDocument();

    const input = screen.getByLabelText("Criar nova opção em Tags");
    fireEvent.change(input, { target: { value: "Back" } });

    // Só a opção que casa com o texto continua; a outra sai da lista.
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.queryByText("Urgente")).toBeNull();
  });

  it("reordena as opções pelo arraste no menu da célula", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([TAGS_DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [{ id: "r1", values: {} }],
      nextCursor: null,
      hasMore: false,
    });

    const { container } = render(<DatabaseView userName="Ana" />);

    const trigger = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(
        "[data-cell-menu-trigger]",
      );
      expect(el).not.toBeNull();
      return el as HTMLButtonElement;
    });
    fireEvent.click(trigger);

    // Arrasta "Urgente" para a posição de "Backlog".
    const handle = screen.getByRole("button", {
      name: "Reordenar opção Urgente",
    });
    const target = screen.getByRole("button", { name: "Backlog" }).closest("div");
    if (!target) throw new Error("linha de destino não encontrada");
    fireEvent.dragStart(handle);
    fireEvent.dragOver(target);
    fireEvent.drop(target);

    // A nova ordem das opções foi persistida na coluna.
    const columns = updateDatabaseColumnsMock.mock.calls.at(-1)?.[1] as Column[];
    const tags = columns.find((c) => c.id === "tags");
    expect(tags?.options?.map((o) => o.id)).toEqual(["o2", "o1"]);
  });

  it("fecha o menu da célula ao clicar em uma propriedade do cabeçalho", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([TAGS_DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [{ id: "r1", values: {} }],
      nextCursor: null,
      hasMore: false,
    });

    const { container } = render(<DatabaseView userName="Ana" />);

    const trigger = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(
        "[data-cell-menu-trigger]",
      );
      expect(el).not.toBeNull();
      return el as HTMLButtonElement;
    });
    fireEvent.click(trigger);

    // Menu da célula aberto (campo de criar opção visível).
    expect(screen.getByLabelText("Criar nova opção em Tags")).toBeInTheDocument();

    // Clicar numa propriedade do cabeçalho fecha o menu da célula (mesmo que o
    // clique abra o menu do cabeçalho).
    const header = container.querySelector<HTMLButtonElement>(
      "[data-column-editor-trigger]",
    );
    if (!header) throw new Error("gatilho do cabeçalho não encontrado");
    fireEvent.pointerDown(header);

    expect(container.querySelector("[data-cell-menu]")).toBeNull();
    expect(
      screen.queryByLabelText("Criar nova opção em Tags"),
    ).not.toBeInTheDocument();
  });

  it("fecha o popover do cabeçalho ao clicar em uma célula", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([TAGS_DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [{ id: "r1", values: {} }],
      nextCursor: null,
      hasMore: false,
    });

    const { container } = render(<DatabaseView userName="Ana" />);

    // Abre o popover da propriedade no cabeçalho.
    const header = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(
        "[data-column-editor-trigger]",
      );
      expect(el).not.toBeNull();
      return el as HTMLButtonElement;
    });
    fireEvent.click(header);
    expect(container.querySelector("[data-column-editor]")).not.toBeNull();

    // Clicar na célula (abre o editor de seleção múltipla) fecha o do cabeçalho.
    const cell = container.querySelector<HTMLButtonElement>(
      "[data-cell-menu-trigger]",
    );
    if (!cell) throw new Error("gatilho da célula não encontrado");
    fireEvent.pointerDown(cell);
    fireEvent.click(cell);

    expect(container.querySelector("[data-column-editor]")).toBeNull();
    expect(screen.getByLabelText("Criar nova opção em Tags")).toBeInTheDocument();
  });

  it("exclui as linhas selecionadas após confirmar no modal", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [
        { id: "r1", values: { name: "Um" } },
        { id: "r2", values: { name: "Dois" } },
      ],
      nextCursor: null,
      hasMore: false,
    });

    const { container } = render(<DatabaseView userName="Ana" />);

    // Marca as duas linhas pelos checkboxes da gutter.
    const rowChecks = await waitFor(() => {
      const els = Array.from(
        container.querySelectorAll<HTMLInputElement>(
          'input[aria-label="Selecionar linha"]',
        ),
      );
      expect(els).toHaveLength(2);
      return els;
    });
    for (const check of rowChecks) fireEvent.click(check);

    // Contador de linhas selecionadas aparece ao lado do "selecionar todas".
    expect(container.querySelector("th [aria-live='polite']")?.textContent).toBe(
      "2",
    );

    // A lixeira abre o modal de confirmação; confirmar exclui as duas.
    fireEvent.click(
      screen.getByRole("button", { name: "Excluir linhas selecionadas" }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(deleteRowMock).toHaveBeenCalledTimes(2));
    expect(deleteRowMock).toHaveBeenCalledWith("r1");
    expect(deleteRowMock).toHaveBeenCalledWith("r2");
    // As linhas saem da tabela e a seleção é limpa.
    expect(screen.queryByText("Um")).not.toBeInTheDocument();
    expect(screen.queryByText("Dois")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Excluir linhas selecionadas" }),
    ).not.toBeInTheDocument();
  });

  it("abre a página centralizada por padrão", async () => {
    // Sem preferência salva para este database.
    window.localStorage.removeItem("calendar:dbPageLayout:db1");
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [{ id: "r1", values: { name: "Um" } }],
      nextCursor: null,
      hasMore: false,
    });

    render(<DatabaseView userName="Ana" />);

    fireEvent.click(await screen.findByRole("button", { name: "Abrir página" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("max-w-[60vw]");
    expect(dialog.className).toContain("rounded-lg");
  });

  it("abre a página inteira quando essa é a preferência salva", async () => {
    // Preferência persistida para este database (database-views.ts).
    window.localStorage.setItem("calendar:dbPageLayout:db1", "full");
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [{ id: "r1", values: { name: "Um" } }],
      nextCursor: null,
      hasMore: false,
    });

    render(<DatabaseView userName="Ana" />);

    fireEvent.click(await screen.findByRole("button", { name: "Abrir página" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("rounded-none");
    expect(dialog.className).not.toContain("max-w-[60vw]");
    // "Página inteira" fica DENTRO da área do conteúdo (não cobre a tela toda).
    expect(dialog.parentElement?.className).toContain("absolute");
    expect(dialog.parentElement?.className).not.toContain("fixed");
  });

  it("mantém a largura total da tabela ao redimensionar uma coluna", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [{ id: "r1", values: { name: "Um" } }],
      nextCursor: null,
      hasMore: false,
    });

    const { container } = render(<DatabaseView userName="Ana" />);

    const table = await waitFor(() => {
      const el = container.querySelector<HTMLTableElement>(
        "[data-database-table]",
      );
      expect(el).not.toBeNull();
      return el as HTMLTableElement;
    });

    /** Soma das larguras declaradas no `<colgroup>` (gutter + colunas + ações + fantasma). */
    const sumColWidths = () =>
      Array.from(table.querySelectorAll("col")).reduce(
        (sum, col) =>
          sum + Number.parseFloat((col as HTMLElement).style.width || "0"),
        0,
      );
    const tableWidth = () => Number.parseFloat(table.style.width || "0");
    /** Largura declarada da 1ª coluna de dados (índice 0 é a gutter). */
    const nameColWidth = () =>
      Number.parseFloat(
        (table.querySelectorAll("col")[1] as HTMLElement).style.width || "0",
      );
    /**
     * Larguras dos blocos do rodapé "Calcular" (gutter, colunas, ações,
     * fantasma) — precisam acompanhar o arraste junto com o `<colgroup>`.
     */
    const footerWidths = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-calc-footer] > div"),
      ).map((el) => Number.parseFloat(el.style.width || "0"));

    // Invariante: a tabela tem exatamente a soma das colunas (o `table-fixed`
    // não tem folga para redistribuir e "puxar" as outras colunas).
    expect(sumColWidths()).toBe(tableWidth());
    expect(nameColWidth()).toBe(220);
    expect(footerWidths()[1]).toBe(220);

    const handle = screen.getByRole("separator", {
      name: "Redimensionar coluna Nome",
    });
    fireEvent(
      handle,
      new MouseEvent("pointerdown", { bubbles: true, clientX: 300 }),
    );
    // Arrasta 50px para a esquerda (diminuir a coluna).
    fireEvent(window, new MouseEvent("pointermove", { clientX: 250 }));

    // O preview do arraste foi aplicado...
    expect(nameColWidth()).toBe(170);
    // ...o rodapé acompanha...
    expect(footerWidths()[1]).toBe(170);
    // ...e o total continua batendo — é isso que evita o "pulo" nas outras.
    expect(sumColWidths()).toBe(tableWidth());
    expect(footerWidths().reduce((sum, w) => sum + w, 0)).toBe(tableWidth());

    fireEvent(window, new MouseEvent("pointerup", { clientX: 250 }));

    // Ao soltar, a largura é persistida e o total segue batendo.
    expect(nameColWidth()).toBe(170);
    expect(footerWidths()[1]).toBe(170);
    expect(sumColWidths()).toBe(tableWidth());
    await waitFor(() => expect(updateDatabaseColumnsMock).toHaveBeenCalled());
    const lastCall =
      updateDatabaseColumnsMock.mock.calls[
        updateDatabaseColumnsMock.mock.calls.length - 1
      ];
    expect(lastCall?.[0]).toBe("db1");
    expect(lastCall?.[1].find((c) => c.id === "name")?.width).toBe(170);
  });

  it("mostra a propriedade de link com o href normalizado", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([URL_DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [{ id: "r1", values: { site: "exemplo.com/pagina" } }],
      nextCursor: null,
      hasMore: false,
    });

    render(<DatabaseView userName="Ana" />);

    const link = await screen.findByRole("link", { name: "Abrir link" });
    expect(link).toHaveAttribute("href", "https://exemplo.com/pagina");
    expect(link).toHaveAttribute("target", "_blank");
    // O valor continua editável na célula (texto cru, sem o esquema).
    expect(screen.getByDisplayValue("exemplo.com/pagina")).toBeInTheDocument();
  });

  it("não cria link para um texto que não é endereço", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([URL_DATABASE]);
    fetchRowsMock.mockResolvedValue({
      rows: [{ id: "r1", values: { site: "só uma anotação" } }],
      nextCursor: null,
      hasMore: false,
    });

    render(<DatabaseView userName="Ana" />);

    expect(
      await screen.findByDisplayValue("só uma anotação"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Abrir link" }),
    ).not.toBeInTheDocument();
  });

  it("respeita o estado salvo vazio e não reabre o primeiro database", async () => {
    fetchProjectsMock.mockResolvedValue([PROJECT]);
    fetchDatabasesMock.mockResolvedValue([DATABASE, DATABASE2]);
    // Estado salvo vazio: o usuário fechou todas as abas antes de recarregar.
    fetchOpenDatabasesMock.mockResolvedValue({ ids: [], selectedId: null });

    render(<DatabaseView userName="Ana" />);

    expect(
      await screen.findByText("Nenhum database aberto"),
    ).toBeInTheDocument();
    // O primeiro database NÃO é reaberto automaticamente.
    expect(fetchRowsMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Fechar Tarefas" }),
    ).not.toBeInTheDocument();
  });
});
