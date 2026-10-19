"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  MoreHorizontal,
  Pencil,
  Plus,
  SquareKanban,
  Trash2,
} from "lucide-react";

import { Chip } from "@/components/database/database-cells";
import {
  cellOf,
  editableOptionsForColumn,
  optionsForColumn,
} from "@/components/database/database-fields";
import { SelectOptionsPopover } from "@/components/database/SelectOptionsPopover";
import { cn } from "@/lib/utils";
import type { CellValue, Column, DbRow, SelectOption } from "@/types/database";

interface KanbanBoardProps {
  /** Todas as colunas (para escolher as propriedades exibidas no card). */
  columns: Column[];
  /** Linhas já filtradas (busca) que devem aparecer no quadro. */
  rows: DbRow[];
  /** Coluna select/status usada para agrupar (null = sem coluna agrupável). */
  groupColumn: Column | null;
  /** Se existe alguma coluna agrupável (select/status). */
  canGroup: boolean;
  onOpenRow: (rowId: string) => void;
  onDeleteRow: (rowId: string) => void;
  /** Cria um card já atribuído a uma opção de uma coluna (agrupamento). */
  onAddCard: (columnId: string, value: CellValue) => void;
  /** Move um card para uma coluna/posição, atualizando valor de grupo e ordem. */
  onMoveCard: (
    rowId: string,
    columnId: string,
    value: CellValue,
    beforeRowId: string | null,
  ) => void;
  /** Renderiza o valor de uma propriedade no rodapé do card (modo leitura). */
  renderCardProperty: (row: DbRow, column: Column) => ReactNode;
  /** Extrai o título do card (primeira coluna de texto/pessoa). */
  cardTitle: (row: DbRow) => string;
  /** Atualiza uma coluna (usado ao editar as opções/grupos do Kanban). */
  onUpdateColumn: (columnId: string, patch: Partial<Column>) => void;
}

/**
 * Quadro Kanban (estilo Notion): as linhas viram cards distribuídos em colunas
 * conforme o valor de uma coluna select/status ("Agrupar por"). Cada coluna
 * lista seus cards e permite criar um novo já com aquele valor atribuído. Os
 * cards podem ser arrastados entre colunas (e reordenados dentro de uma coluna),
 * atualizando o valor de grupo e a ordem; uma linha indica onde o card vai cair.
 */
