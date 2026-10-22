# Busca global na sidebar (projetos → projetos, databases, propriedades, abas, modelos e itens)

## Objetivo

Hoje o input da lupa na sidebar do Workspace **só filtra a lista de projetos**
(`ProjectsSidebar.tsx`, `filteredGroups`). A meta é transformar o popover numa
**paleta de busca global**: encontrar projetos, categorias, databases,
propriedades, visualizações, modelos de página e **itens (linhas) de todos os
databases**, navegando direto para o alvo.

Escopo escolhido pelo usuário: **memória + itens** e **navegação completa**.

## Decisões já tomadas

- **Alvos**: categorias, databases, propriedades (colunas), modelos de página e
  visualizações — tudo já em memória no cliente, **sem SQL novo**; **+ itens**
  de todos os databases via **1 RPC nova** (usa o índice trigram existente).
- **Navegação ao clicar** (completa):
  - Projeto → abre o projeto (`onOpenProject`).
  - Categoria → limpa a busca e **expande o grupo** daquela categoria.
  - Database → abre o database.
  - Propriedade → abre o database **e o editor daquela propriedade**.
  - Visualização → abre o database **e ativa aquela aba**.
  - Modelo de página → abre o database **e o diálogo de modelos**.
  - Item → abre o database **e a página do item**.
- Ao navegar: **fecha o popover e limpa a busca** (a lista da sidebar volta ao normal).
- A **lista da sidebar continua sendo filtrada por projetos** (comportamento atual mantido); a paleta é aditiva.
- **Fora de escopo**: eventos do calendário, busca na sidebar do calendário,
  destaque do trecho encontrado (highlight), fuzzy/ranking, persistir a última busca.

## Inventário (onde cada alvo está)

| Alvo | Fonte no cliente | Observação |
| --- | --- | --- |
| Projetos | `projects` (props da sidebar) | já filtrado hoje |
| Categorias | `categories` (props) | nome + cor |
| Databases | `databases` (estado do `DatabaseView`) | inclui `columns` e `templates` |
| Propriedades | `databases[].columns[].name` | visões vinculadas têm `columns: []` (nada a indexar) |
| Modelos | `databases[].templates[].name` | vêm de `fetchDatabases()` |
| Visualizações | `loadPersistedViews(dbId)` (`database-views.ts`) | só abas **persistidas** (ignorar os defaults) |
| Itens | nova RPC `database_rows_search` | `database_row_search_text(values)` + índice GIN trigram já existentes |

## Tarefas (ordenadas)

### 1. SQL — RPC global de busca de itens

- Criar `supabase/migrations/20261021000000_rows_search.sql` com:

  ```sql
  create or replace function public.database_rows_search(
    p_search text,
    p_limit integer default 10
  )
  returns setof public.database_rows
  language sql
  security invoker      -- a RLS já limita ao usuário
  stable
  as $$
    select r.*
    from public.database_rows r
    where coalesce(p_search, '') <> ''
      and public.database_row_search_text(r.values) ilike '%' || p_search || '%'
    order by r.database_id, r.position, r.id
    limit greatest(1, least(coalesce(p_limit, 10), 50));
  $$;
  ```

- Espelhar a **mesma função** em `supabase/schema.sql` (o guard
  `src/lib/database-rpc-contract.test.ts` exige `function public.<nome>(` no
  `schema.sql` quando há `.rpc("<nome>", ...)` em `src/lib/database.ts`).
- Sem `drop function`: é função nova (idempotente com `create or replace`).

### 2. `src/lib/database.ts` — cliente da RPC

- Novo tipo de retorno (o `DbRow` do domínio não carrega o database):

  ```ts
  export interface RowSearchHit { databaseId: string; row: DbRow }
  ```

- Nova função:

  ```ts
  export async function searchDatabaseRows(
    search: string,
    limit = 10,
  ): Promise<RowSearchHit[]>
  ```

  Chama `supabase.rpc("database_rows_search", { p_search: search, p_limit: limit })`
  e mapeia com o `rowToDbRow` existente + `database_id`.

### 3. `src/store/useCalendarStore.ts` — pedido com foco

- Estender `pendingDatabaseRequest`:

  ```ts
  | {
      type: "open";
      id: string;
      viewId?: string;        // ativa a aba
      editColumnId?: string;  // abre o editor da propriedade
      rowId?: string;         // abre a página do item
      openTemplates?: boolean; // abre o diálogo de modelos
    }
  ```

- `requestOpenDatabase(id, projectId?, focus?)` mantendo a assinatura atual
  compatível (o 3º parâmetro é opcional).

### 4. `src/components/database/workspace-search.ts` (novo) — índice puro e testável

- Exporta `buildWorkspaceIndex({ projects, categories, databases })` e
  `searchWorkspace(index, query)` → resultados agrupados por tipo, com
  normalização idêntica à atual (minúsculas + remoção de acentos, `includes`).
- Tipos do resultado (união discriminada): `project | category | database |
  column | view | template`, cada um com `id`, `label`, `sublabel` (ex.: nome do
  database/categoria) e os ids necessários para navegar.
- Limites por seção (ex.: 5 por tipo em memória) para a paleta não crescer.
- Lê as visualizações com `loadPersistedViews(dbId)` (uma vez por database,
  memoizado); ignora databases sem abas persistidas.

