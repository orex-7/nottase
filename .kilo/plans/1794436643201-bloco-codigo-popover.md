# Plano: bloco de código no popover "Inserir bloco" da página

## Objetivo

Adicionar uma opção **"Código"** no popover de inserir bloco (botão `+`) do `PageEditor`,
permitindo inserir um bloco de código de programação, com seleção de linguagem no
formulário de inserção e troca de linguagem depois de inserido (dropdown no próprio bloco,
estilo Notion). Sem coloração real de sintaxe (sem novas dependências).

## Decisões já tomadas

- **Sem highlight real**: bloco monospace com fundo, sem `lowlight`/`highlight.js`. Nenhuma
  dependência nova.
- **Seletor de linguagem em dois lugares**: no formulário de inserção e num dropdown no
  canto do bloco já inserido.
- Reutilizar o `codeBlock` **já registrado pelo `StarterKit`** (não declarar extensão
  duplicada — o objeto `StarterKit.configure({...})` já está em `PageEditor.tsx:295`).
- UI em pt-BR com acentuação correta; identificadores em inglês.

## Contexto do código (verificado)

- `src/components/database/PageEditor.tsx` (~1993 linhas) — editor TipTap/ProseMirror.
- `StarterKit.configure({...})` em `PageEditor.tsx:295-302` já inclui `codeBlock`
  (v3). Comandos disponíveis: `editor.commands.setCodeBlock({ language })` e
  `toggleCodeBlock({ language })` (ver `node_modules/@tiptap/extension-code-block/dist/index.d.ts`).
- Opção relevante do `CodeBlock`: `languageClassPrefix` (padrão `"language-"`),
  `defaultLanguage`, `enableTabIndentation`, `tabSize`. A linguagem é gravada no HTML
  como `class="language-xxx"` em `<pre><code>`, o que persiste entre edições/saves
  (o conteúdo é salvo como HTML — ver `PageEditor.tsx:354-364`).
- Popover de inserção: `PageEditor.tsx:1195-1361`, controlado por `insertTab`
  (`"menu" | "image" | "table"`, ver `PageEditor.tsx:243`) e por `menuOpen`.
- Menu principal do popover (lista Imagem/Tabela): `PageEditor.tsx:1246-1279`.
- Cabeçalho/ícone/título do popover por aba: `PageEditor.tsx:1207-1243`.
- `updatePlusPosition` (`PageEditor.tsx:397-419`) já **esconde o `+` quando o cursor está
  dentro de um `codeBlock`** (`ed.isActive("codeBlock")`) — comportamento desejado,
  apenas confirmar que continua válido.
- Bubbles de formatação já ignoram codeBlock (`BubbleMenu shouldShow`,
  `PageEditor.tsx:1784-1790`).
- CSS existente para código: `.tiptap-content pre` e `.tiptap-content pre code` em
  `src/app/globals.css:207-216`; `code` inline em `globals.css:200-206`.
- Ícones `lucide-react` já importados em `PageEditor.tsx:4-39` (há `Code`, `Table2`,
  `ImageIcon`, etc.). Será necessário um ícone de "chevron" (ex.: `ChevronDown`) que
  **ainda não está importado**.
- Persistência: `onChange` → autosave em `DatabaseView.tsx` (não muda).

## Implementação

### 1. Ícone e constante
- Em `PageEditor.tsx`, importar `ChevronDown` (e, se necessário, `Check`) de `lucide-react`
  no bloco de imports existente (`PageEditor.tsx:4-39`).
- Adicionar constante com a lista de linguagens suportadas, próxima às demais constantes
  do topo (perto de `POPOVER_ID`, `PageEditor.tsx:70-83`):

  ```ts
  /** Linguagens oferecidas no seletor do bloco de código (rótulo + valor). */
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
  ```

  (Sem highlight real, o `value` serve só como rótulo persistido — mantém compatibilidade
  futura caso se adote lowlight.)

### 2. Estado do popover
- Estender o union de `insertTab` (`PageEditor.tsx:243`) para
  `"menu" | "image" | "table" | "code"`.
- Adicionar estado da linguagem escolhida no formulário:
  `const [codeLanguage, setCodeLanguage] = useState("");` (perto de `tableRows` etc.,
  `PageEditor.tsx:234-243`).

### 3. Handler de inserção
- Adicionar, junto de `insertTable` (`PageEditor.tsx:865-873`), um handler:

  ```ts
  /** Insere um bloco de código na posição atual do cursor. */
  const insertCodeBlock = (language: string) => {
    editor
      .chain()
      .focus()
      .setCodeBlock(language ? { language } : undefined)
      .run();
  };
  ```

  `setCodeBlock` transforma o bloco atual (parágrafo) em `codeBlock`, preservando a
  posição do cursor — consistente com os demais inseridores.

