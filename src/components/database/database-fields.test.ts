import { describe, expect, it } from "vitest";

import {
  applyVisibleColumnOrder,
  linkHref,
  moveColumnTo,
  relatedDatabaseFor,
} from "@/components/database/database-fields";
import type { Column, Database } from "@/types/database";

function db(id: string, columns: Column[] = []): Database {
  return {
    id,
    name: id,
    icon: null,
    projectId: null,
    columns,
    rows: [],
    templates: [],
  };
}

/** Coluna de relação configurada apontando para `target`. */
function relation(target?: string): Column {
  return { id: "rel", name: "Projetos", type: "relation", relationDatabaseId: target };
}

describe("relatedDatabaseFor", () => {
  it("usa o destino da primeira coluna de relação deste database", () => {
    const b = db("b");
    const a = db("a", [relation("b")]);
    expect(relatedDatabaseFor("a", a.columns, [a, b])).toBe(b);
  });

  it("usa a origem quando outro database aponta para este (não bidirecional)", () => {
    const b = db("b");
    const a = db("a", [relation("b")]);
    expect(relatedDatabaseFor("b", b.columns, [a, b])).toBe(a);
  });

  it("devolve null quando não há relação envolvendo o database", () => {
    const a = db("a");
    const b = db("b");
    expect(relatedDatabaseFor("a", a.columns, [a, b])).toBeNull();
  });

  it("ignora coluna de relação sem destino escolhido", () => {
    const a = db("a", [relation()]);
    const b = db("b");
    expect(relatedDatabaseFor("a", a.columns, [a, b])).toBeNull();
  });

  it("não linka para o próprio database", () => {
    const a = db("a", [relation("a")]);
    expect(relatedDatabaseFor("a", a.columns, [a])).toBeNull();
  });

  it("devolve null quando o destino não está carregado", () => {
    const a = db("a", [relation("x")]);
    expect(relatedDatabaseFor("a", a.columns, [a])).toBeNull();
  });
});

describe("moveColumnTo", () => {
  /** Colunas de texto identificadas por letra (a, b, c...). */
  const cols = (...ids: string[]): Column[] =>
    ids.map((id) => ({ id, name: id.toUpperCase(), type: "text" }));

  const ids = (columns: Column[]) => columns.map((c) => c.id);

  it("move a coluna para antes do destino", () => {
    expect(ids(moveColumnTo(cols("a", "b", "c"), "c", "a"))).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(ids(moveColumnTo(cols("a", "b", "c"), "c", "b"))).toEqual([
      "a",
      "c",
      "b",
    ]);
    // Mover para antes do vizinho imediato anterior não muda a ordem.
    expect(ids(moveColumnTo(cols("a", "b", "c"), "a", "b"))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("move para o fim quando beforeId é null", () => {
    expect(ids(moveColumnTo(cols("a", "b", "c"), "a", null))).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("não muda nada quando arrastada e destino são a mesma coluna", () => {
    const columns = cols("a", "b", "c");
    expect(moveColumnTo(columns, "b", "b")).toBe(columns);
  });

  it("não muda nada quando a coluna arrastada não existe", () => {
    const columns = cols("a", "b");
    expect(moveColumnTo(columns, "z", "a")).toBe(columns);
  });

  it("vai para o fim quando o destino não existe", () => {
    expect(ids(moveColumnTo(cols("a", "b", "c"), "a", "z"))).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
});

describe("applyVisibleColumnOrder", () => {
  const cols = (...ids: string[]): Column[] =>
    ids.map((id) => ({ id, name: id.toUpperCase(), type: "text" }));
  const ids = (columns: Column[]) => columns.map((c) => c.id);

  it("aplica a ordem das visíveis mantendo as ocultas no lugar", () => {
    // 'b' está oculta entre 'a' e 'c': a ordem visível muda, 'b' fica na posição.
    const columns = cols("a", "b", "c", "d");
    const next = applyVisibleColumnOrder(
      columns,
      ["a", "c", "d"],
      ["d", "a", "c"],
    );
    expect(ids(next)).toEqual(["d", "b", "a", "c"]);
  });

  it("devolve o mesmo array quando a ordem não casa com as visíveis", () => {
    const columns = cols("a", "b");
    expect(applyVisibleColumnOrder(columns, ["a", "b"], ["a"])).toBe(columns);
  });

  it("não muda nada quando a ordem é a mesma", () => {
    const columns = cols("a", "b");
    expect(ids(applyVisibleColumnOrder(columns, ["a", "b"], ["a", "b"]))).toEqual(
      ["a", "b"],
    );
  });
});

describe("linkHref", () => {
  it("mantém endereços que já têm esquema", () => {
    expect(linkHref("https://exemplo.com")).toBe("https://exemplo.com");
    expect(linkHref("http://exemplo.com/a?b=1")).toBe(
      "http://exemplo.com/a?b=1",
    );
    expect(linkHref("mailto:alguem@exemplo.com")).toBe(
      "mailto:alguem@exemplo.com",
    );
  });

  it("assume https:// quando falta o esquema", () => {
    expect(linkHref("exemplo.com")).toBe("https://exemplo.com");
    expect(linkHref("  exemplo.com/pagina  ")).toBe(
      "https://exemplo.com/pagina",
    );
  });

  it("não transforma texto solto em link", () => {
    expect(linkHref("")).toBe("");
    expect(linkHref("   ")).toBe("");
    expect(linkHref("nota")).toBe("");
    expect(linkHref("duas palavras.com")).toBe("");
  });
});
