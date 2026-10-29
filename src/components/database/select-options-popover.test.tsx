import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SelectOption } from "@/types/database";

import { OPTION_COLORS } from "./database-fields";
import { SelectOptionsPopover } from "./SelectOptionsPopover";

const OPTIONS: SelectOption[] = [
  { id: "a", label: "Alfa", color: OPTION_COLORS[0] },
  { id: "b", label: "Bravo", color: OPTION_COLORS[1] },
  { id: "c", label: "Charlie", color: OPTION_COLORS[2] },
];

/** Simula o arraste nativo da alça de uma opção até a linha de outra. */
function dragOption(fromLabel: string, toLabel: string) {
  const handle = screen.getByRole("button", {
    name: `Reordenar opção ${fromLabel}`,
  });
  const target = screen
    .getByRole("button", { name: `Editar opção ${toLabel}` })
    .closest("li");
  if (!target) throw new Error("linha de destino não encontrada");
  fireEvent.dragStart(handle);
  fireEvent.dragOver(target);
  fireEvent.drop(target);
}

describe("SelectOptionsPopover — arrastar para reordenar", () => {
  it("move a opção arrastada para a posição da opção de destino", () => {
    const onChange = vi.fn();
    render(<SelectOptionsPopover options={OPTIONS} onChange={onChange} />);

    dragOption("Alfa", "Charlie");

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as SelectOption[];
    expect(next.map((o) => o.id)).toEqual(["b", "c", "a"]);
  });

  it("não reordena ao soltar a opção sobre ela mesma", () => {
    const onChange = vi.fn();
    render(<SelectOptionsPopover options={OPTIONS} onChange={onChange} />);

    dragOption("Bravo", "Bravo");

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("SelectOptionsPopover — seletor de cor (seta da opção)", () => {
  it("abre o popover com 9 cores nomeadas + Padrão", () => {
    render(<SelectOptionsPopover options={OPTIONS} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Cor da opção Alfa" }));

    expect(screen.getAllByRole("menuitemradio")).toHaveLength(10);
    for (const label of [
      "Padrão",
      "Cinza",
      "Azul",
      "Verde",
      "Vermelho",
      "Roxo",
      "Ciano",
      "Laranja",
      "Rosa",
      "Amarelo",
    ]) {
      expect(
        screen.getByRole("menuitemradio", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("aplica a cor escolhida na opção", () => {
    const onChange = vi.fn();
    render(<SelectOptionsPopover options={OPTIONS} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Cor da opção Alfa" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Azul" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as SelectOption[];
    expect(next.find((o) => o.id === "a")?.color).toBe(OPTION_COLORS[1]);
  });
});
