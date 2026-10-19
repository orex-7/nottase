"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";

import { rowTitleOf } from "@/components/database/database-fields";
import { useDatabaseRows } from "@/components/database/use-database-rows";
import { cn } from "@/lib/utils";
import type { Column } from "@/types/database";

interface RelationSelectProps {
  /** Database alvo (de onde vêm as linhas listadas). */
  databaseId: string;
  /** Colunas do database alvo (para resolver o título das linhas). */
  columns: Column[];
  /** Ids selecionados (no máximo 1 quando `multiple` é `false`). */
  value: string[];
  /** `true` = seleção múltipla (célula); `false` = valor único (filtro). */
  multiple: boolean;
  onChange: (ids: string[]) => void;
}

/**
 * Seletor de linhas de outro database para uma coluna de **relação**. Lista o
 * database alvo de forma **paginada** (mesma RPC/busca no servidor da Tabela),
 * com busca com debounce. Em `multiple` alterna checkboxes (célula); em modo
 * único escolhe uma linha (valor de filtro).
 */
export function RelationSelect({
  databaseId,
  columns,
  value,
  multiple,
  onChange,
}: RelationSelectProps) {
  const [search, setSearch] = useState("");
  /** Busca "debounced" (250ms): o filtro de texto é aplicado no servidor. */
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { rows, loading, loadingMore, error, hasMore, fetchNextPage } =
    useDatabaseRows({ databaseId, search: debounced });

  const selected = useMemo(() => new Set(value), [value]);

  function toggle(id: string) {
    if (!multiple) {
      onChange(selected.has(id) ? [] : [id]);
      return;
    }
    onChange(
      selected.has(id) ? value.filter((v) => v !== id) : [...value, id],
    );
  }

  return (
    <div className="flex max-h-80 flex-col">
      <div className="flex items-center gap-1.5 border-b px-1.5 pb-1.5">
        <Search className="h-3.5 w-3.5 flex-none text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar itens"
          className="w-full rounded bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {error ? (
          <p className="px-2 py-1.5 text-xs text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Nenhum item.
            </p>
          )
        ) : (
          rows.map((row) => {
            const isSelected = selected.has(row.id);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => toggle(row.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 flex-none items-center justify-center rounded border",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input",
                  )}
                >
                  {isSelected ? <Check className="h-3 w-3" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {rowTitleOf(row, columns)}
                </span>
              </button>
            );
          })
        )}
        {hasMore ? (
          <button
            type="button"
            onClick={fetchNextPage}
            disabled={loadingMore}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Carregando…
              </>
            ) : (
              "Carregar mais"
            )}
          </button>
        ) : null}
      </div>

      {value.length > 0 ? (
        <div className="border-t pt-1">
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Limpar
          </button>
        </div>
      ) : null}
    </div>
  );
}
