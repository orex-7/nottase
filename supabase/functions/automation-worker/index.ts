/**
 * Worker das automações (Edge Function / Deno).
 *
 * Consome a fila `automation_jobs` (claim via RPC `automation_claim_jobs`),
 * casa as regras do database em TS e aplica as escritas. É agendado pelo
 * `pg_cron` via `pg_net` — NÃO é chamado pelo app.
 *
 * Autenticação: header de segredo `x-automation-secret` (comparado com a env
 * `AUTOMATION_WORKER_SECRET`). O `verify_jwt` fica `false` em `config.toml`.
 *
 * Este arquivo é **excluído do `tsc`** (importa `jsr:`/`npm:`, incompatível com o
 * bundler do Next). O motor puro compartilhado vive em `../_shared/automation.ts`.
 *
 * Pré-requisitos, secrets e o agendamento dos crons: ver README.md desta pasta.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

import {
  depthExceeded,
  matchRule,
  planActions,
  templateRowValues,
  type AutomationAction,
  type AutomationEvent,
  type AutomationRow,
  type AutomationRule,
  type CellValue,
  type ColumnLike,
  type PlannedWrite,
} from "../_shared/automation.ts";

/* -------------------------------------------------------------------------- */
/* Configuração                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Fuso usado para resolver `valueFrom: "today"` e a data dos itens criados.
 * Ajuste por deployment (o cron usa o mesmo fuso na janela de `date_arrived`).
 */
const APP_TIMEZONE = "America/Sao_Paulo";

/** Teto de jobs processados por invocação (limita o custo por execução). */
const MAX_JOBS = 25;

/** Tentativas antes de marcar o job como `failed`. */
const MAX_ATTEMPTS = 3;

/** Base do backoff entre tentativas (ms). */
const BACKOFF_BASE_MS = 30_000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WORKER_SECRET = Deno.env.get("AUTOMATION_WORKER_SECRET") ?? "";

/* -------------------------------------------------------------------------- */
/* Tipos das linhas do banco                                                   */
/* -------------------------------------------------------------------------- */

/** Um job da fila, como devolvido por `automation_claim_jobs`. */
interface AutomationJob {
  id: string;
  user_id: string;
  database_id: string;
  row_id: string | null;
  event: AutomationEvent;
  depth: number;
  attempts: number;
}

/** Uma regra como vem de `database_automations` (snake_case). */
interface AutomationRuleDbRow {
  id: string;
  database_id: string;
  name: string;
  enabled: boolean;
  position: number;
  trigger: AutomationRule["trigger"];
  actions: AutomationAction[];
  last_run_at: string | null;
}