### 5. `src/components/database/ProjectsSidebar.tsx` — paleta

- Novos props: `databases: Database[]` e
  `onOpenSearchResult: (result: WorkspaceSearchResult) => void`.
- `ProjectsSearchPopover` passa a ser uma **paleta**:
  - input (mantém o foco ao abrir) + lista de resultados agrupada por seção,
    com cabeçalho em `text-[11px] uppercase text-muted-foreground`;
  - `max-h-[60vh]` com scroll interno; largura até ~560px (hoje 280–420);
    posição mantida (centralizado, 5px abaixo do header);
  - estados: "Nada encontrado" e "Buscando itens…" (enquanto a RPC roda);
  - **teclado**: ↑/↓ percorrem todos os resultados, Enter abre, Esc fecha;
    clique também abre; clique fora fecha;
  - busca de itens: debounce 250ms, **mínimo 2 caracteres**, `limit: 10`,
    descartando respostas antigas (mesmo padrão de `useColumnAggregates`).
- Ao abrir um resultado: `onOpenSearchResult(...)`, limpa `query` e fecha.
- Categoria: limpa a busca, remove a categoria de `collapsedGroups` e fecha.
- Manter `filteredGroups` (filtro da lista da sidebar) como está.

### 6. `src/components/database/DatabaseView.tsx` — ligação e foco

- Passar `databases={databases}` e `onOpenSearchResult={handleSearchResult}`
  nas **três** renderizações da sidebar (`!resolvedProjectId`, `!selected` e a
  final).
- `handleSearchResult`:
  - projeto → `setActiveProjectId(id)`;
  - categoria → tratada na própria sidebar (não chega aqui);
  - database/coluna/aba/modelo/item → `requestOpenDatabase(dbId, projectId, { ...foco })`.
- Consumir o `focus` do pedido pendente (efeito já existente de
  `pendingDatabaseRequest`) e repassar ao `DatabaseTable` como prop
  (`focusRequest`), preservando o comportamento atual de criar/abrir.

### 7. `src/components/database/DatabaseView.tsx` (`DatabaseTable`) — aplicar o foco

- Novo prop opcional `focusRequest?: { viewId?: string; editColumnId?: string; rowId?: string; openTemplates?: boolean }`.
- Efeito que aplica, nesta ordem:
  - `viewId` → `setActiveViewId(viewId)` (se existir nas abas daquele database);
  - `editColumnId` → se a coluna estiver `hidden`, `updateColumn(id, { hidden: false })`;
    em seguida abrir `openColumnEditor` e calcular `columnEditorPos` a partir do
    `<th>` (`[data-column-cell="<id>"]`, atributo já existente) após o próximo
    frame; rolar a coluna para a área visível;
  - `rowId` → `setOpenRowPage(rowId)` (a página do item já resolve via `fetchRowById`);
  - `openTemplates` → `setIsTemplateDialogOpen(true)`.
- Como o `DatabaseTable` é `key={selected.id}`, o efeito cobre montagem e o caso
  de o pedido chegar para o database já aberto.

### 8. Testes

- `src/components/database/workspace-search.test.ts` (novo): indexação e busca
  por projeto/categoria/database/propriedade/aba/modelo, com acentos e caixa;
  limite por seção; `query` vazia → sem resultados.
- `src/lib/database-relations.test.ts` (ou arquivo novo): `searchDatabaseRows`
  com client mockado (payload `p_search`/`p_limit`, mapeamento `databaseId` + `row`).
- O guard `database-rpc-contract.test.ts` passa a exigir a RPC nova no `schema.sql`.

## Riscos e cuidados

- **Nunca** buscar itens com < 2 caracteres (evita varredura ampla); a RPC já
  limita `p_limit` a 50 no servidor.
- A RPC devolve `values` completo (pode conter o HTML de `__content`): renderizar
  apenas o **título** via `rowTitleOf(row, columns)` — nunca HTML.
- `security invoker` + RLS: não adicionar filtro manual por `user_id`; nunca usar
  `service_role`.
- Visões vinculadas têm `columns: []` — não geram resultados de propriedade
  (esperado; a origem é que é indexada).
- Sem biblioteca de fuzzy no projeto: usar a normalização existente
  (minúsculas + acentos) para manter consistência com o filtro atual.
- Se a coluna alvo não existir mais (config mudou), o foco deve ser ignorado em
  silêncio (sem erro).

## Validação

- `npx tsc --noEmit`
- `npm run lint` (esperado: apenas os 2 warnings pré-existentes)
- `npm test`
- `npm run build`
- Manual (navegador): abrir a paleta; buscar por nome de projeto, database,
  propriedade, aba e modelo; buscar um item existente e outro inexistente;
  navegar por ↑/↓/Enter; Esc e clique fora; conferir que a sidebar volta ao
  normal (busca limpa) depois de navegar; conferir que abrir um item de um
  database fechado carrega a página do item.

## Observações

- Este plano exige **implementação** (arquivos de código e uma migration): trocar
  para um agente com permissão de edição.
- Passo seguinte sugerido (não incluído): incluir **eventos do calendário** na
  mesma paleta e, depois, destacar o trecho correspondente nos resultados.
