# Plano — Relação (junção) + Rollup (calculado)

## Decisões fechadas (com o usuário)
- **Modelo**: tabela de junção `relation_links` + configuração da propriedade dentro de
  `databases.columns` (JSONB, chaves **camelCase** como no resto do repo). **Sem `workspace_id`**
  (tenancy é `user_id` + RLS). `property_id` = **id da coluna** (text), não FK.
- **Backend**: **RPCs Postgres `security invoker`** (sem API routes/server actions), chamadas do
  browser com a anon key. Validação no SQL + Zod no cliente.
- **Rollup**: **on-the-fly na consulta** (RPC em lote por página). **Rollup de rollup proibido**
  (elimina ciclos). Somente leitura.
- **Espelho ao excluir**: **remover o espelho + vínculos** em transação. Excluir a database de
  origem → limpar espelhos que apontavam para ela.
- **Backfill**: migrar os `values[coluna]` (JSONB) existentes para `relation_links`
  (unidirecional, `limit="many"`), **idempotente**, **mantendo o JSONB** (rollback seguro).
- **Cross-workspace**: fora de escopo (impossível — não há workspaces).

## Suposições (confirmar se discordar)
- Chaves de config: manter `relationDatabaseId` (já existente) e adicionar `isBidirectional`,
  `reversePropertyId`, `limit` (`"one" | "many"`, default `"many"`), `rollup`.
- "Item sem acesso" não existe (sem compartilhamento) → caso real é item **excluído** = "linha removida".
- Não há duplicação de **item** no app (só de database, feita recentemente) → só ela copia vínculos.
- Templates não entram em relação/rollup.
- Ordenação por relação e busca por **título** da relação seguem fora de escopo (follow-up).

---

## Etapa 0 — Migrations (fonte de verdade)
Novo arquivo `supabase/migrations/<ts>_relation_links.sql` (ts > `20261017000000`) e **sincronizar
`supabase/schema.sql`** (exigido pelo AGENTS.md).

1. **Tabela**
   ```sql
   create table public.relation_links (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references auth.users(id) on delete cascade,
     property_id text not null,                       -- id da coluna (databases.columns[].id)
     source_item_id uuid not null references public.database_rows(id) on delete cascade,
     target_item_id uuid not null references public.database_rows(id) on delete cascade,
     created_at timestamptz not null default now(),
     unique (property_id, source_item_id, target_item_id)
   );
   create index relation_links_src_idx on public.relation_links (user_id, property_id, source_item_id);
   create index relation_links_tgt_idx on public.relation_links (user_id, property_id, target_item_id);
   ```
   RLS `enable` + policies `auth.uid() = user_id` (select/insert/update/delete); insert com
   `with check (auth.uid() = user_id)`.
2. **Backfill idempotente** (`do $$`): para cada `databases.columns[]` com `type='relation'` e
   `relationDatabaseId` não nulo, expandir `database_rows.values[coluna]` (array) em linhas de
   `relation_links` (`insert ... select ... join database_rows t on t.id = target_id` p/ respeitar a FK),
   `on conflict do nothing`. Não apagar o JSONB.
3. **Alterar `database_rows_page`** para tratar filtros de relação (ver Etapa 5). Atenção: `create or
   replace` não renomeia parâmetros — manter a assinatura atual.

## Etapa 1 — RPCs (backend)
Todas `security invoker`, `plpgsql` quando precisarem de transação. Validam posse via RLS/`auth.uid()`.

- `relation_property_create(p_database_id, p_column_id, p_name, p_relation_database_id, p_limit,
  p_bidirectional, p_reverse_column_id, p_reverse_name) returns text`
  → numa **única transação**: acrescenta a coluna `relation` na origem (`isBidirectional`,
  `limit`, `relationDatabaseId`), e se bidirecional cria a coluna espelho no alvo
  (`relationDatabaseId` = origem, `reversePropertyId` = coluna origem) + grava
  `reversePropertyId` na origem. Retorna o id do espelho (ou `null`). Valida que a database alvo é
  do usuário.
- `relation_property_set_limit(p_database_id, p_column_id, p_limit)`
  → atualiza `limit` no JSONB; se virar `"one"`, remove vínculos excedentes (mantém 1 por origem).
