"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Check,
  CheckSquare,
  FileText,
  GripVertical,
  Pencil,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

import { Chip } from "@/components/database/database-cells";
import {
  cellOf,
  columnIcon,
  formatShortDate,
  optionsForColumn,
  tagById,
} from "@/components/database/database-fields";
import { PageEditor } from "@/components/database/PageEditor";
import { ensureHtml } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import {
  PAGE_CONTENT_KEY,
  type CellValue,
  type Column,
  type DbRow,
} from "@/types/database";

interface RowPageContentProps {
  row: DbRow;
  columns: Column[];
  /** Fecha o modal da página. */
  onClose: () => void;
  /** Persiste o conteúdo da página de uma linha. */
  onChangeContent: (rowId: string, content: string) => void;
  /** Reordena as propriedades (colunas) pela lista de ids. */
  onReorderColumns: (orderedIds: string[]) => void;
  /** Atualiza os dados de uma propriedade (ex.: renomear). */
  onUpdateColumn: (columnId: string, patch: Partial<Column>) => void;
  /** Exclui uma propriedade (coluna). */
  onRemoveColumn: (columnId: string) => void;
  /** Abre o editor completo da propriedade. */
  onEditColumn: (columnId: string) => void;
  /** Atualiza o valor de uma célula (propriedade) de uma linha. */
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
}

/**
 * Conteúdo da "página" de um item (estilo Notion) — usado no modal flutuante.
 *
 * Importante: este componente vive no nível de módulo (e não dentro de
 * `DatabaseTable`) de propósito. Componentes definidos no corpo de outro
 * componente ganham uma nova identidade a cada render do pai, o que obriga o
 * React a desmontar/remontar a subárvore inteira — destruindo o foco e o cursor
 * do `PageEditor` a cada digitação (a cada autosave o pai re-renderiza).
 */
