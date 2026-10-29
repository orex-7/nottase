import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Não há Supabase local nem testes Postgres no repo, então as tabelas/triggers
 * das automações são validados manualmente no SQL Editor. Este teste é um
 * **guarda de contrato** estático: garante que a migration nova e o `schema.sql`
 * consolidado declaram as mesmas tabelas/políticas/funções, que o cliente usa os
 * nomes certos e que os literais de `kind` do SQL batem com o motor compartilhado
 * (`supabase/functions/_shared/automation.ts`).
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function read(relative: string): string {
  return readFileSync(resolve(root, relative), "utf8");
}

const MIGRATION = "supabase/migrations/20261023000000_database_automations.sql";
const AUTOMATIONS_TABLE = "public.database_automations";
const JOBS_TABLE = "public.automation_jobs";

/** Políticas de RLS esperadas (dono único, por usuário). */
const POLICIES = [
  "Automações são visíveis apenas pelo dono",
  "Usuário insere suas próprias automações",
  "Usuário atualiza suas próprias automações",
  "Usuário remove suas próprias automações",
];

/** Literais de `kind` compartilhados entre SQL e o motor em TS. */
const KINDS = ["row_created", "row_updated", "date_arrived"];

describe("contrato das automações (tabelas/triggers/RPC)", () => {
  const client = read("src/lib/automations.ts");
  const shared = read("supabase/functions/_shared/automation.ts");
  const schema = read("supabase/schema.sql");
  const migration = read(MIGRATION);

  it.each([
    ["schema.sql", schema],
    ["migration", migration],
  ])("declara as duas tabelas e a RLS no %s", (_label, sql) => {
    expect(sql).toContain(`create table if not exists ${AUTOMATIONS_TABLE}`);
    expect(sql).toContain(`create table if not exists ${JOBS_TABLE}`);
    expect(sql).toContain("unique (database_id, row_id, trigger_key)");
    expect(sql).toContain(
      `alter table ${AUTOMATIONS_TABLE} enable row level security`,
    );
    expect(sql).toContain(`alter table ${JOBS_TABLE} enable row level security`);
    for (const policy of POLICIES) {
      expect(sql).toContain(policy);
    }
  });

  it.each([
    ["schema.sql", schema],
    ["migration", migration],
  ])("declara o enfileiramento, o claim e a varredura por data no %s", (_label, sql) => {
    expect(sql).toContain("function public.enqueue_automation_jobs(");
    expect(sql).toContain("function public.automation_claim_jobs(");
    expect(sql).toContain("function public.enqueue_date_automations(");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain(
      "after insert or update on public.database_rows",
    );
  });

  it("o cliente usa a tabela do contrato", () => {
    expect(client).toContain('.from("database_automations")');
  });

  it("os literais de `kind` do SQL batem com o motor compartilhado", () => {
    for (const kind of KINDS) {
      expect(shared).toContain(kind);
      expect(migration).toContain(`'${kind}'`);
      expect(schema).toContain(`'${kind}'`);
    }
  });

  it("mantém `$$` balanceado na migration e no schema", () => {
    for (const sql of [migration, schema]) {
      const count = (sql.match(/\$\$/g) ?? []).length;
      expect(count % 2).toBe(0);
    }
  });
});