- `relation_property_delete(p_database_id, p_column_id)`
  → remove a coluna do JSONB, apaga `relation_links` dessa propriedade e, se houver
  `reversePropertyId`, remove a coluna espelho (na outra database) e os vínculos dela (transação).
- `relation_link_add(p_property_id, p_source_item_id, p_target_item_id) returns uuid`
  → valida posse, **duplicado** e **limite** (`limit="one"` rejeita se já existir vínculo para a
  origem); insere. Se a coluna for bidirecional, insere o **vínculo espelho** (swap ids + property
  do espelho), resolvendo `reversePropertyId`/`isBidirectional` a partir do JSONB da database da origem.
- `relation_link_remove(p_property_id, p_source_item_id, p_target_item_id)`
  → apaga o vínculo e o espelho correspondente.
- `relation_links_for_rows(p_row_ids uuid[]) returns table (property_id text, source_item_id uuid,
  target_item_id uuid)` → **carrega em lote** (evita N+1) os vínculos das linhas renderizadas.
- `rollup_values_for_rows(p_configs jsonb, p_row_ids uuid[]) returns table (row_id uuid,
  property_id text, value jsonb)` → calcula cada rollup para cada linha (ver Etapa 7).
- `relation_cleanup_for_database(p_database_id uuid)` → chamado ao excluir uma database: remove
  espelhos (colunas + vínculos) que apontavam para ela em outras databases.

## Etapa 2 — Tipos e camada de dados (TS)
- `src/types/database.ts`: `ColumnType += "rollup"`; `Column += { isBidirectional?, reversePropertyId?,
  limit?: RelationLimit, rollup?: RollupConfig }`; exportar `RelationLimit`, `RollupFunction`,
  `RollupConfig`.
- `src/lib/database.ts` (novas funções, seguindo o padrão de `updateRowCell`):
  `createRelationProperty`, `setRelationLimit`, `deleteRelationProperty`,
  `addRelationLink`, `removeRelationLink`, `fetchRelationLinksForRows` (blocos ~500),
  `fetchRollupValues`, `cleanupRelationsForDatabase`. Tipo `RelationLink`.
- `src/components/database/database-fields.ts`: `COLUMN_TYPES += rollup` (ícone `Sigma`),
  `ROLLUP_FUNCTIONS` (rótulos pt-BR + ícones) e helpers `relationLimitLabel`, `rollupFunctionLabel`.
- `emptyValuesFor`: relação e rollup → `""` (não são mais gravados em `values`).

## Etapa 3 — Hooks
- `src/components/database/use-relation-links.ts` (novo): recebe os ids das linhas carregadas +
  colunas de relação; busca em lote via `fetchRelationLinksForRows`; cache/invalidação (mesmo padrão
  de `use-related-rows.ts`); expõe `getTargets(rowId, columnId): string[]` e `loading`.
- `src/components/database/use-rollup-values.ts` (novo): recebe ids + configs de rollup; busca em
  lote via `fetchRollupValues`; expõe `getValue(rowId, columnId)` e `loading`.
- Reusar `use-related-rows.ts` (já existe) para resolver **títulos** dos alvos.

## Etapa 4 — Interface
- `RelationCell.tsx` (existente): fonte dos ids passa a ser `useRelationLinks.getTargets(...)` (não
  mais `values`); chip com botão **"x"** para remover (`relation_link_remove`, otimista + rollback);
  clique no chip abre o item (`DatabaseItemPopover`); manter `+N`, órfão ("linha removida") e altura
  fixa (virtualização).
- `RelationSelect.tsx` (existente): seleção chama `relation_link_add/remove` (não `updateCell`);
  respeita `limit` (`"one"` → seleção única e desabilita os demais); busca + paginação já via
  `useDatabaseRows`.
- `TableSettingsPopover.tsx`: ao escolher **Relação**, mostrar database de destino (já existe),
  **bidirecional** (checkbox) + **nome do espelho** (default "Relacionado com [nome da origem]") e
  **limite** (um/vários). Salvar cria/atualiza via RPC e recarrega a database alvo
  (`fetchDatabaseById`) para refletir a coluna espelho.
- `DatabaseView.tsx`: ramos de `renderCell` para `relation` (links) e `rollup` (somente leitura);
  `filterOperatorsFor` para rollup = sem filtro (documentar); tipo "Rollup" no "Alterar tipo".
