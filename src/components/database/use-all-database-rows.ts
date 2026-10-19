"use client";

import { useEffect, useState } from "react";

import { fetchAllDatabaseRows } from "@/lib/database";
import type { DbRow } from "@/types/database";

/**
 * Carrega **todas** as linhas de um database, em loop de páginas, somente
 * quando `enabled` (sob demanda). É usado pelas visões que precisam do conjunto
 * completo — Kanban e Gráfico — enquanto a Tabela usa a paginação por cursor.
 */
export function useAllDatabaseRows(databaseId: string | null, enabled: boolean) {
  const [rows, setRows] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!databaseId || !enabled) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchAllDatabaseRows(databaseId)
      .then((all) => {
        if (!cancelled) setRows(all);
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message || "Falha ao carregar linhas");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [databaseId, enabled]);

  return { rows, loading, error };
}
