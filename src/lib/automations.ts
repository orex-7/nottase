import { createClient } from "@/lib/supabase/client";
import type {
  AutomationAction,
  AutomationRule,
  AutomationTrigger,
} from "@shared/automation";

/**
 * Camada de dados das automações (regras "quando → então" por database).
 *
 * Mesmo padrão de `src/lib/database.ts`: acesso direto do navegador ao Supabase
 * com a chave anônima; o isolamento por usuário é garantido pela RLS. A fila de
 * execução (`automation_jobs`) é server-only e não é acessada por aqui.
 */

/** Linha de `database_automations` (snake_case). */
interface AutomationDbRow {
  id: string;
  database_id: string;
  name: string;
  enabled: boolean;
  position: number;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  last_run_at: string | null;
}

function rowToRule(row: AutomationDbRow): AutomationRule {
  return {
    id: row.id,
    databaseId: row.database_id,
    name: row.name,
    enabled: row.enabled,
    position: row.position,
    trigger: row.trigger,
    actions: row.actions ?? [],
    lastRunAt: row.last_run_at ?? null,
  };
}

/** Dados aceitos ao criar uma automação (nome/enabled têm padrão no banco). */
export interface AutomationInput {
  name?: string;
  enabled?: boolean;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
}

/** Campos alteráveis de uma automação existente. */
export interface AutomationPatch {
  name?: string;
  enabled?: boolean;
  trigger?: AutomationTrigger;
  actions?: AutomationAction[];
  position?: number;
}

/** Busca as automações de um database, já ordenadas por `position`. */
export async function fetchAutomations(
  databaseId: string,
): Promise<AutomationRule[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("database_automations")
    .select("*")
    .eq("database_id", databaseId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as AutomationDbRow[] | null) ?? []).map(rowToRule);
}

/** Cria uma automação na **última** posição e devolve a regra criada. */
export async function createAutomation(
  databaseId: string,
  input: AutomationInput,
): Promise<AutomationRule> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not-authenticated");

  const { data: current } = await supabase
    .from("database_automations")
    .select("position")
    .eq("database_id", databaseId);
  const position =
    ((current as { position: number }[] | null) ?? []).reduce(
      (max, a) => Math.max(max, a.position ?? 0),
      -1,
    ) + 1;

  const { data, error } = await supabase
    .from("database_automations")
    .insert({
      user_id: user.id,
      database_id: databaseId,
      name: input.name ?? "Nova automação",
      enabled: input.enabled ?? true,
      position,
      trigger: input.trigger,
      actions: input.actions,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToRule(data as AutomationDbRow);
}

/** Atualiza uma automação (nome, ativo, gatilho, ações ou posição). */
export async function updateAutomation(
  id: string,
  patch: AutomationPatch,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("database_automations")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

/** Remove uma automação. */
export async function deleteAutomation(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("database_automations")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/**
 * Persiste a nova **ordem** das automações: grava `position` = índice de cada id
 * recebido. As escritas rodam em paralelo (como em `reorderProjects`).
 */
export async function reorderAutomations(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const supabase = createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("database_automations").update({ position: index }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
