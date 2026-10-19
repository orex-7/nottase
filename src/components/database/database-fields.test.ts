import { describe, expect, it } from "vitest";

import { relatedDatabaseFor } from "@/components/database/database-fields";
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
