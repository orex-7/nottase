# Organizar o topo da sidebar de projetos (ações compactas)

## Objetivo

No topo da `ProjectsSidebar` há **três linhas de largura total** empilhadas:
"Novo projeto" (com texto), a **lupa** ("Buscar no Workspace") e as **Tags**
("Gerenciar categorias"). As duas últimas são **só ícone**, então renderizam
como linhas quase vazias e se confundem com itens da lista de projetos.

Meta: manter "Novo projeto" como linha com texto (ação principal) e mover a
**lupa** e as **Tags** para ícones na linha do rótulo "Projetos", ao lado do
botão minimizar. Incluir também a lupa no **rail minimizado** e deixar o
cabeçalho **fixo** ao rolar a lista.

## Decisões já tomadas

- **Híbrido**: só a lupa e as Tags viram ícones; "Novo projeto" continua como
  linha com texto.
- **Rail minimizado**: ganha o ícone da lupa (hoje tem expandir, `+` e Tags).
- **Cabeçalho fixo** (sticky) ao rolar a lista de projetos.
- **Fora de escopo**: mudar a lista de projetos/categorias, mostrar databases
  dentro dos projetos, mudar a sidebar do calendário, alterar os popovers de
  busca/categorias/criação, mudar o comportamento do drag & drop.

## Contexto atual (verificado no código)

Arquivo único afetado: `src/components/database/ProjectsSidebar.tsx`.

- **Rótulo + minimizar** (`:1326-1341`): `<div className="mb-0.5 flex items-center justify-between px-1">`
  com o `<span>` "Projetos" (ícone `FolderKanban` + texto) e o botão
  `PanelLeftClose` (`aria-label="Minimizar sidebar de projetos"`, `h-6 w-6`).
- **"Novo projeto"** (`:1343-1351`): `<button>` `w-full ... px-2 py-1.5` com
  `Plus` (`h-3.5 w-3.5`) + `<span>Novo projeto</span>`; `onClick={openCreate}`.
- **Lupa** (`:1353-1364`): `<button>` `w-full ... px-2 py-1.5`, `aria-label`/
  `title="Buscar no Workspace"`, `aria-expanded={searchAnchor !== null}`,
  ícone `Search` (`h-3.5 w-3.5`), `onClick={(e) => setSearchAnchor(e.currentTarget)}`.
- **Tags** (`:1366-1374`): `<button>` `w-full ... px-2 py-1.5`, `aria-label`/
  `title="Gerenciar categorias"`, ícone `Tags` (`h-3.5 w-3.5`),
  `onClick={(e) => setCategoriesAnchor(e.currentTarget)}`; **não** tem
  `aria-expanded`.
- **Rail minimizado** (`:1265-1300`): `<aside>` com 3 botões `h-[30px] w-[30px]`
  e ícones `h-4 w-4`: expandir (`PanelLeftOpen`), "Novo projeto" (`Plus`),
  "Gerenciar categorias" (`Tags`). **Não** tem busca.
- **Âncoras dos popovers** (não mudam de posição com esta alteração):
  - `ProjectsSearchPopover` (`:486-496`) posiciona a partir de
    `anchorEl.closest("aside")` — independe do botão exato.
  - `CategoriesManagerPopover` (`:194-207`) abre à **direita** do âncora e cai
    para a esquerda se não couber; o botão continua na borda direita da sidebar,
    então o comportamento se mantém.
- **`aside`** (`:1303-1324`): `flex-col gap-3 overflow-y-auto border-r bg-background/60 p-3`.
- **Nenhum teste** referencia `"Buscar no Workspace"` / `"Gerenciar categorias"` /
  `"Novo projeto"` (verificado por busca no repo) — não há teste a atualizar.
- O `aside` é `hidden ... md:flex`: abaixo de `md` a sidebar não aparece; não há
  trabalho responsivo.

## Tarefas (ordenadas)

Todas em `src/components/database/ProjectsSidebar.tsx`.

### 1. Cabeçalho com as ações (estado expandido)

Substituir o bloco do rótulo (`:1326-1341`) + os botões de lupa (`:1353-1364`)
e Tags (`:1366-1374`) por **uma única seção de cabeçalho**:

- Linha: `<div className="flex items-center justify-between gap-1 px-1">`
  - Esquerda: o `<span>` "Projetos" atual, **sem alteração**.
  - Direita: `<div className="flex items-center gap-0.5">` com, nesta ordem,
    **lupa**, **Tags** e **minimizar** (minimizar continua no extremo direito).
- Os três botões usam a mesma classe base do minimizar
  (`flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground`).
- Ícones: `Search` e `Tags` com `h-3.5 w-3.5` (mesmo tamanho do `Plus` da linha
  "Novo projeto"); manter `PanelLeftClose` com `h-4 w-4`.
