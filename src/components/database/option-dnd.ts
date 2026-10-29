import type { DragEvent } from "react";

import type { SelectOption } from "@/types/database";

/** MIME privado do arraste de opções (evita conflito com outros arrastes). */
export const OPTION_DRAG_MIME = "application/x-database-option";

/**
 * Barra indicadora da posição de inserção durante o arraste de uma opção
 * (mesmo visual da barra usada ao arrastar um projeto na sidebar). Precisa de
 * um elemento pai com `position: relative`.
 */
export const OPTION_DROP_BAR =
  "before:absolute before:-top-0.5 before:left-1 before:right-1 before:h-0.5 before:rounded-full before:bg-muted-foreground";

/**
 * Move a opção `fromId` para a posição da opção `toId`. Devolve a nova lista
 * ou `null` quando nada muda (mesma opção, ou ids desconhecidos).
 */
export function moveOption(
  options: SelectOption[],
  fromId: string,
  toId: string,
): SelectOption[] | null {
  if (fromId === toId) return null;
  const from = options.findIndex((o) => o.id === fromId);
  const to = options.findIndex((o) => o.id === toId);
  if (from < 0 || to < 0) return null;
  const next = [...options];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Marca o arraste no `dataTransfer`. É preciso chamar `setData` (o Firefox
 * exige ao menos uma chamada para iniciar o arraste); o `dataTransfer` pode não
 * existir em alguns ambientes (testes).
 */
export function markOptionDrag(
  event: DragEvent<HTMLElement>,
  optionId: string,
): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(OPTION_DRAG_MIME, optionId);
}
