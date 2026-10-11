import { create } from "zustand";

export type CalendarViewMode = "week" | "month";

/** Telas principais do app. */
export type AppView = "calendar" | "database";

/** Chave de persistência da visualização escolhida. */
const VIEW_MODE_KEY = "calendar:viewMode";

/** Chave de persistência da tela atual. */
const APP_VIEW_KEY = "app:view";

/** Chave de persistência do projeto ativo no Workspace. */
const ACTIVE_PROJECT_KEY = "workspace:activeProjectId";

/** Chave de persistência dos databases fixados na sidebar do calendário. */
const SIDEBAR_DATABASES_KEY = "calendar:sidebarDatabases";

/** Referência leve a um database exibido na sidebar (id + nome + ícone). */
export interface SidebarDatabase {
  id: string;
  name: string;
  /**
   * Nome de um ícone lucide escolhido pelo usuário (ex.: "Table2", "Folder").
   * `null`/ausente significa "Padrão" (usa `Table2`).
   */
  icon?: string | null;
}

function loadSidebarDatabases(): SidebarDatabase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SIDEBAR_DATABASES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SidebarDatabase =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as SidebarDatabase).id === "string" &&
        typeof (item as SidebarDatabase).name === "string",
    );
  } catch {
    return [];
  }
}

function saveSidebarDatabases(items: SidebarDatabase[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIDEBAR_DATABASES_KEY, JSON.stringify(items));
}

function loadViewMode(): CalendarViewMode {
  if (typeof window === "undefined") return "week";
  const stored = window.localStorage.getItem(VIEW_MODE_KEY);
  return stored === "month" || stored === "week" ? stored : "week";
}

function saveViewMode(mode: CalendarViewMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VIEW_MODE_KEY, mode);
}

function loadAppView(): AppView {
  // Padrão inicial: Workspace. Só cai no calendário se o usuário tiver
  // escolhido explicitamente essa tela em uma sessão anterior.
  if (typeof window === "undefined") return "database";
  const stored = window.localStorage.getItem(APP_VIEW_KEY);
  return stored === "calendar" ? "calendar" : "database";
}

function saveAppView(view: AppView): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APP_VIEW_KEY, view);
}

function loadActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_PROJECT_KEY);
}

function saveActiveProjectId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  else window.localStorage.removeItem(ACTIVE_PROJECT_KEY);
}

interface CalendarState {
  /** Tela atual do app: calendário ou database. */
  appView: AppView;
  /** Modo de visualização: semana (estilo Notion) ou mês. */
  viewMode: CalendarViewMode;
  /** Ano exibido no calendário. */
  year: number;
  /** Mês de referência (0-11). */
  month: number;
  /** Dia de referência (1-31) usado para ancorar a semana. */
  day: number;
  /** Dia atualmente selecionado (yyyy-MM-dd) para edição/listagem. */
  selectedDate: string | null;
  /** Id do evento em edição (null = criando novo). */
  editingEventId: string | null;
  /** Controla abertura do diálogo de evento. */
  isDialogOpen: boolean;
  /**
   * Pedido pendente para a tela de database, disparado a partir da sidebar do
   * calendário. `create` pede um novo database; `open` pede abrir um existente.
   * Consumido (e limpo) assim que a tela de database estiver pronta.
   */
  pendingDatabaseRequest: { type: "create" } | { type: "open"; id: string } | null;
  /**
   * Databases fixados na sidebar do calendário (mostrados acima do botão
   * "Adicionar database"). Persistido em localStorage.
   */
  sidebarDatabases: SidebarDatabase[];
  /**
   * Projeto ativo no Workspace. `null` significa que a tela de projetos está
   * sendo exibida; com um id, a tela mostra os databases daquele projeto.
   * Persistido em localStorage.
   */
  activeProjectId: string | null;

  setViewMode: (mode: CalendarViewMode) => void;
  /** Troca entre a tela de calendário e a de database (Workspace/projetos). */
  setAppView: (view: AppView) => void;
  /** Define o projeto ativo no Workspace (null volta para a lista de projetos). */
  setActiveProjectId: (id: string | null) => void;
  /** Pede a criação de um novo database (vai para a tela de database/projeto). */
  requestCreateDatabase: (projectId?: string | null) => void;
  /** Pede a abertura de um database existente (vai para a tela de database). */
  requestOpenDatabase: (id: string, projectId?: string | null) => void;
  /** Consome (limpa) o pedido pendente da tela de database. */
  consumeDatabaseRequest: () => void;
  /** Fixa (ou atualiza) um database na lista da sidebar do calendário. */
  addSidebarDatabase: (item: SidebarDatabase) => void;
  /**
   * Atualiza (ex.: renomeia) um database que já esteja fixado na sidebar,
   * sem adicioná-lo caso não esteja. Preserva a ordem atual da lista.
   */
  updateSidebarDatabase: (item: SidebarDatabase) => void;
  /** Remove um database da lista da sidebar do calendário. */
  removeSidebarDatabase: (id: string) => void;
  /**
   * Aplica as preferências salvas em localStorage no cliente.
   * Deve ser chamada apenas em um `useEffect` após a montagem, para que o
   * primeiro render do cliente coincida com o do servidor (sem hydration mismatch).
   */
  hydrate: () => void;
  setYear: (year: number) => void;
  setMonth: (month: number) => void;
  /** Avança o período conforme o modo de visualização. */
  goNext: () => void;
  /** Retrocede o período conforme o modo de visualização. */
  goPrev: () => void;
  /** Vai para o dia/mês atual. */
  goToToday: () => void;

