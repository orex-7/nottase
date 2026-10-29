# Estado vazio quando não há database aberto (cartão com "Abrir database")

## Objetivo

Substituir o texto solto `"Escolha um database na barra lateral para abri-lo."`
(ramo `if (!selected)` do `DatabaseView`) por um **cartão de estado vazio**
consistente, com os botões **"Abrir database"** (abre o seletor de databases) e
**"Criar database"**. Além disso, fazer o estado "nenhum database aberto"
**persistir após recarregar** (hoje o primeiro database do projeto reabre).

## Decisões tomadas (com o usuário)

1. **Cartão no estilo do estado vazio atual** (nova variante do
   `WorkspaceEmptyState`), com "Abrir database" + "Criar database".
2. **Respeitar o estado salvo ao recarregar**: se existe navegação salva na
   conta (mesmo vazia), **não** auto-abrir; auto-abrir o primeiro database só
   quando **não há estado salvo** (primeiro uso).
3. "Abrir database" reutiliza o `DatabasePickerPopover` já existente (o mesmo
   seletor do botão "+" da faixa), listando todos os databases do Workspace.
   Filtro por projeto fica fora de escopo.

## Contexto verificado

- Ramo do texto atual: `DatabaseView.tsx`, `if (!selected)` →
  `projectHasDatabases ? <div>Escolha um database…</div> : <WorkspaceEmptyState variant="no-database" />`.
- `WorkspaceEmptyState` (`src/components/database/WorkspaceEmptyState.tsx`) já
  cobre `"no-projects"` e `"no-database"`, com `CreateProjectPopover`/
  `CreateDatabasePopover` (este com `placement="anchor"`).
- `DatabasePickerPopover` (`src/components/database/DatabasePickerPopover.tsx`)
  já existe: `role="dialog"`, `aria-label="Abrir database"`, busca por nome,
  prop `currentDatabaseId` marca/desabilita o aberto.
- Persistência: `workspace_open_databases` (1 linha/usuário) +
  `fetchOpenDatabases()`/`saveOpenDatabases()` em `src/lib/database.ts`.
  `fetchOpenDatabases()` hoje devolve `EMPTY_OPEN_DATABASES` quando **não há
  linha** — o que torna "nunca salvo" indistinguível de "salvo vazio".
- `DatabaseView` já tem `closedAllTabsRef` (impede reabrir depois de fechar a
  última aba) e um efeito que o **reseta quando `resolvedProjectId` muda** —
  isso faria o reload reabrir o primeiro database (a hidratação do store pode
  acontecer depois do load) e precisa sair.
- `handleOpenProject` e o ramo `"project"` de `handleSearchResult` fazem
  `setSelectedId(null)` de propósito, para o auto-open abrir o primeiro database
  do projeto (comportamento atual que deve ser mantido).
- `WorkspaceEmptyState` só é usado pelo `DatabaseView` e pelo seu teste.

## Tarefas (ordenadas)

### 1. `src/lib/database.ts` — distinguir "nunca salvo"

- `fetchOpenDatabases(): Promise<OpenDatabasesState | null>`: devolver **`null`**
  quando `maybeSingle()` não traz linha (primeiro uso); manter o mapeamento
  atual quando houver linha.
- Ajustar o JSDoc ("sem linha salva → `null`").
- `EMPTY_OPEN_DATABASES` deixa de ser usado pelo `DatabaseView`: remover a
  constante se ficar sem uso (era introduzida só para esse caso).

### 2. `src/components/database/WorkspaceEmptyState.tsx` — nova variante

- `variant: "no-projects" | "no-database" | "no-open-database"`.
- Props novas **opcionais** (não quebram os usos atuais):
  - `projects?: { id: string; name: string }[]` (default `[]`) — contexto do seletor.
  - `onOpenDatabase?: (id: string) => void`.
- Variante `"no-open-database"`:
  - Ícone `LayoutGrid` (lucide); título **"Nenhum database aberto"**.
  - Descrição: `projectName ? `Abra um database de "${projectName}" para começar.` : "Abra um database para começar."`
  - Botões: **"Abrir database"** (primário) e **"Criar database"** (outline,
    reusa o `CreateDatabasePopover` já existente).
  - "Abrir database" abre o `DatabasePickerPopover` ancorado ao próprio botão
    (`currentDatabaseId={null}`, `databases`, `projects`); ao escolher:
    fecha e chama `onOpenDatabase(id)`.
