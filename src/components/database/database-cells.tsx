import { useState } from "react";
import { X } from "lucide-react";

import { formatNumberValue } from "@/lib/number-format";
import { cn } from "@/lib/utils";
import type { CellValue, Column, SelectOption } from "@/types/database";

/**
 * Input de uma célula numérica. Enquanto **não está em foco**, exibe o valor com
 * o formato escolhido (separadores/percentual/moeda — estilo Notion) por cima do
 * input transparente; ao focar, revela o valor cru editável. Sem isso o usuário
 * não conseguiria digitar (o formato atrapalharia a edição).
 */
export function NumberCellInput({
  value,
  column,
  onChange,
}: {
  value: CellValue;
  column: Column;
  onChange: (next: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const textValue = Array.isArray(value) ? value.join(", ") : (value ?? "");
  const display = formatNumberValue(value, column);
  // Só usa o overlay quando há algo formatado diferente do valor cru (evita
  // esconder o cursor de digitação desnecessariamente).
  const showOverlay = !focused && display !== "" && display !== textValue;

  return (
    <div className="relative flex w-full min-w-0 items-center">
      <input
        type="text"
        inputMode="decimal"
        value={textValue}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={column.name}
        className={cn(
          // Conteúdo alinhado à direita (números, estilo planilha).
          "w-full min-w-0 rounded bg-transparent pl-2 pr-1 py-1 text-right outline-none focus:outline-none",
          showOverlay && "text-transparent caret-transparent",
        )}
      />
      {showOverlay ? (
        <span className="pointer-events-none absolute inset-y-0 left-1 right-1 flex items-center justify-end truncate pl-1 text-foreground">
          {display}
        </span>
      ) : null}
    </div>
  );
}

/** Chip colorido usado para status e tags. */
export function Chip({
  option,
  onRemove,
}: {
  option: SelectOption;
  onRemove?: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
        option.color,
      )}
    >
      {option.label}
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Remover ${option.label}`}>
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
