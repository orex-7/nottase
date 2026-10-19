"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { useRelatedRows } from "@/components/database/use-related-rows";
import { cn } from "@/lib/utils";
import type { Column } from "@/types/database";

/** Estilo base de um chip de relação (mesma escala dos chips de opção). */
const CHIP_BASE =
  "inline-flex max-w-[12rem] flex-none items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs font-medium";

interface RelationCellProps {
  /** Database alvo da coluna de relação. */
  databaseId: string;
  /** Colunas do database alvo (para resolver o título das linhas). */
  columns: Column[];
  /** Ids das linhas referenciadas. */
  ids: string[];
  /** Abre o popover do item ao clicar num chip (âncora = o próprio chip). */
  onOpenItem: (rowId: string, anchorEl: HTMLElement) => void;
  /** Remove o vínculo de um chip (quando ausente, a célula é somente leitura). */
  onRemove?: (rowId: string) => void;
}

/**
 * Conteúdo de uma célula de **relação** em modo leitura: chips com o título das
 * linhas referenciadas. Referências órfãs aparecem esmaecidas ("linha
 * removida") e, quando os chips não cabem na largura da coluna, os excedentes
 * são resumidos num badge "+N". Mantém-se numa única linha (sem `flex-wrap`)
 * para não quebrar a altura fixa usada pela virtualização da Tabela.
 */
export function RelationCell({
  databaseId,
  columns,
  ids,
  onOpenItem,
  onRemove,
}: RelationCellProps) {
  const { resolve } = useRelatedRows(databaseId, ids, columns);
  const containerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(0);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) {
      setOverflow(0);
      return;
    }
    const right = el.getBoundingClientRect().right;
    // jsdom não calcula layout (right = 0): não resume chips.
    if (!right) {
      setOverflow(0);
      return;
    }
    const chips = Array.from(
      el.querySelectorAll<HTMLElement>("[data-relation-chip]"),
    );
    if (chips.length === 0) {
      setOverflow(0);
      return;
    }
    const fits = (limit: number) =>
      chips.filter((chip) => chip.getBoundingClientRect().right <= limit + 0.5)
        .length;
    let hidden = chips.length - fits(right);
    // Com o badge "+N" visível, reserva espaço para ele à direita.
    if (hidden > 0) hidden = chips.length - fits(right - 40);
    setOverflow(hidden);
  }, []);

  // Recalcula após cada render (títulos carregados mudam a largura dos chips).
  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div ref={containerRef} className="relative flex w-full min-w-0 items-center">
      <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
        {ids.map((id) => {
          const state = resolve(id);
          if (state.status === "ready") {
            return (
              <span
                key={id}
                data-relation-chip
                title={state.title}
                className={cn(
                  CHIP_BASE,
                  "group bg-accent text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={(event) => onOpenItem(id, event.currentTarget)}
                  className="truncate hover:underline"
                >
                  {state.title}
                </button>
                {onRemove ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(id);
                    }}
                    aria-label={`Remover ${state.title}`}
                    title="Remover"
                    className="flex-none rounded text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            );
          }
          if (state.status === "loading") {
            return (
              <span
                key={id}
                data-relation-chip
                className={cn(CHIP_BASE, "bg-muted/50 text-muted-foreground")}
              >
                Carregando…
              </span>
            );
          }
          return (
            <span
              key={id}
              data-relation-chip
              title="A linha referenciada foi removida"
              className={cn(
                CHIP_BASE,
                "bg-muted/40 text-muted-foreground line-through",
              )}
            >
              linha removida
            </span>
          );
        })}
      </div>
      {overflow > 0 ? (
        <span className="absolute right-0 top-1/2 -translate-y-1/2 rounded bg-accent px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

interface RelationTitleProps {
  databaseId: string;
  columns: Column[];
  rowId: string;
}

/** Título (texto) de uma linha referenciada, usado no rótulo do chip de filtro. */
export function RelationTitle({ databaseId, columns, rowId }: RelationTitleProps) {
  const { resolve } = useRelatedRows(databaseId, [rowId], columns);
  const state = resolve(rowId);
  if (state.status === "ready") return <>{state.title}</>;
  if (state.status === "loading") return <>Carregando…</>;
  return <>linha removida</>;
}
