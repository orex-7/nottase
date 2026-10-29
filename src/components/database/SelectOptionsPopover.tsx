"use client";

import { useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";

import { Chip } from "@/components/database/database-cells";
import {
  OPTION_COLORS,
  STATUS_CATEGORIES,
  newOptionId,
} from "@/components/database/database-fields";
import { markOptionDrag, moveOption, OPTION_DROP_BAR } from "@/components/database/option-dnd";
import { OptionColorPopover } from "@/components/database/OptionColorPopover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SelectOption, StatusCategory } from "@/types/database";

/**
 * Reordenação das opções por arrastar-e-soltar (HTML5 DnD nativo — o mesmo
 * padrão usado na sidebar de projetos). Devolve o estado do arraste e os
 * handlers a serem ligados em cada item (a linha) e na alça de arraste.
 */
function useOptionReorder(
  options: SelectOption[],
  onChange: (options: SelectOption[]) => void,
) {
  /** Id da opção sendo arrastada. */
  const [dragId, setDragId] = useState<string | null>(null);
  /** Id da opção sob o cursor (destino do "solta aqui"). */
  const [overId, setOverId] = useState<string | null>(null);

  function clear() {
    setDragId(null);
    setOverId(null);
  }

  return {
    dragId,
    overId,
    /** Props da linha que recebe o "solta aqui". */
    itemProps: (id: string) => ({
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!dragId) return;
        // Necessário para permitir o "drop" nesta linha.
        event.preventDefault();
        setOverId(id);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!dragId) return;
        event.preventDefault();
        event.stopPropagation();
        const next = moveOption(options, dragId, id);
        if (next) onChange(next);
        clear();
      },
    }),
    /** Props da alça de arraste. */
    handleProps: (id: string) => ({
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        setDragId(id);
        setOverId(null);
        markOptionDrag(event, id);
      },
      onDragEnd: clear,
    }),
  };
}

/**
 * Editor das opções de uma propriedade Seleção/Seleção múltipla.
 * Permite adicionar, renomear, recolorir, reordenar (arrastar) e excluir
 * opções (estilo Notion).
 */
