import { Extension } from "@tiptap/core";
import { TableCell, TableHeader } from "@tiptap/extension-table";
import type { Editor } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";

/**
 * Atributos extras compartilhados por células (`tableCell`) e cabeçalhos
 * (`tableHeader`) da tabela:
 *
 * - `background`: cor de fundo da célula (valor CSS ou `null`). Aplicada via
 *   `style="background-color: ..."` para manter compatibilidade com HTML
 *   colado/salvo.
 *
 * O alinhamento horizontal usa o atributo `align` NATIVO do TipTap (que já
 * renderiza `style="text-align: ..."`), manipulado por `setCellAttribute`.
 */
const cellAttributes = {
  background: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) =>
      element.style.backgroundColor || element.getAttribute("data-background"),
    renderHTML: (attributes: Record<string, unknown>) => {
      const background = attributes.background as string | null;
      if (!background) return {};
      return {
        style: `background-color: ${background}`,
        "data-background": background,
      };
    },
  },
};

/**
 * Célula de tabela (`td`) com suporte a cor de fundo e alinhamento. Substitui a
 * `TableCell` embutida do `TableKit` (registrada como `tableCell: false`).
 */
export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes };
  },
});

/**
 * Cabeçalho de tabela (`th`) com suporte a cor de fundo e alinhamento.
 * Substitui a `TableHeader` embutida do `TableKit` (`tableHeader: false`).
 */
export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes };
  },
});

/** Cor de fundo suportada por célula (valor CSS) ou `null` para limpar. */
export type CellBackground = string | null;

/** Alinhamento horizontal suportado por célula (atributo `align` nativo). */
export type CellAlignment = "left" | "center" | "right";

/** Paleta de cores de fundo oferecida no menu da célula (tons suaves). */
export const CELL_BACKGROUND_PALETTE: { label: string; value: string }[] = [
  { label: "Amarelo", value: "hsl(48 96% 89%)" },
  { label: "Laranja", value: "hsl(27 96% 90%)" },
  { label: "Vermelho", value: "hsl(0 93% 94%)" },
  { label: "Rosa", value: "hsl(330 81% 94%)" },
  { label: "Roxo", value: "hsl(270 91% 94%)" },
  { label: "Azul", value: "hsl(217 91% 93%)" },
  { label: "Verde", value: "hsl(142 69% 90%)" },
  { label: "Cinza", value: "hsl(220 14% 92%)" },
];

/**
 * Converte (linha, coluna) de grid na posição do documento usando o `TableMap`
 * — robusto a `colspan`/`rowspan`. Retorna `null` se o índice estiver fora.
 */
function gridToPos(
  table: import("@tiptap/pm/model").Node,
  row: number,
  col: number,
  tablePos: number,
): number | null {
  try {
    const map = TableMap.get(table);
    if (row < 0 || row >= map.height || col < 0 || col >= map.width) return null;
    // `positionAt` devolve a posição relativa ao INÍCIO do nó da tabela.
    return tablePos + map.positionAt(row, col, table);
  } catch {
    return null;
  }
}

/**
 * Move o cursor para a célula na linha/coluna de grid indicadas (base 0),
 * usando o `TableMap` — funciona mesmo com células mescladas. Retorna `true`
 * se conseguiu posicionar o cursor.
 */
export function setCursorAtGridCell(
  editor: Editor,
  row: number,
  col: number,
): boolean {
  const { $from } = editor.state.selection;
  let tableDepth = -1;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "table") {
      tableDepth = depth;
      break;
    }
  }
  if (tableDepth < 0) return false;

  const table = $from.node(tableDepth);
  const tablePos = $from.before(tableDepth);
  const pos = gridToPos(table, row, col, tablePos);
  if (pos == null) return false;

  // `pos + 1` entra na célula (o conteúdo começa logo após o token da célula).
  editor.chain().focus().setTextSelection(pos + 1).run();
  return true;
}

