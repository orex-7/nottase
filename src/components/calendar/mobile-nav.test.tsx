import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarSidebar } from "@/components/calendar/CalendarSidebar";
import { Header } from "@/components/calendar/Header";
import { ProjectsSidebar } from "@/components/database/ProjectsSidebar";
import type { ProjectSummary } from "@/components/database/ProjectsScreen";
import { useCalendarStore } from "@/store/useCalendarStore";

/**
 * Navegação off-canvas do celular.
 *
 * O jsdom não calcula layout (media queries, `clientWidth`, posições), então os
 * testes aqui verificam **estado/DOM**: o botão do Header, a classe de
 * deslocamento da gaveta e o fechamento ao navegar — não o resultado visual.
 */

const PROJECT: ProjectSummary = {
  id: "p1",
  name: "Geral",
  category: null,
  color: null,
  databaseCount: 1,
};

function renderHeader(onOpenMobileNav = vi.fn()) {
  render(
    <Header
      appView="database"
      onChangeAppView={() => {}}
      year={2026}
      month={3}
      day={10}
      viewMode="month"
      onPrev={() => {}}
      onNext={() => {}}
      onToday={() => {}}
      onChangeView={() => {}}
      onCreate={() => {}}
      userName="Ana"
      userEmail="ana@exemplo.com"
      userAvatar={null}
      onOpenMobileNav={onOpenMobileNav}
      mobileNavOpen={false}
    />,
  );
  return { onOpenMobileNav };
}

function renderProjectsSidebar(
  overrides: Partial<ComponentProps<typeof ProjectsSidebar>> = {},
) {
  const onOpenProject = vi.fn();
  const onCloseMobile = vi.fn();
  const utils = render(
    <ProjectsSidebar
      projects={[PROJECT]}
      categories={[]}
      activeProjectId="p1"
      onOpenProject={onOpenProject}
      onCreateProject={() => {}}
      onCreateCategory={() => {}}
      onReorderCategories={() => {}}
      onReorderProjects={() => {}}
      onUpdateProject={() => {}}
      onUpdateCategory={() => {}}
      onDeleteCategory={() => {}}
      onDeleteProject={() => {}}
      onCloseMobile={onCloseMobile}
      {...overrides}
    />,
  );
  return { onOpenProject, onCloseMobile, ...utils };
}

function renderCalendarSidebar(
  overrides: Partial<ComponentProps<typeof CalendarSidebar>> = {},
) {
  const onSelectDate = vi.fn();
  const onOpenDatabase = vi.fn();
  const onCloseMobile = vi.fn();
  render(
    <CalendarSidebar
      year={2026}
      month={3}
      selectedDate="2026-04-10"
      eventDates={new Set()}
      onSelectDate={onSelectDate}
      onPrevMonth={() => {}}
      onNextMonth={() => {}}
      onToday={() => {}}
      onOpenDatabase={onOpenDatabase}
      onCreateDatabase={() => {}}
      onCloseMobile={onCloseMobile}
      {...overrides}
    />,
  );
  return { onSelectDate, onOpenDatabase, onCloseMobile };
}

beforeEach(() => {
  window.localStorage.clear();
  useCalendarStore.setState({ sidebarDatabases: [] });
});

describe("Navegação off-canvas — Header", () => {
  it("chama onOpenMobileNav ao clicar no botão de navegação", () => {
    const { onOpenMobileNav } = renderHeader();

    const button = screen.getByRole("button", { name: "Abrir navegação" });
    // O botão só aparece no celular (media query aplicada pelo navegador).
    expect(button.className).toContain("md:hidden");

    fireEvent.click(button);
    expect(onOpenMobileNav).toHaveBeenCalledTimes(1);
  });
});

describe("Navegação off-canvas — sidebar de projetos", () => {
  it("mantém a gaveta fora da tela quando fechada", () => {
    const { container } = renderProjectsSidebar({ mobileOpen: false });

    const aside = container.querySelector("aside");
    expect(aside?.className.split(/\s+/)).toContain("-translate-x-full");
  });

  it("desliza a gaveta para dentro quando aberta", () => {
    const { container } = renderProjectsSidebar({ mobileOpen: true });

    const aside = container.querySelector("aside");
    // Token exato: `md:translate-x-0` (outro token) não conta.
    expect(aside?.className.split(/\s+/)).toContain("translate-x-0");
  });

  it("mostra a versão expandida no celular mesmo com a sidebar minimizada", () => {
    // Preferência de minimização persistida (vale no desktop).
    window.localStorage.setItem("workspace:projectsSidebarCollapsed", "1");

    renderProjectsSidebar({ mobileOpen: true });

    // A versão expandida tem o rótulo "Projetos"/linha "Novo projeto"; o rail
    // só teria os ícones (com `aria-label`).
    expect(screen.getByText("Novo projeto")).toBeInTheDocument();
  });

  it("fecha a gaveta pelo botão de minimizar no celular", () => {
    const { onCloseMobile } = renderProjectsSidebar({ mobileOpen: true });

    // No celular o botão de "minimizar" fecha a gaveta (não há estado
    // minimizado no drawer).
    fireEvent.click(screen.getByRole("button", { name: "Fechar navegação" }));

    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });

  it("fecha a gaveta ao abrir um projeto", async () => {
    const { onOpenProject, onCloseMobile } = renderProjectsSidebar({
      mobileOpen: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Geral" }));
    fireEvent.click(await screen.findByTitle("Abrir projeto"));

    expect(onOpenProject).toHaveBeenCalledWith("p1");
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });
});

describe("Navegação off-canvas — sidebar do calendário", () => {
  it("fecha a gaveta ao selecionar um dia", () => {
    const { onSelectDate, onCloseMobile } = renderCalendarSidebar({
      mobileOpen: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "2026-04-10" }));

    expect(onSelectDate).toHaveBeenCalledWith("2026-04-10");
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });

  it("fecha a gaveta ao abrir um database fixado", () => {
    useCalendarStore.setState({
      sidebarDatabases: [{ id: "db1", name: "Tarefas", icon: null }],
    });
    const { onOpenDatabase, onCloseMobile } = renderCalendarSidebar({
      mobileOpen: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Tarefas" }));

    expect(onOpenDatabase).toHaveBeenCalledWith("db1");
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });
});
