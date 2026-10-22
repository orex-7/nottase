# Tela de boas-vindas do Workspace (conta nova sem projetos)

## Objetivo

Hoje, quando a conta é nova e **não há nenhum projeto**, a área principal do
Workspace fica **em branco**: o `DatabaseView` renderiza só a sidebar
(`DatabaseView.tsx:6055`) e a sidebar mostra apenas "Nenhum projeto criado
ainda." Criar um **cartão de boas-vindas** na área principal com ações diretas,
e reusar o mesmo cartão (numa variante) para o caso "projeto ativo, nenhum
database aberto" (hoje uma frase solta, `DatabaseView.tsx:6103`).

## Decisões já tomadas

- **Abordagem**: boas-vindas + ações (nenhum dado é criado sozinho).
- **Botão "Criar database"** (na tela de 0 projetos): abre o
  `CreateDatabasePopover` existente; ao confirmar, garante o projeto padrão
  "Geral" (`ensureDefaultProject`, já embutido em `handleCreate`) e abre o
  database criado.
- **Variante "projeto sem database"**: reusa o **mesmo** cartão, com CTA
  "Criar database" que cria no **projeto ativo**.
- **Saudação**: personalizada com o **primeiro nome** do usuário
  (`userName`, já disponível no `CalendarProvider`).
- **Fora de escopo**: criar dados de exemplo automaticamente, modelos/starters,
  checklist guiado, remover o `ProjectsScreen.tsx` (componente morto).

## Contexto atual (verificado no código)

- Fluxo: `/auth/callback` → `/app` → `CalendarProvider`
  (`src/components/calendar/CalendarProvider.tsx:382`) → `<DatabaseView />`
  (sem props) → `DatabaseView` (`src/components/database/DatabaseView.tsx`).
- `DatabaseView` já carrega `projects`, `categories`, `databases` e tem
  `handleCreateProject` (`:5493`), `handleCreateCategory` (`:5517`),
  `handleCreate(input, pinToSidebar = false, projectId = activeProjectId)`
  (`:5348`). `handleCreate` sem `projectId` chama `ensureDefaultProject()`
  (cria/usa "Geral") e abre o database criado.
- Ramo `!resolvedProjectId` (`:6055`) → sidebar sozinha (área principal vazia).
- Ramo `!selected` (`:6082`) → sidebar + frase "Abra um projeto na barra lateral
  para ver e criar databases." (`:6103`).
- `CreateProjectPopover` (`ProjectsScreen.tsx:481`, `aria-label="Criar projeto"`,
  input `#new-project-name`, submit "Confirmar") e `CreateDatabasePopover`
  (`DatabasesScreen.tsx:292`, `aria-label="Criar database"`, submit "Criar").
- O estilo de estado vazio existente está em `ProjectsScreen.tsx:122-137`
  (card tracejado, ícone em círculo `bg-muted`, título, descrição, `Button`).
- `CreateDatabasePopover` hoje **sempre** ancora na `<aside>` (posição do
  popover da sidebar) — precisa de um modo alternativo para ser usado na área
  principal.
- Testes de componente usam `@testing-library/react` (`render`/`screen`/
  `fireEvent`); não há `user-event`.

## Tarefas (ordenadas)

### 1. `CreateDatabasePopover` — prop de posicionamento

Arquivo: `src/components/database/DatabasesScreen.tsx` (`CreateDatabasePopover`).

- Adicionar prop opcional `placement?: "sidebar" | "anchor"` (default
  `"sidebar"`, preservando o comportamento atual do popover do projeto).
- No `useLayoutEffect` (deps `[anchorEl, placement]`):
  - `"sidebar"`: comportamento atual (`anchorEl.closest("aside") ?? anchorEl`,
    `top = rect.top + 5`, `left` centralizado, largura 320–560).
  - `"anchor"`: abre **abaixo** do âncora, alinhado à esquerda e mantido dentro
    da viewport, largura 320 (comportamento anterior à mudança de posição):
    `top = rect.bottom + 6`,
    `left = clamp(margin, rect.left, innerWidth - 320 - margin)`.

### 2. Novo componente `src/components/database/WorkspaceEmptyState.tsx`

`"use client"`. Cartão centralizado na área principal, no estilo do estado vazio
de `ProjectsScreen.tsx:122-137` (`mx-auto max-w-md`, borda tracejada, ícone em
círculo `bg-muted`, título, descrição, `Button size="sm"`).

Props:

```ts
export interface WorkspaceEmptyStateProps {
  /** Nome do usuário (saudação com o primeiro nome). Opcional. */
  userName?: string;
  variant: "no-projects" | "no-database";
  /** Categorias para o popover de criação de projeto. */
  categories: ProjectCategory[];
  /** Databases existentes (opção "Espelhar database…" do popover de database). */
  databases: Database[];
  /** Nome do projeto ativo (só na variante `no-database`). */
  projectName?: string;
  onCreateProject: (input: NewProjectInput) => void;
  onCreateCategory: (name: string) => void;
  onCreateDatabase: (input: NewDatabaseInput) => void;
}
```

- Estado local: `projectAnchor: HTMLElement | null`,
  `databaseAnchor: HTMLElement | null`.