  selectDate: (dateKey: string | null) => void;
  openCreateDialog: (dateKey: string) => void;
  openEditDialog: (eventId: string, dateKey: string) => void;
  closeDialog: () => void;
}

const now = new Date();

export const useCalendarStore = create<CalendarState>((set) => ({
  // Valores iniciais determinísticos (iguais no servidor e no 1º render do cliente).
  // As preferências salvas são aplicadas depois via `hydrate()`.
  // Padrão inicial: Workspace (database); a última tela escolhida é respeitada.
  appView: "database",
  viewMode: "week",
  year: now.getFullYear(),
  month: now.getMonth(),
  day: now.getDate(),
  selectedDate: null,
  editingEventId: null,
  isDialogOpen: false,
  pendingDatabaseRequest: null,
  sidebarDatabases: [],
  activeProjectId: null,

  setViewMode: (viewMode) => {
    saveViewMode(viewMode);
    set({ viewMode });
  },
  setAppView: (appView) => {
    saveAppView(appView);
    set({ appView });
  },
  setActiveProjectId: (id) => {
    saveActiveProjectId(id);
    set({ activeProjectId: id });
  },
  requestCreateDatabase: (projectId = null) => {
    saveAppView("database");
    saveActiveProjectId(projectId);
    set({
      appView: "database",
      activeProjectId: projectId,
      pendingDatabaseRequest: { type: "create" },
    });
  },
  requestOpenDatabase: (id, projectId = null) => {
    saveAppView("database");
    saveActiveProjectId(projectId);
    set({
      appView: "database",
      activeProjectId: projectId,
      pendingDatabaseRequest: { type: "open", id },
    });
  },
  consumeDatabaseRequest: () => set({ pendingDatabaseRequest: null }),
  addSidebarDatabase: (item) =>
    set((s) => {
      const exists = s.sidebarDatabases.some((d) => d.id === item.id);
      // Move o item para o fim (mais recente por último) ou o adiciona.
      const next = [
        ...s.sidebarDatabases.filter((d) => d.id !== item.id),
        ...(exists ? [] : [item]),
      ];
      saveSidebarDatabases(next);
      return { sidebarDatabases: next };
    }),
  updateSidebarDatabase: (item) =>
    set((s) => {
      // Só atualiza se já estiver fixado (não adiciona itens novos).
      if (!s.sidebarDatabases.some((d) => d.id === item.id)) return s;
      const next = s.sidebarDatabases.map((d) =>
        d.id === item.id ? { ...d, name: item.name, icon: item.icon } : d,
      );
      saveSidebarDatabases(next);
      return { sidebarDatabases: next };
    }),
  removeSidebarDatabase: (id) =>
    set((s) => {
      const next = s.sidebarDatabases.filter((d) => d.id !== id);
      saveSidebarDatabases(next);
      return { sidebarDatabases: next };
    }),
  hydrate: () =>
    set({
      appView: loadAppView(),
      viewMode: loadViewMode(),
      sidebarDatabases: loadSidebarDatabases(),
      activeProjectId: loadActiveProjectId(),
    }),
  setYear: (year) => set({ year }),
  setMonth: (month) => set({ month }),

  goNext: () =>
    set((s) => {
      if (s.viewMode === "week") {
        const next = new Date(s.year, s.month, s.day + 7);
        return {
          year: next.getFullYear(),
          month: next.getMonth(),
          day: next.getDate(),
        };
      }
      const total = s.year * 12 + s.month + 1;
      return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
    }),
  goPrev: () =>
    set((s) => {
      if (s.viewMode === "week") {
        const prev = new Date(s.year, s.month, s.day - 7);
        return {
          year: prev.getFullYear(),
          month: prev.getMonth(),
          day: prev.getDate(),
        };
      }
      const total = s.year * 12 + s.month - 1;
      return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
    }),
  goToToday: () => {
    const today = new Date();
    set({
      year: today.getFullYear(),
      month: today.getMonth(),
      day: today.getDate(),
    });
  },

  selectDate: (dateKey) => set({ selectedDate: dateKey }),
  openCreateDialog: (dateKey) =>
    set({ selectedDate: dateKey, editingEventId: null, isDialogOpen: true }),
  openEditDialog: (eventId, dateKey) =>
    set({ selectedDate: dateKey, editingEventId: eventId, isDialogOpen: true }),
  closeDialog: () => set({ isDialogOpen: false, editingEventId: null }),
}));