export function RowPageContent({
  row,
  columns,
  onClose,
  onChangeContent,
  onReorderColumns,
  onUpdateColumn,
  onRemoveColumn,
  onEditColumn,
  onUpdateCell,
}: RowPageContentProps) {
  /** Id da propriedade (coluna) sendo arrastada para reordenar. */
  const [dragColId, setDragColId] = useState<string | null>(null);
  /** Id da propriedade antes da qual o item arrastado será solto (null = fim). */
  const [dropColBeforeId, setDropColBeforeId] = useState<string | null>(null);
  /** Id da propriedade cujo menu (renomear/editar/excluir) está aberto. */
  const [menuColId, setMenuColId] = useState<string | null>(null);
  /** Posição (viewport) do menu da propriedade. */
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** Id da propriedade com o nome em edição inline. */
  const [renamingColId, setRenamingColId] = useState<string | null>(null);
  /** Id da propriedade cujo editor de valor (popover por tipo) está aberto. */
  const [valueColId, setValueColId] = useState<string | null>(null);
  /** Posição (viewport) do editor de valor. */
  const [valuePos, setValuePos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Fecha os popovers (menu da propriedade e editor de valor) ao clicar fora.
  useEffect(() => {
    if (!menuColId && !valueColId) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (
        target?.closest("[data-prop-menu]") ||
        target?.closest("[data-prop-menu-trigger]") ||
        target?.closest("[data-value-popover]") ||
        target?.closest("[data-value-trigger]")
      ) {
        return;
      }
      setMenuColId(null);
      setValueColId(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuColId, valueColId]);
  const rowTitle = (() => {
    const first = columns[0];
    const raw = first ? cellOf(row, first.id) : "";
    const text = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
    return text.trim() || "Sem título";
  })();

  const content = (() => {
    const raw = row.values[PAGE_CONTENT_KEY];
    return typeof raw === "string" ? ensureHtml(raw) : "";
  })();

  return (
    <>
      <div className="mb-3 flex items-center gap-2 border-b py-3 pl-[3.75rem] pr-5">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-base font-semibold">{rowTitle}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar página"
          className="ml-auto flex h-[30px] w-[30px] items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">
      <div className="flex flex-col pl-[2.5rem] pr-[2.5rem]">
        {columns.map((column, index) => {
          const raw = cellOf(row, column.id);
          const isList = Array.isArray(raw);
          const Icon = columnIcon(column);
          /** Abre o menu da propriedade ancorado no elemento clicado. */
          const openMenu = (event: ReactMouseEvent<HTMLElement>) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setMenuColId(menuColId === column.id ? null : column.id);
            setMenuPos({ top: rect.bottom + 4, left: rect.left });
          };
          /** Abre o editor de valor (conforme o tipo) ancorado no clique. */
          const openValueEditor = (event: ReactMouseEvent<HTMLElement>) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setValueColId(valueColId === column.id ? null : column.id);
            setValuePos({ top: rect.bottom + 4, left: rect.left });
          };
          /** Opção selecionada (select/status) resolvida pelo id guardado. */
          const currentOption =
            column.type === "select" || column.type === "status"
              ? optionsForColumn(column).find((o) => o.id === raw) ?? null
              : null;
          return (
            <div
              key={column.id}
              onDragOver={(event) => {
                if (!dragColId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const rect = event.currentTarget.getBoundingClientRect();
                const after = event.clientY - rect.top > rect.height / 2;
                const nextBefore = after
                  ? (columns[index + 1]?.id ?? null)
                  : column.id;
                setDropColBeforeId((cur) =>
                  cur === nextBefore ? cur : nextBefore,
                );
              }}
              onDrop={(event) => {
                event.preventDefault();
                const draggedId =
                  event.dataTransfer.getData("text/plain") || dragColId;
                const beforeId = dropColBeforeId;
                setDragColId(null);
                setDropColBeforeId(null);
                if (!draggedId || draggedId === beforeId) return;
                const ids = columns
                  .map((c) => c.id)
                  .filter((id) => id !== draggedId);
                const at = beforeId ? ids.indexOf(beforeId) : -1;
                ids.splice(at === -1 ? ids.length : at, 0, draggedId);
                onReorderColumns(ids);
              }}
              className={cn(
                "relative -mx-2 group flex items-start gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent/40",
                dragColId === column.id && "opacity-40",
              )}
            >
              {/* Indicador de soltura: linha reta própria (não usa `border-t`,
                  que herdava os cantos arredondados do fundo de hover). */}
              {dragColId &&
              dragColId !== column.id &&
              dropColBeforeId === column.id ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-primary"
                />
              ) : null}
              {/* Ícone da propriedade; ao passar o mouse sobre a linha ele é
                  substituído pela alça de arraste (mesmo espaço). */}
              <span className="relative mt-0.5 flex h-4 w-4 flex-none items-center justify-center text-muted-foreground">
                <Icon className="h-3.5 w-3.5 transition-opacity group-hover:opacity-0" />
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", column.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDragColId(column.id);
                  }}
                  onDragEnd={() => {
                    setDragColId(null);
                    setDropColBeforeId(null);
                  }}
                  aria-label={`Arrastar ${column.name} para reordenar`}
                  title="Arrastar para reordenar"
                  className="absolute inset-0 flex cursor-grab items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground active:cursor-grabbing group-hover:opacity-100"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
              </span>
              {renamingColId === column.id ? (
                <input
                  autoFocus
                  defaultValue={column.name}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => {
                    onUpdateColumn(column.id, { name: e.currentTarget.value });
                    setRenamingColId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setRenamingColId(null);
                    }
                  }}
                  aria-label="Nome da propriedade"
                  className="w-32 flex-none rounded bg-transparent px-1 text-sm text-foreground outline-none focus:bg-accent"
                />
              ) : (
                <button
                  type="button"
                  data-prop-menu-trigger
                  onClick={openMenu}
                  className="w-32 flex-none truncate text-left text-muted-foreground hover:text-foreground"
                >
                  {column.name}
                </button>
              )}
              {menuColId === column.id && menuPos ? (
                <div
                  data-prop-menu
                  role="menu"
                  className="fixed z-50 w-52 rounded-md border bg-popover p-1 text-left text-sm shadow-md"
                  style={{ top: menuPos.top, left: menuPos.left }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setRenamingColId(column.id);
                      setMenuColId(null);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <Pencil className="h-3.5 w-3.5 flex-none" />
                    Renomear
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onEditColumn(column.id);
                      setMenuColId(null);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <Settings2 className="h-3.5 w-3.5 flex-none" />
                    Editar propriedade
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onRemoveColumn(column.id);
                      setMenuColId(null);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 flex-none" />
                    Excluir
                  </button>
                </div>
              ) : null}
              {/* Valor da propriedade: toda a área à direita também abre o menu. */}
              {/* Valor da propriedade: abre um editor conforme o tipo. */}
              <button
                type="button"
                data-value-trigger
                onClick={openValueEditor}
                className="min-w-0 flex-1 cursor-pointer text-left"
              >
                {column.type === "relation" ? (
                  raw.length === 0 ? (
                    <span className="text-muted-foreground">Sem valor</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {raw.length}{" "}
                      {raw.length === 1 ? "item relacionado" : "itens relacionados"}
                    </span>
                  )
                ) : column.type === "rollup" ? (
                  <span className="text-muted-foreground">Valor calculado</span>
                ) : isList ? (
                  raw.length === 0 ? (
                    <span className="text-muted-foreground">Sem valor</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-1">
                      {raw.map((id) => {
                        const opt =
                          optionsForColumn(column).find((o) => o.id === id) ??
                          tagById(id);
                        return opt ? <Chip key={id} option={opt} /> : null;
                      })}
                    </span>
                  )
                ) : column.type === "select" || column.type === "status" ? (
                  currentOption ? (
                    <Chip option={currentOption} />
                  ) : (
                    <span className="text-muted-foreground">Sem valor</span>
                  )
                ) : column.type === "date" ? (
                  raw ? (
                    formatShortDate(String(raw))
                  ) : (
                    <span className="text-muted-foreground">Sem valor</span>
                  )
                ) : column.type === "checkbox" ? (
                  raw === "true" || raw === "1" ? (
                    <CheckSquare className="h-4 w-4 text-success" />
                  ) : (
                    <span className="text-muted-foreground">Sem valor</span>
                  )
                ) : String(raw ?? "") !== "" ? (
                  <span className="block break-words">{String(raw ?? "")}</span>
                ) : (
                  <span className="text-muted-foreground">Sem valor</span>
                )}
              </button>
              {valueColId === column.id && valuePos ? (
                <div
                  data-value-popover
                  className="fixed z-50 w-56 rounded-md border bg-popover p-1 text-left text-sm shadow-md"
                  style={{ top: valuePos.top, left: valuePos.left }}
                >
                  {column.type === "select" || column.type === "status" ? (
                    optionsForColumn(column).length === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhuma opção.
                      </p>
                    ) : (
                      optionsForColumn(column).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            onUpdateCell(
                              row.id,
                              column.id,
                              raw === opt.id ? "" : opt.id,
                            );
                            setValueColId(null);
                          }}
                          className="flex w-full items-center rounded px-2 py-1.5 text-left hover:bg-accent"
                        >
                          <Chip option={opt} />
                          {raw === opt.id ? (
                            <Check className="ml-auto h-3.5 w-3.5" />
                          ) : null}
                        </button>
                      ))
                    )
                  ) : column.type === "multi_select" ? (
                    optionsForColumn(column).length === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhuma opção.
                      </p>
                    ) : (
                      optionsForColumn(column).map((opt) => {
                        const active = isList && raw.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              const list = Array.isArray(raw) ? raw : [];
                              onUpdateCell(
                                row.id,
                                column.id,
                                active
                                  ? list.filter((x) => x !== opt.id)
                                  : [...list, opt.id],
                              );
                            }}
                            className="flex w-full items-center rounded px-2 py-1.5 text-left hover:bg-accent"
                          >
                            <Chip option={opt} />
                            {active ? (
                              <Check className="ml-auto h-3.5 w-3.5" />
                            ) : null}
                          </button>
                        );
                      })
                    )
                  ) : column.type === "date" ? (
                    <input
                      type="date"
                      autoFocus
                      value={typeof raw === "string" ? raw : ""}
                      onChange={(e) =>
                        onUpdateCell(row.id, column.id, e.target.value)
                      }
                      aria-label={column.name}
                      className="w-full rounded bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"
                    />
                  ) : column.type === "checkbox" ? (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateCell(
                          row.id,
                          column.id,
                          raw === "true" || raw === "1" ? "" : "true",
                        );
                        setValueColId(null);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <CheckSquare className="h-4 w-4" />
                      {raw === "true" || raw === "1" ? "Desmarcar" : "Marcar"}
                    </button>
                  ) : column.type === "relation" ? (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      Edite a relação na tabela.
                    </p>
                  ) : column.type === "rollup" ? (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      Propriedade calculada — não editável.
                    </p>
                  ) : (
                    <input
                      autoFocus
                      type={column.type === "number" ? "number" : "text"}
                      defaultValue={
                        Array.isArray(raw) ? raw.join(", ") : String(raw ?? "")
                      }
                      onChange={(e) =>
                        onUpdateCell(row.id, column.id, e.target.value)
                      }
                      aria-label={column.name}
                      className="w-full rounded bg-transparent px-2 py-1.5 text-sm text-foreground outline-none"
                    />
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col space-y-3">
        <PageEditor
          value={content}
          onChange={(v) => onChangeContent(row.id, v)}
          placeholder="Clique aqui para começar a escrever..."
          ariaLabel="Conteúdo da página"
        />
      </div>
      </div>
    </>
  );
}