export function SelectOptionsEditor({
  options,
  onChange,
}: {
  options: SelectOption[];
  onChange: (options: SelectOption[]) => void;
}) {
  /** Id da opção cuja paleta de cores está aberta. */
  const [colorFor, setColorFor] = useState<string | null>(null);
  const reorder = useOptionReorder(options, onChange);

  function addOption() {
    onChange([
      ...options,
      {
        id: newOptionId(),
        label: "Nova opção",
        color: OPTION_COLORS[options.length % OPTION_COLORS.length],
      },
    ]);
  }

  function updateOption(id: string, patch: Partial<SelectOption>) {
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function removeOption(id: string) {
    onChange(options.filter((o) => o.id !== id));
  }

  return (
    <div className="space-y-1.5 rounded border bg-muted/30 p-2">
      {options.length === 0 ? (
        <p className="px-1 py-1 text-xs text-muted-foreground">Nenhuma opção ainda.</p>
      ) : (
        <ul className="space-y-1">
          {options.map((option) => (
            <li
              key={option.id}
              {...reorder.itemProps(option.id)}
              className={cn(
                "relative flex items-center gap-1.5 rounded",
                reorder.dragId === option.id && "opacity-50",
                // Barra indicadora da posição de inserção (sem borda).
                reorder.overId === option.id &&
                  reorder.dragId &&
                  reorder.dragId !== option.id &&
                  OPTION_DROP_BAR,
              )}
            >
              <button
                type="button"
                {...reorder.handleProps(option.id)}
                aria-label={`Reordenar opção ${option.label}`}
                title="Arrastar para reordenar"
                className="flex h-6 w-4 flex-none cursor-grab items-center justify-center text-faint-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
              <Chip option={option} />
              <Input
                value={option.label}
                onChange={(e) => updateOption(option.id, { label: e.target.value })}
                className="min-w-0 flex-1 border-0 px-1 shadow-none"
                aria-label={`Nome da opção ${option.label}`}
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setColorFor((cur) => (cur === option.id ? null : option.id))}
                  aria-label={`Cor da opção ${option.label}`}
                  title="Alterar cor"
                  className="flex h-[30px] w-[30px] items-center justify-center rounded hover:bg-accent"
                >
                  <span className={cn("h-3.5 w-3.5 rounded-full", option.color)} />
                </button>
                {colorFor === option.id ? (
                  <div className="absolute right-0 top-8 z-20 grid w-28 grid-cols-5 gap-1 rounded-md border bg-popover p-2 shadow-lg">
                    {OPTION_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => {
                          updateOption(option.id, { color });
                          setColorFor(null);
                        }}
                        aria-label="Escolher cor"
                        className={cn(
                          "h-4 w-4 rounded-full ring-offset-1 hover:ring-2 hover:ring-ring",
                          color,
                          option.color === color && "ring-2 ring-ring",
                        )}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => removeOption(option.id)}
                aria-label={`Excluir opção ${option.label}`}
                title="Excluir opção"
                className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" onClick={addOption}>
        <Plus className="h-3.5 w-3.5" />
        Adicionar opção
      </Button>
    </div>
  );
}

/** Detalhes inline de uma opção de status: renomear, recolorir e excluir. */
function StatusOptionDetails({
  option,
  colorFor,
  setColorFor,
  onUpdate,
  onRemove,
  showColor = true,
}: {
  option: SelectOption;
  colorFor: string | null;
  setColorFor: (updater: (cur: string | null) => string | null) => void;
  onUpdate: (id: string, patch: Partial<SelectOption>) => void;
  onRemove: (id: string) => void;
  /**
   * Quando `false`, esconde o botão de cor (usado no editor de Seleção, onde a
   * cor é escolhida pelo popover de cores nomeadas aberto pela seta da opção).
   */
  showColor?: boolean;
}) {
  /** Botão da cor é usado para ancorar a paleta fora do container rolável. */
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  /**
   * Posição (relativa à viewport) da paleta de cores, calculada ao abrir.
   * A paleta é renderizada num portal com `position: fixed` para NÃO contar
   * como transbordamento rolável do popover. Sem isso, abrir a paleta dentro de
   * um sub-popover com `overflow-y-auto` faz aparecer uma barra de rolagem.
   */
  const [palettePos, setPalettePos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  /** Abre/fecha a paleta de cores, posicionando-a sobre o botão. */
  function togglePalette() {
    if (colorFor === option.id) {
      setColorFor(() => null);
      setPalettePos(null);
      return;
    }
    const rect = colorBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const paletteWidth = 128; // w-28
      const paletteHeight = 120;
      const left = Math.min(rect.left, window.innerWidth - paletteWidth - 8);
      const openUp = rect.bottom + paletteHeight > window.innerHeight;
      setPalettePos({
        top: openUp ? rect.top - paletteHeight : rect.bottom + 4,
        left: Math.max(8, left),
      });
    }
    setColorFor(() => option.id);
  }

  return (
    <div className="mb-1 ml-6 flex items-center gap-1.5 rounded border bg-muted/30 p-1.5">
      {showColor ? (
        <>
          <button
            ref={colorBtnRef}
            type="button"
            onClick={togglePalette}
            aria-label={`Cor da opção ${option.label}`}
            aria-expanded={colorFor === option.id}
            title="Alterar cor"
            className="flex h-[30px] w-[30px] items-center justify-center rounded hover:bg-accent"
          >
            <span className={cn("h-3.5 w-3.5 rounded-full", option.color)} />
          </button>
          {colorFor === option.id && palettePos
            ? createPortal(
                <div
                  data-option-color-palette
                  style={{ top: palettePos.top, left: palettePos.left }}
                  className="fixed z-[60] grid w-28 grid-cols-5 gap-1 rounded-md border bg-popover p-2 shadow-lg"
                >
                  {OPTION_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        onUpdate(option.id, { color });
                        setColorFor(() => null);
                        setPalettePos(null);
                      }}
                      aria-label="Escolher cor"
                      className={cn(
                        "h-4 w-4 rounded-full ring-offset-1 hover:ring-2 hover:ring-ring",
                        color,
                        option.color === color && "ring-2 ring-ring",
                      )}
                    />
                  ))}
                </div>,
                document.body,
              )
            : null}
        </>
      ) : null}
      <Input
        value={option.label}
        onChange={(e) => onUpdate(option.id, { label: e.target.value })}
        className="min-w-0 flex-1 border-0 px-1 shadow-none"
        aria-label={`Nome da opção ${option.label}`}
      />
      <button
        type="button"
        onClick={() => onRemove(option.id)}
        aria-label={`Excluir opção ${option.label}`}
        title="Excluir opção"
        className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Editor de status em **abas de categoria** (A fazer / Em andamento /
 * Concluídos). Cada aba lista as opções daquela categoria e permite
 * renomear, recolorir, excluir e adicionar novas opções — reutilizando os
 * mesmos controles do editor de status agrupado.
 */
export function StatusCategoryTabs({
  options,
  onChange,
}: {
  options: SelectOption[];
  onChange: (options: SelectOption[]) => void;
}) {
  /** Aba (categoria) ativa. */
  const [active, setActive] = useState<StatusCategory>("todo");
  /** Id da opção com os detalhes (nome/cor) expandidos. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Id da opção cuja paleta de cores está aberta (dentro dos detalhes). */
  const [colorFor, setColorFor] = useState<string | null>(null);

  function categoryOf(option: SelectOption): StatusCategory {
    return option.category ?? "todo";
  }

  function addOption(category: StatusCategory) {
    onChange([
      ...options,
      {
        id: newOptionId(),
        label: "Nova opção",
        color: OPTION_COLORS[options.length % OPTION_COLORS.length],
        category,
      },
    ]);
  }

  function updateOption(id: string, patch: Partial<SelectOption>) {
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function removeOption(id: string) {
    onChange(options.filter((o) => o.id !== id));
  }

  const items = options.filter((o) => categoryOf(o) === active);

  return (
    <div className="space-y-2">
      <div
        role="tablist"
        aria-label="Categorias de status"
        className="flex gap-1 rounded-md bg-muted/50 p-1"
      >
        {STATUS_CATEGORIES.map((category) => {
          const isActive = active === category.key;
          return (
            <button
              key={category.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setActive(category.key);
                setEditingId(null);
                setColorFor(null);
              }}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center rounded px-1.5 py-1.5 text-center text-[11px] font-medium leading-tight",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {category.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-0.5">
        <ul className="space-y-0.5">
          {items.length === 0 ? (
            <li className="px-1 py-0.5 text-xs text-muted-foreground">
              Nenhuma opção.
            </li>
          ) : (
            items.map((option) => {
              const expanded = editingId === option.id;
              return (
                <li key={option.id} className="rounded">
                  <div className="flex items-center gap-1 rounded hover:bg-accent/60">
                    <GripVertical className="ml-1 h-3.5 w-3.5 flex-none text-faint-foreground" />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId((cur) =>
                          cur === option.id ? null : option.id,
                        );
                        setColorFor(null);
                      }}
                      aria-expanded={expanded}
                      aria-label={`Editar opção ${option.label}`}
                      title="Editar opção"
                      className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                    >
                      <Chip option={option} />
                      <ChevronRight
                        className={cn(
                          "ml-auto h-3.5 w-3.5 flex-none text-muted-foreground transition-transform",
                          expanded && "rotate-90",
                        )}
                      />
                    </button>
                  </div>
                  {expanded ? (
                    <StatusOptionDetails
                      option={option}
                      colorFor={colorFor}
                      setColorFor={setColorFor}
                      onUpdate={updateOption}
                      onRemove={removeOption}
                    />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>

        <button
          type="button"
          onClick={() => addOption(active)}
          aria-label={`Adicionar opção em ${STATUS_CATEGORIES.find((c) => c.key === active)?.label ?? ""}`}
          className="flex w-full items-center gap-2 rounded px-1 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova opção
        </button>
      </div>
    </div>
  );
}
/**
 * Popover de **Opções** de uma propriedade do tipo Seleção (estilo Notion),
 * aberto a partir do botão "Editar propriedade" no cabeçalho da coluna. Exibe um
 * cabeçalho "Opções" com um botão "+" e a lista de opções (chip colorido +
 * seta); ao clicar numa opção, expande os detalhes para renomear, recolorir e
 * excluir — reutilizando os mesmos controles do editor de status.
 */
export function SelectOptionsPopover({
  options,
  onChange,
}: {
  options: SelectOption[];
  onChange: (options: SelectOption[]) => void;
}) {
  /** Id da opção com os detalhes (nome/cor) expandidos. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Id da opção cuja paleta de cores está aberta (dentro dos detalhes). */
  const [colorFor, setColorFor] = useState<string | null>(null);
  const reorder = useOptionReorder(options, onChange);

  function addOption() {
    const created = {
      id: newOptionId(),
      label: "Nova opção",
      color: OPTION_COLORS[options.length % OPTION_COLORS.length],
    };
    onChange([...options, created]);
    // Já abre os detalhes da opção recém-criada para edição imediata.
    setEditingId(created.id);
    setColorFor(null);
  }

  function updateOption(id: string, patch: Partial<SelectOption>) {
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function removeOption(id: string) {
    onChange(options.filter((o) => o.id !== id));
    setEditingId((cur) => (cur === id ? null : cur));
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-muted-foreground">
          Opções
        </span>
        <button
          type="button"
          onClick={addOption}
          aria-label="Adicionar opção"
          title="Adicionar opção"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {options.length === 0 ? (
        <p className="px-1 py-1 text-xs text-muted-foreground">
          Nenhuma opção ainda.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {options.map((option) => {
            const expanded = editingId === option.id;
            return (
              <li
                key={option.id}
                {...reorder.itemProps(option.id)}
                className={cn(
                  "relative rounded",
                  // Barra indicadora da posição de inserção (sem borda).
                  reorder.overId === option.id &&
                    reorder.dragId &&
                    reorder.dragId !== option.id &&
                    OPTION_DROP_BAR,
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-1 rounded px-1 py-1 hover:bg-accent/60",
                    expanded && "bg-accent/60",
                    reorder.dragId === option.id && "opacity-50",
                  )}
                >
                  <button
                    type="button"
                    {...reorder.handleProps(option.id)}
                    aria-label={`Reordenar opção ${option.label}`}
                    title="Arrastar para reordenar"
                    className="flex h-4 w-4 flex-none cursor-grab items-center justify-center text-faint-foreground active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingId((cur) => (cur === option.id ? null : option.id))
                    }
                    aria-expanded={expanded}
                    aria-label={`Editar opção ${option.label}`}
                    title="Editar opção"
                    className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
                  >
                    <Chip option={option} />
                  </button>
                  {/* A "seta" da opção abre o popover de cores nomeadas. */}
                  <OptionColorPopover
                    option={option}
                    onSelect={(color) => updateOption(option.id, { color })}
                  />
                </div>
                {expanded ? (
                  <StatusOptionDetails
                    option={option}
                    colorFor={colorFor}
                    setColorFor={setColorFor}
                    onUpdate={updateOption}
                    onRemove={removeOption}
                    showColor={false}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
