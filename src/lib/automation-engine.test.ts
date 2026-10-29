import { describe, expect, it } from "vitest";

import {
  MAX_AUTOMATION_DEPTH,
  PAGE_CONTENT_KEY,
  PAGE_TIME_KEY,
  depthExceeded,
  matchRule,
  planActions,
  templateRowValues,
  type AutomationEvent,
  type AutomationRule,
  type ColumnLike,
} from "@shared/automation";

/**
 * Motor de automações (puro, compartilhado com o worker). Não há como rodar o
 * worker/Edge Function nem o Postgres nos testes, então a lógica de casamento e
 * planejamento é coberta aqui.
 */

function makeRule(
  partial: Partial<AutomationRule> & Pick<AutomationRule, "trigger">,
): AutomationRule {
  return {
    id: "r1",
    databaseId: "db1",
    name: "Regra",
    enabled: true,
    position: 0,
    actions: [],
    ...partial,
  };
}

const ROW = { id: "row1", databaseId: "db1", values: { status: "a" } };

describe("matchRule", () => {
  it("casa row_created apenas com o evento de criação", () => {
    const rule = makeRule({ trigger: { kind: "row_created" } });
    expect(matchRule(rule, { kind: "row_created" }, ROW)).toBe(true);
    expect(matchRule(rule, { kind: "row_updated", changed: {} }, ROW)).toBe(false);
  });

  it("ignora regras desativadas", () => {
    const rule = makeRule({ trigger: { kind: "row_created" }, enabled: false });
    expect(matchRule(rule, { kind: "row_created" }, ROW)).toBe(false);
  });

  it("row_created sem condições casa qualquer linha criada", () => {
    const rule = makeRule({ trigger: { kind: "row_created" } });
    expect(matchRule(rule, { kind: "row_created" }, ROW)).toBe(true);
  });

  it("row_created aceita condições sobre os valores da linha", () => {
    const rule = makeRule({
      trigger: {
        kind: "row_created",
        conditions: [{ columnId: "prio", value: "alta" }],
      },
    });
    const alta = { id: "r", databaseId: "db1", values: { prio: "alta" } };
    const baixa = { id: "r", databaseId: "db1", values: { prio: "baixa" } };
    expect(matchRule(rule, { kind: "row_created" }, alta)).toBe(true);
    expect(matchRule(rule, { kind: "row_created" }, baixa)).toBe(false);
  });

  it("column_changed exige a coluna no diff", () => {
    const rule = makeRule({
      trigger: { kind: "column_changed", columnId: "status", condition: "any" },
    });
    const event: AutomationEvent = {
      kind: "row_updated",
      changed: { other: { from: "x", to: "y" } },
    };
    expect(matchRule(rule, event, ROW)).toBe(false);
  });

  it("column_changed com condition 'to' compara o valor novo", () => {
    const rule = makeRule({
      trigger: { kind: "column_changed", columnId: "status", condition: "to", value: "b" },
    });
    const hit: AutomationEvent = {
      kind: "row_updated",
      changed: { status: { from: "a", to: "b" } },
    };
    const miss: AutomationEvent = {
      kind: "row_updated",
      changed: { status: { from: "a", to: "c" } },
    };
    expect(matchRule(rule, hit, ROW)).toBe(true);
    expect(matchRule(rule, miss, ROW)).toBe(false);
  });

  it("column_changed com condition 'to' casa listas (multi-select)", () => {
    const rule = makeRule({
      trigger: { kind: "column_changed", columnId: "tags", condition: "to", value: "t2" },
    });
    const event: AutomationEvent = {
      kind: "row_updated",
      changed: { tags: { from: [], to: ["t1", "t2"] } },
    };
    expect(matchRule(rule, event, ROW)).toBe(true);
  });

  it("column_changed com 'filled' e 'empty' olha o valor novo", () => {
    const filled = makeRule({
      trigger: { kind: "column_changed", columnId: "status", condition: "filled" },
    });
    const empty = makeRule({
      trigger: { kind: "column_changed", columnId: "status", condition: "empty" },
    });
    const nowFilled: AutomationEvent = {
      kind: "row_updated",
      changed: { status: { from: "", to: "a" } },
    };
    const nowEmpty: AutomationEvent = {
      kind: "row_updated",
      changed: { status: { from: "a", to: "" } },
    };
    expect(matchRule(filled, nowFilled, ROW)).toBe(true);
    expect(matchRule(filled, nowEmpty, ROW)).toBe(false);
    expect(matchRule(empty, nowEmpty, ROW)).toBe(true);
    expect(matchRule(empty, nowFilled, ROW)).toBe(false);
  });

  it("date_arrived exige a mesma coluna e a data igual à da linha", () => {
    const rule = makeRule({
      trigger: { kind: "date_arrived", columnId: "due" },
    });
    const row = { id: "row1", databaseId: "db1", values: { due: "2026-10-26" } };
    expect(
      matchRule(rule, { kind: "date_arrived", columnId: "due", date: "2026-10-26" }, row),
    ).toBe(true);
    expect(
      matchRule(rule, { kind: "date_arrived", columnId: "due", date: "2026-10-25" }, row),
    ).toBe(false);
    expect(
      matchRule(rule, { kind: "date_arrived", columnId: "outra", date: "2026-10-26" }, row),
    ).toBe(false);
  });
});

