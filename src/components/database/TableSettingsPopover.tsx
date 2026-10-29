"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  LayoutTemplate,
  Plus,
  Settings2,
  SlidersHorizontal,
  Table2,
  Tags,
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
  /** Tela exibida ao abrir o popover (padrão: menu principal). */
  initialView?: "menu" | "edit" | "visibility" | "layout" | "automations";
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
  initialView = "menu",
  onClose,
}: TableSettingsPopoverProps) {
  /** Confirmação em duas etapas para excluir a tabela. */
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Id da coluna que está com o seletor de tipo aberto. */
  const [openTypeFor, setOpenTypeFor] = useState<string | null>(null);
  /** Tela interna ativa do popover. */
  const [view, setView] = useState<
    "menu" | "edit" | "visibility" | "layout" | "automations"
  >("menu");
  /** Id da coluna cujo editor de opções (select/multi_select) está aberto. */
  const [openOptionsFor, setOpenOptionsFor] = useState<string | null>(null);
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

  // Volta para a tela inicial (menu ou edição) sempre que o popover reabre.
  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);

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
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          {view !== "menu" ? (
            <button
              type="button"
              onClick={() => setView("menu")}
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
                : view === "layout"
                  ? "Layout"
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

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
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
                  onClick={() => setView("edit")}
                  className="flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-left hover:bg-accent"
                >
                  <SlidersHorizontal className="h-4 w-4 flex-none text-muted-foreground" />
                  <span className="flex-1 text-[13px] font-medium">
                    Editar propriedades
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </button>
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Propriedades
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={onAddColumn}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar propriedade
                </Button>
              </div>
              <ul className="space-y-1.5">
              {columns.map((column) => {
                const meta = columnTypeMeta(column.type);
                const TypeIcon = columnIcon(column);
                const isTypeOpen = openTypeFor === column.id;
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
                    className="flex flex-wrap items-center gap-2 rounded border bg-background px-2 py-1.5"
                  >
                    <TypeIcon className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                    <Input
                      value={column.name}
                      onChange={(e) => onUpdateColumn(column.id, { name: e.target.value })}
                      className="min-w-0 flex-1 border-0 px-1 shadow-none"
                      aria-label={`Nome da propriedade ${column.name}`}
                    />
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenTypeFor((cur) => (cur === column.id ? null : column.id))
                        }
                        className="flex h-[30px] items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={`Tipo da propriedade ${column.name}`}
                        title="Alterar tipo"
                      >
                        {meta.label}
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      {isTypeOpen ? (
                        <div className="absolute right-0 top-8 z-10 w-48 overflow-hidden rounded-md border bg-popover py-1 shadow-lg">
                          {COLUMN_TYPES.map((t) => {
                            const OptIcon = t.icon;
                            return (
                              <button
                                key={t.type}
                                type="button"
                                onClick={() => {
                                  onUpdateColumn(column.id, { type: t.type });
                                  setOpenTypeFor(null);
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent",
                                  column.type === t.type && "bg-accent",
                                )}
                              >
                                <OptIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                {t.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    {column.type === "select" ||
                    column.type === "status" ||
                    column.type === "multi_select" ? (
                      <button
                        type="button"
                        onClick={() =>
                          setOpenOptionsFor((cur) => (cur === column.id ? null : column.id))
                        }
                        aria-label={`Editar opções de ${column.name}`}
                        aria-expanded={openOptionsFor === column.id}
                        title="Editar opções"
                        className={cn(
                          "flex h-7 flex-none items-center gap-1 rounded px-2 text-xs hover:bg-accent hover:text-foreground",
                          openOptionsFor === column.id
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <Tags className="h-3.5 w-3.5" />
                        Opções
                      </button>
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
                    <button
                      type="button"
                      onClick={() => onUpdateColumn(column.id, { hidden: !column.hidden })}
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
                    <button
                      type="button"
                      onClick={() => onRemoveColumn(column.id)}
                      aria-label={`Excluir propriedade ${column.name}`}
                      title="Excluir propriedade"
                      className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {openOptionsFor === column.id ? (
                      <div className="basis-full">
                        <SelectOptionsEditor
                          options={editableOptionsForColumn(column)}
                          onChange={(options) => onUpdateColumn(column.id, { options })}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
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
                      className="flex items-center gap-2 rounded border bg-background px-2 py-1.5"
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
          {/* Excluir tabela — mesmo estilo dos botões de propriedades acima. */}
          {confirmDelete ? (
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
              className="group flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-destructive"
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
    </>
  );
}