/** Índice de linha/coluna de grid à qual pertence a posição do cursor. */
export function gridIndexAtCursor(
  editor: Editor,
): { row: number; col: number } | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      const tableDepth = depth - 2; // table > tableRow > (tableCell|tableHeader)
      if (tableDepth < 0) return null;
      const table = $from.node(tableDepth);
      const tablePos = $from.before(tableDepth);
      try {
        const map = TableMap.get(table);
        const offset = $from.before(depth) - tablePos;
        const index = map.map.indexOf(offset);
        if (index < 0) return null;
        return { row: Math.floor(index / map.width), col: index % map.width };
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Analisa texto colado no formato planilha (TSV do Excel/Sheets ou CSV) e
 * devolve uma grade de strings. Retorna `null` se não parecer tabular.
 */
function parseClipboardGrid(text: string): string[][] | null {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
  if (!normalized) return null;

  const lines = normalized.split("\n").filter((line) => line.length > 0);
  if (lines.length < 2) return null;

  // Detecta o separador: TAB (Excel/Sheets) tem prioridade; senão vírgula ou
  // ponto-e-vírgula (CSV).
  let delimiter = "\t";
  if (!lines[0].includes("\t")) {
    if (lines[0].includes(";")) delimiter = ";";
    else if (lines[0].includes(",")) delimiter = ",";
    else return null;
  }

  const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
  // Exige uma grade consistente, com ao menos 2 colunas.
  const width = rows[0].length;
  if (width < 2) return null;
  if (!rows.every((row) => row.length === width)) return null;

  return rows;
}

/**
 * Extensão que permite colar dados de planilha (CSV/TSV) como uma tabela real
 * do TipTap. Sem ela, colar do Excel/Google Sheets vira texto puro. Só age
 * quando o cursor já está dentro de uma tabela e o clipboard traz texto
 * tabular (não HTML de tabela, que o ProseMirror já trata).
 */
export const PasteTable = Extension.create({
  name: "pasteTable",
  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        props: {
          handlePaste(view, event) {
            if (!editor.isEditable || !editor.isActive("table")) return false;

            // Se o clipboard já traz HTML de tabela, deixa o ProseMirror cuidar.
            const html = event.clipboardData?.getData("text/html");
            if (html && /<table[\s>]/i.test(html)) return false;

            const text = event.clipboardData?.getData("text/plain");
            if (!text) return false;

            const grid = parseClipboardGrid(text);
            if (!grid) return false;

            const { state, dispatch } = view;
            const { schema, selection } = state;
            const paragraphType = schema.nodes.paragraph;
            if (!paragraphType) return false;

            const { $from } = selection;
            let tableDepth = -1;
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              if ($from.node(depth).type.name === "table") {
                tableDepth = depth;
                break;
              }
            }
            if (tableDepth < 0) return false;

            const table = $from.node(tableDepth);
            const tablePos = $from.before(tableDepth);
            let map;
            try {
              map = TableMap.get(table);
            } catch {
              return false;
            }

            // Localiza a célula do cursor (linha/coluna de grid).
            let cellDepth = -1;
            for (let depth = $from.depth; depth > tableDepth; depth -= 1) {
              const name = $from.node(depth).type.name;
              if (name === "tableCell" || name === "tableHeader") {
                cellDepth = depth;
                break;
              }
            }
            if (cellDepth < 0) return false;

            const offset = $from.before(cellDepth) - tablePos;
            let startIndex = 0;
            try {
              startIndex = map.map.indexOf(offset);
            } catch {
              return false;
            }
            if (startIndex < 0) return false;

            const startRow = Math.floor(startIndex / map.width);
            const startCol = startIndex % map.width;

            // Preenche as células existentes a partir da célula do cursor. Só
            // escreve nas posições que cabem dentro da tabela (o excedente é
            // ignorado), evitando criar tabelas aninhadas.
            const targets: { pos: number; end: number; value: string }[] = [];
            const seen = new Set<number>();
            grid.forEach((cells, r) => {
              cells.forEach((value, c) => {
                const row = startRow + r;
                const col = startCol + c;
                if (row >= map.height || col >= map.width) return;
                const cellPos = tablePos + map.positionAt(row, col, table);
                // Células mescladas aparecem repetidas no `TableMap`; escreve
                // apenas uma vez por célula real.
                if (seen.has(cellPos)) return;
                seen.add(cellPos);
                const $cell = state.doc.resolve(cellPos + 1);
                targets.push({
                  pos: cellPos + 1,
                  end: cellPos + 1 + $cell.parent.content.size,
                  value,
                });
              });
            });
            if (targets.length === 0) return false;

            // De BAIXO para CIMA: substituir as células em ordem decrescente
            // mantém válidas as posições ainda não processadas.
            targets.sort((a, b) => b.pos - a.pos);
            const tr = state.tr;
            for (const target of targets) {
              tr.replaceWith(
                target.pos,
                target.end,
                paragraphType.create(
                  null,
                  target.value ? schema.text(target.value) : null,
                ),
              );
            }

            dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});

/**
 * Move o conteúdo de uma coluna de grid para outra posição, reconstruindo a
 * tabela. Cada `tableRow` tem suas células reordenadas preservando atributos
 * (`colspan`, `rowspan`, `colwidth`, cor, alinhamento).
 */
function reorderColumns(
  table: import("@tiptap/pm/model").Node,
  from: number,
  to: number,
): import("@tiptap/pm/model").Node | null {
  const rowType = table.type.schema.nodes.tableRow;
  const map = TableMap.get(table);
  if (from < 0 || to < 0 || from >= map.width || to >= map.width) return null;

  const newRows: import("@tiptap/pm/model").Node[] = [];
  table.forEach((row) => {
    if (row.type !== rowType) {
      newRows.push(row);
      return;
    }
    const cells = row.content.content as import("@tiptap/pm/model").Node[];
    // Só reordena linhas sem células mescladas horizontalmente (colspan 1).
    const simple = cells.every((c) => (c.attrs.colspan ?? 1) === 1);
    if (!simple || cells.length !== map.width) {
      newRows.push(row);
      return;
    }
    const reordered = [...cells];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    newRows.push(rowType.create(row.attrs, reordered));
  });

  try {
    return table.type.create(table.attrs, newRows);
  } catch {
    return null;
  }
}

/**
 * Extensão com comandos de reordenação de LINHAS e COLUNAS da tabela (usados
 * pelo arraste das alças). Atua sobre a tabela ativa.
 */
export const TableReorder = Extension.create({
  name: "tableReorder",
  addCommands() {
    return {
      /** Move a linha `from` para a posição `to` (índices de grid, base 0). */
      moveTableRow:
        (from: number, to: number) =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          let tableDepth = -1;
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            if ($from.node(depth).type.name === "table") {
              tableDepth = depth;
              break;
            }
          }
          if (tableDepth < 0) return false;
          const table = $from.node(tableDepth);
          const tablePos = $from.before(tableDepth);

          const map = TableMap.get(table);
          if (from < 0 || to < 0 || from >= map.height || to >= map.height) {
            return false;
          }
          if (from === to) return false;

          const rowType = table.type.schema.nodes.tableRow;
          const rows = (table.content.content as import("@tiptap/pm/model").Node[]).filter(
            (n) => n.type === rowType,
          );
          if (rows.length !== map.height) return false;

          const reordered = [...rows];
          const [moved] = reordered.splice(from, 1);
          reordered.splice(to, 0, moved);

          const next = table.type.create(table.attrs, reordered);
          if (dispatch) {
            dispatch(state.tr.replaceWith(tablePos, tablePos + table.nodeSize, next));
          }
          return true;
        },
      /** Move a coluna `from` para a posição `to` (índices de grid, base 0). */
      moveTableColumn:
        (from: number, to: number) =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          let tableDepth = -1;
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            if ($from.node(depth).type.name === "table") {
              tableDepth = depth;
              break;
            }
          }
          if (tableDepth < 0) return false;
          const table = $from.node(tableDepth);
          const tablePos = $from.before(tableDepth);
          if (from === to) return false;

          const next = reorderColumns(table, from, to);
          if (!next) return false;
          if (dispatch) {
            dispatch(state.tr.replaceWith(tablePos, tablePos + table.nodeSize, next));
          }
          return true;
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableReorder: {
      /** Move uma linha da tabela para outra posição (índices de grid). */
      moveTableRow: (from: number, to: number) => ReturnType;
      /** Move uma coluna da tabela para outra posição (índices de grid). */
      moveTableColumn: (from: number, to: number) => ReturnType;
    };
  }
}
