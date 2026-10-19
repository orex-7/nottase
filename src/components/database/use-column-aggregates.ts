"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchColumnAggregates,
  type ColumnAggregateRequest,
  type RowsFilter,
} from "@/lib/database";
import type { CellValue } from "@/types/database";

/**
 * Agrupa rajadas de mudança (ex.: edição de célula a cada tecla) numa única
 * consulta. O resultado continua sendo recalculado a cada mudança relevante
 * (config/busca/filtros/mutações) — só não a cada tecla.
 */
const AGGREGATE_DEBOUNCE_MS = 250;

export interface UseColumnAggregatesParams {
  databaseId: string;
  /** Uma requisição por coluna numérica com `calculate` configurado. */
  configs: ColumnAggregateRequest[];
  /** Busca (debounced) da visão ativa. */
  search: string;
  /** Filtros da visão ativa (mesmos aplicados à Tabela). */
  filters: RowsFilter[];
  /** Contador incrementado nas mutações (edição/adição/remoção de linha). */
  revision: number;
}

export interface UseColumnAggregatesResult {
  /** Agregado calculado de uma coluna (`null` enquanto não carregado). */
  getValue: (columnId: string) => CellValue | null;
  /** Há um cálculo em andamento. */
  loading: boolean;
}

/**
 * Calcula, no servidor, os agregados do rodapé (RPC `database_column_aggregates`)
 * sobre todas as linhas do database, respeitando busca e filtros. Estado local
 * (o resultado depende da visão) e sem cache global; respostas de requisições
 * antigas são descartadas.
 */
export function useColumnAggregates({
  databaseId,
  configs,
  search,
  filters,
  revision,
}: UseColumnAggregatesParams): UseColumnAggregatesResult {
  const [values, setValues] = useState<Map<string, CellValue>>(new Map());
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  // Estabiliza a identidade das configs/filtros (o chamador pode recriar os arrays).
  const configsKey = useMemo(() => JSON.stringify(configs), [configs]);
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    const list = JSON.parse(configsKey) as ColumnAggregateRequest[];
    if (list.length === 0) {
      // Invalida requisições em voo e limpa o rodapé.
      requestRef.current += 1;
      setValues(new Map());
      setLoading(false);
      return;
    }
    const requestId = ++requestRef.current;
    setLoading(true);
    const timer = setTimeout(() => {
      void fetchColumnAggregates(databaseId, list, {
        search,
        filters: JSON.parse(filtersKey) as RowsFilter[],
      })
        .then((map) => {
          if (requestId !== requestRef.current) return;
          setValues(map);
        })
        .catch(() => {
          /* mantém o último valor conhecido até uma nova tentativa */
        })
        .finally(() => {
          if (requestId === requestRef.current) setLoading(false);
        });
    }, AGGREGATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [databaseId, configsKey, filtersKey, search, revision]);

  /** Lê o agregado calculado de uma coluna (ou `null` enquanto não carregado). */
  function getValue(columnId: string): CellValue | null {
    const cached = values.get(columnId);
    return cached === undefined ? null : cached;
  }

  return { getValue, loading };
}
