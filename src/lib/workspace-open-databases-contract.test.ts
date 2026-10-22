import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Não há Supabase local nem testes Postgres no repo, então a tabela de navegação
 * é validada manualmente no SQL Editor. Este teste é um **guarda de contrato**
 * estático: garante que a migration nova e o `schema.sql` consolidado declaram a
 * mesma tabela/políticas e que o cliente usa os nomes certos.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function read(relative: string): string {
  return readFileSync(resolve(root, relative), "utf8");
}

const TABLE = "public.workspace_open_databases";
const MIGRATION =
  "supabase/migrations/20261022000000_workspace_open_databases.sql";

/** Políticas de RLS esperadas (dono único, por usuário). */
const POLICIES = [
  "Navegação é visível apenas pelo dono",
  "Usuário insere sua própria navegação",
  "Usuário atualiza sua própria navegação",
  "Usuário remove sua própria navegação",
];

describe("contrato da tabela workspace_open_databases", () => {
  const client = read("src/lib/database.ts");
  const schema = read("supabase/schema.sql");
  const migration = read(MIGRATION);

  it.each([
    ["schema.sql", schema],
    ["migration", migration],
  ])("declara a tabela e a RLS no %s", (_label, sql) => {
    expect(sql).toContain(`create table if not exists ${TABLE}`);
    expect(sql).toContain("database_ids jsonb");
    expect(sql).toContain("selected_id");
    expect(sql).toContain(`alter table ${TABLE} enable row level security`);
    for (const policy of POLICIES) {
      expect(sql).toContain(policy);
    }
  });

  it("o cliente usa a tabela e as colunas do contrato", () => {
    expect(client).toContain('.from("workspace_open_databases")');
    expect(client).toContain("database_ids: state.ids");
    expect(client).toContain("selected_id: state.selectedId");
  });
});