export function KanbanBoard({
  columns,
  rows,
  groupColumn,
  canGroup,
  onOpenRow,
  onDeleteRow,
  onAddCard,
  onMoveCard,
  renderCardProperty,
  cardTitle,
  onUpdateColumn,
}: KanbanBoardProps) {
  /** Coluna atualmente realçada durante um arraste (alvo do drop). */
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  /**
   * Posição de inserção durante o arraste: em qual coluna e antes de qual card
   * (null = no fim). Usada para desenhar a linha indicadora onde o card vai cair.
   */
  const [dropTarget, setDropTarget] = useState<{
    groupId: string;
    beforeRowId: string | null;
  } | null>(null);
  /** Id do card sendo arrastado (para não desenhar a linha sobre ele mesmo). */
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  /** Colunas cujas propriedades aparecem no rodapé do card (exceto a de grupo). */
  const propColumns = useMemo(
    () =>
      columns.filter(
        (c) => !c.hidden && c.id !== groupColumn?.id,
      ),
    [columns, groupColumn],
  );

  /** Id da coluna cujo menu "..." (cabeçalho) está aberto. */
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  /** Quando true, o popover da coluna mostra o editor de grupos (opções). */
  const [editingGroups, setEditingGroups] = useState(false);

  // Fecha o menu da coluna ao clicar fora.
  useEffect(() => {
    if (!menuGroupId) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (
        target?.closest("[data-kanban-menu]") ||
        target?.closest("[data-kanban-menu-trigger]") ||
        // A paleta de cores do editor de opções é renderizada em portal.
        target?.closest("[data-option-color-palette]")
      ) {
        return;
      }
      setMenuGroupId(null);
      setEditingGroups(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuGroupId]);

  if (!canGroup || !groupColumn) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <SquareKanban className="h-8 w-8 opacity-60" />
        <p className="max-w-xs">
          O quadro Kanban agrupa os itens por uma propriedade de seleção ou
          status. Crie uma coluna desses tipos (em &quot;Configurações da tabela&quot;)
          para usar esta visualização.
        </p>
      </div>
    );
  }

  const options = optionsForColumn(groupColumn);
  // Cada opção vira uma coluna do quadro; itens sem valor caem em "Sem valor".
  const groups = [
    ...options.map((option) => ({
      id: option.id,
      option,
      rows: rows.filter((r) => cellOf(r, groupColumn.id) === option.id),
    })),
    {
      id: "__none__",
      option: null as SelectOption | null,
      rows: rows.filter((r) => {
        const value = cellOf(r, groupColumn.id);
        return value === "" || (Array.isArray(value) && value.length === 0);
      }),
    },
  ];

  return (
    <div className="flex h-full min-h-0 items-stretch gap-3 overflow-x-auto p-3">
      {groups.map((group) => (
        <div
          key={group.id}
          className="group/column flex w-72 flex-none flex-col rounded-lg border bg-muted/20"
        >
          {/* Cabeçalho da coluna: chip da opção + contagem + ações */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            {group.option ? (
              <Chip option={group.option} />
            ) : (
              <span className="text-xs font-medium text-muted-foreground">
                Sem valor
              </span>
            )}
            <span className="rounded-full bg-background px-2 text-xs text-muted-foreground">
              {group.rows.length}
            </span>
            <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/column:opacity-100">
              {/* Menu "..." (à esquerda do "+") */}
              <div className="relative">
                <button
                  type="button"
                  data-kanban-menu-trigger
                  onClick={() => {
                    setEditingGroups(false);
                    setMenuGroupId((cur) => (cur === group.id ? null : group.id));
                  }}
                  aria-haspopup="menu"
                  aria-expanded={menuGroupId === group.id}
                  aria-label="Mais opções da coluna"
                  title="Mais opções"
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuGroupId === group.id ? (
                  <div
                    data-kanban-menu
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-1 w-60 rounded-md border bg-popover p-1 text-sm shadow-md"
                  >
                    {editingGroups ? (
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => setEditingGroups(false)}
                          className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                          Voltar
                        </button>
                        <SelectOptionsPopover
                          options={editableOptionsForColumn(groupColumn)}
                          onChange={(options) =>
                            onUpdateColumn(groupColumn.id, { options })
                          }
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setEditingGroups(true)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar grupos
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
              {/* Adicionar página */}
              <button
                type="button"
                onClick={() =>
                  onAddCard(groupColumn.id, group.option ? group.option.id : "")
                }
                aria-label="Adicionar página"
                title="Adicionar página"
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Lista de cards (também é a zona de soltar do arraste) */}
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors",
              dragOverGroupId === group.id && "bg-accent/40",
            )}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("text/plain")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (dragOverGroupId !== group.id) setDragOverGroupId(group.id);
              // Soltar no espaço vazio da coluna = mover para o fim.
              setDropTarget({ groupId: group.id, beforeRowId: null });
            }}
            onDragLeave={(event) => {
              // Só limpa quando o ponteiro sai de fato da coluna (não ao entrar num filho).
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDragOverGroupId((current) => (current === group.id ? null : current));
              setDropTarget((current) =>
                current?.groupId === group.id ? null : current,
              );
            }}
            onDrop={(event) => {
              event.preventDefault();
              const rowId = event.dataTransfer.getData("text/plain");
              const target = dropTarget;
              setDragOverGroupId(null);
              setDropTarget(null);
              setDraggingRowId(null);
              if (!rowId) return;
              const beforeRowId =
                target?.groupId === group.id ? target.beforeRowId : null;
              onMoveCard(
                rowId,
                groupColumn.id,
                group.option ? group.option.id : "",
                beforeRowId,
              );
            }}
          >
            {group.rows.map((row) => {
              const isDragging = draggingRowId === row.id;
              const showLineBefore =
                dropTarget?.groupId === group.id &&
                dropTarget.beforeRowId === row.id &&
                !isDragging;
              return (
                <Fragment key={row.id}>
                  {/* Linha indicadora da posição de inserção */}
                  {showLineBefore ? (
                    <div className="h-0.5 flex-none rounded-full bg-primary" />
                  ) : null}
                  <div
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", row.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDraggingRowId(row.id);
                    }}
                    onDragEnd={() => {
                      setDraggingRowId(null);
                      setDropTarget(null);
                      setDragOverGroupId(null);
                    }}
                    // Determina soltar acima ou abaixo deste card pela metade.
                    onDragOver={(event) => {
                      if (!event.dataTransfer.types.includes("text/plain")) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverGroupId(group.id);
                      const rect = event.currentTarget.getBoundingClientRect();
                      const after = event.clientY - rect.top > rect.height / 2;
                      const nextBefore = after
                        ? (group.rows[group.rows.indexOf(row) + 1]?.id ?? null)
                        : row.id;
                      if (
                        dropTarget?.beforeRowId !== nextBefore ||
                        dropTarget.groupId !== group.id
                      ) {
                        setDropTarget({ groupId: group.id, beforeRowId: nextBefore });
                      }
                    }}
                    className={cn(
                      "group/card cursor-grab rounded-md border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
                      isDragging && "opacity-40",
                    )}
                  >
                    <div className="flex items-start gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenRow(row.id)}
                        className="min-w-0 flex-1 text-left text-sm font-medium hover:underline"
                      >
                        <span className="line-clamp-2">{cardTitle(row)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteRow(row.id)}
                        aria-label="Excluir item"
                        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/card:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Propriedades (chips/data/texto) das demais colunas,
                        empilhadas uma abaixo da outra. */}
                    {propColumns.length > 0 ? (
                      <div className="mt-1.5 flex flex-col items-start gap-1">
                        {propColumns.map((column) => (
                          <Fragment key={column.id}>
                            {renderCardProperty(row, column)}
                          </Fragment>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Fragment>
              );
            })}

            {/* Linha indicadora no fim da coluna */}
            {dropTarget?.groupId === group.id && dropTarget.beforeRowId === null ? (
              <div className="h-0.5 flex-none rounded-full bg-primary" />
            ) : null}

            {/* Criar novo card já com o valor desta coluna */}
            <button
              type="button"
              onClick={() =>
                onAddCard(groupColumn.id, group.option ? group.option.id : "")
              }
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
