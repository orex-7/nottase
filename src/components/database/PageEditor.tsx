"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Code,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  Eraser,
  GripHorizontal,
  GripVertical,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  MoreVertical,
  Plus,
  Quote,
  Redo2,
  Rows3,
  Columns3,
  SplitSquareHorizontal,
  SquareStack,
  Strikethrough,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import Image from "@tiptap/extension-image";
import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";

import { cn } from "@/lib/utils";
import { countTasksFromHtml } from "@/lib/markdown";
import { uploadPageImage } from "@/lib/images";
import {
  CELL_BACKGROUND_PALETTE,
  CustomTableCell,
  CustomTableHeader,
  PasteTable,
  TableReorder,
  gridIndexAtCursor,
  setCursorAtGridCell,
  type CellAlignment,
} from "@/lib/editor-table";

/** Atraso (ms) do autosave após a última alteração. */
const AUTOSAVE_DELAY = 500;

/** Id do popover de inserção do botão "+" (usado no clique-fora). */
const POPOVER_ID = "page-editor-insert-popover";

/** Id do popover de configurações da imagem (botão de três pontos). */
const IMAGE_MENU_ID = "page-editor-image-menu";

/** Id do popover das alças de linha/coluna da tabela (clique-fora). */
const TABLE_HANDLE_MENU_ID = "page-editor-table-handle-menu";

/** Id do menu contextual da célula da tabela (clique-fora). */
const TABLE_CELL_MENU_ID = "page-editor-table-cell-menu";

/** Id do menu de seleção de linguagem do bloco de código (clique-fora). */
const CODE_MENU_ID = "page-editor-code-menu";

/**
 * Linguagens oferecidas no seletor do bloco de código (rótulo + valor). O valor
 * é gravado como `class="language-xxx"` no `<pre><code>` (persiste no HTML).
 * A opção de valor vazio ("Texto puro") não emite classe.
 */
const CODE_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Texto puro" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "python", label: "Python" },
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Shell" },
  { value: "markdown", label: "Markdown" },
];

/** Rótulo exibido para a linguagem do bloco de código (vazio = "Texto puro"). */
const codeLanguageLabel = (value: string): string =>
  CODE_LANGUAGES.find((lang) => lang.value === value)?.label ?? "Texto puro";

/**
 * Instância do lowlight com as linguagens "comuns" do highlight.js, usada pelo
 * `CodeBlockLowlight` para colorir o bloco de código conforme a linguagem.
 */
const lowlight = createLowlight(common);

/** Tamanho (px) do quadradinho da alça de linha/coluna da tabela. */
const TABLE_HANDLE_SIZE = 22;

/** Altura (px) do botão de arrastar da COLUNA (mais baixo, estilo Notion). */
const TABLE_COL_HANDLE_HEIGHT = 16;

/** Largura (px) do botão de arrastar da LINHA (mais estreito, estilo Notion). */
const TABLE_ROW_HANDLE_WIDTH = 16;

/**
 * Classe aplicada (manualmente) à célula da tabela onde está o cursor, para
 * destacá-la com um contorno azul. O ProseMirror só marca as células com
 * `selectedCell` durante uma seleção de célula (arrastar); no clique simples
 * não há classe, então nós a adicionamos aqui.
 */
const TABLE_CURSOR_CELL_CLASS = "table-cursor-cell";

/**
 * Extensão que destaca com um contorno azul a célula de tabela onde está a
 * seleção (cursor). Usa uma `Decoration.node`, que o ProseMirror REAPLICA a
 * cada re-render — por isso a classe não "pisca"/some como aconteceria se
 * fosse adicionada manualmente ao DOM. Cobre o clique simples, no qual a
 * extensão Table não aplica `selectedCell`.
 */
const TableCellCursorHighlight = Extension.create({
  name: "tableCellCursorHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { $from, from, to } = state.selection;
            // Numa seleção de célula (CellSelection) a Table já aplica
            // `selectedCell`; aqui só tratamos a seleção de texto/cursor.
            if (from !== to) return null;
            // Sobe do cursor até a célula (`tableCell`/`tableHeader`).
            let cellDepth = -1;
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              const name = $from.node(depth).type.name;
              if (name === "tableCell" || name === "tableHeader") {
                cellDepth = depth;
                break;
              }
            }
            if (cellDepth < 0) return null;
            const fromPos = $from.before(cellDepth);
            const toPos = $from.after(cellDepth);
            return DecorationSet.create(state.doc, [
              Decoration.node(fromPos, toPos, {
                class: TABLE_CURSOR_CELL_CLASS,
              }),
            ]);
          },
        },
      }),
    ];
  },
});

/**
 * Posição de uma alça (linha ou coluna) da tabela, relativa ao container do
 * editor. `index` é o índice da linha/coluna no DOM (base 0).
 */
interface TableHandle {
  /** Centro horizontal (px, relativo ao container). */
  left: number;
  /** Centro vertical (px, relativo ao container). */
  top: number;
  /** Índice da linha ou coluna (base 0). */
  index: number;
  /** Largura (px) da coluna — usado pela barrinha de destaque no topo. */
  width?: number;
  /** Altura (px) da linha — usado pela barrinha de destaque à esquerda. */
  height?: number;
}

/** Alça cujo popover está aberto (com a posição já resolvida). */
interface TableHandleMenuState extends TableHandle {
  /** Se o menu pertence a uma linha ou a uma coluna. */
  kind: "row" | "col";
}

/**
 * Recuo (px) do botão de configurações em relação ao canto superior direito da
 * imagem, para que ele fique DENTRO da imagem (sobreposto).
 */
const IMAGE_MENU_INSET = 8;

/**
 * Distância (px) da borda esquerda do container até o botão "+". Fica dentro do
 * gutter criado por `.tiptap-content { padding-left }`, de modo que o botão
 * apareça na margem — sem sobrepor o texto da linha.
 */
const PLUS_GUTTER_LEFT = 4;

/**
 * Distância (px) da borda esquerda do container até o início do conteúdo da
 * página. Corresponde ao `padding-left: 2.25rem` (36px) de `.tiptap-content`,
 * usado para alinhar o popover de inserção à margem do texto.
 */
const CONTENT_LEFT = 36;

/** Dimensões padrão da tabela inserida pelo popover do "+". */
const TABLE_DEFAULT_ROWS = 3;
const TABLE_DEFAULT_COLS = 3;
const TABLE_DEFAULT_HEADER = true;

interface PageEditorProps {
  /** Valor HTML atual (fonte da verdade externa). */
  value: string;
  /** Chamado após o debounce de autosave, com o HTML do editor. */
  onChange: (html: string) => void;
  placeholder?: string;
  /** Classe aplicada ao container do editor (altura/flex). */
  className?: string;
  /** Rótulo de acessibilidade da área editável. */
  ariaLabel?: string;
}

/**
 * Editor de página rico (estilo Notion) baseado em TipTap/ProseMirror.
 *
 * A formatação é visual: digitar `**texto**`, `# `, `- `, `- [ ] ` etc. aplica
 * o estilo em tempo real (input rules do StarterKit) e os caracteres de markdown
 * nao aparecem. O conteudo e salvo como HTML.
 *
 * O `onChange` (que persiste no Supabase) e disparado apenas apos uma pausa de
 * digitacao (debounce). Quando `value` muda externamente (ex.: aplicar um
 * modelo), o conteudo do editor e ressincronizado sem disparar o autosave.
 */
