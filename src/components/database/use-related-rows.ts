"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { rowTitleOf } from "@/components/database/database-fields";
import { fetchRowsByIds } from "@/lib/database";
import type { Column, DbRow } from "@/types/database";

/**
 * Cache em memória das linhas relacionadas (por id de linha, que é global).
 * Compartilhado entre células/tabelas para que vários itens que referenciam a
 * mesma linha não disparem buscas repetidas.
 */
const rowCache = new Map<string, DbRow>();
/**
 * Ids já buscados que **não** existem mais (referência órfã). Evita refazer a
 * busca em loop por um id removido — até uma invalidação explícita.
 */
const missingIds = new Set<string>();
/** Hooks montados que devem reexecutar quando o cache muda. */
const listeners = new Set<() => void>();

/** Notifica os hooks montados de que o cache mudou. */
function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Invalida o cache de linhas relacionadas. Sem argumento limpa tudo; com ids,
 * remove apenas as linhas informadas (ex.: linha editada ou excluída). Chamada
 * nas escritas de célula e nas exclusões de linha.
 */
export function invalidateRelatedRows(ids?: Iterable<string>): void {
  if (ids === undefined) {
    rowCache.clear();
    missingIds.clear();
  } else {
    for (const id of ids) {
      rowCache.delete(id);
      missingIds.delete(id);
    }
  }
  notify();
}

/** Estado de resolução de uma linha referenciada. */
export type RelatedRowState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; title: string };

export interface UseRelatedRowsResult {
  /** Resolve o estado (título/órfã/carregando) de uma linha referenciada. */
  resolve: (rowId: string) => RelatedRowState;
  /** Há uma busca em andamento para algum id ainda não resolvido. */
  loading: boolean;
}

/**
 * Resolve os **títulos** das linhas referenciadas por uma coluna de relação.
 * Busca apenas os ids ainda não resolvidos (deduplicados, em lote) e descarta
 * respostas de requisições antigas. O cache é compartilhado e invalidado pelas
 * escritas (`invalidateRelatedRows`).
 */
export function useRelatedRows(
  databaseId: string | null,
  ids: string[],
  columns: Column[],
): UseRelatedRowsResult {
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  // Reexecuta quando o cache é invalidado externamente (edição/exclusão).
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Chave estável dos ids deduplicados (evita refetch a cada render).
  const idsKey = useMemo(() => {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const id of ids) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    return unique.join(",");
  }, [ids]);

  useEffect(() => {
    if (!databaseId) {
      setLoading(false);
      return;
    }
    const list = idsKey ? idsKey.split(",") : [];
    const missing = list.filter(
      (id) => !rowCache.has(id) && !missingIds.has(id),
    );
    if (missing.length === 0) {
      setLoading(false);
      return;
    }
    const requestId = ++requestRef.current;
    setLoading(true);
    void fetchRowsByIds(missing)
      .then((rows) => {
        if (requestId !== requestRef.current) return;
        for (const [id, row] of rows) rowCache.set(id, row);
        // Marca como órfãs as que não voltaram (evita buscar em loop).
        for (const id of missing) if (!rows.has(id)) missingIds.add(id);
        // Força o re-render para exibir os títulos recém-carregados.
        setTick((t) => t + 1);
      })
      .catch(() => {
        /* mantém o fallback (id curto) até uma nova tentativa */
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
  }, [databaseId, idsKey, tick]);

  const resolve = useCallback(
    (rowId: string): RelatedRowState => {
      const row = rowCache.get(rowId);
      if (row) return { status: "ready", title: rowTitleOf(row, columns) };
      return loading ? { status: "loading" } : { status: "missing" };
    },
    [loading, columns],
  );

  return { resolve, loading };
}
