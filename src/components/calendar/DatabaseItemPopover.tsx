"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

import { fetchDatabaseById, updateRowValues } from "@/lib/database";
import { cn } from "@/lib/utils";
import { formatNumberValue } from "@/lib/number-format";
import type { CellValue, Column, Database, DbRow } from "@/types/database";

/** Converte "yyyy-MM-dd" em "dd MMM" curto (pt-BR), sem depender de timezone. */
function formatShortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  const months = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  return `${d} ${months[m - 1]}`;
}

/** Valor de uma célula (nunca undefined — usa "" como padrão). */
function cellOf(row: DbRow, columnId: string): CellValue {
  return row.values[columnId] ?? "";
}

/** Paleta de cores para chips de opções (estilo Notion). */
const OPTION_COLORS: string[] = [
  "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-red-500/15 text-red-700 dark:text-red-300",
  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];

/** Opções disponíveis para uma coluna (respeita `column.options`). */
function optionsForColumn(column: Column) {
  return column.options ?? [];
}

interface DatabaseItemPopoverProps {
  /** Id do database de origem do evento. */
  databaseId: string;
  /** Id da linha (item) correspondente ao evento clicado. */
  rowId: string;
  /** Elemento usado como âncora para posicionar o popover. */
  anchorEl: HTMLElement | null;
  /** Chamado após qualquer edição persistida (para o calendário recarregar). */
  onUpdated: () => void;
  /** Fecha o popover. */
  onClose: () => void;
}

/**
 * Popover ancorado a um item do calendário que veio de um database. Mostra as
 * propriedades da linha e permite editá-las (caixa de seleção, seleção, seleção
 * múltipla, data, texto/número), persistindo cada alteração no Supabase.
 */