export function PageEditor({
  value,
  onChange,
  placeholder,
  className,
  ariaLabel = "Conteúdo da página",
}: PageEditorProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Último HTML emitido/agendado, para distinguir edições locais de externas. */
  const lastEmittedRef = useRef(value);
  /** Evita renderizar conteudo inicial no servidor (mismatch de hidratacao). */
  const [mounted, setMounted] = useState(false);
  /** Re-render da toolbar para refletir o estado ativo dos botoes. */
  const [, forceTick] = useState(0);

  /** Botão "+" que aparece à esquerda da linha onde está o cursor. */
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  /** Posição (top/left) do botão "+" relativa ao container do editor. */
  const [plusPos, setPlusPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  /** Indica se o popover de inserção (aberto pelo "+") está visível. */
  const [menuOpen, setMenuOpen] = useState(false);
  /** Container do popover de inserção (usado para decidir abrir p/ cima). */
  const popoverRef = useRef<HTMLDivElement>(null);
  /**
   * Se o popover deve abrir para CIMA (ancorado pela base). Definido quando o
   * popover não cabe abaixo da linha do cursor (ex.: cursor perto do fim da
   * tela).
   */
  const [menuFlipUp, setMenuFlipUp] = useState(false);
  /** Envio de imagem em andamento (desabilita ações do popover). */
  const [uploading, setUploading] = useState(false);
  /** Mensagem de erro de upload exibida no popover. */
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Input de arquivo escondido, acionado pela opção "Imagem". */
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Container do editor (referência para calcular a posição do "+"). */
  const containerRef = useRef<HTMLDivElement>(null);
  /** Posição (top/left) do botão de três pontos, relativa ao container. */
  const [imageMenuPos, setImageMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** Indica se o popover de configurações da imagem está aberto. */
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  /** Posição (documento) da imagem cujo menu está aberto. */
  const imageMenuPosRef = useRef<number | null>(null);
  /** Posição (documento) da imagem sob o mouse (hover). */
  const hoveredImagePosRef = useRef<number | null>(null);
  /** Botão de três pontos (usado no clique-fora). */
  const imageMenuButtonRef = useRef<HTMLButtonElement>(null);
  /**
   * Aba ativa do popover do "+": menu principal, inserção de imagem ou de
   * tabela. O popover abre no menu principal e navega entre as opções.
   */
  const [insertTab, setInsertTab] = useState<"menu" | "image">("menu");
  /**
   * Alças (botões de 6 pontos) das linhas e colunas da tabela sob o cursor,
   * com a posição já resolvida (relativa ao container). Vazio quando o cursor
   * não está dentro de uma tabela.
   */
  const [tableRowHandles, setTableRowHandles] = useState<TableHandle[]>([]);
  const [tableColHandles, setTableColHandles] = useState<TableHandle[]>([]);
  /** Alça cujo popover está aberto (inserir linha/coluna antes/depois). */
  const [tableHandleMenu, setTableHandleMenu] =
    useState<TableHandleMenuState | null>(null);
  /**
   * Alça sob o mouse (hover). As alças ficam invisíveis por padrão e só
   * aparecem quando o mouse passa sobre a área onde elas estão.
   */
  const [hoveredHandle, setHoveredHandle] = useState<{
    kind: "row" | "col";
    index: number;
  } | null>(null);
  /**
   * Índice da coluna sob o mouse (hover). Usado para destacar a coluna inteira
   * (barrinha no topo) quando o mouse está sobre qualquer célula dela.
   */
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);
  /**
   * Índice da LINHA sob o mouse (hover). Usado para destacar a linha inteira
   * (barrinha vertical à esquerda) quando o mouse está sobre qualquer célula.
   */
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  /**
   * Posição/dimensões (relativas ao container) do botão "inserir coluna",
   * exibido como uma faixa vertical à direita da última coluna, com a altura da
   * tabela. `null` quando não há tabela ativa.
   */
  const [insertColPos, setInsertColPos] = useState<{
    top: number;
    left: number;
    height: number;
    /** Posição (no documento) do nó da tabela. */
    tablePos: number;
  } | null>(null);
  /** Mouse sobre a faixa do botão "inserir coluna". */
  const [insertColHover, setInsertColHover] = useState(false);
  /**
   * Posição/dimensões (relativas ao container) do botão "inserir linha",
   * exibido como uma faixa horizontal ABAIXO da tabela, com a largura dela.
   * `null` quando não há tabela ativa.
   */
  const [insertRowPos, setInsertRowPos] = useState<{
    top: number;
    left: number;
    width: number;
    /** Posição (no documento) do nó da tabela. */
    tablePos: number;
  } | null>(null);
  /** Mouse sobre a faixa do botão "inserir linha". */
  const [insertRowHover, setInsertRowHover] = useState(false);
  /**
   * Alça que está sendo ARRASTADA (para reordenar linhas/colunas). Guarda a
   * origem (`kind` + `index`) e o índice alvo sob o cursor.
   */
  const [dragHandle, setDragHandle] = useState<{
    kind: "row" | "col";
    from: number;
    over: number;
  } | null>(null);
  /**
   * Menu contextual da CÉLULA ativa (botão "⋮" na célula onde está o cursor):
   * mesclar/dividir, cabeçalho, alinhamento e cor de fundo.
   */
  const [cellMenu, setCellMenu] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** Se o painel de opções da célula (aberto pelo botão "⋮") está visível. */
  const [cellMenuPanelOpen, setCellMenuPanelOpen] = useState(false);
  /** Ref espelhando se o menu da célula está aberto (evita stale closure). */
  const cellMenuOpenRef = useRef(false);
  useEffect(() => {
    cellMenuOpenRef.current = cellMenuPanelOpen;
  }, [cellMenuPanelOpen]);
  /**
   * Referência atualizada para a função que recalcula as alças. Chamada pelo
   * `onTransaction` do editor (criado antes da função existir).
   */
  const updateTableHandlesRef = useRef<(() => void) | null>(null);

  /** Posição (top/left) do botão de linguagem, relativa ao container. */
  const [codeMenuPos, setCodeMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  /** Indica se o dropdown de linguagem do bloco de código está aberto. */
  const [codeMenuOpen, setCodeMenuOpen] = useState(false);
  /** Botão de linguagem (usado no clique-fora). */
  const codeMenuButtonRef = useRef<HTMLButtonElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // O StarterKit v3 já inclui a extensão `link`; configuramos por aqui
        // (declará-la separadamente causaria "Duplicate extension names: ['link']").
        link: { openOnClick: false, autolink: true },
        // O StarterKit v3 também já registra `underline` (usado na seleção).
        underline: {},
        // Desativa o `codeBlock` padrão: usamos o `CodeBlockLowlight` (abaixo),
        // que adiciona coloração de sintaxe (highlight.js) por linguagem.
        codeBlock: false,
      }),
      // Bloco de código com syntax highlighting (lowlight/highlight.js).
      CodeBlockLowlight.configure({ lowlight }),
      TaskList,
      TaskItem.configure({ nested: true }),
      // Imagem inserida via botão "+"/popover (upload no Supabase Storage).
      // O `resize` habilita as alças de redimensionamento (arrastar para mudar
      // o tamanho). A largura/altura ficam gravadas nos atributos `width`/
      // `height` do próprio HTML, então o tamanho persiste entre edições.
      Image.configure({
        inline: false,
        allowBase64: false,
        resize: {
          enabled: true,
          // Alças no meio das bordas laterais (esquerda e direita).
          directions: ["left", "right"],
          minWidth: 40,
          minHeight: 40,
          alwaysPreserveAspectRatio: true,
        },
      }),
      // Tabela editável (estilo Notion): inserida pelo popover do botão "+".
      // O `TableKit` registra Table, TableRow, TableCell e TableHeader de uma
      // só vez. As células são redimensionáveis (colgroup com larguras) e o
      // primeiro item costuma ser a linha de cabeçalho. As células usam versões
      // estendidas (cor de fundo + alinhamento), por isso `tableCell`/
      // `tableHeader` são desativados aqui.
      TableKit.configure({
        table: {
          resizable: true,
          // Permite selecionar a tabela inteira clicando na borda.
          allowTableNodeSelection: true,
        },
        tableCell: false,
        tableHeader: false,
      }),
      CustomTableCell,
      CustomTableHeader,
      // Contorno azul na célula da tabela onde está o cursor (decoração).
      TableCellCursorHighlight,
      // Reordenação de linhas/colunas (arraste das alças) e colar CSV/TSV.
      TableReorder,
      PasteTable,
      Placeholder.configure({
        placeholder: placeholder ?? "Clique aqui para começar a escrever...",
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "tiptap-content",
        "aria-label": ariaLabel,
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Captura o HTML UMA vez para que o valor emitido e o marcador de eco
      // sejam idênticos (evita o efeito de sincronização sobrescrever o
      // conteúdo — e o cursor — enquanto o usuário digita).
      const html = ed.getHTML();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        lastEmittedRef.current = html;
        onChange(html);
      }, AUTOSAVE_DELAY);
    },
    // Re-render "leve" da toolbar/contagens a cada transação (não toca no DOM
    // do editor, portanto não afeta o foco nem o cursor). Também recalcula as
    // alças (botões de 6 pontos) da tabela quando a seleção ou o conteúdo mudam.
    onTransaction: ({ transaction }) => {
      forceTick((n) => n + 1);
      if (transaction.selectionSet || transaction.docChanged) {
        updateTableHandlesRef.current?.();
      }
    },
  });

  // Sincroniza alteracoes externas (aplicar modelo, trocar de item, etc.).
  // IMPORTANTE: nunca sobrescreve o conteudo enquanto o editor esta focado —
  // fazer `setContent` durante a digitacao reposiciona o cursor e o foco.
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    if (editor.isFocused) {
      // Mudanca veio do proprio usuario (eco do save) enquanto digitava:
      // apenas registra o valor para nao reagir na proxima renderizacao.
      lastEmittedRef.current = value;
      return;
    }
    lastEmittedRef.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);

  /**
   * Calcula a posição do botão "+" (à esquerda da linha atual do cursor),
   * relativa ao container do editor. Esconde o botão quando o editor não está
   * focado ou quando o cursor está num bloco de código (que não aceita "+").
   */
  const updatePlusPosition = useCallback(() => {
    const ed = editor;
    const container = containerRef.current;
    if (!ed || !container || !ed.isFocused || ed.isActive("codeBlock")) {
      // Não reposiciona (nem esconde) enquanto o popover está aberto: o editor
      // perde o foco ao clicar no popover, e se zerássemos aqui o popover seria
      // desmontado antes da ação (ex.: abrir o seletor de arquivos).
      if (menuOpen) return;
      setPlusPos(null);
      return;
    }
    const { from } = ed.state.selection;
    // Retângulo da posição ATUAL do cursor (coordenadas da tela). Usar `from`
    // (e não o início do bloco) faz o "+" acompanhar a linha onde o usuário
    // clicou, mesmo em parágrafos com várias linhas.
    const rect = ed.view.coordsAtPos(from);
    const containerRect = container.getBoundingClientRect();
    // Centraliza o botão na altura da linha (não no topo dela).
    const lineCenter = (rect.top + rect.bottom) / 2;
    setPlusPos({
      top: lineCenter - containerRect.top + container.scrollTop,
      left: rect.left - containerRect.left,
    });
  }, [editor, menuOpen]);

  // Reposiciona o "+" a cada mudança de seleção/transação e em scroll/resize.
  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", updatePlusPosition);
    editor.on("transaction", updatePlusPosition);
    editor.on("focus", updatePlusPosition);
    editor.on("blur", updatePlusPosition);
    window.addEventListener("scroll", updatePlusPosition, true);
    window.addEventListener("resize", updatePlusPosition);
    // Reforço: um clique no editor pode não emitir `selectionUpdate` (o cursor
    // já estava na linha). Recalculamos no clique/mouseup para que o "+"
    // apareça imediatamente ao clicar, sem precisar digitar.
    const dom = editor.view.dom;
    const onPointerUp = () => updatePlusPosition();
    dom.addEventListener("click", onPointerUp);
    dom.addEventListener("mouseup", onPointerUp);
    return () => {
      editor.off("selectionUpdate", updatePlusPosition);
      editor.off("transaction", updatePlusPosition);
      editor.off("focus", updatePlusPosition);
      editor.off("blur", updatePlusPosition);
      window.removeEventListener("scroll", updatePlusPosition, true);
      window.removeEventListener("resize", updatePlusPosition);
      dom.removeEventListener("click", onPointerUp);
      dom.removeEventListener("mouseup", onPointerUp);
    };
  }, [editor, updatePlusPosition]);

  /**
   * Decide se o popover de inserção deve abrir para CIMA. Mede a altura real do
   * popover e o espaço disponível abaixo da linha do cursor; se não couber,
   * abre para cima (ancorado pela base). Reavalia quando abre, ao trocar de aba
   * (a altura muda) e em scroll/resize.
   */
  useEffect(() => {
    if (!menuOpen) {
      setMenuFlipUp(false);
      return;
    }
    const measure = () => {
      const popover = popoverRef.current;
      const container = containerRef.current;
      if (!popover || !container) return;
      const margin = 8;
      const popoverHeight = popover.offsetHeight;
      // Borda superior do popover na tela = topo do container + top do popover
      // (relativo ao container) menos o que o container já rolou.
      const topInViewport =
        container.getBoundingClientRect().top +
        (plusPos?.top ?? 0) -
        container.scrollTop;
      const spaceBelow = window.innerHeight - topInViewport - margin;
      setMenuFlipUp(spaceBelow < popoverHeight && topInViewport > popoverHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [menuOpen, insertTab, plusPos]);

  /**
   * Calcula a posição do botão de linguagem no canto superior direito do bloco
   * de código sob o cursor, relativa ao container do editor. Esconde o botão
   * quando o cursor não está num `codeBlock` (mas mantém a posição enquanto o
   * dropdown está aberto, pois o foco sai do editor ao interagir com ele).
   */
  const updateCodeMenuPosition = useCallback(() => {
    const ed = editor;
    const container = containerRef.current;
    if (!ed || !container || !ed.isActive("codeBlock")) {
      if (codeMenuOpen) return;
      setCodeMenuPos(null);
      return;
    }

    // Localiza o nó `codeBlock` que contém o cursor.
    const { $from } = ed.state.selection;
    let codePos = -1;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name === "codeBlock") {
        codePos = $from.before(depth);
        break;
      }
    }
    if (codePos < 0) {
      if (codeMenuOpen) return;
      setCodeMenuPos(null);
      return;
    }

    const dom = ed.view.nodeDOM(codePos);
    if (!(dom instanceof HTMLElement)) {
      if (codeMenuOpen) return;
      setCodeMenuPos(null);
      return;
    }

    const rect = dom.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setCodeMenuPos({
      top: rect.top - containerRect.top + container.scrollTop + 4,
      left: rect.right - containerRect.left - 4,
    });
  }, [editor, codeMenuOpen]);

  // Reposiciona o botão de linguagem a cada mudança de seleção/transação e em
  // scroll/resize (o bloco pode se mover). Aproveita a lista de eventos do "+".
  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", updateCodeMenuPosition);
    editor.on("transaction", updateCodeMenuPosition);
    editor.on("focus", updateCodeMenuPosition);
    editor.on("blur", updateCodeMenuPosition);
    window.addEventListener("scroll", updateCodeMenuPosition, true);
    window.addEventListener("resize", updateCodeMenuPosition);
    updateCodeMenuPosition();
    return () => {
      editor.off("selectionUpdate", updateCodeMenuPosition);
      editor.off("transaction", updateCodeMenuPosition);
      editor.off("focus", updateCodeMenuPosition);
      editor.off("blur", updateCodeMenuPosition);
      window.removeEventListener("scroll", updateCodeMenuPosition, true);
      window.removeEventListener("resize", updateCodeMenuPosition);
    };
  }, [editor, updateCodeMenuPosition]);

  // Fecha o dropdown de linguagem ao clicar fora dele.
  useEffect(() => {
    if (!codeMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (codeMenuButtonRef.current?.contains(target)) return;
      const popover = document.getElementById(CODE_MENU_ID);
      if (popover?.contains(target)) return;
      setCodeMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [codeMenuOpen]);

  /**
   * Calcula as posições das alças (botões de 6 pontos) de cada LINHA (à
   * esquerda da tabela) e de cada COLUNA (acima da tabela), relativas ao
   * container do editor. Lê as células do DOM para acompanhar a largura/altura
   * reais. Limpa as alças quando o cursor não está dentro de uma tabela.
   *
   * O contorno azul da célula ativa é feito por uma decoração do ProseMirror
   * (extensão `TableCellCursorHighlight`), não aqui.
   */
  const updateTableHandles = useCallback(() => {
    const ed = editor;
    const container = containerRef.current;
    if (!ed || !container || !ed.isActive("table")) {
      setTableRowHandles((prev) => (prev.length ? [] : prev));
      setTableColHandles((prev) => (prev.length ? [] : prev));
      setInsertColPos(null);
      setInsertRowPos(null);
      return;
    }

    // Localiza o nó da tabela que contém o cursor.
    const { $from } = ed.state.selection;
    let tablePos = -1;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name === "table") {
        tablePos = $from.before(depth);
        break;
      }
    }
    if (tablePos < 0) {
      setTableRowHandles([]);
      setTableColHandles([]);
      return;
    }

    const dom = ed.view.nodeDOM(tablePos);
    if (!(dom instanceof HTMLElement)) {
      setTableRowHandles([]);
      setTableColHandles([]);
      return;
    }
    const tableEl = dom.querySelector("table");
    if (!tableEl) {
      setTableRowHandles([]);
      setTableColHandles([]);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const toLocal = (r: DOMRect) => ({
      top: r.top - containerRect.top + container.scrollTop,
      left: r.left - containerRect.left + container.scrollLeft,
      width: r.width,
      height: r.height,
    });

    const tableRect = toLocal(tableEl.getBoundingClientRect());

    // --- Colunas: uma alça por coluna, acima da tabela (centro da coluna). ---
    const firstRow = tableEl.querySelector("tr");
    const firstRowCells = firstRow
      ? Array.from(firstRow.children).filter(
          (c): c is HTMLElement => c instanceof HTMLElement,
        )
      : [];
    const cols: TableHandle[] = firstRowCells.map((cell, index) => {
      const r = toLocal(cell.getBoundingClientRect());
      return {
        index,
        // Centro horizontal da coluna, encaixado SOBRE a borda superior dela
        // (a linha física da grade), como no Notion.
        left: r.left + r.width / 2,
        top: tableRect.top,
        width: r.width,
      };
    });

    // --- Linhas: uma alça por linha, encaixada SOBRE a borda esquerda dela. ---
    const rows = Array.from(tableEl.querySelectorAll("tr"))
      .filter((tr): tr is HTMLTableRowElement => tr instanceof HTMLTableRowElement)
      .map((tr, index) => {
        const r = toLocal(tr.getBoundingClientRect());
        return {
          index,
          // Sobre a borda esquerda da tabela, no centro vertical da linha.
          left: tableRect.left,
          top: r.top + r.height / 2,
          height: r.height,
        };
      });

    // --- Botão "+" (inserir coluna): faixa vertical à direita da última
    // coluna, com a ALTURA da tabela, dentro da margem direita da página. ---
    setInsertColPos({
      top: tableRect.top,
      height: tableRect.height,
      // Logo à direita da tabela; fica dentro do gutter (padding-right) da
      // página, então não estoura a margem.
      left: tableRect.left + tableRect.width + 4,
      tablePos,
    });

    // --- Botão "+" (inserir linha): faixa horizontal ABAIXO da tabela, com a
    // LARGURA dela. ---
    setInsertRowPos({
      top: tableRect.top + tableRect.height + 4,
      left: tableRect.left,
      width: tableRect.width,
      tablePos,
    });

    // --- Botão "⋮" da CÉLULA ativa (menu contextual), no canto sup. direito. ---
    const cellPos = gridIndexAtCursor(ed);
    let nextCellMenu: { top: number; left: number } | null = null;
    if (cellPos) {
      const tr = tableEl.querySelectorAll("tr")[cellPos.row];
      const cellEl = tr?.children[cellPos.col];
      if (cellEl instanceof HTMLElement) {
        const r = toLocal(cellEl.getBoundingClientRect());
        nextCellMenu = {
          // Recuado para dentro do canto superior direito da célula.
          top: r.top + 2,
          left: r.left + r.width - 2,
        };
      }
    }
    // Preserva a posição enquanto o menu está aberto (o foco sai do editor).
    setCellMenu((prev) =>
      nextCellMenu ? nextCellMenu : cellMenuOpenRef.current ? prev : null,
    );

    setTableColHandles(cols);
    setTableRowHandles(rows);
  }, [editor]);

  // Mantém o ref atualizado para o `onTransaction` do editor.
  useEffect(() => {
    updateTableHandlesRef.current = updateTableHandles;
  }, [updateTableHandles]);

  // Recalcula as alças em seleção/foco/transação e em scroll/resize. O destaque
  // da célula segue a SELEÇÃO (fonte da verdade), sem depender do foco — assim
  // ele não "pisca" (aparece e some) durante o clique.
  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", updateTableHandles);
    editor.on("focus", updateTableHandles);
    editor.on("transaction", updateTableHandles);
    window.addEventListener("scroll", updateTableHandles, true);
    window.addEventListener("resize", updateTableHandles);
    // Reforço: um clique dentro de uma célula pode não gerar transação quando o
    // cursor já estava nela. Recalculamos também no clique/mouseup do editor.
    const dom = editor.view.dom;
    const onPointerUp = () => updateTableHandles();
    dom.addEventListener("click", onPointerUp);
    dom.addEventListener("mouseup", onPointerUp);
    updateTableHandles();
    return () => {
      editor.off("selectionUpdate", updateTableHandles);
      editor.off("focus", updateTableHandles);
      editor.off("transaction", updateTableHandles);
      window.removeEventListener("scroll", updateTableHandles, true);
      window.removeEventListener("resize", updateTableHandles);
      dom.removeEventListener("click", onPointerUp);
      dom.removeEventListener("mouseup", onPointerUp);
    };
  }, [editor, updateTableHandles]);

  // Fecha o popover das alças ao clicar fora dele.
  useEffect(() => {
    if (!tableHandleMenu) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (target instanceof Element && target.closest("[data-table-handle]")) {
        return;
      }
      setTableHandleMenu(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [tableHandleMenu]);
  // Fecha o menu contextual da célula ao clicar fora dele.
  useEffect(() => {
    if (!cellMenuPanelOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (target instanceof Element && target.closest("[data-table-cell-menu]")) {
        return;
      }
      setCellMenuPanelOpen(false);
      setCellMenu(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [cellMenuPanelOpen]);

  // Reposiciona as alças durante o REDIMENSIONAMENTO de colunas em tempo real.
  // O handle do `column-resize-handle` altera larguras do DOM sem emitir
  // transação; um `ResizeObserver` sobre a tabela sob o cursor mantém as alças
  // alinhadas. (Mesmo padrão usado para a imagem.)
  useEffect(() => {
    if (!editor) return;
    const { $from } = editor.state.selection;
    let tablePos = -1;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name === "table") {
        tablePos = $from.before(depth);
        break;
      }
    }
    if (tablePos < 0) return;
    const dom = editor.view.nodeDOM(tablePos);
    if (!(dom instanceof HTMLElement)) return;
    const tableEl = dom.querySelector("table");
    if (!tableEl) return;
    const observer = new ResizeObserver(() => updateTableHandlesRef.current?.());
    observer.observe(tableEl);
    return () => observer.disconnect();
  }, [editor, tableRowHandles, tableColHandles]);




  // Fecha o popover do "+" ao clicar fora dele (mas mantém o botão "+").
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (plusButtonRef.current?.contains(target)) return;
      const popover = document.getElementById(POPOVER_ID);
      if (popover?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  /**
   * Dado o nó de imagem numa posição do documento, calcula a posição
   * (top/left, relativa ao container do editor) do canto superior direito
   * recuado para dentro da imagem. Retorna `null` se não for possível.
   */
  const computeImageMenuPosition = useCallback(
    (ed: NonNullable<typeof editor>, pos: number) => {
      const container = containerRef.current;
      if (!container) return null;

      const dom = ed.view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) return null;

      // O `dom` do NodeView é o container `flex` (largura total do editor);
      // quem reflete o TAMANHO real da imagem é o `<img>` interno. Usamos o
      // retângulo do `<img>` para que o botão acompanhe o redimensionamento.
      const imgEl = dom.querySelector("img");
      const rect = (imgEl ?? dom).getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return {
        top:
          rect.top - containerRect.top + container.scrollTop + IMAGE_MENU_INSET,
        left: rect.right - containerRect.left - IMAGE_MENU_INSET,
      };
    },
    [],
  );

  /**
   * Calcula a posição do botão de três pontos (canto superior direito da
   * imagem), relativa ao container do editor. O botão aparece quando a imagem
   * está SELECIONADA (`NodeSelection` sobre o nó `image`) OU quando o mouse
   * está sobre a imagem (hover).
   */
  const updateImageMenuPosition = useCallback(() => {
    const ed = editor;
    if (!ed) {
      setImageMenuPos(null);
      return;
    }

    const { selection } = ed.state;
    const isImageSelected =
      selection instanceof NodeSelection && selection.node.type.name === "image";

    // Posição a usar: a imagem selecionada tem prioridade; caso contrário,
    // usa a imagem sob o mouse (hover).
    const pos = isImageSelected ? selection.from : hoveredImagePosRef.current;

    // Enquanto o popover está aberto, mantém a posição (o foco sai do editor
    // quando o usuário interage com o popover).
    if (pos == null) {
      if (imageMenuOpen) return;
      setImageMenuPos(null);
      imageMenuPosRef.current = null;
      return;
    }

    const next = computeImageMenuPosition(ed, pos);
    if (!next) {
      // A imagem sob o mouse pode ter sido removida; limpa o hover.
      if (!isImageSelected) hoveredImagePosRef.current = null;
      setImageMenuPos(null);
      imageMenuPosRef.current = null;
      return;
    }

    imageMenuPosRef.current = pos;
    // Só atualiza o estado quando a posição realmente muda (evita re-renders
    // e recriação do ResizeObserver a cada frame durante o arraste).
    setImageMenuPos((prev) =>
      prev && prev.top === next.top && prev.left === next.left ? prev : next,
    );
  }, [editor, imageMenuOpen]);

  // Reposiciona o menu da imagem a cada mudança de seleção/transação e em
  // scroll/resize (a imagem pode se mover, ex.: ao redimensionar).
  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", updateImageMenuPosition);
    editor.on("transaction", updateImageMenuPosition);
    window.addEventListener("scroll", updateImageMenuPosition, true);
    window.addEventListener("resize", updateImageMenuPosition);
    // Executa uma vez para capturar uma seleção já existente.
    updateImageMenuPosition();
    return () => {
      editor.off("selectionUpdate", updateImageMenuPosition);
      editor.off("transaction", updateImageMenuPosition);
      window.removeEventListener("scroll", updateImageMenuPosition, true);
      window.removeEventListener("resize", updateImageMenuPosition);
    };
  }, [editor, updateImageMenuPosition]);

  // Fecha o menu da imagem ao clicar fora dele.
  useEffect(() => {
    if (!imageMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (imageMenuButtonRef.current?.contains(target)) return;
      const popover = document.getElementById(IMAGE_MENU_ID);
      if (popover?.contains(target)) return;
      setImageMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [imageMenuOpen]);

  // O botão de três pontos acompanha o tamanho da imagem em TEMPO REAL:
  // durante o arraste das alças o NodeView altera o `style.width/height` do
  // elemento <img> diretamente (sem emitir transação). Um `ResizeObserver`
  // sobre a imagem selecionada reposiciona o botão a cada mudança de tamanho.
  useEffect(() => {
    if (!editor) return;
    const { selection } = editor.state;
    const isImageSelected =
      selection instanceof NodeSelection &&
      selection.node.type.name === "image";
    if (!isImageSelected) return;

    const dom = editor.view.nodeDOM(selection.from);
    if (!(dom instanceof HTMLElement)) return;

    // Observa o `<img>` interno (que muda de tamanho no arraste) e, por
    // segurança, também o container pai (caso a altura/tamanho dele mude).
    const observer = new ResizeObserver(() => updateImageMenuPosition());
    observer.observe(dom);
    const imgEl = dom.querySelector("img");
    if (imgEl) observer.observe(imgEl);
    return () => observer.disconnect();
  }, [editor, imageMenuPos, updateImageMenuPosition]);

  // Marca montagem no cliente (evita conteudo no SSR).
  useEffect(() => setMounted(true), []);

  // Limpa timers ao desmontar.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!editor) return null;

  /** Solicita uma URL e aplica/remove o link sobre a seleção atual. */
  const promptForLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link:", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  };

  /** Insere a imagem (URL pública) na posição atual do cursor. */
  const insertImage = (src: string, alt?: string) => {
    if (!src) return;
    editor.chain().focus().setImage({ src, alt }).run();
  };

  /** Remove a imagem atualmente selecionada (opção do menu de três pontos). */
  const deleteSelectedImage = () => {
    const pos = imageMenuPosRef.current;
    const { selection } = editor.state;
    const isImageSelected =
      selection instanceof NodeSelection && selection.node.type.name === "image";

    if (isImageSelected) {
      // Remove o nó de imagem selecionado e restaura o cursor.
      editor.chain().focus().deleteSelection().run();
    } else if (pos != null) {
      // Fallback: apaga o nó exatamente na posição guardada.
      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + 1 })
        .run();
    }

    setImageMenuOpen(false);
    setImageMenuPos(null);
    imageMenuPosRef.current = null;
  };

  /** Faz upload do arquivo escolhido no Supabase Storage e insere a imagem. */
  const handleFileSelected = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const { url } = await uploadPageImage(file);
      insertImage(url, file.name);
      setMenuOpen(false);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Falha ao enviar a imagem.",
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /**
   * Insere uma tabela (bloco `table` do `TableKit`) na posição atual do cursor,
   * com o número de linhas/colunas escolhido e uma linha de cabeçalho opcional.
   */
  const insertTable = (rows: number, cols: number, withHeaderRow: boolean) => {
    const safeRows = Math.max(1, Math.min(20, Math.floor(rows)));
    const safeCols = Math.max(1, Math.min(12, Math.floor(cols)));
    editor
      .chain()
      .focus()
      .insertTable({ rows: safeRows, cols: safeCols, withHeaderRow })
      .run();
  };

  /**
   * Insere um bloco de código (`codeBlock` do `StarterKit`) na posição atual do
   * cursor, transformando o parágrafo em bloco monoespaçado. A linguagem vazia
   * ("Texto puro") não emite a classe `language-xxx`.
   */
  const insertCodeBlock = (language: string) => {
    editor
      .chain()
      .focus()
      .setCodeBlock(language ? { language } : undefined)
      .run();
  };

  /**
   * Executa um comando de tabela devolvendo o foco ao editor (os botões do
   * popover/menu desviam o foco para fora da área editável).
   */
  const runTableCommand = (run: () => void) => {
    editor.chain().focus().run();
    run();
  };

  /**
   * Move o cursor para a célula na linha/coluna de grid indicadas (base 0) da
   * tabela ativa, usando o `TableMap` (robusto a células mescladas). Wrapper do
   * helper compartilhado que atua sobre o `editor` do componente.
   */
  const moveCursorToCell = (row: number, col: number) =>
    setCursorAtGridCell(editor, row, col);

  /**
   * Insere uma nova linha ACIMA ou ABAIXO da linha `index` (base 0) e devolve o
   * foco ao editor. Usado pelo popover das alças de linha.
   */
  const insertRowAt = (index: number, place: "before" | "after") => {
    // Coloca o cursor na primeira célula da linha de referência.
    if (!moveCursorToCell(index, 0)) return;
    runTableCommand(() =>
      place === "before"
        ? editor.chain().addRowBefore().run()
        : editor.chain().addRowAfter().run(),
    );
    setTableHandleMenu(null);
  };

  /**
   * Insere uma nova coluna À ESQUERDA ou À DIREITA da coluna `index` (base 0) e
   * devolve o foco ao editor. Usado pelo popover das alças de coluna.
   */
  const insertColumnAt = (index: number, place: "before" | "after") => {
    // Usa a primeira linha como referência para localizar a coluna.
    if (!moveCursorToCell(0, index)) return;
    runTableCommand(() =>
      place === "before"
        ? editor.chain().addColumnBefore().run()
        : editor.chain().addColumnAfter().run(),
    );
    setTableHandleMenu(null);
  };
  /**
   * Insere uma coluna à direita da ÚLTIMA coluna da tabela, mesmo quando o
   * cursor NÃO está dentro dela (o botão "+" fica fora da tabela). Posiciona o
   * cursor na primeira célula da última coluna (via posição da tabela) e então
   * insere a coluna.
   */
  const insertColumnAfterLast = () => {
    const pos = insertColPos?.tablePos;
    if (pos == null) return;
    const table = editor.state.doc.nodeAt(pos);
    if (!table || table.type.name !== "table") return;
    const map = TableMap.get(table);
    const lastCol = map.width - 1;
    const cellPos = pos + map.positionAt(0, lastCol, table);
    editor.chain().focus().setTextSelection(cellPos + 1).run();
    editor.chain().addColumnAfter().run();
  };
  /**
   * Insere uma linha ABAIXO da última linha da tabela, mesmo quando o cursor
   * NÃO está dentro dela (o botão "+" fica fora da tabela). Posiciona o cursor
   * na primeira célula da última linha (via posição da tabela) e então insere.
   */
  const insertRowAfterLast = () => {
    const pos = insertRowPos?.tablePos;
    if (pos == null) return;
    const table = editor.state.doc.nodeAt(pos);
    if (!table || table.type.name !== "table") return;
    const map = TableMap.get(table);
    const lastRow = map.height - 1;
    const cellPos = pos + map.positionAt(lastRow, 0, table);
    editor.chain().focus().setTextSelection(cellPos + 1).run();
    editor.chain().addRowAfter().run();
  };
  /** Exclui a linha `index` (base 0). Usado pelo popover das alças de linha. */
  const deleteRowAt = (index: number) => {
    if (!moveCursorToCell(index, 0)) return;
    runTableCommand(() => editor.chain().deleteRow().run());
    setTableHandleMenu(null);
  };

  /** Exclui a coluna `index` (base 0). Usado pelo popover das alças de coluna. */
  const deleteColumnAt = (index: number) => {
    if (!moveCursorToCell(0, index)) return;
    runTableCommand(() => editor.chain().deleteColumn().run());
    setTableHandleMenu(null);
  };

  /**
   * Duplica a linha `index` (insere uma cópia logo abaixo). Usa `insertContentAt`
   * na posição logo após o fim da linha de referência.
   */
  const duplicateRowAt = (index: number) => {
    const ed = editor;
    const { $from } = ed.state.selection;
    let tableDepth = -1;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name === "table") {
        tableDepth = depth;
        break;
      }
    }
    if (tableDepth < 0) return;
    const table = $from.node(tableDepth);
    const rowType = table.type.schema.nodes.tableRow;
    const row = (table.content.content as import("@tiptap/pm/model").Node[])
      .filter((n) => n.type === rowType)[index];
    if (!row) return;

    // Reposiciona o cursor na linha de referência e insere a cópia abaixo dela.
    if (!moveCursorToCell(index, 0)) return;
    runTableCommand(() => {
      const tr = ed.state.tr;
      const $pos = tr.doc.resolve(ed.state.selection.from);
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
        if ($pos.node(depth).type === rowType) {
          tr.insert($pos.after(depth), row);
          break;
        }
      }
      ed.view.dispatch(tr);
    });
    setTableHandleMenu(null);
  };

  /**
   * Duplica a coluna `index` reconstruindo a tabela com a célula repetida em
   * cada linha (preserva atributos). Usado pelo popover das alças de coluna.
   */
  const duplicateColumnAt = (index: number) => {
    const ed = editor;
    const { $from } = ed.state.selection;
    let tableDepth = -1;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name === "table") {
        tableDepth = depth;
        break;
      }
    }
    if (tableDepth < 0) return;
    const table = $from.node(tableDepth);
    const tablePos = $from.before(tableDepth);
    const rowType = table.type.schema.nodes.tableRow;

    const newRows: import("@tiptap/pm/model").Node[] = [];
    table.forEach((row) => {
      if (row.type !== rowType) {
        newRows.push(row);
        return;
      }
      const cells = row.content.content as import("@tiptap/pm/model").Node[];
      if (index < 0 || index >= cells.length) {
        newRows.push(row);
        return;
      }
      const copy = [...cells];
      copy.splice(index + 1, 0, cells[index]);
      newRows.push(rowType.create(row.attrs, copy));
    });

    try {
      const next = table.type.create(table.attrs, newRows);
      ed.view.dispatch(
        ed.state.tr.replaceWith(tablePos, tablePos + table.nodeSize, next),
      );
    } catch {
      // Ignora se a tabela não permitir a duplicação (ex.: grid inválido).
    }
    setTableHandleMenu(null);
  };

  /** Fecha o painel de opções da célula. */
  const closeCellMenu = () => {
    setCellMenuPanelOpen(false);
    setCellMenu(null);
  };

  /** Mescla as células selecionadas (via seleção de célula/arraste). */
  const mergeSelectedCells = () => {
    runTableCommand(() => editor.chain().mergeCells().run());
    closeCellMenu();
  };

  /** Divide a célula atual (ou a seleção mesclada). */
  const splitSelectedCell = () => {
    runTableCommand(() => editor.chain().splitCell().run());
    closeCellMenu();
  };

  /** Alterna a linha do cursor entre cabeçalho (`th`) e corpo (`td`). */
  const toggleRowHeader = () => {
    runTableCommand(() => editor.chain().toggleHeaderRow().run());
    closeCellMenu();
  };

  /** Alterna a coluna do cursor entre cabeçalho (`th`) e corpo (`td`). */
  const toggleColumnHeader = () => {
    runTableCommand(() => editor.chain().toggleHeaderColumn().run());
    closeCellMenu();
  };

  /** Aplica alinhamento horizontal à célula atual (mantém o painel aberto). */
  const setCellAlignment = (align: CellAlignment) => {
    runTableCommand(() => editor.chain().setCellAttribute("align", align).run());
  };

  /** Aplica (ou limpa) a cor de fundo da célula atual (mantém o painel aberto). */
  const setCellBackground = (background: string | null) => {
    runTableCommand(() =>
      editor.chain().setCellAttribute("background", background).run(),
    );
  };
  /**
   * Move a linha/coluna arrastada para a posição alvo usando os comandos
   * `moveTableRow`/`moveTableColumn` (registrados na extensão `TableReorder`).
   */
  const commitHandleDrag = () => {
    if (!dragHandle) return;
    const { kind, from, over } = dragHandle;
    setDragHandle(null);
    if (from === over) return;
    runTableCommand(() => {
      if (kind === "row") editor.chain().moveTableRow(from, over).run();
      else editor.chain().moveTableColumn(from, over).run();
    });
  };





  /**
   * Seleciona a imagem clicada (estilo Notion): transforma o clique numa
   * `NodeSelection` sobre o nó de imagem, para que o botão de três pontos e as
   * alças de redimensionamento apareçam.
   */
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const img = target.closest("img");
    if (!img || !editor.view.dom.contains(img)) return;
    try {
      // `posAtDOM(img, 0)` retorna a posição imediatamente ANTES do nó de
      // imagem — exatamente onde `setNodeSelection` deve apontar.
      const pos = editor.view.posAtDOM(img, 0);
      const $pos = editor.state.doc.resolve(pos);
      if ($pos.nodeAfter?.type.name === "image") {
        editor.chain().setNodeSelection(pos).run();
      }
    } catch {
      // Ignora cliques que não resolvem para uma posição válida.
    }
  };

  /**
   * Ao passar o mouse sobre uma imagem, mostra o botão de três pontos do mesmo
   * jeito que ao selecioná-la. Ignora movimentos sobre o próprio botão/popover
   * para não esconder o botão quando o usuário vai clicá-lo.
   */
  const handleImageMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editor) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-image-menu]")) return;

    // Destaca a coluna da tabela sob o mouse (barrinha no topo com a alça).
    const cell = target.closest("td, th") as HTMLTableCellElement | null;
    if (cell && editor.view.dom.contains(cell)) {
      setHoveredColumn((prev) =>
        prev === cell.cellIndex ? prev : cell.cellIndex,
      );
      // Índice da LINHA da célula (para a barrinha vertical à esquerda).
      const row = cell.parentElement as HTMLTableRowElement | null;
      const rowIndex = row ? row.rowIndex : null;
      setHoveredRow((prev) => (prev === rowIndex ? prev : rowIndex));
    } else {
      setHoveredColumn(null);
      setHoveredRow(null);
    }

    const img = target.closest("img");
    if (!img || !editor.view.dom.contains(img)) return;
    try {
      const pos = editor.view.posAtDOM(img, 0);
      const $pos = editor.state.doc.resolve(pos);
      if ($pos.nodeAfter?.type.name === "image") {
        hoveredImagePosRef.current = pos;
        updateImageMenuPosition();
      }
    } catch {
      // Ignora posições inválidas.
    }
  };

  /** Ao sair da imagem (ou do container), esconde o botão de hover. */
  const handleImageMouseLeave = () => {
    setHoveredColumn(null);
    setHoveredRow(null);
    if (hoveredImagePosRef.current == null) return;
    hoveredImagePosRef.current = null;
    updateImageMenuPosition();
  };

  /** Botão compacto do menu flutuante (seleção de texto). */
  const menuButton = (
    label: string,
    icon: React.ReactNode,
    isActive: boolean,
    onRun: () => void,
  ) => (
    <button
      type="button"
      // `onMouseDown` + preventDefault evita que o clique roube o foco/seleção
      // do editor antes do comando ser aplicado.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        isActive && "bg-accent text-foreground",
      )}
    >
      {icon}
    </button>
  );

  const html = editor.getHTML();
  const { done, total } = countTasksFromHtml(html);
  /**
   * Célula ativa (onde está o cursor), em índices DOM (`rowIndex`/`cellIndex`,
   * os mesmos usados pelas alças). Calculado a cada render (o componente
   * re-renderiza a cada transação) para manter as barrinhas da coluna/linha
   * visíveis mesmo sem hover.
   */
  const activeCell = (() => {
    try {
      const { from } = editor.state.selection;
      const dom = editor.view.domAtPos(from).node as Node;
      const el =
        dom instanceof HTMLElement ? dom : dom.parentElement;
      const cell = el?.closest("td, th") as HTMLTableCellElement | null;
      if (!cell) return null;
      const row = cell.parentElement as HTMLTableRowElement | null;
      return row ? { row: row.rowIndex, col: cell.cellIndex } : null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Área editável (montada só no cliente para evitar mismatch de hidratação) */}
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        onMouseOver={handleImageMouseOver}
        onMouseLeave={handleImageMouseLeave}
        className={cn(
          "relative w-full px-1 py-1 text-sm outline-none",
          className ?? "min-h-[280px] flex-1",
        )}
      >
        {mounted ? (
          <>
            {/* Botão "+" flutuante: aparece à esquerda da linha onde está o
                cursor, no estilo do Notion. Abre o popover de inserção. */}
            {plusPos && !menuOpen ? (
              <button
                ref={plusButtonRef}
                type="button"
                aria-label="Inserir bloco"
                title="Inserir imagem"
                // preventDefault mantém o foco/cursor no editor ao clicar.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setUploadError(null);
                  setInsertTab("menu");
                  setMenuOpen(true);
                }}
                className="absolute z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded border bg-popover text-muted-foreground opacity-70 shadow-sm transition-colors hover:bg-accent hover:text-foreground hover:opacity-100"
                style={{ top: plusPos.top, left: PLUS_GUTTER_LEFT }}
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}

            {/* Popover de inserção de blocos (imagem e tabela). */}
            {menuOpen && plusPos ? (
              <div
                ref={popoverRef}
                id={POPOVER_ID}
                role="dialog"
                aria-label="Inserir bloco"
                className="absolute z-30 w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl"
                style={{
                  top: plusPos.top,
                  left: CONTENT_LEFT,
                  // Perto do fim da tela, abre para cima (ancorado pela base).
                  transform: menuFlipUp ? "translateY(-100%)" : undefined,
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">
                    {insertTab === "menu" ? "Inserir bloco" : "Adicionar imagem"}
                  </span>
                  {insertTab !== "menu" ? (
                    <button
                      type="button"
                      onClick={() => setInsertTab("menu")}
                      aria-label="Voltar"
                      title="Voltar"
                      className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      ←
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    aria-label="Fechar"
                    title="Fechar"
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
                      insertTab === "menu" ? "ml-auto" : "ml-1",
                    )}
                  >
                    ×
                  </button>
                </div>

                {/* Menu principal: escolha do tipo de bloco. */}
                {insertTab === "menu" ? (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setInsertTab("image")}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <span className="flex h-5 w-5 flex-none items-center justify-center">
                        <ImageIcon className="h-4 w-4" />
                      </span>
                      <span className="font-medium">Imagem</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        insertTable(
                          TABLE_DEFAULT_ROWS,
                          TABLE_DEFAULT_COLS,
                          TABLE_DEFAULT_HEADER,
                        );
                        setMenuOpen(false);
                        setInsertTab("menu");
                      }}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <span className="flex h-5 w-5 flex-none items-center justify-center">
                        <Table2 className="h-4 w-4" />
                      </span>
                      <span className="font-medium">Tabela</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        insertCodeBlock("");
                        setMenuOpen(false);
                        setInsertTab("menu");
                      }}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <span className="flex h-5 w-5 flex-none items-center justify-center">
                        <Code className="h-4 w-4" />
                      </span>
                      <span className="font-medium">Código</span>
                    </button>
                  </div>
                ) : null}

                {/* Aba: inserir imagem. */}
                {insertTab === "image" ? (
                  <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileSelected(file);
                  }}
                />

                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-4 w-4" />
                      Enviar do computador
                    </>
                  )}
                </button>

                <div className="my-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  ou
                  <span className="h-px flex-1 bg-border" />
                </div>

                <input
                  type="url"
                  placeholder="Cole a URL da imagem"
                  className="h-[30px] w-full rounded-md border bg-background px-3 text-sm outline-none"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const url = e.currentTarget.value.trim();
                    if (!url) return;
                    insertImage(url);
                    setMenuOpen(false);
                  }}
                />

                {uploadError ? (
                  <p className="mt-2 text-xs text-destructive">{uploadError}</p>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    PNG, JPG, WEBP, GIF ou SVG até 5 MB. Armazenado no Supabase
                    Storage.
                  </p>
                )}
                  </>
                ) : null}
              </div>
            ) : null}

            {/* Botão de três pontos no canto superior direito da imagem
                selecionada. Abre o popover de configurações da imagem. */}
            {imageMenuPos && !imageMenuOpen ? (
              <button
                ref={imageMenuButtonRef}
                type="button"
                data-image-menu
                aria-label="Configurações da imagem"
                title="Configurações da imagem"
                // preventDefault mantém a seleção da imagem no editor.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setImageMenuOpen(true)}
                className="absolute z-20 -translate-x-full flex h-6 w-6 items-center justify-center rounded border bg-popover/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
                style={{ top: imageMenuPos.top, left: imageMenuPos.left }}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            ) : null}

            {/* Popover de configurações da imagem (por enquanto: excluir). */}
            {imageMenuOpen && imageMenuPos ? (
              <div
                id={IMAGE_MENU_ID}
                role="dialog"
                data-image-menu
                aria-label="Configurações da imagem"
                className="absolute z-30 w-48 -translate-x-full overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl"
                style={{ top: imageMenuPos.top, left: imageMenuPos.left }}
              >
                <button
                  type="button"
                  onClick={deleteSelectedImage}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-accent"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir imagem
                </button>
              </div>
            ) : null}

            {/* Botão de linguagem no canto superior direito do bloco de código
                sob o cursor. Abre o dropdown de troca de linguagem. */}
            {codeMenuPos && !codeMenuOpen ? (
              <button
                ref={codeMenuButtonRef}
                type="button"
                data-code-menu
                aria-label="Linguagem do bloco de código"
                title="Alterar linguagem"
                // preventDefault mantém o foco/cursor no bloco de código.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setCodeMenuOpen(true)}
                className="absolute z-20 flex -translate-x-full items-center gap-1 whitespace-nowrap rounded border bg-popover/90 px-1.5 py-0.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
                style={{ top: codeMenuPos.top, left: codeMenuPos.left }}
              >
                {codeLanguageLabel(
                  editor.getAttributes("codeBlock").language ?? "",
                )}
                <ChevronDown className="h-3 w-3" />
              </button>
            ) : null}

            {/* Dropdown de seleção de linguagem do bloco de código. */}
            {codeMenuOpen && codeMenuPos ? (
              <div
                id={CODE_MENU_ID}
                role="dialog"
                data-code-menu
                aria-label="Linguagem do bloco de código"
                onMouseDown={(e) => e.preventDefault()}
                className="absolute z-30 max-h-64 w-40 -translate-x-full overflow-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl"
                style={{ top: codeMenuPos.top, left: codeMenuPos.left }}
              >
                {CODE_LANGUAGES.map((lang) => {
                  const current =
                    (editor.getAttributes("codeBlock").language ?? "") ===
                    lang.value;
                  return (
                    <button
                      key={lang.value || "plain"}
                      type="button"
                      onClick={() => {
                        editor
                          .chain()
                          .focus()
                          .updateAttributes("codeBlock", {
                            language: lang.value,
                          })
                          .run();
                        setCodeMenuOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                        current && "font-medium text-foreground",
                      )}
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 flex-none",
                          current ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {lang.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Alças de COLUNA: um botão de 6 pontos acima de cada coluna.
                Clique abre o popover (inserir/excluir/duplicar). Arrastar
                reordena a coluna. Ao passar o mouse sobre QUALQUER célula da
                coluna, aparece uma barrinha no topo dela com a alça. */}
            {tableColHandles.map((h) => {
              // O botão de arrastar aparece ao passar o mouse sobre a barrinha da
              // coluna, e permanece enquanto o menu/arraste está em andamento.
              const showHandle =
                (hoveredHandle?.kind === "col" &&
                  hoveredHandle.index === h.index) ||
                (tableHandleMenu?.kind === "col" &&
                  tableHandleMenu.index === h.index) ||
                (dragHandle?.kind === "col" &&
                  (dragHandle.from === h.index || dragHandle.over === h.index));
              // Barrinha (e sua área de hover) visível quando o mouse está sobre
              // a coluna.
              const showBarArea =
                hoveredColumn === h.index || activeCell?.col === h.index;
              return (
                <div key={`col-${h.index}`}>
                  {showBarArea ? (
                    <>
                      {/* Recorte sem cor na linha de topo da célula (16px,
                          centrado na coluna) para a barrinha não encostar na
                          borda. */}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute z-10 bg-card"
                        style={{
                          top: h.top - 1,
                          left: h.left - 8,
                          width: 16,
                          height: 3,
                        }}
                      />
                      <div
                        // Área de hover (transparente) da barrinha: mais alta
                        // que a linha visível para facilitar o hover; revela a
                        // alça.
                        onMouseEnter={() =>
                          setHoveredHandle({ kind: "col", index: h.index })
                        }
                        onMouseLeave={() => setHoveredHandle(null)}
                        className="absolute z-20 cursor-pointer"
                        style={{
                          top: h.top - 8,
                          // Área de hover da barrinha: 16px de largura,
                          // centralizada na coluna.
                          left: h.left - 8,
                          width: 16,
                          height: 18,
                        }}
                      >
                        <span
                          className={cn(
                            "absolute left-[2px] top-[8px] block rounded-full bg-faint-foreground transition-colors",
                            !showHandle && "hover:bg-foreground/70",
                            showHandle && "opacity-0",
                          )}
                          // Linha colorida: 12px, centralizada (2px sem cor de
                          // cada lado).
                          style={{ height: 2, width: 12 }}
                        />
                      </div>
                    </>
                  ) : null}
                  <button
                    type="button"
                    data-table-handle
                    draggable
                    aria-label={`Opções da coluna ${h.index + 1}`}
                    title="Clique para opções · arraste para mover"
                    // preventDefault mantém o foco/cursor no editor.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() =>
                      setHoveredHandle({ kind: "col", index: h.index })
                    }
                    onMouseLeave={() => setHoveredHandle(null)}
                    onDragStart={() =>
                      setDragHandle({ kind: "col", from: h.index, over: h.index })
                    }
                    onDragOver={(e) => {
                      if (dragHandle?.kind !== "col") return;
                      e.preventDefault();
                      if (dragHandle.over !== h.index) {
                        setDragHandle({ ...dragHandle, over: h.index });
                      }
                    }}
                    onDragEnd={commitHandleDrag}
                    onDrop={(e) => {
                      e.preventDefault();
                      commitHandleDrag();
                    }}
                    onClick={() =>
                      setTableHandleMenu((prev) =>
                        prev && prev.kind === "col" && prev.index === h.index
                          ? null
                          : { ...h, kind: "col" },
                      )
                    }
                    className={cn(
                      "absolute z-20 flex cursor-grab items-center justify-center rounded border bg-popover text-muted-foreground shadow-sm transition-opacity active:cursor-grabbing",
                      showHandle ? "opacity-100" : "pointer-events-none opacity-0",
                      dragHandle?.kind === "col" && dragHandle.over === h.index
                        ? "ring-2 ring-[hsl(var(--table-select))]"
                        : "",
                    )}
                    style={{
                      // Centralizado SOBRE a linha de topo da primeira célula
                      // da coluna.
                      top: h.top,
                      left: h.left,
                      width: TABLE_HANDLE_SIZE,
                      height: TABLE_COL_HANDLE_HEIGHT,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <GripHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}

            {/* Botão "+" para inserir uma coluna à direita da última coluna:
                faixa vertical com a ALTURA da tabela, dentro da margem da
                página. A faixa fica sempre presente como área de hover e se
                revela ao passar o mouse sobre a última coluna OU sobre a
                própria faixa. */}
            {insertColPos && tableColHandles.length > 0 ? (
              <button
                type="button"
                aria-label="Inserir coluna à direita"
                title="Inserir coluna à direita"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setInsertColHover(true)}
                onMouseLeave={() => setInsertColHover(false)}
                onClick={insertColumnAfterLast}
                className={cn(
                  "absolute z-20 flex w-5 items-center justify-center rounded border transition-colors",
                  hoveredColumn === tableColHandles.length - 1 ||
                    insertColHover
                    ? "border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground"
                    : "border-transparent bg-transparent text-transparent",
                )}
                style={{
                  top: insertColPos.top,
                  left: insertColPos.left,
                  height: insertColPos.height,
                }}
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}

            {/* Botão "+" para inserir uma linha ABAIXO da última linha: faixa
                horizontal com a LARGURA da tabela. A faixa fica sempre presente
                como área de hover e se revela ao passar o mouse sobre a última
                linha OU sobre a própria faixa. */}
            {insertRowPos && tableRowHandles.length > 0 ? (
              <button
                type="button"
                aria-label="Inserir linha abaixo"
                title="Inserir linha abaixo"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setInsertRowHover(true)}
                onMouseLeave={() => setInsertRowHover(false)}
                onClick={insertRowAfterLast}
                className={cn(
                  "absolute z-20 flex h-5 items-center justify-center rounded border transition-colors",
                  hoveredRow === tableRowHandles.length - 1 || insertRowHover
                    ? "border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground"
                    : "border-transparent bg-transparent text-transparent",
                )}
                style={{
                  top: insertRowPos.top,
                  left: insertRowPos.left,
                  width: insertRowPos.width,
                }}
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}

            {/* Alças de LINHA: um botão de 6 pontos à esquerda de cada linha.
                Clique abre o popover (inserir/excluir/duplicar). Arrastar
                reordena a linha. Ao passar o mouse sobre qualquer célula da
                linha, aparece uma barrinha vertical à esquerda dela. */}
            {tableRowHandles.map((h) => {
              const active =
                (hoveredHandle?.kind === "row" &&
                  hoveredHandle.index === h.index) ||
                (tableHandleMenu?.kind === "row" &&
                  tableHandleMenu.index === h.index) ||
                (dragHandle?.kind === "row" &&
                  (dragHandle.from === h.index || dragHandle.over === h.index));
              // Barrinha (e área de hover) visível quando o mouse está sobre a
              // linha.
              const showBarArea =
                hoveredRow === h.index || activeCell?.row === h.index;
              const rowHeight = h.height ?? TABLE_HANDLE_SIZE;
              const barLen = Math.min(12, Math.max(6, rowHeight - 4));
              return (
                <div key={`row-${h.index}`}>
                  {showBarArea ? (
                    <>
                      {/* Recorte sem cor na linha esquerda da célula (16px,
                          centrado na linha) para a barrinha não encostar na
                          borda. */}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute z-10 bg-card"
                        style={{
                          left: h.left - 1,
                          top: h.top - 8,
                          width: 3,
                          height: 16,
                        }}
                      />
                      <div
                        // Área de hover (transparente) da barrinha; revela a
                        // alça da linha.
                        onMouseEnter={() =>
                          setHoveredHandle({ kind: "row", index: h.index })
                        }
                        onMouseLeave={() => setHoveredHandle(null)}
                        className="absolute z-20 cursor-pointer"
                        style={{
                          left: h.left - 8,
                          top: h.top - 8,
                          width: 18,
                          height: 16,
                        }}
                      >
                        <span
                          className={cn(
                            "absolute left-[8px] top-[2px] block rounded-full bg-faint-foreground transition-colors",
                            !active && "hover:bg-foreground/70",
                            active && "opacity-0",
                          )}
                          // Linha colorida: 12px (ou menos em linhas baixas),
                          // centralizada (2px sem cor de cada lado).
                          style={{ width: 2, height: barLen }}
                        />
                      </div>
                    </>
                  ) : null}
                  <button
                    type="button"
                    data-table-handle
                    draggable
                    aria-label={`Opções da linha ${h.index + 1}`}
                    title="Clique para opções · arraste para mover"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() =>
                      setHoveredHandle({ kind: "row", index: h.index })
                    }
                    onMouseLeave={() => setHoveredHandle(null)}
                    onDragStart={() =>
                      setDragHandle({ kind: "row", from: h.index, over: h.index })
                    }
                    onDragOver={(e) => {
                      if (dragHandle?.kind !== "row") return;
                      e.preventDefault();
                      if (dragHandle.over !== h.index) {
                        setDragHandle({ ...dragHandle, over: h.index });
                      }
                    }}
                    onDragEnd={commitHandleDrag}
                    onDrop={(e) => {
                      e.preventDefault();
                      commitHandleDrag();
                    }}
                    onClick={() =>
                      setTableHandleMenu((prev) =>
                        prev && prev.kind === "row" && prev.index === h.index
                          ? null
                          : { ...h, kind: "row" },
                      )
                    }
                    className={cn(
                      "absolute z-20 flex cursor-grab items-center justify-center rounded border bg-popover text-muted-foreground shadow-sm transition-opacity active:cursor-grabbing",
                      active ? "opacity-100" : "pointer-events-none opacity-0",
                      dragHandle?.kind === "row" && dragHandle.over === h.index
                        ? "ring-2 ring-[hsl(var(--table-select))]"
                        : "",
                    )}
                    style={{
                      top: h.top,
                      left: h.left,
                      width: TABLE_ROW_HANDLE_WIDTH,
                      height: TABLE_HANDLE_SIZE,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}

            {/* Popover da alça selecionada: inserir linha/coluna antes/depois. */}
            {tableHandleMenu ? (
              <div
                id={TABLE_HANDLE_MENU_ID}
                data-table-handle
                role="dialog"
                aria-label={
                  tableHandleMenu.kind === "col"
                    ? "Opções da coluna"
                    : "Opções da linha"
                }
                className="absolute z-30 w-44 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl"
                style={{
                  top:
                    tableHandleMenu.kind === "col"
                      ? tableHandleMenu.top
                      : tableHandleMenu.top - TABLE_HANDLE_SIZE / 2,
                  left:
                    tableHandleMenu.kind === "col"
                      ? tableHandleMenu.left
                      : tableHandleMenu.left + TABLE_HANDLE_SIZE / 2 + 4,
                  // Coluna: abre centralizado abaixo da alça. Linha: abre à
                  // direita da alça, alinhado ao topo dela.
                  transform:
                    tableHandleMenu.kind === "col"
                      ? "translate(-50%, 100%)"
                      : "translate(0, 0)",
                }}
              >
                {tableHandleMenu.kind === "col" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => insertColumnAt(tableHandleMenu.index, "before")}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Inserir à esquerda
                    </button>
                    <button
                      type="button"
                      onClick={() => insertColumnAt(tableHandleMenu.index, "after")}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <ArrowRight className="h-4 w-4" />
                      Inserir à direita
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateColumnAt(tableHandleMenu.index)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <Copy className="h-4 w-4" />
                      Duplicar coluna
                    </button>
                    <div className="my-1 h-px bg-border" />
                    <button
                      type="button"
                      onClick={() => deleteColumnAt(tableHandleMenu.index)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir coluna
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => insertRowAt(tableHandleMenu.index, "before")}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <ArrowUp className="h-4 w-4" />
                      Inserir acima
                    </button>
                    <button
                      type="button"
                      onClick={() => insertRowAt(tableHandleMenu.index, "after")}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <ArrowDown className="h-4 w-4" />
                      Inserir abaixo
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateRowAt(tableHandleMenu.index)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <Copy className="h-4 w-4" />
                      Duplicar linha
                    </button>
                    <div className="my-1 h-px bg-border" />
                    <button
                      type="button"
                      onClick={() => deleteRowAt(tableHandleMenu.index)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir linha
                    </button>
                  </>
                )}
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={() => {
                    runTableCommand(() => editor.chain().deleteTable().run());
                    setTableHandleMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Eraser className="h-4 w-4" />
                  Excluir tabela

            {/* Botão "⋮" da CÉLULA ativa: abre o menu contextual com
                mesclar/dividir, cabeçalho, alinhamento e cor de fundo. */}
            {cellMenu ? (
              <button
                type="button"
                data-table-cell-menu
                aria-label="Opções da célula"
                title="Opções da célula"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setCellMenuPanelOpen((prev) => !prev)}
                className="absolute z-20 flex h-5 w-5 items-center justify-center rounded text-faint-foreground transition-colors hover:bg-accent hover:text-foreground"
                style={{
                  top: cellMenu.top,
                  left: cellMenu.left,
                  transform: "translate(-100%, 0)",
                }}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            ) : null}

            {/* Painel do menu contextual da célula. */}
            {cellMenu && cellMenuPanelOpen ? (
              <div
                data-table-cell-menu
                role="dialog"
                aria-label="Opções da célula"
                className="absolute z-30 w-52 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl"
                style={{
                  top: cellMenu.top + 22,
                  left: cellMenu.left,
                  transform: "translate(-100%, 0)",
                }}
              >
                <button
                  type="button"
                  onClick={toggleRowHeader}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <Rows3 className="h-4 w-4" />
                  Alternar cabeçalho da linha
                </button>
                <button
                  type="button"
                  onClick={toggleColumnHeader}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <Columns3 className="h-4 w-4" />
                  Alternar cabeçalho da coluna
                </button>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={mergeSelectedCells}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <SquareStack className="h-4 w-4" />
                  Mesclar células
                </button>
                <button
                  type="button"
                  onClick={splitSelectedCell}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <SplitSquareHorizontal className="h-4 w-4" />
                  Dividir célula
                </button>
                <div className="my-1 h-px bg-border" />
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  Alinhamento
                </div>
                <div className="flex items-center gap-1 px-1 pb-1">
                  <button
                    type="button"
                    aria-label="Alinhar à esquerda"
                    onClick={() => setCellAlignment("left")}
                    className="flex h-[30px] flex-1 items-center justify-center rounded transition-colors hover:bg-accent"
                  >
                    <AlignLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Centralizar"
                    onClick={() => setCellAlignment("center")}
                    className="flex h-[30px] flex-1 items-center justify-center rounded transition-colors hover:bg-accent"
                  >
                    <AlignCenter className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Alinhar à direita"
                    onClick={() => setCellAlignment("right")}
                    className="flex h-[30px] flex-1 items-center justify-center rounded transition-colors hover:bg-accent"
                  >
                    <AlignRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="my-1 h-px bg-border" />
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  Cor de fundo
                </div>
                <div className="grid grid-cols-8 gap-1 px-1 pb-1">
                  {CELL_BACKGROUND_PALETTE.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      aria-label={`Cor ${color.label}`}
                      title={color.label}
                      onClick={() => setCellBackground(color.value)}
                      className="h-5 w-5 rounded border transition-transform hover:scale-110"
                      style={{ backgroundColor: color.value }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setCellBackground(null)}
                  className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <Eraser className="h-4 w-4" />
                  Remover cor
                </button>
              </div>
            ) : null}

                </button>
              </div>
            ) : null}

            {/* Menu flutuante de formatação: aparece ao lado do texto selecionado.
                Concentra TODAS as ações que antes ficavam na barra fixa. */}
            <BubbleMenu
              editor={editor}
              options={{ placement: "top", offset: 8 }}
              shouldShow={({ editor: ed, from, to, state }) =>
                ed.isEditable &&
                from !== to &&
                !ed.isActive("codeBlock") &&
                // Não mostrar sobre uma imagem selecionada (tem menu próprio).
                !(state.selection instanceof NodeSelection)
              }
              className="flex flex-wrap items-center gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {menuButton(
                "Negrito (Ctrl+B)",
                <Bold className="h-3.5 w-3.5" />,
                editor.isActive("bold"),
                () => editor.chain().focus().toggleBold().run(),
              )}
              {menuButton(
                "Itálico (Ctrl+I)",
                <Italic className="h-3.5 w-3.5" />,
                editor.isActive("italic"),
                () => editor.chain().focus().toggleItalic().run(),
              )}
              {menuButton(
                "Sublinhado (Ctrl+U)",
                <UnderlineIcon className="h-3.5 w-3.5" />,
                editor.isActive("underline"),
                () => editor.chain().focus().toggleUnderline().run(),
              )}
              {menuButton(
                "Tachado",
                <Strikethrough className="h-3.5 w-3.5" />,
                editor.isActive("strike"),
                () => editor.chain().focus().toggleStrike().run(),
              )}
              <span className="mx-0.5 h-5 w-px bg-border" />
              {menuButton(
                "Título",
                <Heading2 className="h-3.5 w-3.5" />,
                editor.isActive("heading"),
                () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
              )}
              {menuButton(
                "Lista",
                <List className="h-3.5 w-3.5" />,
                editor.isActive("bulletList"),
                () => editor.chain().focus().toggleBulletList().run(),
              )}
              {menuButton(
                "Lista numerada",
                <ListOrdered className="h-3.5 w-3.5" />,
                editor.isActive("orderedList"),
                () => editor.chain().focus().toggleOrderedList().run(),
              )}
              {menuButton(
                "Tarefa",
                <ListChecks className="h-3.5 w-3.5" />,
                editor.isActive("taskList"),
                () => editor.chain().focus().toggleTaskList().run(),
              )}
              {menuButton(
                "Citação",
                <Quote className="h-3.5 w-3.5" />,
                editor.isActive("blockquote"),
                () => editor.chain().focus().toggleBlockquote().run(),
              )}
              {menuButton(
                "Código",
                <Code className="h-3.5 w-3.5" />,
                editor.isActive("code") || editor.isActive("codeBlock"),
                () => editor.chain().focus().toggleCode().run(),
              )}
              <span className="mx-0.5 h-5 w-px bg-border" />
              {menuButton(
                "Link (Ctrl+K)",
                <Link2 className="h-3.5 w-3.5" />,
                editor.isActive("link"),
                promptForLink,
              )}
              {menuButton(
                "Limpar formatação",
                <Eraser className="h-3.5 w-3.5" />,
                false,
                () => editor.chain().focus().unsetAllMarks().run(),
              )}
              <span className="mx-0.5 h-5 w-px bg-border" />
              {menuButton(
                "Desfazer (Ctrl+Z)",
                <Undo2 className="h-3.5 w-3.5" />,
                false,
                () => editor.chain().focus().undo().run(),
              )}
              {menuButton(
                "Refazer (Ctrl+Shift+Z)",
                <Redo2 className="h-3.5 w-3.5" />,
                false,
                () => editor.chain().focus().redo().run(),
              )}
            </BubbleMenu>

            <EditorContent editor={editor} />
          </>
        ) : null}
      </div>

      {/* Rodapé: progresso de tarefas (alinhado ao conteúdo, com a mesma margem) */}
      <div className="flex flex-wrap items-center gap-3 pl-10 pr-10 text-[11px] text-muted-foreground">
        {total > 0 ? (
          <span className={cn(done === total && "text-success")}>
            {done}/{total} concluídas
          </span>
        ) : null}
      </div>
    </div>
  );
}
