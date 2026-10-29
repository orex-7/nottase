"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createAutomation,
  deleteAutomation,
  fetchAutomations,
  updateAutomation,
} from "@/lib/automations";
import { cn } from "@/lib/utils";
import type { Column, PageTemplate } from "@/types/database";
import type {
  AutomationAction,
  AutomationRule,
  AutomationTrigger,
  CellValue,
  CreateRowAction,
  RowCondition,
  SetValueAction,
} from "@shared/automation";

/**
 * Painel de automações de um database, renderizado dentro do
 * `TableSettingsPopover` (sub-view "Automações").
 *
 * Difere dos demais painéis do popover: ele mesmo busca/persiste as regras
 * (`@/lib/automations`) em vez de receber callbacks do `DatabaseView`, porque as
 * automações são uma tabela própria, sem estado no `DatabaseView`.
 */

const SELECT_CLASS =
  "w-full rounded border bg-background px-2 py-1 text-sm outline-none";

/** Modelo rascunho editado no painel (antes de persistir). */
interface AutomationDraft {
  /** `null` = automação nova (ainda não salva). */
  id: string | null;
  name: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
}

interface AutomationsPanelProps {
  databaseId: string;
  databases: {
    id: string;
    name: string;
    columns: Column[];
    linkedDatabaseId?: string | null;
    templates?: PageTemplate[];
  }[];
  columns: Column[];
}

/* -------------------------------------------------------------------------- */
/* Helpers de valor/descrição                                                  */
/* -------------------------------------------------------------------------- */

