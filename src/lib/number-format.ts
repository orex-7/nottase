import type { CellValue, Column } from "@/types/database";
import { currencyByCode } from "@/lib/currencies";

/**
 * Converte o valor de uma célula em número, aceitando tanto a notação pt-BR
 * ("1.234,56") quanto a en-US ("1,234.56"). Vazio/não numérico → `null`.
 *
 * Observação: como o app é pt-BR, um ponto seguido de exatamente 3 dígitos
 * (ex.: "1.234") é lido como separador de milhar, não como decimal. Para
 * decimais, use vírgula ("1,234").
 */
export function parseNumberValue(value: CellValue): number | null {
  if (Array.isArray(value)) return null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  // Remove separadores de milhar e normaliza a vírgula decimal para ponto.
  const normalized = raw.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(normalized.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Formata um número com `pt-BR`. Sem casas forçadas usa até 2 decimais. */
function formatDecimal(value: number, decimals?: number | null): string {
  const fixed =
    typeof decimals === "number" && decimals >= 0 && decimals <= 20;
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: fixed ? decimals : 0,
    maximumFractionDigits: fixed ? decimals : 2,
  });
}

/**
 * Formata o valor bruto de uma célula numérica conforme o `numberFormat` da
 * coluna (estilo Notion): número puro, com separadores de milhar, percentual ou
 * moeda. A quantidade de casas decimais segue `column.decimals` (ausente =
 * "Padrão"). Quando o valor não é numérico, devolve o texto original sem
 * alterações (para não "sumir" com o que o usuário digitou enquanto edita).
 */
export function formatNumberValue(value: CellValue, column: Column): string {
  const raw = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  if (!raw.trim()) return "";
  const n = parseNumberValue(value);
  if (n === null) return raw;

  const decimals = column.decimals ?? null;
  switch (column.numberFormat) {
    case "separators":
      return formatDecimal(n, decimals);
    case "percent":
      return `${formatDecimal(n, decimals)}%`;
    case "currency": {
      const currency = currencyByCode(column.currency);
      return `${currency.symbol} ${formatDecimal(n, decimals)}`;
    }
    default:
      // Formato "plain": ainda respeita as casas decimais escolhidas.
      return decimals === null ? raw : formatDecimal(n, decimals);
  }
}

/**
 * Formata um número já calculado (ex.: agregado de gráfico) conforme o formato
 * da coluna que o originou. Sem coluna (contagem), usa número com separadores.
 */
export function formatNumberByColumn(value: number, column: Column | null): string {
  if (!column) return formatDecimal(value);
  return formatNumberValue(String(value), column);
}