- `variant === "no-projects"`:
  - Título: `Bem-vindo, {primeiroNome}` (ou "Bem-vindo ao seu Workspace" quando
    `userName` estiver vazio). Primeiro nome: `userName?.trim().split(/\s+/)[0]`.
  - Descrição curta (pt-BR): organiza itens em databases dentro de projetos.
  - Botões: **"Criar meu primeiro projeto"** (primário) e **"Criar database"**
    (outline).
- `variant === "no-database"`:
  - Título: "Nenhum database aberto".
  - Descrição: escolher um database na barra lateral ou criar um novo
    (menciona `projectName` quando informado).
  - Botão único: **"Criar database"**.
- Popovers (portais, ancorados aos respectivos botões):
  - `CreateProjectPopover` com `categories`, `onCreateCategory`; `onConfirm` →
    `onCreateProject(input)` e fecha.
  - `CreateDatabasePopover` com `databases` e `placement="anchor"`;
    `onConfirm` → `onCreateDatabase(input)` e fecha.
- Não criar estado global; nenhum efeito colateral além dos callbacks.

### 3. `DatabaseView` — prop `userName` e uso do cartão

Arquivo: `src/components/database/DatabaseView.tsx`.

- `export function DatabaseView({ userName }: { userName?: string })` (prop
  opcional; único consumidor é o `CalendarProvider`).
- Ramo `!resolvedProjectId` (`:6055`): após a sidebar, renderizar
  `<WorkspaceEmptyState variant="no-projects" userName={userName}
  categories={categories} databases={databases}
  onCreateProject={handleCreateProject}
  onCreateCategory={handleCreateCategory}
  onCreateDatabase={(input) => void handleCreate(input)} />`.
- Ramo `!selected` (`:6082`): substituir o `<div>` de aviso por
  `<WorkspaceEmptyState variant="no-database" userName={userName}
  projectName={projects.find((p) => p.id === resolvedProjectId)?.name}
  categories={categories} databases={databases}
  onCreateProject={handleCreateProject}
  onCreateCategory={handleCreateCategory}
  onCreateDatabase={(input) => void handleCreate(input)} />`.
- `handleCreate(input)` usa o `projectId` padrão (`activeProjectId`): no ramo
  `!resolvedProjectId` é `null` → `ensureDefaultProject()` cria/usa "Geral"; no
  ramo `!selected` é o projeto ativo. **Nenhuma mudança em `handleCreate`.**

### 4. `CalendarProvider` — passar o nome

Arquivo: `src/components/calendar/CalendarProvider.tsx:382`.

- Trocar `<DatabaseView />` por `<DatabaseView userName={userName} />`.

### 5. Teste do componente

Novo: `src/components/database/workspace-empty-state.test.tsx` (padrão
`fireEvent` + `screen`, como `RelationCell.test.tsx`).

- `no-projects` com `userName="Lucas Silva"`: mostra "Bem-vindo, Lucas".
- `no-projects` sem `userName`: mostra o título genérico.
- Clicar em "Criar meu primeiro projeto" abre o diálogo "Criar projeto";
  preencher `#new-project-name` e submeter ("Confirmar") chama `onCreateProject`
  com `{ name, category: null, color }`.
- `no-database` com `projectName="Trabalho"`: mostra o nome do projeto; clicar
  em "Criar database" abre o diálogo "Criar database"; submeter ("Criar") chama
  `onCreateDatabase`.

## Riscos e cuidados

- **Não** alterar o posicionamento padrão (`"sidebar"`) do
  `CreateDatabasePopover` — o popover do projeto depende dele.
- `handleCreate` fixa o database na sidebar do calendário apenas com
  `pinToSidebar = true`; manter `false` (comportamento atual do fluxo de
  criação pela tela).
- O cartão só aparece com `loading === false` (o ramo de carregamento retorna
  antes).
- Sem `user-event` no projeto: usar `fireEvent`.
- Os popovers são portais (`document.body`); nos testes, `screen` os encontra.
- Não introduzir dependências novas.

## Validação

- `npx tsc --noEmit`
- `npm run lint` (esperado: apenas os 2 warnings pré-existentes:
  `DatabaseView.tsx` `exhaustive-deps` e `PageEditor.tsx:726`)
- `npm test` (baseline: 16 arquivos / 110 testes)
- `npm run build`
- Manual (navegador): conta sem projetos → cartão de boas-vindas com o nome;
  "Criar meu primeiro projeto" cria e entra no projeto → aparece a variante
  "Nenhum database aberto"; "Criar database" (em ambas as variantes) abre o
  popover e, ao confirmar, abre o database (com 0 projetos, cria o "Geral");
  conferir que a sidebar e o popover do projeto continuam funcionando.

## Observações

- Este plano exige **implementação** (arquivos de código): trocar para um agente
  com permissão de edição.
- `src/components/database/ProjectsScreen.tsx` (componente `ProjectsScreen`) e
  `DatabasesScreen.tsx` (componente `DatabasesScreen`) seguem **mortos** no app
  (mantidos apenas porque `tools/*.tsx` os importam); não fazem parte deste
  escopo.
