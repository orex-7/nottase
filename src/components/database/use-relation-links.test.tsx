import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database")>();
  return { ...actual, fetchRelationLinksForRows: vi.fn() };
});

import { fetchRelationLinksForRows, type RelationLink } from "@/lib/database";

import {
  invalidateRelationLinks,
  useRelationLinks,
} from "./use-relation-links";

const fetchLinks = vi.mocked(fetchRelationLinksForRows);

function link(sourceItemId: string, targetItemId: string): RelationLink {
  return { propertyId: "rel", sourceItemId, targetItemId };
}

describe("useRelationLinks", () => {
  beforeEach(() => {
    invalidateRelationLinks();
    fetchLinks.mockReset();
  });

  it("busca em lote, deduplica os ids e resolve os alvos", async () => {
    fetchLinks.mockResolvedValue([link("a", "t1"), link("a", "t2")]);

    const { result } = renderHook(() => useRelationLinks(["a", "a", "b"]));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchLinks).toHaveBeenCalledTimes(1);
    expect(fetchLinks).toHaveBeenCalledWith(["a", "b"]);
    expect(result.current.getTargets("a", "rel")).toEqual(["t1", "t2"]);
    // "b" não tem vínculos, mas foi carregada → lista vazia.
    expect(result.current.getTargets("b", "rel")).toEqual([]);
  });

  it("atualiza o cache de forma otimista (setTargets)", async () => {
    fetchLinks.mockResolvedValue([]);

    const { result } = renderHook(() => useRelationLinks(["a"]));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setTargets("a", "rel", ["x", "y"]));
    expect(result.current.getTargets("a", "rel")).toEqual(["x", "y"]);
  });

  it("recarrega após uma invalidação", async () => {
    fetchLinks.mockResolvedValueOnce([link("a", "t1")]);
    const { result } = renderHook(() => useRelationLinks(["a"]));
    await waitFor(() =>
      expect(result.current.getTargets("a", "rel")).toEqual(["t1"]),
    );

    fetchLinks.mockResolvedValueOnce([link("a", "t9")]);
    act(() => invalidateRelationLinks(["a"]));
    await waitFor(() =>
      expect(result.current.getTargets("a", "rel")).toEqual(["t9"]),
    );
  });

  it("descarta a resposta de uma requisição antiga", async () => {
    let resolveFirst: (links: RelationLink[]) => void = () => {};
    fetchLinks.mockReturnValueOnce(
      new Promise<RelationLink[]>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    fetchLinks.mockResolvedValueOnce([link("z", "t")]);

    const { result, rerender } = renderHook(
      ({ ids }) => useRelationLinks(ids),
      { initialProps: { ids: ["a"] } },
    );
    rerender({ ids: ["z"] });

    await waitFor(() =>
      expect(result.current.getTargets("z", "rel")).toEqual(["t"]),
    );

    await act(async () => {
      resolveFirst([link("a", "told")]);
    });
    // A resposta atrasada não popula o cache.
    expect(result.current.getTargets("a", "rel")).toEqual([]);
  });
});
