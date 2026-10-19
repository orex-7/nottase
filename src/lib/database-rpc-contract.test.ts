import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Não há Supabase local nem testes Postgres no repo, então as RPCs são
 * validadas manualmente no SQL Editor. Este teste é um **guarda de contrato**
 * estático: garante que toda RPC chamada pelo cliente existe no schema e que os
 * nomes de parâmetros enviados batem com os declarados no SQL.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function read(relative: string): string {
  return readFileSync(resolve(root, relative), "utf8");
}

/** Nomes das RPCs de relação/rollup que precisam existir na migration nova. */
const RELATION_ROLLUP_RPCS = [
  "relation_property_create",
  "relation_property_set_limit",
  "relation_property_delete",
  "relation_link_add",
  "relation_link_remove",
  "relation_links_for_rows",
  "rollup_values_for_rows",
  "relation_cleanup_for_database",
];

/** Extrai `(nome, chaves de parâmetro)` de cada `supabase.rpc(...)` do cliente. */
function extractClientRpcs(source: string): { name: string; params: string[] }[] {
  const out: { name: string; params: string[] }[] = [];
  const re = /\.rpc\(\s*"([^"]+)"\s*,\s*\{([^}]*)\}/g;
  for (const match of source.matchAll(re)) {
    const params = [...match[2].matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
    out.push({ name: match[1], params });
  }
  return out;
}

describe("contrato das RPCs (cliente ↔ SQL)", () => {
  const client = read("src/lib/database.ts");
  const schema = read("supabase/schema.sql");
  const migration = read("supabase/migrations/20261018000000_relation_links.sql");

  const calls = extractClientRpcs(client);

  it("encontra chamadas de RPC no cliente", () => {
    expect(calls.length).toBeGreaterThan(0);
  });

  it.each([...new Set(calls.map((c) => c.name))])(
    "define public.%s(...) no schema.sql",
    (name) => {
      expect(schema).toContain(`function public.${name}(`);
    },
  );

  it("usa nomes de parâmetros que existem no SQL", () => {
    const missing: string[] = [];
    for (const call of calls) {
      for (const param of call.params) {
        // O parâmetro do cliente (`p_x`) precisa existir no schema.
        if (!schema.includes(param)) missing.push(`${call.name}: ${param}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("define as RPCs de relação/rollup na migration", () => {
    for (const name of RELATION_ROLLUP_RPCS) {
      expect(migration).toContain(`function public.${name}(`);
    }
  });

  it("mantém `$$` balanceado na migration e no schema", () => {
    for (const sql of [migration, schema]) {
      const count = (sql.match(/\$\$/g) ?? []).length;
      expect(count % 2).toBe(0);
    }
  });

  it("mantém a assinatura de database_rows_page (parâmetros) no schema", () => {
    for (const param of [
      "p_database_id",
      "p_limit",
      "p_cursor_position",
      "p_cursor_id",
      "p_search",
      "p_filters",
    ]) {
      expect(schema).toContain(param);
    }
    // Os operadores de relação do filtro precisam estar no servidor.
    for (const op of [
      "relation_is",
      "relation_is_not",
      "relation_is_empty",
      "relation_is_not_empty",
    ]) {
      expect(schema).toContain(op);
    }
  });
});
