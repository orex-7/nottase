"use client";

import { useCallback, useMemo } from "react";
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
} from "@tanstack/react-virtual";

/**
 * Altura padrão (px) de uma linha da tabela. É só o valor inicial: a altura real
 * é calibrada no DOM (a linha tem altura fixa — `white-space: nowrap`), porque
 * ela depende da fonte/zoom do usuário. Um `estimateSize` errado em 1px
 * acumularia desvio no spacer superior em listas longas.
 */
export const DEFAULT_ROW_HEIGHT = 41;

export interface UseVirtualTableRowsOptions {
  /** Total de linhas da lista (`filtered.length`). */
  count: number;
  /** Container de rolagem (`overflow-auto`) que envolve a tabela. */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Id estável de cada índice — usado como `getItemKey` (não use o índice). */
  getRowId: (index: number) => string;
  /** Altura estimada da linha (px). Default: `DEFAULT_ROW_HEIGHT`. */
  estimateSize?: number;
  /**
   * Índices que precisam permanecer montados mesmo fora da área visível
   * (linha em drag, em edição ou com menu aberto).
   */
  pinnedIndexes?: number[];
  /** Itens renderizados além da área visível (default 10). */
  overscan?: number;
  /**
   * Offset do início da lista dentro do container de rolagem (a altura do
   * cabeçalho sticky). Alinha `start`/`scrollToIndex` com o DOM real.
   */
  scrollMargin?: number;
}

/**
 * Virtualiza as linhas de uma **tabela real** (`<table>` + spacer rows), para
 * reaproveitar em tabelas/listas do database. Devolve os itens visíveis e as
 * alturas dos dois spacers (`paddingTop`/`paddingBottom`) que devem ser
 * renderizados como `<tr>` de preenchimento acima e abaixo das linhas reais —
 * mantendo o `<table>`, o `<colgroup>` e o cabeçalho sticky intactos.
 *
 * Notas de geometria (confirmadas na `@tanstack/virtual-core`):
 * - `virtualItem.start` **inclui** `scrollMargin`; `getTotalSize()` **exclui**.
 *   Por isso `paddingTop = start - scrollMargin` (posição dentro do `<tbody>`).
 * - `scrollToIndex` usa `start - scrollPaddingStart`; passamos
 *   `scrollPaddingStart = scrollMargin` para a linha não ficar sob o cabeçalho.
 */
export function useVirtualTableRows({
  count,
  scrollRef,
  getRowId,
  estimateSize = DEFAULT_ROW_HEIGHT,
  pinnedIndexes,
  overscan = 10,
  scrollMargin = 0,
}: UseVirtualTableRowsOptions) {
  // Índices extras sempre montados, válidos em relação à lista atual.
  const extraIndexes = useMemo(
    () => (pinnedIndexes ?? []).filter((i) => i >= 0 && i < count),
    [pinnedIndexes, count],
  );

  // Compõe o range padrão com os índices "pinados" (sem duplicar).
  const rangeExtractor = useCallback(
    (range: Range) => {
      const base = defaultRangeExtractor(range);
      if (extraIndexes.length === 0) return base;
      const merged = new Set(base);
      for (const index of extraIndexes) merged.add(index);
      return Array.from(merged).sort((a, b) => a - b);
    },
    [extraIndexes],
  );

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    getItemKey: (index) => getRowId(index),
    overscan,
    scrollMargin,
    scrollPaddingStart: scrollMargin,
    rangeExtractor,
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const first = items[0];
  const last = items[items.length - 1];
  // Alturas dos spacers (em coordenadas do `<tbody>`, sem o `scrollMargin`).
  const paddingTop = first ? first.start - scrollMargin : 0;
  const paddingBottom = last ? totalSize - (last.end - scrollMargin) : 0;

  return { virtualizer, items, totalSize, paddingTop, paddingBottom };
}
