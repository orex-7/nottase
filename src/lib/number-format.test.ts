import { describe, expect, it } from "vitest";

import { formatNumberValue, parseNumberValue } from "@/lib/number-format";
import type { Column } from "@/types/database";

/** Coluna numérica base para os testes de formatação. */
function numberColumn(patch: Partial<Column> = {}): Column {
  return { id: "valor", name: "Valor", type: "number", ...patch };
}

describe("parseNumberValue", () => {
  it("lê notação pt-BR (milhar com ponto, decimal com vírgula)", () => {
    expect(parseNumberValue("1.234,56")).toBe(1234.56);
  });

  it("lê decimal simples com ponto", () => {
    expect(parseNumberValue("1234.56")).toBe(1234.56);
  });

  // Observação: o comentário de `parseNumberValue` diz aceitar en-US
  // ("1,234.56"), mas na prática a função devolve `null` nesse formato.
  it("não interpreta en-US com vírgula de milhar", () => {
    expect(parseNumberValue("1,234.56")).toBeNull();
  });

  it("retorna null para vazio, texto e lista", () => {
    expect(parseNumberValue("")).toBeNull();
    expect(parseNumberValue("abc")).toBeNull();
    expect(parseNumberValue(["1", "2"])).toBeNull();
  });
});

describe("formatNumberValue", () => {
  it("formata percentual com as casas decimais da coluna", () => {
    expect(
      formatNumberValue("12.5", numberColumn({ numberFormat: "percent", decimals: 1 })),
    ).toBe("12,5%");
  });

  it("formata moeda com o símbolo da coluna", () => {
    expect(
      formatNumberValue("10", numberColumn({ numberFormat: "currency", currency: "BRL" })),
    ).toBe("R$ 10");
  });

  it("mantém o texto original quando não é numérico", () => {
    expect(formatNumberValue("abc", numberColumn())).toBe("abc");
  });

  it("devolve string vazia para valor vazio", () => {
    expect(formatNumberValue("", numberColumn())).toBe("");
  });
});