export function DatabaseItemPopover({
  databaseId,
  rowId,
  anchorEl,
  onUpdated,
  onClose,
}: DatabaseItemPopoverProps) {
  const [database, setDatabase] = useState<Database | null>(null);
  const [row, setRow] = useState<DbRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Carrega o database e localiza a linha correspondente.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const db = await fetchDatabaseById(databaseId);
        if (cancelled) return;
        if (!db) {
          setError("Database não encontrado.");
          return;
        }
        setDatabase(db);
        setRow(db.rows.find((r) => r.id === rowId) ?? null);
      } catch {
        if (!cancelled) setError("Não foi possível carregar as propriedades.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [databaseId, rowId]);

  // Posiciona o popover logo abaixo do item clicado, mantendo-o na tela.
  useEffect(() => {
    if (!anchorEl) return;
    const place = () => {
      const rect = anchorEl.getBoundingClientRect();
      const width = 288;
      const maxLeft = window.innerWidth - width - 8;
      const left = Math.min(Math.max(8, rect.left), Math.max(8, maxLeft));
      const top = Math.min(rect.bottom + 6, window.innerHeight - 120);
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorEl]);

  // Fecha ao pressionar Esc ou clicar fora do popover.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [anchorEl, onClose]);

  /** Aplica uma alteração na linha: atualiza UI e persiste no Supabase. */
  const setValue = useCallback(
    (columnId: string, value: CellValue) => {
      setRow((prev) => {
        if (!prev) return prev;
        const nextValues = { ...prev.values, [columnId]: value };
        // Persiste de forma best-effort; a UI já reflete a mudança.
        void updateRowValues(prev.id, nextValues)
          .then(() => onUpdated())
          .catch(() => {
            setError("Falha ao salvar. Tente novamente.");
          });
        return { ...prev, values: nextValues };
      });
    },
    [onUpdated],
  );

  const content = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Propriedades do item"
      className="fixed z-50 w-72 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {database?.name ?? "Propriedades"}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="py-4 text-sm text-destructive">{error}</p>
      ) : !row || !database ? (
        <p className="py-4 text-sm text-muted-foreground">Item não encontrado.</p>
      ) : (
        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
          {database.columns
            .filter((c) => !c.hidden)
            .map((column) => (
              <PropertyField
                key={column.id}
                column={column}
                value={cellOf(row, column.id)}
                onChange={(value) => setValue(column.id, value)}
              />
            ))}
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}


interface PropertyFieldProps {
  column: Column;
  value: CellValue;
  onChange: (value: CellValue) => void;
}

/** Um campo editável de propriedade, conforme o tipo da coluna. */
function PropertyField({ column, value, onChange }: PropertyFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {column.name}
      </span>
      <PropertyControl column={column} value={value} onChange={onChange} />
    </div>
  );
}

/** Controle editável para um valor, variando conforme o tipo da coluna. */
function PropertyControl({ column, value, onChange }: PropertyFieldProps) {
  if (column.type === "checkbox") {
    const checked = value === "true" || value === "1";
    return (
      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked ? "true" : "")}
          className="h-4 w-4 flex-none cursor-pointer rounded border-input accent-primary"
        />
      </label>
    );
  }

  if (column.type === "select" || column.type === "status") {
    const options = optionsForColumn(column);
    const current = typeof value === "string" ? value : "";
    return (
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border bg-background px-2 py-1 text-sm outline-none"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (column.type === "multi_select") {
    const options = optionsForColumn(column);
    const list = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-1">
        {options.length === 0 ? (
          <span className="text-xs text-muted-foreground">Sem opções</span>
        ) : (
          options.map((o, index) => {
            const selected = list.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() =>
                  onChange(
                    selected
                      ? list.filter((id) => id !== o.id)
                      : [...list, o.id],
                  )
                }
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-black/5 transition-opacity",
                  OPTION_COLORS[index % OPTION_COLORS.length],
                  selected ? "opacity-100" : "opacity-40 hover:opacity-70",
                )}
              >
                {o.label}
              </button>
            );
          })
        )}
      </div>
    );
  }

  if (column.type === "date") {
    const dateValue = typeof value === "string" ? value : "";
    return (
      <div className="flex items-center gap-1.5 rounded px-1 py-1">
        <input
          type="date"
          value={dateValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded bg-transparent px-1 py-1 text-sm outline-none focus:bg-background"
          aria-label={column.name}
        />
        {dateValue ? (
          <span className="flex-none text-xs text-muted-foreground">
            {formatShortDate(dateValue)}
          </span>
        ) : null}
      </div>
    );
  }

  // number → input numérico com valor formatado exibido quando não está em foco
  if (column.type === "number") {
    return (
      <NumberField column={column} value={value} onChange={onChange} />
    );
  }

  // text | person → input simples
  const textValue = Array.isArray(value) ? value.join(", ") : value ?? "";
  return (
    <input
      type="text"
      value={textValue}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded bg-transparent px-1 py-1 text-sm outline-none focus:outline-none"
      aria-label={column.name}
    />
  );
}

/**
 * Campo numérico do popover: exibe o valor com o formato escolhido
 * (separadores/percentual/moeda) enquanto não está em foco e revela o valor cru
 * ao editar — mesmo comportamento da célula na tabela.
 */
function NumberField({ column, value, onChange }: PropertyFieldProps) {
  const [focused, setFocused] = useState(false);
  const textValue = Array.isArray(value) ? value.join(", ") : value ?? "";
  const display = formatNumberValue(value, column);
  const showOverlay = !focused && display !== "" && display !== textValue;

  return (
    <div className="relative flex w-full items-center">
      <input
        type="text"
        inputMode="decimal"
        value={textValue}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn(
          "w-full rounded bg-transparent px-1 py-1 text-sm outline-none focus:outline-none",
          showOverlay && "text-transparent caret-transparent",
        )}
        aria-label={column.name}
      />
      {showOverlay ? (
        <span className="pointer-events-none absolute inset-y-0 left-1 flex items-center truncate pr-1 text-sm">
          {display}
        </span>
      ) : null}
    </div>
  );
}

