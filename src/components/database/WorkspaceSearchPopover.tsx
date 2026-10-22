"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignLeft,
  FileText,
  Folder,
  Layers,
  LayoutTemplate,
  Search,
  Table2,
  Tags,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { searchDatabaseRows } from "@/lib/database";
import { rowTitleOf } from "@/components/database/database-fields";
import {
  SEARCH_ITEM_LIMIT,
  itemResultFor,
  searchWorkspace,
  type WorkspaceSearchIndex,
  type WorkspaceSearchKind,
  type WorkspaceSearchResult,
} from "@/components/database/workspace-search";
import type { Database } from "@/types/database";

/** Metadados (título/ícone) de cada seção da paleta de busca. */
const SEARCH_SECTION_META: Record<
  WorkspaceSearchKind,
  { title: string; icon: typeof Folder }
> = {
  project: { title: "Projetos", icon: Folder },
  category: { title: "Categorias", icon: Tags },
  database: { title: "Databases", icon: Table2 },
  column: { title: "Propriedades", icon: AlignLeft },
  view: { title: "Visualizações", icon: Layers },
  template: { title: "Modelos", icon: LayoutTemplate },
  item: { title: "Itens", icon: FileText },
};

/** Debounce da busca de itens (mesmo valor usado na Tabela/agregados). */
const ITEM_SEARCH_DEBOUNCE_MS = 250;

/** Mínimo de caracteres para consultar itens (evita varredura ampla). */
const ITEM_SEARCH_MIN_CHARS = 2;

export interface WorkspaceSearchPopoverProps {
  anchorEl: HTMLElement;
  query: string;
  onQueryChange: (value: string) => void;
  /** Índice em memória (projetos/categorias/databases/propriedades/abas/modelos). */
  index: WorkspaceSearchIndex;
  /** Databases carregados (resolve o título dos itens e o `projectId`). */
  databases: Database[];
  /** Abre o resultado escolhido (o pai fecha e limpa a busca). */
  onOpenResult: (result: WorkspaceSearchResult) => void;
  onClose: () => void;
}

/**
 * Paleta de **busca global** do Workspace: encontra projetos, categorias,
 * databases, propriedades, abas, modelos e itens (linhas). Renderizada em portal
 * com `position: fixed`, no mesmo padrão dos demais popovers da sidebar. O texto
 * da busca é controlado pelo pai (`query`).
 *
 * É compartilhada pela lupa da sidebar de projetos. O texto da busca é
 * controlado pelo pai (`query`).
 */
export function WorkspaceSearchPopover({
  anchorEl,
  query,
  onQueryChange,
  index,
  databases,
  onOpenResult,
  onClose,
}: WorkspaceSearchPopoverProps) {
  /** Posição/tamanho (viewport) da paleta, calculados a partir do âncora. */
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Índice do resultado destacado (base da navegação por teclado). */
  const [activeIndex, setActiveIndex] = useState(0);
  /** Resultados de itens (RPC), com descarte de respostas fora de ordem. */
  const [itemResults, setItemResults] = useState<WorkspaceSearchResult[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const requestRef = useRef(0);

  // Centralizado na horizontal, com 5px abaixo do header (o topo da sidebar é
  // exatamente a base do header). Mais largo que o popover antigo de projetos.
  useLayoutEffect(() => {
    const sidebar = anchorEl.closest("aside") ?? anchorEl;
    const rect = sidebar.getBoundingClientRect();
    const width = Math.max(320, Math.min(560, window.innerWidth - 32));
    setPos({
      top: rect.top + 5,
      left: Math.max(8, (window.innerWidth - width) / 2),
      width,
    });
    inputRef.current?.focus();
  }, [anchorEl]);

  // Busca de itens no servidor: debounce de 250ms, mínimo de 2 caracteres e
  // descarte de respostas antigas (mesmo padrão de `useColumnAggregates`).
  useEffect(() => {
    const term = query.trim();
    if (term.length < ITEM_SEARCH_MIN_CHARS) {
      requestRef.current += 1;
      setItemResults([]);
      setItemsLoading(false);
      return;
    }
    const requestId = ++requestRef.current;
    setItemsLoading(true);
    const timer = setTimeout(() => {
      void searchDatabaseRows(term, SEARCH_ITEM_LIMIT)
        .then((hits) => {
          if (requestId !== requestRef.current) return;
          setItemResults(
            hits.map((hit) =>
              itemResultFor(
                {
                  databaseId: hit.databaseId,
                  rowId: hit.row.id,
                  // Nunca renderizar `values` como HTML: só o título.
                  label: rowTitleOf(
                    hit.row,
                    databases.find((d) => d.id === hit.databaseId)?.columns ?? [],
                  ),
                },
                databases,
              ),
            ),
          );
        })
        .catch(() => {
          if (requestId === requestRef.current) setItemResults([]);
        })
        .finally(() => {
          if (requestId === requestRef.current) setItemsLoading(false);
        });
    }, ITEM_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, databases]);

  // Seções em memória + a seção de itens (ao final).
  const sections = useMemo(() => {
    const memory = searchWorkspace(index, query);
    if (itemResults.length > 0) {
      return [...memory, { kind: "item" as const, results: itemResults }];
    }
    return memory;
  }, [index, query, itemResults]);

  /** Lista plana na ordem exibida — base da navegação por teclado. */
  const flat = useMemo(
    () => sections.flatMap((section) => section.results),
    [sections],
  );

  // Volta o destaque ao topo quando a busca muda.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Mantém o resultado destacado visível durante a navegação por teclado.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, flat.length]);

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

  const openResult = (result: WorkspaceSearchResult | undefined) => {
    if (!result) return;
    onOpenResult(result);
  };

  const hasQuery = query.trim().length > 0;
  const nothingFound = hasQuery && flat.length === 0 && !itemsLoading;

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
        aria-label="Buscar no Workspace"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) =>
                  Math.min(i + 1, Math.max(flat.length - 1, 0)),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                openResult(flat[activeIndex]);
              }
            }}
            placeholder="Buscar no Workspace"
            autoComplete="off"
            aria-label="Buscar no Workspace"
            className="pl-7"
          />
        </div>

        <div
          ref={listRef}
          className="no-scrollbar mt-2 flex max-h-[60vh] flex-col gap-2 overflow-y-auto"
        >
          {!hasQuery ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Busque por projetos, databases, propriedades, abas, modelos e itens.
            </p>
          ) : null}

          {sections.map((section) => {
            const meta = SEARCH_SECTION_META[section.kind];
            const Icon = meta.icon;
            return (
              <section key={section.kind} className="flex flex-col gap-0.5">
                <span className="px-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {meta.title}
                </span>
                {section.results.map((result) => {
                  const resultIndex = flat.indexOf(result);
                  const isActive = resultIndex === activeIndex;
                  return (
                    <button
                      key={result.id}
                      type="button"
                      data-active={isActive}
                      onMouseEnter={() => setActiveIndex(resultIndex)}
                      onClick={() => openResult(result)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                        isActive ? "bg-accent" : "hover:bg-accent/60",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{result.label}</span>
                      {result.sublabel ? (
                        <span className="max-w-[40%] flex-none truncate text-xs text-muted-foreground">
                          {result.sublabel}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </section>
            );
          })}

          {itemsLoading ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Buscando itens…
            </p>
          ) : null}

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
