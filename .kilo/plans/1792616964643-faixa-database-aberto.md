# Faixa do database aberto acima da tabela (com botão "+" abrindo a paleta de busca)

## Objetivo

Adicionar, **acima da barra de título da tabela**, uma faixa que mostra o
**database aberto** (ícone + nome) e, à direita, um botão **"+"** que abre a
**paleta de busca do Workspace** — o mesmo popover do botão de lupa da sidebar
de projetos (`ProjectsSidebar.tsx`, `ProjectsSearchPopover`).

## Decisões já tomadas

- **Faixa nova** acima da barra de título (o nome já aparece nessa barra, como
  input editável; a duplicação é aceita de propósito).
- **Extração da paleta**: o componente sai de `ProjectsSidebar.tsx` para
  `src/components/database/WorkspaceSearchPopover.tsx` e passa a ser usado pela
  sidebar **e** pela faixa nova (uma única implementação).
- O **"+" abre a paleta** (busca/navegação) — **não** cria database.
- **Fora de escopo**: alterar a barra de título da tabela, mostrar o nome do
  projeto na faixa, atalho de teclado, mudar o conteúdo/comportamento da paleta
  além do posicionamento, mudar a sidebar de projetos.

## Contexto atual (verificado no código)

- **Barra de título da tabela** (`DatabaseView.tsx`, `DatabaseTable`, ~`:3139-3233`):
  `<div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">`
  com o seletor de ícone, o **nome** num `<input aria-label="Título do database">`
  e um chip opcional de database relacionado; à direita: busca da tabela, menu
  "Mais" e configurações.
- **Barra de abas de visualização** logo abaixo (~`:3357`) e a tabela em
  `tableScrollRef` (~`:4107`).
- **Render final do `DatabaseView`** (último `return`): linha flex com
  `<ProjectsSidebar/>`, `<DatabaseTable .../>` (recebe `database={tableDatabase ?? selected}`,
  `viewId={selected.id}`, `linkedDatabaseId`) e `{errorNotice}`.
  `selected` é garantido não nulo nesse ramo.
- **Database efetivo**: `tableDatabase ?? selected` (numa **visão vinculada**,
  `tableDatabase` traz o nome/ícone da visão e o `id` da origem).
- **Paleta** (`ProjectsSidebar.tsx:449`, `ProjectsSearchPopover`): privada do
  arquivo; `role="dialog"`, `aria-label="Buscar no Workspace"`, input com o mesmo
  `aria-label` e `placeholder="Buscar no Workspace"`; navegação por teclado
  (↑/↓/Enter), Esc, clique fora; busca de itens com debounce 250ms e mínimo 2
  caracteres (`searchDatabaseRows`); `SEARCH_SECTION_META` e as constantes
  `ITEM_SEARCH_*` são usadas **só** por ela.
- **Posicionamento atual da paleta** (`:486-496`): `anchorEl.closest("aside") ?? anchorEl`,
  `top = rect.top + 5`, centralizado na viewport, largura 320–560. Na área
  principal não existe `<aside>` ancestral → precisa de um modo próprio.
- **Índice de busca**: `buildWorkspaceIndex({ projects, categories, databases })`
  (`workspace-search.ts`) é montado em `ProjectsSidebar.tsx:1236`. O
  `DatabaseView` já tem `projects`, `categories` e `databases` em estado, e o
  handler de navegação **já existe**: `handleSearchResult` (trata
  projeto/database/coluna/aba/modelo/item).
- **`handleSearchResult`** (no `DatabaseView`): projeto → `setActiveProjectId`;
  database/coluna/aba/modelo/item → `requestOpenDatabase(...)` (o efeito de
  `pendingDatabaseRequest` abre o database e aplica o foco).
- Ícones/ícone do database: `databaseIcon(icon)` (`@/lib/database-icons`).
- Testes: `src/components/database/database-view.test.tsx` renderiza o
  `DatabaseView` com `@/lib/database` e `@/lib/database-recurrence` mockados.
  `vitest.setup.ts` já stuba `ResizeObserver` (jsdom) e faz `cleanup`.

## Tarefas (ordenadas)

### 1. Extrair a paleta — `src/components/database/WorkspaceSearchPopover.tsx` (novo)

Mover **exatamente** o código atual (o arquivo tem alterações não commitadas —
copiar da árvore de trabalho, não reescrever):

- A função `ProjectsSearchPopover` (`ProjectsSidebar.tsx:449-691`), renomeada
  para `WorkspaceSearchPopover` e **exportada**.
- `SEARCH_SECTION_META` (`:423-434`) e as constantes `ITEM_SEARCH_DEBOUNCE_MS` /
  `ITEM_SEARCH_MIN_CHARS` (`:437`, `:440`).