describe("planActions", () => {
  const ctx = { todayISO: "2026-10-26" };

  it("resolve valueFrom 'today' e mantém o valor literal", () => {
    const rule = makeRule({
      trigger: { kind: "row_created" },
      actions: [
        { kind: "set_value", columnId: "done_at", valueFrom: "today" },
        { kind: "set_value", columnId: "status", value: "b" },
      ],
    });
    expect(planActions(rule, ROW, ctx)).toEqual([
      { kind: "set_value", rowId: "row1", columnId: "done_at", value: "2026-10-26" },
      { kind: "set_value", rowId: "row1", columnId: "status", value: "b" },
    ]);
  });

  it("create_row cai no database da linha e aceita destino/modelo explícitos", () => {
    const rule = makeRule({
      trigger: { kind: "row_created" },
      actions: [
        { kind: "create_row" },
        { kind: "create_row", databaseId: "db2", templateId: "tpl1" },
      ],
    });
    expect(planActions(rule, ROW, ctx)).toEqual([
      { kind: "create_row", databaseId: "db1", values: {}, templateId: null },
      { kind: "create_row", databaseId: "db2", values: {}, templateId: "tpl1" },
    ]);
  });
});

describe("depthExceeded", () => {
  it("permite até o teto e barra a profundidade seguinte", () => {
    expect(depthExceeded(0)).toBe(false);
    expect(depthExceeded(MAX_AUTOMATION_DEPTH)).toBe(false);
    expect(depthExceeded(MAX_AUTOMATION_DEPTH + 1)).toBe(true);
  });

  it("aceita um teto customizado", () => {
    expect(depthExceeded(1, 1)).toBe(false);
    expect(depthExceeded(2, 1)).toBe(true);
  });
});

describe("templateRowValues", () => {
  const columns: ColumnLike[] = [
    { id: "hiddenName", type: "text", hidden: true },
    { id: "name", type: "text" },
    { id: "due", type: "date" },
  ];

  it("espelha a linha criada por recorrência (conteúdo, data, título e horário)", () => {
    const values = templateRowValues(
      { name: "Reunião", content: "Pauta", time: "09:30" },
      columns,
      "2026-10-26",
    );
    expect(values).toEqual({
      [PAGE_CONTENT_KEY]: "<p>Pauta</p>",
      due: "2026-10-26",
      name: "Reunião",
      [PAGE_TIME_KEY]: "09:30",
    });
  });

  it("mantém HTML já existente no conteúdo e omite o horário quando ausente", () => {
    const values = templateRowValues(
      { name: "Tarefa", content: "<p>Oi</p>" },
      columns,
      "2026-10-26",
    );
    expect(values[PAGE_CONTENT_KEY]).toBe("<p>Oi</p>");
    expect(values[PAGE_TIME_KEY]).toBeUndefined();
  });
});