- **Rollup config** (em `TableSettingsPopover`): escolher propriedade de relação, propriedade do item
  alvo e função. Bloquear `targetPropertyId` que seja rollup (sem rollup de rollup).

## Etapa 5 — Filtro de relação no servidor
- Estender `RowsFilter.operator` com `relation_is | relation_is_not | relation_is_empty |
  relation_is_not_empty`.
- Em `database_rows_page`, tratar esses operadores com `exists (select 1 from relation_links l where
  l.property_id = f->>'columnId' and l.source_item_id = r.id and l.target_item_id = f->>'value')`
  (e variantes), antes do `not exists (... database_row_matches_filter ...)`.
- `DatabaseView`: `serverFilters` traduz o filtro de relação para esses operadores (o `filtered`
  cliente, que hoje lê `values`, passa a usar `useRelationLinks` quando a visão não é Tabela).

## Etapa 6 — Duplicação
- `duplicateDatabase` (`src/lib/database.ts`): após copiar as linhas, copiar os vínculos cuja origem
  está no conjunto copiado — alvo **dentro** do conjunto → remapear para o id novo; alvo **externo**
  → manter o mesmo alvo. `relation_links.property_id` = mesma coluna (ids de coluna são preservados).
- A cópia de **visualizações** (já feita) continua válida (filtros de relação usam ids de coluna/itens
  externos que existem).

## Etapa 7 — Rollup (somente leitura, on-the-fly)
- `RollupConfig = { relationPropertyId, targetPropertyId, fn }`.
- Funções: `count_all`, `count_filled`, `count_empty`, `sum`, `avg`, `min`, `max`, `median`,
  `range`, `percent_checked` (caixa de seleção), `show_original` (lista), `earliest_date`,
  `latest_date`.
- `rollup_values_for_rows` (SQL): para cada linha, pega os alvos via `relation_links`, lê
  `database_rows.values -> targetPropertyId` e agrega. Números: cast com guarda
  (`~ '^-?[0-9]+(\.[0-9]+)?$'`); datas: min/max lexicográfico (ISO); `show_original`: `jsonb_agg`.
  Respeita RLS (security invoker).
- UI: célula read-only com valor formatado (`number-format.ts` quando numérico), "—" quando vazio,
  e `loading` enquanto calcula. Atualiza quando os vínculos/valores mudam (invalidação do hook).
- Ciclos: proibir rollup de rollup (validação na UI + no RPC de config).

## Etapa 8 — Testes e validação
- **Vitest** (padrão do repo: `vi.mock("@/lib/database")` + `importOriginal`):
  - `use-relation-links.test.tsx`: lote, dedupe, invalidação, resposta antiga descartada.
  - `use-rollup-values.test.tsx`: lote, vazio, loading.
  - `RelationSelect.test.tsx`: `limit="one"` (seleção única) e múltiplo (add/remove via RPC).
  - `RelationCell.test.tsx`: chip "x" remove; órfão; título resolvido.
  - `database-relations.test.ts` (já existe): `fetchRelationLinksForRows` (blocos/vazio).
  - `database-views.test.ts`/duplicação: vínculos copiados/remapeados.
- **SQL**: sem harness local (não há Supabase local; `config.toml` aponta p/ `seed.sql` inexistente)
  → validar RPCs manualmente no SQL Editor. Documentar isso.