/** Texto de uma célula (arrays viram o primeiro item, para edição simples). */
function asText(value: CellValue | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function columnName(columns: Column[], id: string | undefined): string {
  if (!id) return "coluna";
  return columns.find((c) => c.id === id)?.name ?? "coluna";
}

function optionLabel(
  columns: Column[],
  columnId: string | undefined,
  value: string | undefined,
): string {
  const column = columns.find((c) => c.id === columnId);
  return column?.options?.find((o) => o.id === value)?.label ?? value ?? "";
}

function describeTrigger(trigger: AutomationTrigger, columns: Column[]): string {
  if (trigger.kind === "row_created") {
    const conditions = (trigger.conditions ?? []).filter((c) => c.columnId);
    if (conditions.length === 0) return "Quando uma linha é criada";
    const parts = conditions
      .map(
        (c) =>
          `${columnName(columns, c.columnId)} = ${
            optionLabel(columns, c.columnId, c.value) || "…"
          }`,
      )
      .join(", ");
    return `Quando uma linha é criada (${parts})`;
  }
  if (trigger.kind === "date_arrived") {
    return `Quando a data de "${columnName(columns, trigger.columnId)}" chega`;
  }
  const name = `"${columnName(columns, trigger.columnId)}"`;
  if (trigger.condition === "to") {
    return `Quando ${name} vira "${optionLabel(columns, trigger.columnId, trigger.value)}"`;
  }
  if (trigger.condition === "filled") return `Quando ${name} fica preenchida`;
  if (trigger.condition === "empty") return `Quando ${name} fica vazia`;
  return `Quando ${name} muda`;
}

function describeActions(
  actions: AutomationAction[],
  columns: Column[],
  databases: AutomationsPanelProps["databases"],
): string {
  if (actions.length === 0) return "Sem ações";
  return actions
    .map((action) => {
      if (action.kind === "set_value") {
        const column = columns.find((c) => c.id === action.columnId);
        const value =
          action.valueFrom === "today"
            ? "hoje"
            : column?.type === "date"
              ? asText(action.value) || "…"
              : optionLabel(columns, action.columnId, asText(action.value)) || "…";
        return `Preencher "${column?.name ?? "coluna"}" = ${value}`;
      }
      const target = databases.find((d) => d.id === action.databaseId);
      return `Criar linha em "${target?.name ?? "este database"}"`;
    })
    .join("; ");
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("pt-BR");
}

/** Ações padrão conforme o tipo escolhido (com um alvo válido já selecionado). */
function defaultAction(
  kind: AutomationAction["kind"],
  columns: Column[],
  databaseId: string,
): AutomationAction {
  if (kind === "create_row") {
    return { kind: "create_row", databaseId, templateId: null, values: {} };
  }
  return { kind: "set_value", columnId: columns[0]?.id ?? "", value: "" };
}

function defaultTrigger(
  kind: AutomationTrigger["kind"],
  columns: Column[],
): AutomationTrigger {
  if (kind === "column_changed") {
    return { kind: "column_changed", columnId: columns[0]?.id ?? "", condition: "any" };
  }
  if (kind === "date_arrived") {
    const dateColumn = columns.find((c) => c.type === "date");
    return { kind: "date_arrived", columnId: dateColumn?.id ?? "" };
  }
  return { kind: "row_created" };
}

/* -------------------------------------------------------------------------- */
/* Editor de valor                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Editor do valor de uma ação "preencher": oferece opções para select/status,
 * caixa para checkbox e, para datas, um atalho "Hoje" (resolve no worker).
 */
function ValueEditor({
  column,
  value,
  valueFrom,
  onChange,
  ariaLabel,
}: {
  column: Column | undefined;
  value: string;
  valueFrom?: "today";
  onChange: (next: { value: string; valueFrom?: "today" }) => void;
  ariaLabel: string;
}) {
  if (column?.type === "date") {
    const useToday = valueFrom === "today";
    return (
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={useToday}
            aria-label={`${ariaLabel}: usar a data de hoje`}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? { value: "", valueFrom: "today" }
                  : { value: "", valueFrom: undefined },
              )
            }
          />
          Hoje
        </label>
        {useToday ? null : (
          <Input
            type="date"
            value={value}
            onChange={(e) => onChange({ value: e.target.value })}
            aria-label={ariaLabel}
          />
        )}
      </div>
    );
  }

  if (column?.type === "checkbox") {
    return (
      <select
        value={value}
        onChange={(e) => onChange({ value: e.target.value })}
        aria-label={ariaLabel}
        className={SELECT_CLASS}
      >
        <option value="">Escolha…</option>
        <option value="true">Marcado</option>
        <option value="false">Desmarcado</option>
      </select>
    );
  }

  if (
    column &&
    (column.type === "select" ||
      column.type === "status" ||
      column.type === "multi_select")
  ) {
    const options = column.options ?? [];
    // Texto livre aqui nunca casaria com um id de opção (a célula guarda o id) —
    // por isso exigimos escolher uma opção existente em vez de digitar.
    if (options.length === 0) {
      return (
        <p className="text-xs text-muted-foreground">
          Esta propriedade não tem opções. Cadastre opções nela para usá-la aqui.
        </p>
      );
    }
    return (
      <select
        value={value}
        onChange={(e) => onChange({ value: e.target.value })}
        aria-label={ariaLabel}
        className={SELECT_CLASS}
      >
        <option value="">Escolha…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Input
      value={value}
      onChange={(e) => onChange({ value: e.target.value })}
      aria-label={ariaLabel}
      placeholder="Valor"
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Painel                                                                      */
/* -------------------------------------------------------------------------- */

export function AutomationsPanel({
  databaseId,
  databases,
  columns,
}: AutomationsPanelProps) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AutomationDraft | null>(null);

  const columnById = useMemo(
    () => new Map(columns.map((c) => [c.id, c])),
    [columns],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRules(await fetchAutomations(databaseId));
    } catch {
      setError("Não foi possível carregar as automações.");
    } finally {
      setLoading(false);
    }
  }, [databaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(rule: AutomationRule) {
    const next = !rule.enabled;
    setError(null);
    setRules((cur) =>
      cur.map((r) => (r.id === rule.id ? { ...r, enabled: next } : r)),
    );
    try {
      await updateAutomation(rule.id, { enabled: next });
    } catch {
      // Reverte o otimismo para não mentir o estado na tela.
      setRules((cur) =>
        cur.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)),
      );
      setError("Não foi possível atualizar a automação.");
    }
  }

  async function remove(rule: AutomationRule) {
    setError(null);
    try {
      await deleteAutomation(rule.id);
      setRules((cur) => cur.filter((r) => r.id !== rule.id));
    } catch {
      setError("Não foi possível excluir a automação.");
    }
  }

  function startNew() {
    setError(null);
    setDraft({
      id: null,
      name: "Nova automação",
      trigger: { kind: "row_created" },
      actions: [defaultAction("set_value", columns, databaseId)],
    });
  }

  function startEdit(rule: AutomationRule) {
    setError(null);
    setDraft({
      id: rule.id,
      name: rule.name,
      trigger: rule.trigger,
      actions: rule.actions,
    });
  }

  /** Atualiza as condições opcionais do gatilho "linha criada". */
  function patchRowConditions(
    updater: (conditions: RowCondition[]) => RowCondition[],
  ) {
    setDraft((cur) => {
      if (!cur || cur.trigger.kind !== "row_created") return cur;
      return {
        ...cur,
        trigger: {
          kind: "row_created",
          conditions: updater(cur.trigger.conditions ?? []),
        },
      };
    });
  }

  function patchSetValue(index: number, patch: Partial<SetValueAction>) {
    setDraft((cur) => {
      if (!cur) return cur;
      return {
        ...cur,
        actions: cur.actions.map((action, i) =>
          i === index && action.kind === "set_value"
            ? { ...action, ...patch }
            : action,
        ),
      };
    });
  }

  function patchCreateRow(index: number, patch: Partial<CreateRowAction>) {
    setDraft((cur) => {
      if (!cur) return cur;
      return {
        ...cur,
        actions: cur.actions.map((action, i) =>
          i === index && action.kind === "create_row"
            ? { ...action, ...patch }
            : action,
        ),
      };
    });
  }

  function changeActionKind(index: number, kind: AutomationAction["kind"]) {
    setDraft((cur) =>
      cur
        ? {
            ...cur,
            actions: cur.actions.map((action, i) =>
              i === index ? defaultAction(kind, columns, databaseId) : action,
            ),
          }
        : cur,
    );
  }

  function removeAction(index: number) {
    setDraft((cur) =>
      cur
        ? { ...cur, actions: cur.actions.filter((_, i) => i !== index) }
        : cur,
    );
  }

  async function save() {
    if (!draft) return;
    const name = draft.name.trim() || "Nova automação";
    // Multi-select precisa de lista; o editor guarda um único id.
    const actions: AutomationAction[] = draft.actions.map((action) => {
      if (action.kind !== "set_value") return action;
      const column = columnById.get(action.columnId);
      if (column?.type === "multi_select" && typeof action.value === "string" && action.value) {
        return { ...action, value: [action.value] };
      }
      return action;
    });

    setError(null);
    try {
      if (draft.id) {
        await updateAutomation(draft.id, { name, trigger: draft.trigger, actions });
        setRules((cur) =>
          cur.map((r) =>
            r.id === draft.id ? { ...r, name, trigger: draft.trigger, actions } : r,
          ),
        );
      } else {
        const created = await createAutomation(databaseId, {
          name,
          trigger: draft.trigger,
          actions,
        });
        setRules((cur) => [...cur, created]);
      }
      setDraft(null);
    } catch {
      setError("Não foi possível salvar a automação.");
    }
  }

  /* ------------------------------ Editor ------------------------------ */

  if (draft) {
    const triggerColumn =
      draft.trigger.kind === "row_created"
        ? undefined
        : columnById.get(draft.trigger.columnId);
    const dateColumns = columns.filter((c) => c.type === "date");
    const createTargets = databases.filter((d) => !d.linkedDatabaseId);

    return (
      <div className="space-y-3">
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Nome
          </label>
          <Input
            value={draft.name}
            onChange={(e) =>
              setDraft((cur) => (cur ? { ...cur, name: e.target.value } : cur))
            }
            aria-label="Nome da automação"
            placeholder="Nome da automação"
          />
        </div>

        {/* Gatilho */}
        <div className="space-y-1.5 rounded border bg-muted/30 p-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Quando
          </span>
          <select
            value={draft.trigger.kind}
            aria-label="Tipo de gatilho"
            className={SELECT_CLASS}
            onChange={(e) =>
              setDraft((cur) =>
                cur
                  ? {
                      ...cur,
                      trigger: defaultTrigger(
                        e.target.value as AutomationTrigger["kind"],
                        columns,
                      ),
                    }
                  : cur,
              )
            }
          >
            <option value="row_created">Linha criada</option>
            <option value="column_changed">Coluna mudou</option>
            <option value="date_arrived">Data chegou</option>
          </select>

          {draft.trigger.kind === "row_created" ? (
            <div className="space-y-1.5 rounded border bg-background p-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Somente se (opcional)
              </span>
              {(draft.trigger.conditions ?? []).map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={condition.columnId}
                    aria-label={`Coluna da condição ${index + 1}`}
                    className={SELECT_CLASS}
                    onChange={(e) =>
                      patchRowConditions((cs) =>
                        cs.map((c, i) =>
                          i === index
                            ? { columnId: e.target.value, value: "" }
                            : c,
                        ),
                      )
                    }
                  >
                    <option value="">Escolha uma coluna…</option>
                    {columns.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                  <ValueEditor
                    column={columnById.get(condition.columnId)}
                    value={condition.value}
                    ariaLabel={`Valor da condição ${index + 1}`}
                    onChange={({ value }) =>
                      patchRowConditions((cs) =>
                        cs.map((c, i) => (i === index ? { ...c, value } : c)),
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      patchRowConditions((cs) =>
                        cs.filter((_, i) => i !== index),
                      )
                    }
                    aria-label={`Excluir condição ${index + 1}`}
                    title="Excluir condição"
                    className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  patchRowConditions((cs) => [
                    ...cs,
                    { columnId: columns[0]?.id ?? "", value: "" },
                  ])
                }
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar condição
              </button>
            </div>
          ) : null}

          {draft.trigger.kind === "column_changed" ? (
            <>
              <select
                value={draft.trigger.columnId}
                aria-label="Coluna do gatilho"
                className={SELECT_CLASS}
                onChange={(e) =>
                  setDraft((cur) =>
                    cur && cur.trigger.kind === "column_changed"
                      ? {
                          ...cur,
                          trigger: { ...cur.trigger, columnId: e.target.value },
                        }
                      : cur,
                  )
                }
              >
                <option value="">Escolha uma coluna…</option>
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
              <select
                value={draft.trigger.condition}
                aria-label="Condição"
                className={SELECT_CLASS}
                onChange={(e) =>
                  setDraft((cur) =>
                    cur && cur.trigger.kind === "column_changed"
                      ? {
                          ...cur,
                          trigger: {
                            ...cur.trigger,
                            condition: e.target.value as
                              | "to"
                              | "filled"
                              | "empty"
                              | "any",
                          },
                        }
                      : cur,
                  )
                }
              >
                <option value="any">Muda qualquer coisa</option>
                <option value="to">Vira o valor…</option>
                <option value="filled">Fica preenchida</option>
                <option value="empty">Fica vazia</option>
              </select>
              {draft.trigger.condition === "to" ? (
                <ValueEditor
                  column={triggerColumn}
                  value={draft.trigger.value ?? ""}
                  ariaLabel="Valor do gatilho"
                  onChange={({ value }) =>
                    setDraft((cur) =>
                      cur && cur.trigger.kind === "column_changed"
                        ? { ...cur, trigger: { ...cur.trigger, value } }
                        : cur,
                    )
                  }
                />
              ) : null}
            </>
          ) : null}

          {draft.trigger.kind === "date_arrived" ? (
            <select
              value={draft.trigger.columnId}
              aria-label="Coluna de data"
              className={SELECT_CLASS}
              onChange={(e) =>
                setDraft((cur) =>
                  cur && cur.trigger.kind === "date_arrived"
                    ? { ...cur, trigger: { ...cur.trigger, columnId: e.target.value } }
                    : cur,
                )
              }
            >
              <option value="">Escolha uma coluna de data…</option>
              {dateColumns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {/* Ações */}
        <div className="space-y-2 rounded border bg-muted/30 p-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Então
          </span>
          {draft.actions.map((action, index) => (
            <div key={index} className="space-y-1.5 rounded border bg-background p-2">
              <div className="flex items-center gap-2">
                <select
                  value={action.kind}
                  aria-label={`Tipo da ação ${index + 1}`}
                  className={SELECT_CLASS}
                  onChange={(e) =>
                    changeActionKind(
                      index,
                      e.target.value as AutomationAction["kind"],
                    )
                  }
                >
                  <option value="set_value">Preencher valor</option>
                  <option value="create_row">Criar linha</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeAction(index)}
                  aria-label={`Excluir ação ${index + 1}`}
                  title="Excluir ação"
                  className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {action.kind === "set_value" ? (
                <>
                  <select
                    value={action.columnId}
                    aria-label={`Coluna da ação ${index + 1}`}
                    className={SELECT_CLASS}
                    onChange={(e) =>
                      patchSetValue(index, { columnId: e.target.value, value: "" })
                    }
                  >
                    <option value="">Escolha uma coluna…</option>
                    {columns.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                  <ValueEditor
                    column={columnById.get(action.columnId)}
                    value={asText(action.value)}
                    valueFrom={action.valueFrom}
                    ariaLabel={`Valor da ação ${index + 1}`}
                    onChange={({ value, valueFrom }) =>
                      patchSetValue(index, { value, valueFrom })
                    }
                  />
                </>
              ) : (
                <>
                  <select
                    value={action.databaseId ?? databaseId}
                    aria-label={`Database de destino ${index + 1}`}
                    className={SELECT_CLASS}
                    onChange={(e) =>
                      patchCreateRow(index, {
                        databaseId: e.target.value,
                        templateId: null,
                      })
                    }
                  >
                    {createTargets.map((db) => (
                      <option key={db.id} value={db.id}>
                        {db.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={action.templateId ?? ""}
                    aria-label={`Modelo ${index + 1}`}
                    className={SELECT_CLASS}
                    onChange={(e) =>
                      patchCreateRow(index, { templateId: e.target.value || null })
                    }
                  >
                    <option value="">Sem modelo</option>
                    {(
                      databases.find(
                        (d) => d.id === (action.databaseId ?? databaseId),
                      )?.templates ?? []
                    ).map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setDraft((cur) =>
                cur
                  ? {
                      ...cur,
                      actions: [
                        ...cur.actions,
                        defaultAction("set_value", columns, databaseId),
                      ],
                    }
                  : cur,
              )
            }
            className="flex w-full items-center gap-2 rounded px-1 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar ação
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void save()}>
            Salvar
          </Button>
        </div>
      </div>
    );
  }

  /* ------------------------------ Lista ------------------------------ */

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Regras
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={startNew}
        >
          <Plus className="h-3.5 w-3.5" />
          Nova automação
        </Button>
      </div>

      {loading ? (
        <p className="px-1 py-1 text-xs text-muted-foreground">Carregando…</p>
      ) : rules.length === 0 ? (
        <p className="px-1 py-1 text-xs text-muted-foreground">
          Nenhuma automação ainda.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="rounded border bg-background px-2 py-1.5"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggle(rule)}
                  aria-pressed={rule.enabled}
                  aria-label={`${rule.enabled ? "Desativar" : "Ativar"} automação ${rule.name}`}
                  title={rule.enabled ? "Desativar" : "Ativar"}
                  className={cn(
                    "flex h-[30px] w-[30px] flex-none items-center justify-center rounded hover:bg-accent",
                    rule.enabled ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {rule.enabled ? (
                    <ToggleRight className="h-4 w-4" />
                  ) : (
                    <ToggleLeft className="h-4 w-4" />
                  )}
                </button>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {rule.name}
                </span>
                <button
                  type="button"
                  onClick={() => startEdit(rule)}
                  aria-label={`Editar automação ${rule.name}`}
                  title="Editar automação"
                  className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(rule)}
                  aria-label={`Excluir automação ${rule.name}`}
                  title="Excluir automação"
                  className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {describeTrigger(rule.trigger, columns)} →{" "}
                {describeActions(rule.actions, columns, databases)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {rule.lastRunAt
                  ? `Última execução: ${formatDateTime(rule.lastRunAt)}`
                  : "Nunca executada"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