function toRule(row: AutomationRuleDbRow): AutomationRule {
  return {
    id: row.id,
    databaseId: row.database_id,
    name: row.name,
    enabled: row.enabled,
    position: row.position,
    trigger: row.trigger,
    actions: row.actions ?? [],
    lastRunAt: row.last_run_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

/** Data "hoje" (`YYYY-MM-DD`) no fuso informado (o worker não tem fuso local). */
function todayISO(timeZone: string): string {
  // `en-CA` formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/* -------------------------------------------------------------------------- */
/* Servidor                                                                    */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  const provided = req.headers.get("x-automation-secret") ?? "";
  if (!WORKER_SECRET || provided !== WORKER_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "missing-supabase-env" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const today = todayISO(APP_TIMEZONE);

  let processed = 0;
  for (let i = 0; i < MAX_JOBS; i += 1) {
    const { data, error } = await supabase.rpc("automation_claim_jobs", {
      p_limit: 1,
    });
    if (error) {
      console.error("automation_claim_jobs falhou:", error.message);
      return json({ error: "claim-failed", processed }, 500);
    }
    const job = ((data as AutomationJob[] | null) ?? [])[0];
    if (!job) break;
    await processJob(supabase, job, today);
    processed += 1;
  }

  return json({ processed }, 200);
});

/* -------------------------------------------------------------------------- */
/* Processamento de um job                                                     */
/* -------------------------------------------------------------------------- */

async function processJob(
  supabase: SupabaseClient,
  job: AutomationJob,
  today: string,
): Promise<void> {
  try {
    if (depthExceeded(job.depth)) {
      await finishJob(supabase, job.id, {
        status: "skipped",
        last_error: "profundidade máxima de encadeamento atingida",
      });
      return;
    }
    if (!job.row_id) {
      await finishJob(supabase, job.id, {
        status: "skipped",
        last_error: "job sem linha",
      });
      return;
    }

    const { data: rowData, error: rowError } = await supabase
      .from("database_rows")
      .select("id, database_id, values")
      .eq("id", job.row_id)
      .maybeSingle();
    if (rowError) throw rowError;
    if (!rowData) {
      await finishJob(supabase, job.id, {
        status: "skipped",
        last_error: "linha removida",
      });
      return;
    }
    const row: AutomationRow = {
      id: (rowData as { id: string }).id,
      databaseId: (rowData as { database_id: string }).database_id,
      values: (rowData as { values: Record<string, CellValue> }).values ?? {},
    };

    const { data: rulesData, error: rulesError } = await supabase
      .from("database_automations")
      .select("*")
      .eq("database_id", job.database_id)
      .eq("enabled", true)
      .order("position", { ascending: true });
    if (rulesError) throw rulesError;
    const rules = ((rulesData as AutomationRuleDbRow[] | null) ?? []).map(toRule);

    // Cliente dedicado às escritas deste job: propaga a profundidade do
    // encadeamento pelo header, que o trigger lê do GUC `request.headers`.
    const writeClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false },
        global: { headers: { "x-automation-depth": String(job.depth + 1) } },
      },
    );

    const triggered: string[] = [];
    for (const rule of rules) {
      if (!matchRule(rule, job.event, row)) continue;
      const writes = planActions(rule, row, { todayISO: today });
      if (writes.length === 0) continue;
      for (const write of writes) {
        if (write.kind === "set_value") {
          const { error } = await writeClient.rpc("database_row_set_cell", {
            p_row_id: write.rowId,
            p_column_id: write.columnId,
            p_value: write.value,
          });
          if (error) throw error;
        } else {
          await createRow(supabase, writeClient, job, write, today);
        }
      }
      triggered.push(rule.id);
    }

    if (triggered.length > 0) {
      const { error } = await supabase
        .from("database_automations")
        .update({ last_run_at: new Date().toISOString() })
        .in("id", triggered);
      if (error) throw error;
    }

    await finishJob(supabase, job.id, { status: "done", last_error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`job ${job.id} falhou:`, message);
    if (job.attempts >= MAX_ATTEMPTS) {
      await finishJob(supabase, job.id, { status: "failed", last_error: message });
    } else {
      await finishJob(supabase, job.id, {
        status: "pending",
        last_error: message,
        run_after: new Date(
          Date.now() + job.attempts * BACKOFF_BASE_MS,
        ).toISOString(),
      });
    }
  }
}

/**
 * Cria a linha pedida por uma ação `create_row`. Quando há modelo, monta os
 * valores com `templateRowValues` (nome/conteúdo/data/horário, como a geração
 * por recorrência) e aplica por cima os valores explícitos da ação.
 */
async function createRow(
  supabase: SupabaseClient,
  writeClient: SupabaseClient,
  job: AutomationJob,
  write: Extract<PlannedWrite, { kind: "create_row" }>,
  today: string,
): Promise<void> {
  let values: Record<string, CellValue> = { ...write.values };

  if (write.templateId) {
    const { data: template, error: templateError } = await supabase
      .from("database_templates")
      .select("name, content, recurrence")
      .eq("id", write.templateId)
      .maybeSingle();
    if (templateError) throw templateError;

    if (template) {
      const { data: targetDb, error: dbError } = await supabase
        .from("databases")
        .select("columns")
        .eq("id", write.databaseId)
        .maybeSingle();
      if (dbError) throw dbError;

      const columns =
        (targetDb as { columns: ColumnLike[] } | null)?.columns ?? [];
      const recurrence = (
        template as { recurrence: { time?: string | null } | null }
      ).recurrence;

      const templateValues = templateRowValues(
        {
          name: (template as { name: string }).name,
          content: (template as { content: string }).content,
          time: recurrence?.time ?? null,
        },
        columns,
        today,
      );
      values = { ...templateValues, ...values };
    }
  }

  const { data: position, error: positionError } = await supabase.rpc(
    "database_next_row_position",
    { p_database_id: write.databaseId },
  );
  if (positionError) throw positionError;

  const { error: insertError } = await writeClient.from("database_rows").insert({
    database_id: write.databaseId,
    user_id: job.user_id,
    values,
    position: typeof position === "number" ? position : Number(position ?? 0),
  });
  if (insertError) throw insertError;
}

/** Fecha o job gravando o status (e, opcionalmente, erro/agendamento). */
async function finishJob(
  supabase: SupabaseClient,
  id: string,
  patch: {
    status: "done" | "failed" | "skipped" | "pending";
    last_error?: string | null;
    run_after?: string;
  },
): Promise<void> {
  const { error } = await supabase
    .from("automation_jobs")
    .update(patch)
    .eq("id", id);
  if (error) console.error(`falha ao atualizar o job ${id}:`, error.message);
}