- Manter as variantes atuais sem alteração visual.

### 3. `src/components/database/DatabaseView.tsx`

- `persistedOpenDatabases`: passa a `useState<OpenDatabasesState | null>(null)`.
- No load inicial: `fetchOpenDatabases().catch(() => null)` (falha → tratado como
  "sem estado salvo", degradando para o auto-open atual).
- Efeito de restauração:
  - `const saved = persistedOpenDatabases; if (!saved) return;` → primeiro uso:
    deixa o auto-open abrir o primeiro database do projeto (comportamento atual).
  - Com estado salvo: aplicar `ids`/`selectedId` filtrados por databases
    conhecidos, atualizar `lastSavedOpenDatabasesRef` e **bloquear o auto-open**
    (`closedAllTabsRef.current = true`) — respeita inclusive o salvo vazio.
- **Remover** o efeito que reseta `closedAllTabsRef` em `resolvedProjectId`
  (evita a corrida com a hidratação do store e clobber do estado salvo).
- Resetar `closedAllTabsRef.current = false` **explicitamente** em
  `handleOpenProject` e no ramo `"project"` de `handleSearchResult` (os dois já
  limpam `selectedId` para o auto-open do primeiro database do projeto).
- Ramo `!selected` com `projectHasDatabases`: trocar o `<div>` de texto por:

```tsx
<WorkspaceEmptyState
  variant="no-open-database"
  userName={userName}
  projectName={projects.find((p) => p.id === resolvedProjectId)?.name}
  categories={categories}
  databases={databases}
  projects={projects}
  onOpenDatabase={handleOpenDatabase}
  onCreateProject={handleCreateProject}
  onCreateCategory={handleCreateCategory}
  onCreateDatabase={(input) => void handleCreate(input)}
/>
```

- Remover imports que ficarem órfãos (ex.: `EMPTY_OPEN_DATABASES`).

### 4. Testes

- `src/components/database/workspace-empty-state.test.tsx` (novo caso):
  variante `no-open-database` → mostra "Nenhum database aberto"; clicar em
  "Abrir database" abre o `role="dialog"` "Abrir database" com os databases;
  escolher um chama `onOpenDatabase("db…")`.
- `src/components/database/database-view.test.tsx`:
  - mock default de `fetchOpenDatabases` passa a **`null`** (senão os testes de
    auto-open quebram).
  - ajustar o teste "fecha a aba do database…" para esperar o cartão
    ("Nenhum database aberto" + botão "Abrir database") em vez do texto antigo.
  - novo teste: `fetchOpenDatabases` → `{ ids: [], selectedId: null }` mostra o
    cartão e **não** reabre o primeiro database.
- `open-database-bar.test.tsx` e `workspace-open-databases-contract.test.ts`:
  sem mudanças.

### 5. Validação

- `npx tsc --noEmit`
- `npm run lint` (esperado: apenas os 2 warnings pré-existentes)
- `npm test`
- `npm run build`

## Riscos e cuidados

- **Mock default de `fetchOpenDatabases`**: com a nova semântica (`null` = nunca
  salvo), manter `{ ids: [], selectedId: null }` como default faria todos os
  testes de auto-open falharem.
- **Não** derivar o bloqueio do auto-open de um efeito em `resolvedProjectId`
  (a hidratação do store pode rodar depois do load e reabrir o database).
- Não alterar `ProjectsSidebarProps`, o `DatabasePickerPopover` nem a
  migration/tabela (já existem).
- Textos pt-BR com acentuação; sem `any`; sem dependências novas.

## Validação manual (navegador)

- Fechar todas as abas → aparece o cartão; "Abrir database" abre o seletor e
  abre o escolhido (vira aba); "Criar database" cria e abre.
- Recarregar depois de fechar todas → continua sem database aberto (cartão).
- Primeiro uso (sem estado salvo) → o primeiro database do projeto abre
  automaticamente (comportamento atual).
- "Abrir projeto" na sidebar → o primeiro database do projeto abre (mantido).
- Projeto sem nenhum database → continua o cartão "Nenhum database ainda".

## Fora de escopo

- Grade de cards dos databases do projeto na área principal.
- Filtro por projeto no seletor de databases.
- Aplicar a migration `20261022000000_workspace_open_databases.sql` (ação manual
  no Supabase, já pendente de antes).
