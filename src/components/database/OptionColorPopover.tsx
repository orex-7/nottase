"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Trash2 } from "lucide-react";

import { OPTION_COLOR_CHOICES } from "@/components/database/database-fields";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SelectOption } from "@/types/database";

/**
 * Seletor de cor de uma opção, aberto pela "seta" ao lado da opção no editor de
 * Opções e no menu da célula. Mostra as cores **nomeadas** (9 cores + "Padrão"):
 * quadrado da cor à esquerda e o nome à direita.
 *
 * Quando `onRename`/`onRemove` são informados (menu da célula), o popover ganha
 * no topo o campo com o nome da opção e, logo abaixo, o botão de excluir.
 *
 * O popover é renderizado num portal com `position: fixed` (com um fundo
 * invisível para fechar ao clicar fora) para não ser recortado pelo
 * `overflow-y-auto` do container de Opções.
 */
export function OptionColorPopover({
  option,
  onSelect,
  onRename,
  onRemove,
}: {
  option: SelectOption;
  onSelect: (color: string) => void;
  /** Quando informado, mostra o campo de nome da opção no topo. */
  onRename?: (label: string) => void;
  /** Quando informado, mostra o botão de excluir a opção abaixo do nome. */
  onRemove?: () => void;
}) {
  /** Botão (seta) usado para ancorar o popover. */
  const btnRef = useRef<HTMLButtonElement>(null);
  /** Posição (viewport) do popover; `null` = fechado. */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  /** Abre/fecha o popover, posicionando-o ao lado do botão. */
  function toggle() {
    if (pos) {
      setPos(null);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 176; // w-44
    const height = 320;
    // Alinha a borda direita do popover com a do botão, dentro da viewport.
    const left = Math.min(
      Math.max(8, rect.right - width),
      Math.max(8, window.innerWidth - width - 8),
    );
    const openUp = rect.bottom + height > window.innerHeight;
    setPos({
      top: openUp ? Math.max(8, rect.top - height) : rect.bottom + 4,
      left,
    });
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        aria-label={`Cor da opção ${option.label}`}
        title="Alterar cor"
        className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ChevronRight
          className={cn("h-3.5 w-3.5 transition-transform", pos && "rotate-90")}
        />
      </button>
      {pos
        ? createPortal(
            <>
              {/* Fundo invisível: fecha o popover ao clicar fora. */}
              <div
                className="fixed inset-0 z-[59]"
                onClick={() => setPos(null)}
                aria-hidden="true"
              />
              <div
                data-option-color-popover
                style={{ top: pos.top, left: pos.left }}
                className="fixed z-[60] w-44 rounded-md border bg-popover p-1 shadow-lg"
                role="menu"
                aria-label={`Cor da opção ${option.label}`}
                onClick={(e) => e.stopPropagation()}
              >
                {onRename || onRemove ? (
                  <div className="mb-1 space-y-1 border-b pb-1">
                    {onRename ? (
                      <Input
                        value={option.label}
                        onChange={(e) => onRename(e.target.value)}
                        aria-label={`Nome da opção ${option.label}`}
                        className="h-7 px-2 text-sm"
                      />
                    ) : null}
                    {onRemove ? (
                      <button
                        type="button"
                        onClick={() => {
                          onRemove();
                          setPos(null);
                        }}
                        aria-label={`Excluir opção ${option.label}`}
                        title="Excluir opção"
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5 flex-none" />
                        Excluir
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {OPTION_COLOR_CHOICES.map((choice) => {
                  const isCurrent = option.color === choice.color;
                  return (
                    <button
                      key={choice.label}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isCurrent}
                      onClick={() => {
                        onSelect(choice.color);
                        setPos(null);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                        isCurrent && "bg-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "h-4 w-4 flex-none rounded-sm",
                          // "Padrão" não tem cor: quadrado só com a borda.
                          choice.color || "border bg-transparent",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {choice.label}
                      </span>
                      {isCurrent ? (
                        <Check className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
