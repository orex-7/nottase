"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchRollupValues,
  type RollupValueRequest,
} from "@/lib/database";
import type { CellValue } from "@/types/database";

/**
 * Cache em memória dos valores de rollup, chaveado por
 * `${rowId}|${propertyId}|${assinaturaDaConfig}` — a assinatura garante que
 * mudar a função/propriedade alvo invalide o valor antigo. Um `Set` marca as
 * chaves já calculadas.
 */
const rollupCache = new Map<string, CellValue>();
const fetchedKeys = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Assinatura estável de uma configuração de rollup (entra na chave do cache). */
function configSig(config: RollupValueRequest): string {
  return `${config.relationPropertyId}:${config.targetPropertyId}:${config.fn}:${config.targetType ?? ""}`;
}

/** Remove as chaves (e, opcionalmente, os valores) das linhas informadas. */
function dropKeys(rowIds: Iterable<string> | undefined, dropValues: boolean): void {
  if (rowIds === undefined) {
    fetchedKeys.clear();
    if (dropValues) rollupCache.clear();
    return;
  }
  for (const id of rowIds) {
    const prefix = `${id}|`;
    for (const key of [...fetchedKeys]) {
      if (key.startsWith(prefix)) fetchedKeys.delete(key);
    }
    if (dropValues) {
      for (const key of [...rollupCache.keys()]) {
        if (key.startsWith(prefix)) rollupCache.delete(key);
      }
    }
  }
}

/**
 * Invalida (descarta) o cache de rollup. Sem argumento limpa tudo; com ids,
 * descarta as linhas informadas. Usada em mudanças estruturais (vínculo
 * alterado, linha/database excluída) — a UI volta a "…" até recalcular.
 */
export function invalidateRollupValues(rowIds?: Iterable<string>): void {
  dropKeys(rowIds, true);
  notify();
}

/**
 * Marca o cache de rollup como **stale** sem descartar o valor: mantém o último
 * cálculo visível enquanto recalcula (sem "piscar" para "…"). Usada em edições
 * frequentes de célula.
 */
export function staleRollupValues(rowIds?: Iterable<string>): void {
  dropKeys(rowIds, false);
  notify();
}

export interface UseRollupValuesResult {
  /** Valor calculado de um rollup (`null` enquanto ainda não foi carregado). */
  getValue: (rowId: string, propertyId: string) => CellValue | null;
  /** Há um cálculo em andamento para alguma linha ainda não resolvida. */
  loading: boolean;
}

/**
 * Calcula, em lote, os valores das propriedades de **rollup** das linhas
 * informadas (RPC `rollup_values_for_rows`). Somente leitura: não há escrita.
 */
export function useRollupValues(
  rowIds: string[],
  configs: RollupValueRequest[],
): UseRollupValuesResult {
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const idsKey = useMemo(() => {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const id of rowIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    return unique.join(",");
  }, [rowIds]);

  // Estabiliza a identidade das configs (o chamador pode recriar o array).
  const configsKey = useMemo(() => JSON.stringify(configs), [configs]);
  const stableConfigs = useMemo(
    () => JSON.parse(configsKey) as RollupValueRequest[],
    [configsKey],
  );
  const configByProperty = useMemo(
    () => new Map(stableConfigs.map((c) => [c.propertyId, c])),
    [stableConfigs],
  );

  useEffect(() => {
    const list = idsKey ? idsKey.split(",") : [];
    if (list.length === 0 || stableConfigs.length === 0) {
      setLoading(false);
      return;
    }
    const pendingRows = list.filter((rowId) =>
      stableConfigs.some(
        (c) => !fetchedKeys.has(`${rowId}|${c.propertyId}|${configSig(c)}`),
      ),
    );
    if (pendingRows.length === 0) {
      setLoading(false);
      return;
    }
    const requestId = ++requestRef.current;
    setLoading(true);
    void fetchRollupValues(stableConfigs, pendingRows)
      .then((map) => {
        if (requestId !== requestRef.current) return;
        for (const rowId of pendingRows) {
          for (const c of stableConfigs) {
            const key = `${rowId}|${c.propertyId}|${configSig(c)}`;
            rollupCache.set(key, map.get(`${rowId}|${c.propertyId}`) ?? "");
            fetchedKeys.add(key);
          }
        }
        setTick((t) => t + 1);
      })
      .catch(() => {
        /* mantém "—" até uma nova tentativa */
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
  }, [idsKey, stableConfigs, tick]);

  /**
   * Lê o valor calculado do cache (função comum; muda a cada render). Devolve o
   * último valor conhecido mesmo quando está "stale" (recálculo em andamento) —
   * só devolve `null` (→ "…") quando nunca foi calculado.
   */
  function getValue(rowId: string, propertyId: string): CellValue | null {
    const config = configByProperty.get(propertyId);
    if (!config) return null;
    const key = `${rowId}|${propertyId}|${configSig(config)}`;
    const cached = rollupCache.get(key);
    if (cached !== undefined) return cached;
    return null;
  }

  return { getValue, loading };
}