- Manter `aria-label` + `title` (tooltips) exatamente como estão
  (`"Buscar no Workspace"`, `"Gerenciar categorias"`, `"Minimizar sidebar de projetos"`).
- **Estado ativo**: quando o popover estiver aberto, aplicar
  `bg-accent text-foreground` no botão. Para isso:
  - lupa: manter `aria-expanded={searchAnchor !== null}`;
  - Tags: **adicionar** `aria-expanded={categoriesAnchor !== null}` (hoje não tem);
  - usar `cn(...)` com a condição (`searchAnchor` / `categoriesAnchor`) para a
    classe ativa.
- Manter os `onClick` atuais (`setSearchAnchor(e.currentTarget)`,
  `setCategoriesAnchor(e.currentTarget)`, `toggleCollapsed`).
- A linha "Novo projeto" (`:1343-1351`) permanece **inalterada** e passa a ser a
  primeira linha do corpo (logo abaixo do cabeçalho), mantendo `openCreate`.

### 2. Cabeçalho fixo (sticky)

Na seção do cabeçalho (o `<section>` que envolve rótulo + ações), aplicar:

- `sticky top-0 z-10 -mx-3 -mt-3 -mb-1` (compensa o `p-3` do `aside` para o
  cabeçalho ficar full-bleed e colado no topo do scrollport) +
  `bg-background px-3 pb-2 pt-3` (fundo **opaco**, para o conteúdo não aparecer
  por baixo ao rolar) + `border-b` (separador sutil).
- Manter o `flex flex-col gap-0.5` da seção.
- Conferir que o `gap-3` do `aside` continua dando o espaçamento entre o
  cabeçalho e a lista de projetos (ajustar o `-mb-1` se ficar largo demais).

### 3. Lupa no rail minimizado

No `<aside>` minimizado (`:1265-1300`), inserir um botão de busca entre
"Novo projeto" (`+`) e "Gerenciar categorias" (Tags), seguindo o mesmo padrão
dos vizinhos (`h-[30px] w-[30px]`, ícone `h-4 w-4`):

- `aria-label`/`title="Buscar no Workspace"`,
  `aria-expanded={searchAnchor !== null}`,
  `onClick={(e) => setSearchAnchor(e.currentTarget)}`, ícone `Search`.

### 4. Revisão de estilos/ordem

- Ordem final do cabeçalho expandido: `Projetos` · lupa · Tags · minimizar.
- Ordem final do rail: expandir · `+` · lupa · Tags.
- Garantir que o cabeçalho **não** capture o drag & drop de projetos: sem
  `onDragOver`/`onDrop` próprios, o evento cai no `aside` (`endProjectDrag`),
  como hoje.

## Riscos e cuidados

- **Sticky dentro de `overflow-y-auto` com `p-3`**: o truque `-mx-3 -mt-3` +
  `bg-background` opaco é o que evita o conteúdo "vazar" atrás do cabeçalho;
  validar visualmente ao rolar (light e dark). Não usar `bg-background/60`
  (transparente) no cabeçalho.
- **Não** mudar a posição dos popovers: a busca ancora na `<aside>` e o de
  categorias na borda direita; mover o botão para a linha do rótulo mantém
  `rect.right` praticamente igual.
- **Acessibilidade**: manter `aria-label` + `title`; adicionar `aria-expanded` ao
  botão das Tags. Ícones sem texto só são aceitáveis por causa do tooltip.
- Não introduzir dependências novas nem mexer em `ProjectsSidebarProps`.
- Não alterar a lógica de `collapsed`, `collapsedGroups`, `orderedIds` ou drag &
  drop.

## Validação

- `npx tsc --noEmit`
- `npm run lint` (esperado: apenas os 2 warnings pré-existentes —
  `DatabaseView.tsx` `exhaustive-deps` e `PageEditor.tsx:726`)
- `npm test` (baseline: 18 arquivos / 117 testes)
- `npm run build`
- Manual (navegador, `npm run dev` já rodando em `C:\dev\calendario`):
  - sidebar expandida: cabeçalho com "Projetos" + lupa + Tags + minimizar, sem
    as duas linhas vazias; "Novo projeto" logo abaixo;
  - clicar na lupa e nas Tags abre os popovers de sempre e o ícone fica com
    estado ativo; tooltips aparecem no hover;
  - rolar a lista de projetos: o cabeçalho permanece no topo sem sobreposição;
  - minimizar: o rail mostra expandir, `+`, lupa e Tags; a lupa abre a busca;
  - arrastar um projeto entre grupos continua funcionando.

## Observações

- A alteração é de UI, em um único arquivo; exige um agente com permissão de
  edição (este plano não implementa código).
