"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchRelationLinksForRows } from "@/lib/database";

/**
 * Cache em memória dos vínculos de relação, chaveado por `${rowId}|${propertyId}`.
 * Compartilhado entre células/tabelas para evitar buscas repetidas da mesma
 * linha. Um `Set` separado marca as linhas já carregadas (ausência de chave =
 * lista vazia para aquela propriedade).
 */
const linkCache = new Map<string, string[]>();
/** Linhas cujos vínculos já foram carregados (mesmo que vazios). */
const fetchedRows = new Set<string>();
/** Hooks montados que devem reexecutar quando o cache muda. */
const listeners = new Set<() => void>();

/** Lista vazia estável (evita recriar arrays a cada render). */
const EMPTY_TARGETS: string[] = [];

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Invalida o cache de vínculos. Sem argumento limpa tudo; com ids, remove apenas
 * as linhas informadas (ex.: origem ou alvo de um vínculo alterado). Chamada nas
 * escritas de vínculo e nas exclusões de linha/database.
 */
export function invalidateRelationLinks(rowIds?: Iterable<string>): void {
  if (rowIds === undefined) {
    linkCache.clear();
    fetchedRows.clear();
  } else {
    for (const id of rowIds) {
      fetchedRows.delete(id);
      const prefix = `${id}|`;
      for (const key of [...linkCache.keys()]) {
        if (key.startsWith(prefix)) linkCache.delete(key);
      }
    }
  }
  notify();
}

export interface UseRelationLinksResult {
  /** Ids das linhas alvo vinculadas a `rowId` na propriedade `propertyId`. */
  getTargets: (rowId: string, propertyId: string) => string[];
  /** Há uma busca em andamento para alguma linha ainda não resolvida. */
  loading: boolean;
  /** Atualiza otimisticamente o cache (add/remove) e notifica os hooks. */
  setTargets: (rowId: string, propertyId: string, targets: string[]) => void;
}

/**
 * Carrega, em lote, os **vínculos** das linhas informadas (`relation_links`) e
 * resolve os alvos de cada propriedade de relação. Deduplica os ids, descarta
 * respostas de requisições antigas e compartilha um cache invalidável pelas
 * escritas (`invalidateRelationLinks`).
 */
export function useRelationLinks(rowIds: string[]): UseRelationLinksResult {
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  // Reexecuta quando o cache é invalidado externamente (escrita de vínculo).
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
    for (const id of rowIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    return unique.join(",");
  }, [rowIds]);

  useEffect(() => {
    const list = idsKey ? idsKey.split(",") : [];
    const missing = list.filter((id) => !fetchedRows.has(id));
    if (missing.length === 0) {
      setLoading(false);
      return;
    }
    const requestId = ++requestRef.current;
    setLoading(true);
    void fetchRelationLinksForRows(missing)
      .then((links) => {
        if (requestId !== requestRef.current) return;
        const grouped = new Map<string, string[]>();
        for (const link of links) {
          const key = `${link.sourceItemId}|${link.propertyId}`;
          const arr = grouped.get(key) ?? [];
          arr.push(link.targetItemId);
          grouped.set(key, arr);
        }
        for (const id of missing) fetchedRows.add(id);
        for (const [key, arr] of grouped) linkCache.set(key, arr);
        setTick((t) => t + 1);
      })
      .catch(() => {
        /* mantém o estado vazio até uma nova tentativa */
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
  }, [idsKey, tick]);

  /**
   * Lê os alvos do cache. É uma função comum (não memoizada) de propósito: a
   * identidade muda a cada render, então consumidores memoizados (ex.: o filtro
   * de Kanban/Gráfico) recalculam após uma carga/invalidação.
   */
  function getTargets(rowId: string, propertyId: string): string[] {
    if (!fetchedRows.has(rowId)) return EMPTY_TARGETS;
    return linkCache.get(`${rowId}|${propertyId}`) ?? EMPTY_TARGETS;
  }

  const setTargets = useCallback(
    (rowId: string, propertyId: string, targets: string[]): void => {
      fetchedRows.add(rowId);
      const key = `${rowId}|${propertyId}`;
      if (targets.length === 0) linkCache.delete(key);
      else linkCache.set(key, [...targets]);
      notify();
    },
    [],
  );

  return { getTargets, loading, setTargets };
}