Props (todas obrigatórias exceto `placement`):

```ts
export interface WorkspaceSearchPopoverProps {
  anchorEl: HTMLElement;
  /**
   * "sidebar" (padrão): comportamento atual — centralizado abaixo do header da
   * sidebar. "anchor": abre logo abaixo do âncora, alinhado à direita e preso à
   * viewport (usado pelo botão "+" da área principal).
   */
  placement?: "sidebar" | "anchor";
  query: string;
  onQueryChange: (value: string) => void;
  index: WorkspaceSearchIndex;
  databases: Database[];
  onOpenResult: (result: WorkspaceSearchResult) => void;
  onClose: () => void;
}
```

No `useLayoutEffect` (deps `[anchorEl, placement]`), manter o ramo `"sidebar"`
como está e adicionar:

```ts
if (placement === "anchor") {
  const rect = anchorEl.getBoundingClientRect();
  const width = Math.min(420, window.innerWidth - margin * 2);
  const left = Math.min(
    Math.max(margin, rect.right - width),
    Math.max(margin, window.innerWidth - width - margin),
  );
  setPos({ top: rect.bottom + 6, left, width });
} else { /* atual */ }
```

Importar no novo arquivo: hooks (`useEffect`, `useLayoutEffect`, `useMemo`,
`useRef`, `useState`), `createPortal`, `Search` (lucide), `Input`, `cn`,
`searchDatabaseRows`, `rowTitleOf`, `SEARCH_ITEM_LIMIT`, `itemResultFor`,
`searchWorkspace`, `type WorkspaceSearchIndex`, `type WorkspaceSearchKind`,
`type WorkspaceSearchResult`, `type Database`, e os ícones usados no
`SEARCH_SECTION_META` (`FolderKanban`, `Tags`, `Table2`, `AlignLeft`, `Layers`,
`LayoutTemplate`, `FileText`).

### 2. `src/components/database/ProjectsSidebar.tsx` — usar a paleta extraída

- Remover o componente movido, o `SEARCH_SECTION_META` e as constantes
  `ITEM_SEARCH_*`.
- Importar `WorkspaceSearchPopover` e trocar o uso no render (`:1733`) por
  `<WorkspaceSearchPopover placement="sidebar" ... />` com **os mesmos props**
  (`query`, `onQueryChange`, `index={searchIndex}`, `databases`, `onOpenResult`,
  `onClose`).
- Limpar imports que ficaram órfãos: `searchDatabaseRows` (`:39`), `rowTitleOf`
  (`:41`), `SEARCH_ITEM_LIMIT`, `itemResultFor`, `searchWorkspace` e
  `WorkspaceSearchKind` (`:44-50`). **Manter** `buildWorkspaceIndex`,
  `WorkspaceSearchIndex`, `WorkspaceSearchResult`, `Database`,
  `useLayoutEffect`, `useMemo`, `useRef`, `useState`, `createPortal`, `Search` e
  `Input` (ainda usados por outros popovers/botões do arquivo — conferir cada
  um antes de remover).
- Não alterar `ProjectsSidebarProps` (é consumido por `tools/*.tsx`, que são
  type-checked).

### 3. `src/components/database/OpenDatabaseBar.tsx` (novo) — a faixa

`"use client"`. Componente puro (sem estado global, sem efeitos de rede):

```ts
export interface OpenDatabaseBarProps {
  /** Database aberto (nome/ícone efetivos, já resolvidos pela visão vinculada). */
  database: { name: string; icon: string | null };
  searchIndex: WorkspaceSearchIndex;
  databases: Database[];
  onOpenSearchResult: (result: WorkspaceSearchResult) => void;
}
```

- Estado local: `anchor: HTMLElement | null` e `query: string`.
- Render: `<div className="flex shrink-0 items-center justify-between gap-2 border-b bg-card px-4 py-2">`
  - Esquerda: `databaseIcon(database.icon)` + nome (`min-w-0 truncate`, `text-sm font-medium`).
  - Direita: `Button variant="outline" size="icon"` com `Plus`, `aria-label` e
    `title` = `"Buscar e abrir outro database"`, `onClick={(e) => setAnchor(e.currentTarget)}`.
- Quando `anchor`: `<WorkspaceSearchPopover placement="anchor" .../>` com
  `onOpenResult={(r) => { setAnchor(null); setQuery(""); onOpenSearchResult(r); }}`
  e `onClose={() => { setAnchor(null); setQuery(""); }}`.

### 4. `src/components/database/DatabaseView.tsx` — montar o índice e renderizar a faixa

