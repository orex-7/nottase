"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { databaseIcon } from "@/lib/database-icons";
import { normalizeSearchTerm } from "@/components/database/workspace-search";
import type { Database } from "@/types/database";

export interface DatabasePickerPopoverProps {
  /** Elemento de referência do posicionamento (o topo da área de conteúdo). */
  anchorEl: HTMLElement;
  /** Todos os databases do Workspace. */
  databases: Database[];
  /** Projetos (resolve o nome do projeto exibido como contexto). */
  projects: { id: string; name: string }[];
  /** Id do database aberto (marcado como "aberto" e não selecionável). */
  currentDatabaseId: string | null;
  /** Escolhe um database (vira um chip ao lado do aberto). */
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * Seletor de **databases do Workspace**, aberto pelo botão "+" da faixa do
 * database aberto. Lista todos os databases com um campo de busca por nome e
 * abre na **mesma posição** da paleta de busca da sidebar (centralizado, logo
 * abaixo do header) — por isso replica aquele posicionamento.
 */
export function DatabasePickerPopover({
  anchorEl,
  databases,
  projects,
  currentDatabaseId,
  onSelect,
  onClose,
}: DatabasePickerPopoverProps) {
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Mesma posição da paleta da sidebar: centralizado na horizontal, 5px abaixo
  // do topo da área de conteúdo (o `anchorEl` é a própria faixa, que começa no
  // mesmo topo da `<aside>`).
  useLayoutEffect(() => {
    const target = anchorEl.closest("aside") ?? anchorEl;
    const rect = target.getBoundingClientRect();
    const width = Math.max(320, Math.min(560, window.innerWidth - 32));
    setPos({
      top: rect.top + 5,
      left: Math.max(8, (window.innerWidth - width) / 2),
      width,
    });
    inputRef.current?.focus();
  }, [anchorEl]);

  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  /** Databases filtrados pela busca (nome ou projeto), em ordem alfabética. */
  const filtered = useMemo(() => {
    const needle = normalizeSearchTerm(query.trim());
    return databases
      .filter((db) => {
        if (!needle) return true;
        const projectName = db.projectId
          ? projectNameById.get(db.projectId) ?? ""
          : "";
        return (
          normalizeSearchTerm(db.name).includes(needle) ||
          normalizeSearchTerm(projectName).includes(needle)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [databases, query, projectNameById]);

  /** Itens navegáveis por teclado (o database já aberto não é selecionável). */
  const selectable = useMemo(
    () => filtered.filter((db) => db.id !== currentDatabaseId),
    [filtered, currentDatabaseId],
  );

  // Volta o destaque ao topo quando a busca muda.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Mantém o item destacado visível durante a navegação por teclado.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, selectable.length]);

  // Fecha com Esc.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const open = (id: string | undefined) => {
    if (!id) return;
    onSelect(id);
  };

  const hasQuery = query.trim().length > 0;
  const nothingFound = filtered.length === 0;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} role="presentation" />
      <div
        style={
          pos
            ? { top: pos.top, left: pos.left, width: pos.width }
            : { top: -9999, left: -9999 }
        }
        className="fixed z-[60] rounded-md border bg-popover p-2 shadow-lg"
        role="dialog"
        aria-label="Abrir database"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) =>
                  Math.min(i + 1, Math.max(selectable.length - 1, 0)),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                open(selectable[activeIndex]?.id);
              }
            }}
            placeholder="Buscar database"
            autoComplete="off"
            aria-label="Buscar database"
            className="pl-7"
          />
        </div>

        <div
          ref={listRef}
          className="no-scrollbar mt-2 flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto"
        >
          {filtered.map((db) => {
            const Icon = databaseIcon(db.icon);
            const isCurrent = db.id === currentDatabaseId;
            const isActive = !isCurrent && selectable[activeIndex]?.id === db.id;
            const projectName = db.projectId
              ? projectNameById.get(db.projectId)
              : undefined;
            return (
              <button
                key={db.id}
                type="button"
                disabled={isCurrent}
                data-active={isActive}
                onMouseEnter={() => {
                  if (isCurrent) return;
                  const index = selectable.findIndex((d) => d.id === db.id);
                  if (index >= 0) setActiveIndex(index);
                }}
                onClick={() => open(db.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                  isCurrent
                    ? "cursor-default text-muted-foreground"
                    : isActive
                      ? "bg-accent"
                      : "hover:bg-accent/60",
                )}
              >
                <Icon className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{db.name}</span>
                {isCurrent ? (
                  <span className="flex-none text-xs text-muted-foreground">
                    aberto
                  </span>
                ) : projectName ? (
                  <span className="max-w-[40%] flex-none truncate text-xs text-muted-foreground">
                    {projectName}
                  </span>
                ) : null}
              </button>
            );
          })}

          {nothingFound ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Nada encontrado.
            </p>
          ) : null}
        </div>
      </div>
    </>,
    document.body,
  );
}
