"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  ChevronRight,
  CircleDashed,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  LayoutTemplate,
  Plus,
  Settings2,
  SlidersHorizontal,
  Table2,
  Trash2,
  X,
  Zap,
} from "lucide-react";

import {
  COLUMN_TYPES,
  RELATION_LIMITS,
  ROLLUP_FUNCTIONS,
  columnIcon,
  columnTypeMeta,
  editableOptionsForColumn,
  tableGroupColumns,
  type TableGroup,
} from "@/components/database/database-fields";
import {
  PAGE_LAYOUTS,
  VIEW_TYPES,
  type DbViewType,
  type PageLayout,
} from "@/components/database/database-views";
import {
  CHART_KINDS,
  type ChartConfig,
} from "@/components/database/database-chart";
import { SelectOptionsEditor } from "@/components/database/SelectOptionsPopover";
import { AutomationsPanel } from "@/components/database/AutomationsPanel";
import {
  markOptionDrag,
  OPTION_DROP_BAR,
} from "@/components/database/option-dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ICON_OPTIONS, databaseIcon } from "@/lib/database-icons";
import { cn } from "@/lib/utils";
import type {
  Column,
  RelationLimit,
  RollupConfig,
  RollupFunction,
} from "@/types/database";

/** Configuração de uma relação editada no popover (aplicada ao salvar). */
export interface RelationDraft {
  limit: RelationLimit;
  bidirectional: boolean;
  reverseName: string;
}

/**
 * Popover de configurações da tabela (database), ancorado logo abaixo do botão
 * de configurações. Permite renomear a tabela, gerenciar propriedades (colunas)
 * e excluir a tabela inteira.
 * Componente de nível de módulo para preservar o estado dos campos entre renders.
 */
interface TableSettingsPopoverProps {
  open: boolean;
  /** Elemento ao qual o popover fica ancorado (botão de configurações). */
  anchorEl?: HTMLElement | null;
  title: string;
  /** Icone escolhido do database (nome lucide ou `null` para o padrao). */
  icon: string | null;
  columns: Column[];
  /** Renomeia a tabela. */
  onRename: (name: string) => void;
  /** Define (ou limpa, com `null`) o icone escolhido do database. */
  onUpdateIcon: (icon: string | null) => void;
  /** Atualiza nome/tipo de uma coluna. */
  onUpdateColumn: (id: string, patch: Partial<Column>) => void;
  /** Adiciona uma nova coluna. */
  onAddColumn: () => void;
  /** Remove uma coluna. */
  onRemoveColumn: (id: string) => void;
  /** Exclui a tabela inteira. */
  onDeleteDatabase: () => void;
  /** Tipo (layout) da visualização ativa. */
  activeViewType: DbViewType;
  /** Altera o tipo (layout) da visualização ativa. */
  onChangeViewType: (type: DbViewType) => void;
  /**
   * Como a página de um item é aberta: na área do conteúdo ("Página inteira"),
   * centralizada ou ancorada à direita.
   */
  pageLayout: PageLayout;
  /** Altera como a página de um item é aberta. */
  onChangePageLayout: (layout: PageLayout) => void;
  /** Configuração da visualização "Gráfico" (para escolher o formato). */
  chartConfig: ChartConfig;
  /** Atualiza a configuração do gráfico (formato etc.). */
  onChangeChartConfig: (patch: Partial<ChartConfig>) => void;
  /**
   * Databases do usuário (id/nome/colunas) para escolher o destino de uma
   * relação e a propriedade alvo de um rollup. `linkedDatabaseId` marca as
   * visões vinculadas (excluídas como destino de relação).
   */
  databases: {
    id: string;
    name: string;
    columns: Column[];
    linkedDatabaseId?: string | null;
  }[];
  /** Id do database atual (não é oferecido como destino de relação). */
  currentDatabaseId: string;
  /** Nome do database atual (default do nome do espelho bidirecional). */
  currentDatabaseName: string;
  /** Salva a configuração de uma relação (limite, bidirecional + espelho). */
  onSaveRelation: (columnId: string, config: RelationDraft) => void;
  /** Salva (ou limpa) a configuração de um rollup. */
  onSaveRollup: (columnId: string, config: RollupConfig | null) => void;
  /** Id da coluna usada para agrupar as linhas na visão Tabela (null = nenhum). */
  groupColumnId: string | null;
  /**
   * Grupos da coluna de agrupamento ativa, já na ordem persistida (incluindo
   * "Sem valor" e, para caixa de seleção, Marcado/Desmarcado). Vazio quando não
   * há agrupamento.
   */
  groupItems: TableGroup[];
  /** Persiste a nova ordem dos grupos (chaves de `groupItems`). */
  onReorderGroups: (order: string[]) => void;
  /** Alterna a visibilidade (oculto/visível) de um grupo. */
  onToggleGroupHidden: (key: string) => void;
  /** Define (ou limpa, com `null`) a coluna de agrupamento da visão Tabela. */
  onChangeGroupColumn: (columnId: string | null) => void;
  /** Tela exibida ao abrir o popover (padrão: menu principal). */
  initialView?: "menu" | "edit" | "visibility" | "layout" | "group" | "automations";
  onClose: () => void;
}

