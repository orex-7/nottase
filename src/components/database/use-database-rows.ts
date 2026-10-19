"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import {
  DEFAULT_ROWS_PAGE_SIZE,
  fetchDatabaseRowsPage,
  type RowsFilter,
  type RowsCursor,
} from "@/lib/database";
import type { DbRow } from "@/types/database";

/** Tamanho padrão de página da Tabela. */
export const ROWS_PAGE_SIZE = DEFAULT_ROWS_PAGE_SIZE;

interface State {
  rows: DbRow[];
  cursor: RowsCursor | null;
  hasMore: boolean;
  /** Carregando a 1ª página (reset / mudança de busca ou filtro). */
  loading: boolean;
  /** Carregando uma página seguinte (scroll). */
  loadingMore: boolean;
  error: string | null;
}

type Action =
  | { type: "reset" }
  | { type: "loading"; append: boolean }
  | {
      type: "page";
      rows: DbRow[];
      cursor: RowsCursor | null;
      hasMore: boolean;
      append: boolean;
    }
  | { type: "error"; message: string }
  | { type: "patch"; updater: (rows: DbRow[]) => DbRow[] };

const INITIAL: State = {
  rows: [],
  cursor: null,
  hasMore: true,
  loading: true,
  loadingMore: false,
  error: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return { ...INITIAL };
    case "loading":
      return {
        ...state,
        loading: !action.append,
        loadingMore: action.append,
        error: null,
      };
    case "page":
      return {
        rows: action.append ? [...state.rows, ...action.rows] : action.rows,
        cursor: action.cursor,
        hasMore: action.hasMore,
        loading: false,
        loadingMore: false,
        error: null,
      };
    case "error":
      return {
        ...state,
        loading: false,
        loadingMore: false,
        error: action.message,
      };
    case "patch":
      return { ...state, rows: action.updater(state.rows) };
  }
}

export interface UseDatabaseRowsOptions {
  /** Database selecionado (`null` = nenhum). */
  databaseId: string | null;
  /** Busca textual (aplicada no servidor). */
  search?: string;
  /** Filtros por propriedade (aplicados no servidor). */
  filters?: RowsFilter[];
  /** Tamanho da página (default `ROWS_PAGE_SIZE`). */
  limit?: number;
}

export interface UseDatabaseRowsResult {
  /** Linhas carregadas (páginas acumuladas). */
  rows: DbRow[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  /** Carrega a próxima página (no-op se já carregando ou no fim). */
  fetchNextPage: () => void;
  /** Tenta de novo a última carga que falhou (sem perder o já carregado). */
  retry: () => void;
  /** Aplica um patch local nas linhas carregadas (escritas otimistas). */
  patchRows: (updater: (rows: DbRow[]) => DbRow[]) => void;
}

/**
 * Carrega as linhas de um database em páginas por keyset, buscando mais conforme
 * o chamador pedir (`fetchNextPage`). Reseta e recarrega a 1ª página quando o
 * database, a busca ou os filtros mudam. Descarta respostas de requisições
 * antigas (troca rápida de filtro/database não sobrescreve o estado atual).
 */
export function useDatabaseRows({
  databaseId,
  search = "",
  filters: filtersProp,
  limit = ROWS_PAGE_SIZE,
}: UseDatabaseRowsOptions): UseDatabaseRowsResult {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  // Estabiliza a identidade dos filtros (o chamador pode recriar o array).
  const filtersKey = useMemo(
    () => JSON.stringify(filtersProp ?? []),
    [filtersProp],
  );
  const filters = useMemo(
    () => JSON.parse(filtersKey) as RowsFilter[],
    [filtersKey],
  );

  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const cursorRef = useRef<RowsCursor | null>(null);
  const hasMoreRef = useRef(true);
  const lastAppendRef = useRef(false);

  const load = useCallback(
    async (append: boolean) => {
      if (!databaseId) return;
      // Evita disparar a mesma página duas vezes.
      if (append && (!hasMoreRef.current || inFlightRef.current)) return;
      const requestId = ++requestIdRef.current;
      lastAppendRef.current = append;
      inFlightRef.current = true;
      dispatch({ type: "loading", append });
      try {
        const page = await fetchDatabaseRowsPage(databaseId, {
          cursor: append ? cursorRef.current : null,
          limit,
          search,
          filters,
        });
        // Requisição antiga (filtro/database trocados): descarta.
        if (requestId !== requestIdRef.current) return;
        cursorRef.current = page.nextCursor;
        hasMoreRef.current = page.hasMore;
        dispatch({
          type: "page",
          rows: page.rows,
          cursor: page.nextCursor,
          hasMore: page.hasMore,
          append,
        });
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        dispatch({
          type: "error",
          message: (err as Error).message || "Falha ao carregar linhas",
        });
      } finally {
        if (requestId === requestIdRef.current) inFlightRef.current = false;
      }
    },
    [databaseId, limit, search, filters],
  );

  // Recarrega do zero quando muda o database, a busca ou os filtros.
  useEffect(() => {
    requestIdRef.current += 1;
    inFlightRef.current = false;
    cursorRef.current = null;
    hasMoreRef.current = true;
    dispatch({ type: "reset" });
    void load(false);
  }, [load]);

  const fetchNextPage = useCallback(() => {
    void load(true);
  }, [load]);

  const retry = useCallback(() => {
    void load(lastAppendRef.current);
  }, [load]);

  const patchRows = useCallback(
    (updater: (rows: DbRow[]) => DbRow[]) =>
      dispatch({ type: "patch", updater }),
    [],
  );

  return {
    rows: state.rows,
    loading: state.loading,
    loadingMore: state.loadingMore,
    error: state.error,
    hasMore: state.hasMore,
    fetchNextPage,
    retry,
    patchRows,
  };
}
