import { describe, expect, it } from "vitest";

import { ICON_BY_NAME, ICON_OPTIONS, databaseIcon } from "@/lib/database-icons";

describe("ícones de database/propriedade", () => {
  it("oferece 100 opções, sem nomes repetidos", () => {
    expect(ICON_OPTIONS).toHaveLength(100);
    const names = ICON_OPTIONS.map((option) => option.name);
    // Nome repetido quebraria o `key` do seletor e o mapa nome → ícone.
    expect(new Set(names).size).toBe(names.length);
  });

  it("resolve um ícone pelo nome persistido", () => {
    const first = ICON_OPTIONS[0];
    expect(ICON_BY_NAME[first.name]).toBe(first.icon);
    expect(databaseIcon(first.name)).toBe(first.icon);
  });

  it("cai no ícone padrão quando o nome é desconhecido ou ausente", () => {
    const fallback = databaseIcon(null);
    expect(databaseIcon("IconeQueNaoExiste")).toBe(fallback);
    expect(databaseIcon(undefined)).toBe(fallback);
  });
});