### 4. Cabeçalho do popover
- Em `PageEditor.tsx:1207-1243`, incluir o caso `insertTab === "code"`:
  - Ícone: reutilizar `Code` (já importado).
  - Título: `"Adicionar bloco de código"`.
  - O botão "Voltar" já é renderizado para `insertTab !== "menu"` (cobre o novo caso);
    ao voltar, resetar `setInsertTab("menu")` (comportamento atual).

### 5. Item no menu principal
- Em `PageEditor.tsx:1246-1279`, adicionar um terceiro botão (mesmo padrão visual dos
  itens Imagem/Tabela):

  ```tsx
  <button
    type="button"
    onClick={() => setInsertTab("code")}
    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
  >
    <span className="flex h-7 w-7 flex-none items-center justify-center rounded border bg-background">
      <Code className="h-4 w-4" />
    </span>
    <span className="flex flex-col leading-tight">
      <span className="font-medium">Código</span>
      <span className="text-[11px] text-muted-foreground">
        Bloco de código com linguagem
      </span>
    </span>
  </button>
  ```

### 6. Aba "Código" (formulário de inserção)
- Adicionar, após a aba de tabela (`PageEditor.tsx:1282-1296`), um bloco:

  ```tsx
  {insertTab === "code" ? (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Linguagem
        <select
          value={codeLanguage}
          onChange={(e) => setCodeLanguage(e.currentTarget.value)}
          className="h-[30px] w-full rounded-md border bg-background px-2 text-sm text-foreground outline-none"
        >
          {CODE_LANGUAGES.map((lang) => (
            <option key={lang.value || "plain"} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          insertCodeBlock(codeLanguage);
          setMenuOpen(false);
          setInsertTab("menu");
        }}
      >
        <Code className="h-4 w-4" />
        Inserir bloco de código
      </Button>
    </div>
  ) : null}
  ```

  Usar o `Button` do shadcn (já importado, `PageEditor.tsx:52`) ou replicar o estilo do
  botão "Enviar do computador" (`PageEditor.tsx:1312-1329`) para consistência. Escolher
  **uma** das duas e manter o restante do popover como está.

### 7. Dropdown de linguagem dentro do bloco já inserido
Decisão: trocar a linguagem depois de inserido, sem depender de NodeView React (não há
NodeView no projeto hoje — evita complexidade nova). Abordagem: um botão flutuante
"linguagem" ancorado ao **bloco de código sob o cursor**, no mesmo padrão do botão `+`
e do menu da imagem/da célula.

- Reaproveitar o padrão de posicionamento flutuante já usado por `plusPos`
  (`PageEditor.tsx:205-210`, `397-419`). Adicionar estado:

  ```ts
  const [codeMenuPos, setCodeMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [codeMenuOpen, setCodeMenuOpen] = useState(false);
  ```

- Criar `updateCodeMenuPosition` (análogo a `updatePlusPosition`): quando
  `editor.isActive("codeBlock")` e o editor está focado, calcular a posição do início do
  bloco (`coordsAtPos(start + 1)`) e posicionar o botão no canto superior direito do
  `<pre>` (usar `editor.view.nodeDOM` do nó `codeBlock` para ancorar no DOM real, como já
  é feito para a tabela em `PageEditor.tsx:473-494`). Quando **não** estiver em `codeBlock`,
  esconder o botão (mas manter aberto enquanto `codeMenuOpen` — mesma proteção de foco
  usada em `updatePlusPosition`, `PageEditor.tsx:400-407`).
- Registrar `updateCodeMenuPosition` nos mesmos eventos de `updatePlusPosition`
  (`PageEditor.tsx:422-438`): `selectionUpdate`, `transaction`, `focus`, `blur` + `scroll`
  (capture) + `resize`. Alternativamente, chamar dentro do `onTransaction` via um ref
  espelho (padrão `updateTableHandlesRef`, `PageEditor.tsx:286-290`) para evitar um segundo
  conjunto de listeners. **Preferir** reaproveitar os listeners existentes adicionando a
  chamada dentro do mesmo `useEffect`.
- Fechar ao clicar fora: incluir um id (ex.: `CODE_MENU_ID = "page-editor-code-menu"`) e
  adicionar a verificação no handler de clique-fora já existente
  (`PageEditor.tsx:639-660`), tratando o popover como "dentro". Botão de três pontos / botão
  de linguagem deve usar `data-code-menu` para o clique-fora, seguindo o padrão da imagem
  (`imageMenuButtonRef`, `PageEditor.tsx:750-755`).