- Índice (uma vez, memoizado):
  `const workspaceSearchIndex = useMemo(() => buildWorkspaceIndex({ projects, categories, databases }), [projects, categories, databases]);`
  (importar `buildWorkspaceIndex` de `@/components/database/workspace-search`).
- No **render final**, envolver a tabela num contêiner vertical e colocar a
  faixa acima:

```tsx
<div className="flex min-h-0 flex-1 overflow-hidden">
  <ProjectsSidebar ... />
  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <OpenDatabaseBar
      database={tableDatabase ?? selected}
      searchIndex={workspaceSearchIndex}
      databases={databases}
      onOpenSearchResult={handleSearchResult}
    />
    <DatabaseTable ... />
  </div>
  {errorNotice}
</div>
```

- Nada muda em `handleCreate`, `handleSearchResult`, na barra de título ou nos
  outros ramos do render.

### 5. Testes

- **`vitest.setup.ts`**: adicionar stub de `Element.prototype.scrollIntoView`
  (jsdom não implementa) — a paleta chama `el?.scrollIntoView(...)` quando há
  resultado destacado. Stub mínimo, junto do `ResizeObserver`.
- **`src/components/database/workspace-search-popover.test.tsx`** (novo):
  - com `index = buildWorkspaceIndex({ projects: [projeto], categories: [], databases: [] })`
    e `query = "proj"`: mostra a seção "Projetos" e o resultado; clicar chama
    `onOpenResult` com o resultado do projeto;
  - `query = ""`: mostra a dica ("Busque por projetos, databases…");
  - Esc chama `onClose`.
- **`src/components/database/open-database-bar.test.tsx`** (novo):
  - mostra o nome do database e o botão "+" (`aria-label`/`getByRole("button")`);
  - clicar no "+" abre `screen.getByRole("dialog", { name: "Buscar no Workspace" })`;
  - clicar num resultado chama `onOpenSearchResult` e fecha o diálogo.
- **`database-view.test.tsx`** (existente): no caso que abre o primeiro database
  do projeto, acrescentar a asserção de que o **nome aparece na faixa**
  (`await screen.findByText("Tarefas")`) e que o botão "+" existe. Os mocks
  atuais (`@/lib/database`) continuam válidos — a paleta só chama
  `searchDatabaseRows` com ≥2 caracteres.

## Riscos e cuidados

- **Copiar o código da paleta da árvore de trabalho**, não de uma versão mental:
  o arquivo tem alterações não commitadas (busca global) que precisam ser
  preservadas na extração.
- **Imports órfãos**: conferir cada import de `ProjectsSidebar.tsx` após a
  extração (`Input`, `Search`, `createPortal`, `useLayoutEffect` continuam em
  uso por outros popovers/botões).
- **Posicionamento**: manter o ramo `"sidebar"` intacto (a sidebar depende dele);
  o modo `"anchor"` precisa de `clamp` horizontal porque o "+" fica no extremo
  direito da área principal.
- **`tableDatabase ?? selected`**: numa visão vinculada, a faixa deve mostrar o
  nome/ícone da **visão** (o que está aberto), como a barra de título.
- **Layout**: a faixa é `shrink-0` acima da tabela; o `DatabaseTable` continua
  com `flex-1` e rola por dentro. Não mover `errorNotice`.
- **Sem dependências novas**; sem `any`; comentários em pt-BR explicando o
  porquê; strings de UI em pt-BR.
- **Não** alterar `ProjectsSidebarProps` (quebra `tools/*.tsx` no `tsc`).

## Validação

- `npx tsc --noEmit`
- `npm run lint` (esperado: apenas os 2 warnings pré-existentes —
  `DatabaseView.tsx` `exhaustive-deps` e `PageEditor.tsx:726`)
- `npm test` (baseline atual: 18 arquivos / 117 testes; passam a existir 2
  arquivos novos)
- `npm run build`
- Manual (navegador; já existe um `npm run dev` rodando no projeto):
  - abrir um database → a faixa aparece acima da barra de título com ícone +
    nome do database aberto;
  - abrir uma **visão vinculada** → a faixa mostra o nome da visão;
  - clicar no "+" → a paleta abre **abaixo do botão**, alinhada à direita, sem
    sair da viewport; buscar um database/propriedade/item e confirmar que a
    navegação funciona igual à da sidebar;
  - Esc, clique fora e a lupa da sidebar continuam funcionando como antes;
  - conferir alinhamento/altura da faixa em relação à barra de título (light e
    dark).

## Observações

- A alteração exige **edição de código** (arquivos novos e alterações em
  `ProjectsSidebar.tsx`, `DatabaseView.tsx` e `vitest.setup.ts`): precisa de um
  agente com permissão de implementação.
- `tools/*.tsx` e `_patch/` são artefatos antigos type-checked; não mexer.
