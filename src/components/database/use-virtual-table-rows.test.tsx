import { render, screen } from "@testing-library/react";
import { useCallback, useRef } from "react";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROW_HEIGHT,
  useVirtualTableRows,
} from "./use-virtual-table-rows";

interface HarnessProps {
  count: number;
  viewportHeight?: number;
  rowHeight?: number;
  pinnedIndexes?: number[];
}

/**
 * Harness mínimo da virtualização. O jsdom não calcula layout, então o
 * container de rolagem tem `clientHeight`/`scrollHeight` mockados — o
 * virtualizador mede via `clientHeight` (`getRect`) e `scrollTop`.
 */
function Harness({
  count,
  viewportHeight = 400,
  rowHeight = DEFAULT_ROW_HEIGHT,
  pinnedIndexes,
}: HarnessProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const getRowId = useCallback((index: number) => `row-${index}`, []);

  const { items, paddingTop, paddingBottom } = useVirtualTableRows({
    count,
    scrollRef,
    getRowId,
    estimateSize: rowHeight,
    pinnedIndexes,
    overscan: 10,
  });

  const setScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      if (!node) return;
      Object.defineProperty(node, "clientHeight", {
        configurable: true,
        get: () => viewportHeight,
      });
      Object.defineProperty(node, "clientWidth", {
        configurable: true,
        get: () => 800,
      });
      Object.defineProperty(node, "scrollHeight", {
        configurable: true,
        get: () => count * rowHeight,
      });
    },
    [viewportHeight, count, rowHeight],
  );

  return (
    <div ref={setScrollRef} data-testid="scroll">
      <div data-testid="pad-top" style={{ height: paddingTop }} />
      {items.map((item) => (
        <div
          key={item.key}
          data-testid="row"
          data-index={item.index}
          style={{ height: rowHeight }}
        />
      ))}
      <div data-testid="pad-bottom" style={{ height: paddingBottom }} />
    </div>
  );
}

/** Altura (px) aplicada inline a um spacer. */
function spacerHeight(testId: string): number {
  return Number.parseFloat(screen.getByTestId(testId).style.height || "0");
}

describe("useVirtualTableRows", () => {
  it("renderiza pouquíssimas linhas com 10.000 itens", () => {
    render(<Harness count={10000} />);
    const rows = screen.getAllByTestId("row");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(50);
  });

  it("a altura total (spacers + linhas) confere com count * estimateSize", () => {
    render(<Harness count={10000} />);
    const rows = screen.getAllByTestId("row");
    const total =
      spacerHeight("pad-top") +
      rows.length * DEFAULT_ROW_HEIGHT +
      spacerHeight("pad-bottom");
    expect(total).toBeCloseTo(10000 * DEFAULT_ROW_HEIGHT, 0);
  });

  it("renderiza a lista vazia sem linhas nem spacers", () => {
    render(<Harness count={0} />);
    expect(screen.queryAllByTestId("row")).toHaveLength(0);
    expect(spacerHeight("pad-top")).toBe(0);
    expect(spacerHeight("pad-bottom")).toBe(0);
  });

  it("renderiza todos os itens de uma lista pequena", () => {
    render(<Harness count={3} />);
    expect(screen.getAllByTestId("row")).toHaveLength(3);
  });

  it("mantém montada a linha pinada mesmo fora da área visível", () => {
    render(<Harness count={10000} pinnedIndexes={[5000]} />);
    const scroll = screen.getByTestId("scroll");
    expect(scroll.querySelector('[data-index="5000"]')).not.toBeNull();
    // Continua renderizando poucas linhas além da pinada.
    expect(screen.getAllByTestId("row").length).toBeLessThan(50);
  });
});