- Comandos obrigatórios: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`
  (lint hoje tem 2 warnings pré-existentes em `DatabaseView.tsx`/`PageEditor.tsx`).

---

## Validação manual (roteiro)
1. Criar "Projetos" e "Tarefas"; em Tarefas, criar Relação **bidirecional** p/ Projetos → conferir
   o espelho criado em Projetos e o nome editável.
2. Adicionar/remover de um lado e conferir no outro (sincronização).
3. Limite **um item**: tentar adicionar um 2º → bloqueado.
4. **Auto-relação**: Tarefas → Tarefas (pai/sub-itens).
5. Excluir a propriedade de relação → espelho e vínculos removidos; excluir a database alvo →
   origem fica "Escolha um database"; excluir a origem → espelhos limpos.
6. Excluir um item relacionado → vínculos em cascade; chip vira "linha removida".
7. **Duplicar** database → relações internas remapeadas; externas mantidas.
8. **Rollup** de cada função sobre uma relação; conferir atualização ao mudar itens relacionados.
9. Tabela paginada com busca/filtros (inclusive filtro por relação) e o seletor com busca/paginação.

## Riscos / pontos de atenção
- **SQL sem teste automatizado** no repo → risco concentrado nas RPCs; validar manualmente e revisar
  `security invoker` + RLS em cada função.
- `database_rows_page` alterado: **manter a assinatura** (o `create or replace` não renomeia params).
- **Backfill** precisa respeitar a FK (só alvos existentes) e ser idempotente.
- **N+1**: sempre usar `relation_links_for_rows`/`rollup_values_for_rows` em lote por página.
- **Performance**: índices em `(property_id, source_item_id)` e `(property_id, target_item_id)`;
  rollup agrega só os alvos dos ids da página.
- **Busca textual** continua casando ids (não títulos) — follow-up já documentado.
- Config em JSONB: `reversePropertyId` é apenas um id de coluna (não FK) — a limpeza depende das RPCs.

---

## Status da implementação (concluída)

- **Etapa 0/1/5/7 (SQL)**: `supabase/migrations/20261018000000_relation_links.sql`
  (tabela + RLS + backfill idempotente + `relation_property_create/set_limit/delete`,
  `relation_link_add/remove`, `relation_links_for_rows`, `rollup_values_for_rows`,
  `relation_cleanup_for_database`, `relation_reverse_remove`, helpers
  `safe_uuid`/`rollup_number`/`rollup_text`/`rollup_is_empty` e o
  `database_rows_page` estendido com os operadores `relation_*`). `supabase/schema.sql`
  sincronizado (mesmo conteúdo; `relation_links`+`safe_uuid` definidos antes de
  `database_rows_page`, pois funções `language sql` validam o corpo na criação).
- **Etapa 2 (tipos/dados)**: `ColumnType += "rollup"`; `Column` com `isBidirectional`,
  `reversePropertyId`, `limit`, `rollup`; `RelationLimit`/`RollupFunction`/`RollupConfig`;
  funções em `src/lib/database.ts`; `emptyValuesFor` (relação/rollup = `""`);
  `duplicateDatabase` copia/remapreia vínculos; `FilterOperator` com `relation_*`.
- **Etapa 3 (hooks)**: `use-relation-links.ts` e `use-rollup-values.ts` (cache em
  módulo + invalidação, no mesmo padrão de `use-related-rows.ts`).
- **Etapa 4 (UI)**: `RelationCell` com "x" (remover); `RelationSelect` reutilizado com
  `limit` (`multiple={limit!=="one"}`); `TableSettingsPopover` com limite, bidirecional +
  nome do espelho e config de rollup; `DatabaseView` renderiza `relation` (via vínculos) e
  `rollup` (somente leitura) e roteia os handlers; guards read-only de `rollup` em
  `DatabaseItemPopover` e `RowPageContent`.
- **Etapa 6 (duplicação)**: vínculos internos remapeados; externos mantidos.
- **Etapa 8 (testes)**: `use-relation-links.test.tsx`, `use-rollup-values.test.tsx`,
  `RelationCell.test.tsx` (remoção), `database-relations.test.ts` (backfill/`fetchRelationLinksForRows`)
  e `database-rpc-contract.test.ts` (guarda estático cliente↔SQL: nomes das RPCs,
  parâmetros e `$$` balanceado).
- **Invalidação de rollup**: mudanças de vínculo/exclusão invalidam (`invalidateRollupValues`);
  edição de célula usa `staleRollupValues` (mantém o valor visível enquanto recalcula) e,
  se a coluna for alvo de rollup em alguma tabela, marca todos como stale (o rollup de uma
  linha reflete a edição do valor de um item relacionado).
- **Validação**: `npx tsc --noEmit` OK; `npm run lint` só com os 2 warnings pré-existentes;
  `npm test` 76/76; `npm run build` OK.
- **Pendente/limitação**: as RPCs/backfill **não** são executados localmente (sem Postgres no
  repo) — validar manualmente no SQL Editor (ver "Validação manual"); `limit="one"` mantém o
  vínculo mais antigo por origem.