export function TableSettingsPopover({
  open,
  anchorEl,
  title,
  icon,
  columns,
  onRename,
  onUpdateIcon,
  onUpdateColumn,
  onAddColumn,
  onRemoveColumn,
  onDeleteDatabase,
  activeViewType,
  onChangeViewType,
  pageLayout,
  onChangePageLayout,
  chartConfig,
  onChangeChartConfig,
  databases,
  currentDatabaseId,
  currentDatabaseName,
  onSaveRelation,
  onSaveRollup,
  groupColumnId,
  groupItems,
  onReorderGroups,
  onToggleGroupHidden,
  onChangeGroupColumn,
  initialView = "menu",
  onClose,
}: TableSettingsPopoverProps) {
  /** Confirmação em duas etapas para excluir a tabela. */
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Tela interna ativa do popover. */
  const [view, setView] = useState<
    | "menu"
    | "edit"
    | "property"
    | "type"
    | "visibility"
    | "layout"
    | "group"
    | "automations"
  >("menu");
  /** Coluna cujas configurações estão abertas na tela "property". */
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  /** Busca de propriedades na tela "edit". */
  const [propertySearch, setPropertySearch] = useState("");
  /** Id da coluna cujo seletor de ícone (da propriedade) está aberto. */
  const [propIconFor, setPropIconFor] = useState<string | null>(null);
  /** Posição (viewport) do seletor de ícone da propriedade. */
  const [propIconPos, setPropIconPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** Seletor de icone do database (ao lado do input de nome) esta aberto. */
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  /** Botao do icone do database, usado para ancorar o seletor flutuante. */
  const iconBtnRef = useRef<HTMLButtonElement>(null);
  /** Posicao (viewport) do seletor de icone, calculada ao abrir. */
  const [iconPickerPos, setIconPickerPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** Rascunho da configuração de relação por coluna (aplicado ao "Salvar"). */
  const [relationDrafts, setRelationDrafts] = useState<
    Record<string, RelationDraft>
  >({});
  /** Rascunho da configuração de rollup por coluna (aplicado ao "Salvar"). */
  const [rollupDrafts, setRollupDrafts] = useState<
    Record<string, RollupConfig | null>
  >({});
  /** Seletor flutuante "Agrupar por" (lista de propriedades) está aberto. */
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  /** Botão "Agrupar por", usado para ancorar o seletor flutuante. */
  const groupBtnRef = useRef<HTMLButtonElement>(null);
  /** Posição (viewport) do seletor "Agrupar por". */
  const [groupPickerPos, setGroupPickerPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** Busca de propriedades no seletor "Agrupar por". */
  const [groupSearch, setGroupSearch] = useState("");
  /** Id da opção de agrupamento sendo arrastada (reordenar grupos). */
  const [groupDragId, setGroupDragId] = useState<string | null>(null);
  /** Id da opção de agrupamento sob o cursor (destino do "solta aqui"). */
  const [groupOverId, setGroupOverId] = useState<string | null>(null);

  /** Abre/fecha o seletor de icone, posicionando-o sobre o botao (fora do
   * container rolavel, para nao ser recortado pelo popover de configuracoes). */
  const toggleIconPicker = () => {
    if (iconPickerOpen) {
      setIconPickerOpen(false);
      setIconPickerPos(null);
      return;
    }
    const rect = iconBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const pickerWidth = 256;
      const margin = 8;
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - pickerWidth - margin),
      );
      setIconPickerPos({ top: rect.bottom + 6, left });
    }
    setIconPickerOpen(true);
  };

  /** Abre/fecha o seletor de ícone de uma **propriedade**, ancorado no botão
   *  clicado (mesma técnica do ícone do database). */
  const togglePropertyIcon = (columnId: string, el: HTMLElement) => {
    if (propIconFor === columnId) {
      setPropIconFor(null);
      setPropIconPos(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const pickerWidth = 256;
    const margin = 8;
    const left = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, window.innerWidth - pickerWidth - margin),
    );
    setPropIconPos({ top: rect.bottom + 6, left });
    setPropIconFor(columnId);
  };

  /** Abre/fecha o seletor "Agrupar por", ancorado no botão clicado. */
  const toggleGroupPicker = () => {
    if (groupPickerOpen) {
      setGroupPickerOpen(false);
      setGroupPickerPos(null);
      return;
    }
    const el = groupBtnRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const pickerWidth = 256;
      const margin = 8;
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - pickerWidth - margin),
      );
      setGroupPickerPos({ top: rect.bottom + 6, left });
    }
    setGroupSearch("");
    setGroupPickerOpen(true);
  };

  // Ao reabrir o popover, volta para a tela inicial e **fecha os sub-popovers**:
  // o seletor de ícone é um portal (não é filho do popover), então sem isso ele
  // reaparecia aberto depois de fechar e reabrir as configurações.
  // `useLayoutEffect` para o ajuste valer já no 1º paint (sem piscar o seletor).
  useLayoutEffect(() => {
    if (!open) return;
    setView(initialView);
    setIconPickerOpen(false);
    setIconPickerPos(null);
    setConfirmDelete(false);
    setEditingColumnId(null);
    setPropertySearch("");
    setPropIconFor(null);
    setPropIconPos(null);
    setGroupPickerOpen(false);
    setGroupPickerPos(null);
    setGroupSearch("");
  }, [open, initialView]);
  /** Fecha o seletor "Agrupar por" ao sair da tela de agrupamento. */
  useEffect(() => {
    if (view !== "group") {
      setGroupPickerOpen(false);
      setGroupPickerPos(null);
    }
  }, [view]);
  /** Posição (top/right) do popover, ancorado abaixo do botão de configurações. */
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Posiciona o popover logo abaixo do botão âncora, alinhado à direita.
  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setPos(null);
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }, [open, anchorEl]);

  /** Icone atual do database (resolvido a partir do nome persistido). */
  const ActiveIcon = databaseIcon(icon);

  /** Coluna cujas configurações estão abertas na tela "property". */
  const editingColumn = columns.find((c) => c.id === editingColumnId) ?? null;

  /** Ícone atual da propriedade cujo seletor está aberto (para marcar o ativo). */
  const propIcon = columns.find((c) => c.id === propIconFor)?.icon ?? null;

  /** Propriedades filtradas pela busca (tela "edit"). */
  const searchTerm = propertySearch.trim().toLowerCase();
  const visibleColumns = searchTerm
    ? columns.filter((c) => c.name.toLowerCase().includes(searchTerm))
    : columns;

  /** Colunas agrupáveis, filtradas pela busca do seletor "Agrupar por". */
  const groupSearchTerm = groupSearch.trim().toLowerCase();
  const groupableColumns = tableGroupColumns(columns).filter((c) =>
    groupSearchTerm ? c.name.toLowerCase().includes(groupSearchTerm) : true,
  );

  /**
   * Visões vinculadas não recebem automações: elas não têm linhas próprias (o
   * worker opera no database de origem). Mesmo predicado usado nos alvos de
   * relação (ver `relationTargets`).
   */
  const currentIsView = databases.some(
    (d) => d.id === currentDatabaseId && Boolean(d.linkedDatabaseId),
  );

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        role="presentation"
      >
      <div
        className="absolute flex max-h-[80vh] w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-lg border bg-popover shadow-xl"
        style={pos ? { top: pos.top, right: pos.right } : { top: -9999, right: 0 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Configurações da tabela"
      >
        <div
          className={cn(
            "flex items-center gap-2 py-2.5",
            // Na tela da propriedade os ícones do cabeçalho (voltar/fechar)
            // ficam alinhados com os ícones de baixo (recuados por `px-2`).
            view === "property" ? "px-3" : "px-4",
            // Sem divisória na tela da propriedade (o nome já aparece abaixo)
            // nem na lista de tipos.
            view !== "property" && view !== "type" && "border-b",
          )}
        >
          {view !== "menu" ? (
            <button
              type="button"
              // Da tela de tipos volta para a propriedade; da propriedade, para
              // a lista; das demais, volta ao menu principal.
              onClick={() =>
                setView(
                  view === "property"
                    ? "edit"
                    : view === "type"
                      ? "property"
                      : "menu",
                )
              }
              aria-label="Voltar"
              title="Voltar"
              className="flex h-[30px] w-[30px] items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Settings2 className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-base font-semibold">
            {view === "menu"
              ? "Configurações da tabela"
              : view === "edit"
                ? "Editar propriedades"
                : view === "property"
                  ? (editingColumn?.name ?? "Propriedade")
                  : view === "type"
                    ? "Alterar tipo"
                    : view === "layout"
                    ? "Layout"
                    : view === "group"
                      ? "Agrupar"
                      : view === "automations"
                        ? "Automações"
                        : "Visibilidade de propriedades"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="ml-auto flex h-[30px] w-[30px] items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto",
            // Menos padding na tela de uma propriedade.
            view === "property" ? "px-2 py-2" : "px-4 py-3",
          )}
        >
          {view === "menu" ? (
            <>
              {/* Nome + seletor de icone lado a lado */}
              <div className="space-y-1 mb-2">
                <div className="relative flex items-center gap-2">
                  <button
                    ref={iconBtnRef}
                    type="button"
                    onClick={toggleIconPicker}
                    aria-haspopup="menu"
                    aria-expanded={iconPickerOpen}
                    title="Escolher icone"
                    aria-label="Escolher icone"
                    className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <ActiveIcon className="h-4 w-4" />
                  </button>

                  <Input
                    value={title}
                    onChange={(e) => onRename(e.target.value)}
                    placeholder="Nome da tabela"
                    aria-label="Nome da tabela"
                  />
                </div>
              </div>

              {/* Ações de propriedades */}
              <div>
                <button
                  type="button"
                  onClick={() => setView("layout")}
                  className="flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                >
                  <LayoutTemplate className="h-4 w-4 flex-none text-muted-foreground" />
                  <span className="flex-1 text-[13px] font-medium">Layout</span>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </button>
                {/* Formato do gráfico: aparece logo abaixo de "Layout" quando a
                    visualização ativa é um Gráfico. */}
                {activeViewType === "chart" ? (
                  <div className="mb-1 ml-2 mr-2 mt-0.5 flex items-center justify-between gap-1">
                    {CHART_KINDS.map((option) => {
                      const OptionIcon = option.icon;
                      const isActive = option.kind === chartConfig.kind;
                      return (
                        <button
                          key={option.kind}
                          type="button"
                          onClick={() =>
                            onChangeChartConfig({ kind: option.kind })
                          }
                          aria-pressed={isActive}
                          aria-label={option.label}
                          title={option.label}
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded transition-colors",
                            isActive
                              ? "text-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                        >
                          <OptionIcon className="h-6 w-6" />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setView("visibility")}
                  className="flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                >
                  <Eye className="h-4 w-4 flex-none text-muted-foreground" />
                  <span className="flex-1 text-[13px] font-medium">
                    Visibilidade de propriedades
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => setView("group")}
                  className="flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                >
                  <Layers className="h-4 w-4 flex-none text-muted-foreground" />
                  <span className="flex-1 text-[13px] font-medium">Agrupar</span>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </button>
                <div className="my-1 border-t" />
                <button
                  type="button"
                  onClick={() => setView("edit")}
                  className="flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                >
                  <SlidersHorizontal className="h-4 w-4 flex-none text-muted-foreground" />
                  <span className="flex-1 text-[13px] font-medium">
                    Editar propriedades
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </button>
                {currentIsView ? null : (
                  <button
                    type="button"
                    onClick={() => setView("automations")}
                    className="flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                  >
                    <Zap className="h-4 w-4 flex-none text-muted-foreground" />
                    <span className="flex-1 text-[13px] font-medium">
                      Automações
                    </span>
                    <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                  </button>
                )}
              </div>
            </>
          ) : view === "edit" ? (
            <div className="space-y-2 mb-2">
              <Input
                value={propertySearch}
                onChange={(e) => setPropertySearch(e.target.value)}
                placeholder="Buscar propriedade"
                aria-label="Buscar propriedade"
              />
              <ul className="space-y-0.5">
                {visibleColumns.map((column) => {
                  const TypeIcon = columnIcon(column);
                  return (
                    <li key={column.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingColumnId(column.id);
                          setView("property");
                        }}
                        className="flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                      >
                        <TypeIcon className="h-4 w-4 flex-none text-muted-foreground" />
                        <span className="flex-1 truncate text-[13px] font-medium">
                          {column.name}
                        </span>
                        <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                      </button>
                    </li>
                  );
                })}
                {visibleColumns.length === 0 ? (
                  <li className="px-2.5 py-1.5 text-sm text-muted-foreground">
                    Nenhuma propriedade encontrada.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : view === "property" ? (
            <div className="space-y-2 mb-2">
              <ul className="space-y-1.5">
              {columns.filter((c) => c.id === editingColumnId).map((column) => {
                const meta = columnTypeMeta(column.type);
                const TypeIcon = columnIcon(column);
                /** Opções atuais da propriedade (seleção/status). */
                const columnOptions = editableOptionsForColumn(column);
                /** Propriedades com lista de opções (seleção/status). */
                const hasOptions =
                  column.type === "select" ||
                  column.type === "status" ||
                  column.type === "multi_select";
                /**
                 * Databases que podem ser alvo de uma relação: exceto o atual e as
                 * **visões vinculadas** (não têm colunas próprias para resolver).
                 */
                const relationTargets = databases.filter(
                  (d) => d.id !== currentDatabaseId && !d.linkedDatabaseId,
                );
                /** O alvo configurado não existe mais (database excluído). */
                const staleTarget =
                  !!column.relationDatabaseId &&
                  !databases.some((d) => d.id === column.relationDatabaseId);
                /** Rascunho da relação desta coluna (aplicado no "Salvar"). */
                const relationDraft: RelationDraft = relationDrafts[column.id] ?? {
                  limit: column.limit ?? "many",
                  bidirectional: column.isBidirectional ?? false,
                  reverseName: `Relacionado com ${currentDatabaseName}`,
                };
                /** Database alvo atual (nome exibido no checkbox de espelho). */
                const relationTarget = databases.find(
                  (d) => d.id === column.relationDatabaseId,
                );
                /** Relações desta tabela (para a configuração de rollup). */
                const relationColumns = columns.filter(
                  (c) => c.type === "relation" && c.relationDatabaseId,
                );
                /** Rascunho do rollup desta coluna (aplicado no "Salvar"). */
                const rollupDraft: RollupConfig = rollupDrafts[column.id] ??
                  column.rollup ?? {
                    relationPropertyId: "",
                    targetPropertyId: "",
                    fn: "count_all",
                  };
                /** Database alvo da relação escolhida no rollup. */
                const rollupRelationColumn = relationColumns.find(
                  (c) => c.id === rollupDraft.relationPropertyId,
                );
                const rollupTargetDb = rollupRelationColumn?.relationDatabaseId
                  ? databases.find(
                      (d) => d.id === rollupRelationColumn.relationDatabaseId,
                    )
                  : undefined;
                /** Propriedades do alvo (rollup de rollup é proibido). */
                const rollupTargetColumns = (rollupTargetDb?.columns ?? []).filter(
                  (c) => c.type !== "rollup",
                );
                return (
                  <li
                    key={column.id}
                    className="flex flex-wrap items-center gap-2 py-1"
                  >
                    <button
                      type="button"
                      onClick={(e) =>
                        togglePropertyIcon(column.id, e.currentTarget)
                      }
                      aria-haspopup="menu"
                      aria-expanded={propIconFor === column.id}
                      title="Escolher ícone da propriedade"
                      aria-label={`Ícone da propriedade ${column.name}`}
                      className="flex h-[30px] flex-none items-center justify-center rounded border px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <TypeIcon className="h-4 w-4" />
                    </button>
                    <Input
                      value={column.name}
                      onChange={(e) => onUpdateColumn(column.id, { name: e.target.value })}
                      className="min-w-0 flex-1 px-2"
                      aria-label={`Nome da propriedade ${column.name}`}
                    />
                    {/* "Alterar tipo" abre a lista de tipos na própria aba. */}
                    <div className="basis-full">
                      <button
                        type="button"
                        onClick={() => setView("type")}
                        className="flex w-full items-center gap-3 rounded py-1.5 pl-2 pr-2 text-left hover:bg-accent"
                        aria-label={`Alterar tipo da propriedade ${column.name}`}
                        title="Alterar tipo"
                      >
                        <ArrowLeftRight className="h-4 w-4 flex-none text-foreground" />
                        <span className="flex-1 text-[13px] font-medium text-foreground">
                          Alterar tipo
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {meta.label}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    </div>
                    {hasOptions ? (
                      <div className="basis-full">
                        {/* Divisória acima de "Opções". */}
                        <div className="my-1.5 h-px bg-border" />
                        <SelectOptionsEditor
                          options={columnOptions}
                          onChange={(options) =>
                            onUpdateColumn(column.id, { options })
                          }
                        />
                      </div>
                    ) : null}
                    {column.type === "relation" ? (
                      <div className="basis-full space-y-1.5">
                        <label
                          htmlFor={`relation-target-${column.id}`}
                          className="block text-[11px] uppercase tracking-wide text-muted-foreground"
                        >
                          Database de destino
                        </label>
                        <select
                          id={`relation-target-${column.id}`}
                          value={column.relationDatabaseId ?? ""}
                          onChange={(e) =>
                            onUpdateColumn(column.id, {
                              relationDatabaseId: e.target.value || undefined,
                            })
                          }
                          className="w-full rounded border bg-background px-2 py-1 text-sm outline-none"
                        >
                          <option value="">Escolha um database…</option>
                          {staleTarget ? (
                            <option value={column.relationDatabaseId} disabled>
                              Database removido
                            </option>
                          ) : null}
                          {relationTargets.map((db) => (
                            <option key={db.id} value={db.id}>
                              {db.name}
                            </option>
                          ))}
                        </select>
                        {staleTarget ? (
                          <p className="px-1 text-[11px] text-destructive">
                            O database escolhido foi removido. Escolha outro.
                          </p>
                        ) : null}
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor={`relation-limit-${column.id}`}
                            className="text-[11px] uppercase tracking-wide text-muted-foreground"
                          >
                            Limite
                          </label>
                          <select
                            id={`relation-limit-${column.id}`}
                            value={relationDraft.limit}
                            onChange={(e) =>
                              setRelationDrafts((prev) => ({
                                ...prev,
                                [column.id]: {
                                  ...relationDraft,
                                  limit: e.target.value as RelationLimit,
                                },
                              }))
                            }
                            className="flex-1 rounded border bg-background px-2 py-1 text-sm outline-none"
                          >
                            {RELATION_LIMITS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={relationDraft.bidirectional}
                            disabled={!relationTarget}
                            onChange={(e) =>
                              setRelationDrafts((prev) => ({
                                ...prev,
                                [column.id]: {
                                  ...relationDraft,
                                  bidirectional: e.target.checked,
                                },
                              }))
                            }
                          />
                          Mostrar relacionado em{" "}
                          {relationTarget ? relationTarget.name : "—"}
                        </label>
                        {relationDraft.bidirectional ? (
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`relation-reverse-${column.id}`}
                              className="text-[11px] uppercase tracking-wide text-muted-foreground"
                            >
                              Nome do espelho
                            </label>
                            <Input
                              id={`relation-reverse-${column.id}`}
                              value={relationDraft.reverseName}
                              onChange={(e) =>
                                setRelationDrafts((prev) => ({
                                  ...prev,
                                  [column.id]: {
                                    ...relationDraft,
                                    reverseName: e.target.value,
                                  },
                                }))
                              }
                              aria-label={`Nome do espelho de ${column.name}`}
                            />
                          </div>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={!relationTarget}
                          onClick={() => onSaveRelation(column.id, relationDraft)}
                        >
                          Salvar relação
                        </Button>
                      </div>
                    ) : null}
                    {column.type === "rollup" ? (
                      <div className="basis-full space-y-1.5">
                        <label
                          htmlFor={`rollup-relation-${column.id}`}
                          className="block text-[11px] uppercase tracking-wide text-muted-foreground"
                        >
                          Relação
                        </label>
                        <select
                          id={`rollup-relation-${column.id}`}
                          value={rollupDraft.relationPropertyId}
                          onChange={(e) =>
                            setRollupDrafts((prev) => ({
                              ...prev,
                              [column.id]: {
                                ...rollupDraft,
                                relationPropertyId: e.target.value,
                                targetPropertyId: "",
                              },
                            }))
                          }
                          className="w-full rounded border bg-background px-2 py-1 text-sm outline-none"
                        >
                          <option value="">Escolha uma relação…</option>
                          {relationColumns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <label
                          htmlFor={`rollup-target-${column.id}`}
                          className="block text-[11px] uppercase tracking-wide text-muted-foreground"
                        >
                          Propriedade
                        </label>
                        <select
                          id={`rollup-target-${column.id}`}
                          value={rollupDraft.targetPropertyId}
                          disabled={!rollupDraft.relationPropertyId}
                          onChange={(e) =>
                            setRollupDrafts((prev) => ({
                              ...prev,
                              [column.id]: {
                                ...rollupDraft,
                                targetPropertyId: e.target.value,
                              },
                            }))
                          }
                          className="w-full rounded border bg-background px-2 py-1 text-sm outline-none disabled:opacity-60"
                        >
                          <option value="">Escolha uma propriedade…</option>
                          {rollupTargetColumns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <label
                          htmlFor={`rollup-fn-${column.id}`}
                          className="block text-[11px] uppercase tracking-wide text-muted-foreground"
                        >
                          Função
                        </label>
                        <select
                          id={`rollup-fn-${column.id}`}
                          value={rollupDraft.fn}
                          onChange={(e) =>
                            setRollupDrafts((prev) => ({
                              ...prev,
                              [column.id]: {
                                ...rollupDraft,
                                fn: e.target.value as RollupFunction,
                              },
                            }))
                          }
                          className="w-full rounded border bg-background px-2 py-1 text-sm outline-none"
                        >
                          {ROLLUP_FUNCTIONS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={
                            !rollupDraft.relationPropertyId ||
                            !rollupDraft.targetPropertyId
                          }
                          onClick={() =>
                            onSaveRollup(
                              column.id,
                              rollupDraft.relationPropertyId &&
                                rollupDraft.targetPropertyId
                                ? rollupDraft
                                : null,
                            )
                          }
                        >
                          Salvar rollup
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            </div>
          ) : view === "type" ? (
            <div className="space-y-1">
              {COLUMN_TYPES.map((t) => {
                const OptIcon = t.icon;
                const isCurrent = editingColumn?.type === t.type;
                return (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => {
                      if (editingColumn) {
                        onUpdateColumn(editingColumn.id, { type: t.type });
                      }
                      setView("property");
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                      isCurrent && "bg-accent",
                    )}
                  >
                    <OptIcon className="h-4 w-4 flex-none text-muted-foreground" />
                    <span className="flex-1">{t.label}</span>
                    {isCurrent ? (
                      <Check className="h-4 w-4 flex-none text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : view === "layout" ? (
            <div className="space-y-3 mb-2">
              <div className="space-y-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Layout
                </span>
                <div className="space-y-1">
                  {VIEW_TYPES.map((option) => {
                    const OptionIcon = option.icon;
                    const isActive = option.type === activeViewType;
                    return (
                      <button
                        key={option.type}
                        type="button"
                        onClick={() => onChangeViewType(option.type)}
                        aria-pressed={isActive}
                        title={`Usar layout ${option.label}`}
                        className={cn(
                          "flex w-full items-center gap-3 rounded border px-2.5 py-1.5 text-left hover:bg-accent",
                          isActive
                            ? "border-primary bg-accent"
                            : "border-transparent",
                        )}
                      >
                        <OptionIcon className="h-4 w-4 flex-none text-muted-foreground" />
                        <span className="flex-1 text-[13px] font-medium">
                          {option.label}
                        </span>
                        {isActive ? (
                          <Check className="h-4 w-4 flex-none text-primary" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Como a página do item é aberta (afeta a tabela). */}
              <div className="space-y-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Abertura da página
                </span>
                <div className="space-y-1">
                  {PAGE_LAYOUTS.map((option) => {
                    const isActive = option.layout === pageLayout;
                    return (
                      <button
                        key={option.layout}
                        type="button"
                        onClick={() => onChangePageLayout(option.layout)}
                        aria-pressed={isActive}
                        title={`Abrir a página ${option.label.toLowerCase()}`}
                        className={cn(
                          "flex w-full items-center gap-3 rounded border px-2.5 py-1.5 text-left hover:bg-accent",
                          isActive
                            ? "border-primary bg-accent"
                            : "border-transparent",
                        )}
                      >
                        <span className="flex-1 text-[13px] font-medium">
                          {option.label}
                        </span>
                        {isActive ? (
                          <Check className="h-4 w-4 flex-none text-primary" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : view === "group" ? (
            <div className="space-y-2 mb-2">
              <button
                ref={groupBtnRef}
                type="button"
                onClick={toggleGroupPicker}
                aria-haspopup="menu"
                aria-expanded={groupPickerOpen}
                className="flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent"
              >
                <span className="text-[13px] font-medium">Agrupar por</span>
                <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right text-[13px] font-medium text-muted-foreground">
                  <span className="min-w-0 truncate">
                    {groupColumnId
                      ? (columns.find((c) => c.id === groupColumnId)?.name ??
                        "Nenhum")
                      : "Nenhum"}
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </span>
              </button>
              {groupColumnId && groupItems.length > 0 ? (
                <div className="space-y-0.5 border-t pt-2">
                  <span className="px-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Grupos
                  </span>
                  <ul className="space-y-0.5">
                    {groupItems.map((group) => {
                      const isDragging = groupDragId === group.key;
                      const showDropBar =
                        groupOverId === group.key &&
                        groupDragId !== null &&
                        groupDragId !== group.key;
                      return (
                        <li
                          key={group.key}
                          onDragOver={(event) => {
                            if (!groupDragId) return;
                            event.preventDefault();
                            setGroupOverId(group.key);
                          }}
                          onDrop={(event) => {
                            if (!groupDragId) return;
                            event.preventDefault();
                            event.stopPropagation();
                            if (groupDragId !== group.key) {
                              const order = groupItems.map((g) => g.key);
                              const from = order.indexOf(groupDragId);
                              const to = order.indexOf(group.key);
                              if (from >= 0 && to >= 0) {
                                order.splice(from, 1);
                                order.splice(to, 0, groupDragId);
                                onReorderGroups(order);
                              }
                            }
                            setGroupDragId(null);
                            setGroupOverId(null);
                          }}
                          className={cn(
                            "relative flex items-center gap-1.5 rounded px-2 py-1",
                            isDragging && "opacity-50",
                            showDropBar && OPTION_DROP_BAR,
                          )}
                        >
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              setGroupDragId(group.key);
                              markOptionDrag(event, group.key);
                            }}
                            onDragEnd={() => {
                              setGroupDragId(null);
                              setGroupOverId(null);
                            }}
                            aria-label={`Reordenar grupo ${group.label}`}
                            title="Arrastar para reordenar"
                            className="flex h-4 w-3.5 flex-none cursor-grab items-center justify-center text-faint-foreground active:cursor-grabbing"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </button>
                          <span
                            className={cn(
                              "inline-flex min-w-0 max-w-full flex-1 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
                              group.color,
                              group.hidden && "opacity-50",
                            )}
                          >
                            <span className="truncate">{group.label}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => onToggleGroupHidden(group.key)}
                            aria-label={`${group.hidden ? "Mostrar" : "Ocultar"} grupo ${group.label}`}
                            aria-pressed={!group.hidden}
                            title={
                              group.hidden ? "Mostrar grupo" : "Ocultar grupo"
                            }
                            className={cn(
                              "flex h-6 w-6 flex-none items-center justify-center rounded hover:bg-accent",
                              group.hidden
                                ? "text-muted-foreground"
                                : "text-foreground",
                            )}
                          >
                            {group.hidden ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {groupColumnId ? (
                <>
                  <div className="border-t" />
                  <button
                    type="button"
                    onClick={() => onChangeGroupColumn(null)}
                    className="flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-4 w-4 flex-none" />
                    <span className="flex-1 text-[13px] font-medium">
                      Remover agrupamento
                    </span>
                  </button>
                </>
              ) : null}
            </div>
          ) : view === "automations" ? (
            <AutomationsPanel
              databaseId={currentDatabaseId}
              databases={databases}
              columns={columns}
            />
          ) : (
            <div className="space-y-2 mb-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Propriedades
              </span>
              <ul className="space-y-1.5">
                {columns.map((column) => {
                  const TypeIcon = columnIcon(column);
                  return (
                    <li
                      key={column.id}
                      className="flex items-center gap-2 rounded border px-2 py-1.5"
                    >
                      <TypeIcon className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                      <span className="flex-1 truncate text-sm">{column.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateColumn(column.id, { hidden: !column.hidden })
                        }
                        aria-label={`${column.hidden ? "Mostrar" : "Ocultar"} propriedade ${column.name}`}
                        aria-pressed={!column.hidden}
                        title={column.hidden ? "Mostrar propriedade" : "Ocultar propriedade"}
                        className={cn(
                          "flex h-[30px] w-[30px] flex-none items-center justify-center rounded hover:bg-accent",
                          column.hidden ? "text-muted-foreground" : "text-foreground",
                        )}
                      >
                        {column.hidden ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {/* Adicionar propriedade — no rodapé, acima de "Excluir tabela" e com
              uma divisória separando da lista de propriedades. */}
          {view === "edit" ? (
            <div className="mt-2 border-t pt-2">
              <button
                type="button"
                onClick={onAddColumn}
                className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-accent"
              >
                <Plus className="h-4 w-4 flex-none text-muted-foreground" />
                <span className="flex-1 text-[13px] font-medium">
                  Adicionar propriedade
                </span>
              </button>
            </div>
          ) : null}
          {/* No rodapé da tela de uma propriedade o botão exclui a propriedade;
              nas demais telas, exclui a tabela. A tela de agrupamento não tem
              rodapé (só o "Remover agrupamento" na própria lista). */}
          {view === "type" || view === "group" ? null : view === "property" && editingColumn ? (
            <div className="mt-2 border-t pt-2">
              <button
                type="button"
                onClick={() => {
                  onRemoveColumn(editingColumn.id);
                  setView("edit");
                }}
                className="group flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-accent hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 flex-none text-muted-foreground group-hover:text-destructive" />
                <span className="flex-1 text-[13px] font-medium">
                  Excluir propriedade
                </span>
              </button>
            </div>
          ) : confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2 rounded px-2.5 py-1.5 hover:bg-destructive/10">
              <span className="text-sm text-muted-foreground">
                Excluir a tabela e todos os itens? Essa ação é permanente.
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onDeleteDatabase}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir tabela
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="group flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 flex-none text-muted-foreground group-hover:text-destructive" />
              <span className="flex-1 text-[13px] font-medium">
                Excluir tabela
              </span>
            </button>
          )}
        </div>
      </div>
      </div>
      {/* Seletor de icone flutuante (fora do popover, para nao ser recortado
          pelo overflow do container rolavel). Mesma tecnica da paleta de cores. */}
      {iconPickerOpen && iconPickerPos
        ? createPortal(
            <div
              data-table-icon-picker
              style={{
                top: iconPickerPos.top,
                left: iconPickerPos.left,
                // Limita à altura que sobra na janela: com 100 ícones o seletor
                // passa da tela e precisa rolar.
                maxHeight: Math.max(
                  160,
                  window.innerHeight - iconPickerPos.top - 8,
                ),
              }}
              className="fixed z-[70] w-64 overflow-y-auto rounded-md border bg-popover p-2 shadow-md"
              role="menu"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  onUpdateIcon(null);
                  setIconPickerOpen(false);
                  setIconPickerPos(null);
                }}
                className={cn(
                  "mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                  !icon ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Table2 className="h-4 w-4" />
                Padrao
              </button>
              <div className="grid grid-cols-6 gap-1">
                {ICON_OPTIONS.map((option) => {
                  const OptionIcon = option.icon;
                  const isActive = icon === option.name;
                  return (
                    <button
                      key={option.name}
                      type="button"
                      title={option.name}
                      aria-label={option.name}
                      aria-pressed={isActive}
                      onClick={() => {
                        onUpdateIcon(option.name);
                        setIconPickerOpen(false);
                        setIconPickerPos(null);
                      }}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded hover:bg-accent",
                        isActive
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <OptionIcon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
      {/* Seletor de ícone de uma **propriedade** (mesma técnica do database). */}
      {propIconFor && propIconPos
        ? createPortal(
            <div
              data-prop-icon-picker
              style={{
                top: propIconPos.top,
                left: propIconPos.left,
                maxHeight: Math.max(
                  160,
                  window.innerHeight - propIconPos.top - 8,
                ),
              }}
              className="fixed z-[70] w-64 overflow-y-auto rounded-md border bg-popover p-2 shadow-md"
              role="menu"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  onUpdateColumn(propIconFor, { icon: undefined });
                  setPropIconFor(null);
                  setPropIconPos(null);
                }}
                className={cn(
                  "mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                  !propIcon ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <CircleDashed className="h-4 w-4" />
                Automático
              </button>
              <div className="grid grid-cols-6 gap-1">
                {ICON_OPTIONS.map((option) => {
                  const OptionIcon = option.icon;
                  const isActive = propIcon === option.name;
                  return (
                    <button
                      key={option.name}
                      type="button"
                      title={option.name}
                      aria-label={option.name}
                      aria-pressed={isActive}
                      onClick={() => {
                        onUpdateColumn(propIconFor, { icon: option.name });
                        setPropIconFor(null);
                        setPropIconPos(null);
                      }}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded hover:bg-accent",
                        isActive
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <OptionIcon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
      {/* Seletor flutuante "Agrupar por": input de busca no topo e a lista de
          propriedades agrupáveis abaixo (mesma técnica dos seletores de ícone). */}
      {groupPickerOpen && groupPickerPos
        ? createPortal(
            <div
              data-group-picker
              style={{
                top: groupPickerPos.top,
                left: groupPickerPos.left,
                maxHeight: Math.max(
                  160,
                  window.innerHeight - groupPickerPos.top - 8,
                ),
              }}
              className="fixed z-[70] flex w-64 flex-col overflow-hidden rounded-md border bg-popover shadow-md"
              role="menu"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b p-2">
                <Input
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="Buscar propriedade"
                  aria-label="Buscar propriedade para agrupar"
                  autoFocus
                />
              </div>
              <div className="flex-1 overflow-y-auto p-1">
                <button
                  type="button"
                  onClick={() => {
                    onChangeGroupColumn(null);
                    setGroupPickerOpen(false);
                    setGroupPickerPos(null);
                  }}
                  aria-pressed={groupColumnId === null}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                    groupColumnId === null && "bg-accent",
                  )}
                >
                  <X className="h-4 w-4 flex-none text-muted-foreground" />
                  <span className="flex-1">Nenhum</span>
                  {groupColumnId === null ? (
                    <Check className="h-4 w-4 flex-none text-primary" />
                  ) : null}
                </button>
                {groupableColumns.map((column) => {
                  const GroupIcon = columnIcon(column);
                  const isActive = groupColumnId === column.id;
                  return (
                    <button
                      key={column.id}
                      type="button"
                      onClick={() => {
                        onChangeGroupColumn(column.id);
                        setGroupPickerOpen(false);
                        setGroupPickerPos(null);
                      }}
                      aria-pressed={isActive}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                        isActive && "bg-accent",
                      )}
                    >
                      <GroupIcon className="h-4 w-4 flex-none text-muted-foreground" />
                      <span className="flex-1 truncate">{column.name}</span>
                      {isActive ? (
                        <Check className="h-4 w-4 flex-none text-primary" />
                      ) : null}
                    </button>
                  );
                })}
                {groupableColumns.length === 0 ? (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">
                    {tableGroupColumns(columns).length === 0
                      ? "Nenhuma propriedade agrupável."
                      : "Nenhuma propriedade encontrada."}
                  </p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