- Renderizar:
  - Botão flutuante (aparece quando o cursor está num `codeBlock` e `!codeMenuOpen`),
    rotulado com a linguagem atual (ex.: `JavaScript` ou "Texto puro"), usando `ChevronDown`.
    `onMouseDown={(e) => e.preventDefault()}` para não perder a seleção.
  - Popover (quando `codeMenuOpen`): lista de `CODE_LANGUAGES`; ao escolher, executar:

    ```ts
    editor.chain().focus().updateAttributes("codeBlock", { language: lang.value }).run();
    ```

    e fechar o popover.
- Reset/limpeza: ao trocar de bloco ou sair do `codeBlock`, limpar `codeMenuPos`.

> Observação de risco: `updateAttributes("codeBlock", { language })` funciona com a
> extensão `CodeBlock` do StarterKit, cujo atributo é `language`. Validar em execução; se
> o atributo não atualizar o HTML, usar como fallback reconstruir via
> `setCodeBlock({ language })` no bloco atual.

### 8. CSS do bloco de código
- O CSS atual (`.tiptap-content pre`, `globals.css:207-216`) já estiliza o bloco
  (fundo `muted`, `rounded`, `overflow-x: auto`). Adicionar, se necessário, apenas:
  - `font-family: ui-monospace, ...` no `pre` (o `code` inline já tem; conferir se o `pre`
    herda) e
  - `white-space: pre` / `tab-size` opcional.
- Não introduzir cores de token (sem highlight). Manter alterações mínimas e localizadas
  no bloco `.tiptap-content pre`.

### 9. Atalhos de teclado e input rules
- O `codeBlock` do StarterKit já oferece: input por ``` ``` ``` (backticks) e saída com
  Enter triplo / seta — nada a fazer.
- Considerar (opcional, fora do escopo mínimo) habilitar `enableTabIndentation: true` e
  `tabSize` via `StarterKit.configure({ codeBlock: { enableTabIndentation: true, tabSize: 2 } })`
  em `PageEditor.tsx:295-302`. Se habilitado, validar que Tab não "escapa" do editor.
  Marcar como decisão explícita do implementador; **recomendado deixar como está** para
  minimizar risco de regressão no foco/atalhos.

## Arquivos afetados

- `src/components/database/PageEditor.tsx` — principal: constante de linguagens, estado,
  handlers, item de menu, aba de inserção, dropdown in-block, clique-fora.
- `src/app/globals.css` — ajuste cosmético opcional do `pre` (monospace).

Nenhuma migração/DB, nenhum novo pacote, nenhuma rota de API.

## Validação

Comandos (ver `AGENTS.md`):

1. `npx tsc --noEmit` — sem erros de tipo.
2. `npm run lint` — sem novos erros (as 2 warnings pré-existentes em
   `DatabaseView.tsx`/`PageEditor.tsx` podem permanecer).
3. `npm test` — suíte existente continua passando (`src/lib/number-format.test.ts`).
4. `npm run build` — build de produção conclui.

Verificação manual (dev server `npm run dev`, rota `/app`, abrir uma página):

- Botão `+` → "Inserir bloco" → item "Código" aparece.
- Aba "Código": seletor de linguagem lista todas as opções; inserir cria um bloco
  monoespaçado com o cursor dentro.
- Com o cursor no bloco, aparece o botão de linguagem no canto; trocar a linguagem
  atualiza o rótulo e persiste após autosave + reload (a classe `language-xxx` sobrevive
  no HTML salvo).
- Clicar fora fecha o dropdown sem alterar o bloco.
- `+` **não** aparece quando o cursor já está dentro do `codeBlock` (comportamento atual
  preservado, `PageEditor.tsx:400`).
- BubbleMenu de formatação **não** aparece sobre o bloco de código.
- Inserir código não quebra os fluxos de Imagem/Tabela nem o clique-fora existentes.

## Riscos e mitigação

- **Conflito de listeners flutuantes**: adicionar novos `editor.on(...)` para o botão de
  código pode duplicar handlers. Mitigar reaproveitando o `useEffect` de
  `updatePlusPosition` (`PageEditor.tsx:422-438`) e um ref espelho (padrão
  `updateTableHandlesRef`).
- **Atributo `language` via `updateAttributes`**: validar em execução; fallback com
  `setCodeBlock({ language })`.
- **Escopo**: alterar apenas o necessário; não tocar em `DatabaseView.tsx` nem refatorar o
  popover. Manter o padrão de fechamento (`setMenuOpen(false)` + `setInsertTab("menu")`).
- **NodeView React**: evitado de propósito (projeto não usa NodeView hoje). A abordagem
  flutuante é consistente com `+`/imagem/célula.

## Pendências / decisões abertas

- Escolher entre `Button` shadcn e replicar o estilo do botão de upload no formulário da
  aba Código (ambos aceitáveis; manter consistência visual).
- Opcional: habilitar `enableTabIndentation` (recomendado manter desabilitado nesta
  entrega).
