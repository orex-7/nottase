# Relação de database — como funciona e como foi implementada

> Documento explicativo (não é um plano de implementação). Escrito em pt-BR.
> Referências no formato `arquivo:linha`.

## 1. O que é, em uma frase

Uma **Relação** liga um item de uma tabela (database) a itens de outra tabela
(ou da mesma). É o "Relation" do Notion. A célula guarda **vínculos** (pares
origem→alvo), e não texto. Em cima dos vínculos, o **Rollup** calcula um valor
(soma, contagem, média, etc.) sobre uma propriedade dos itens relacionados.

Modelo mental:

```
Tarefas (origem)                       Projetos (alvo)
┌──────────────┬───────────────┐      ┌──────────────┐
│ Nome         │ Projetos (rel)│      │ Nome         │
├──────────────┼───────────────┤      ├──────────────┤
│ Corrigir bug │ [Site]  [App] │ ───▶ │ Site         │
│ Escrever doc │ [Site]        │ ───▶ │ App          │
└──────────────┴───────────────┘      └──────────────┘
```

## 2. Modelo de dados

### 2.1 Tabela de junção `relation_links`

`supabase/migrations/20261018000000_relation_links.sql:18`

| Coluna | Tipo | Papel |
| --- | --- | --- |
| `id` | uuid (pk) | id do vínculo |
| `user_id` | uuid (FK `auth.users`, cascade) | dono (tenancy por usuário; **não há workspace**) |
| `property_id` | text | **id da coluna** de relação (`databases.columns[].id`), sem FK |
| `source_item_id` | uuid (FK `database_rows`, cascade) | item de origem |
| `target_item_id` | uuid (FK `database_rows`, cascade) | item alvo |
| `created_at` | timestamptz | ordem/estabilidade do vínculo |

- `unique (property_id, source_item_id, target_item_id)` → impede vínculo duplicado.
- Índices `relation_links_src_idx (user_id, property_id, source_item_id)` e
  `relation_links_tgt_idx (user_id, property_id, target_item_id)`
  (`:29`, `:32`) → leitura por origem (célula) e por alvo (limpeza/espelho).
- `on delete cascade` nas FKs de `database_rows` → excluir um item **apaga os
  vínculos** que apontam para ele (a célula passa a mostrar "linha removida").

### 2.2 Configuração da propriedade (em `databases.columns`, JSONB)

A "coluna" continua sendo um objeto em `databases.columns` (JSONB, chaves
camelCase). Campos de relação/rollup em `src/types/database.ts`:

| Campo | Onde | Significado |
| --- | --- | --- |
| `type` | `:2` | `"relation"` ou `"rollup"` |
| `relationDatabaseId` | `:82` | id do database alvo |
| `isBidirectional` | `:87` | se cria/mantém o espelho no alvo |
| `reversePropertyId` | `:92` | id da **coluna espelho** na outra tabela (sem FK) |
| `limit` | `:94` | `"one" | "many"` (`RelationLimit`, `:18`) |
| `rollup` | `:96` | `RollupConfig` (`:41`): `{ relationPropertyId, targetPropertyId, fn }` |

`RollupFunction` (`:21`): `count_all`, `count_filled`, `count_empty`, `sum`,
`avg`, `min`, `max`, `median`, `range`, `percent_checked`, `show_original`,
`earliest_date`, `latest_date`.

### 2.3 Por que não usar mais `values`

Antes, a relação era um array de ids gravado em `database_rows.values[coluna]`.
Isso não suporta bidirecional, limite, espelho nem rollup eficiente. Agora os
vínculos vivem na tabela de junção; `values` **não** guarda mais relação.

- `emptyValuesFor` (`src/lib/database.ts:82`) cria relação/rollup como `""`
  (só `multi_select` continua `[]`).
- A **migração preserva o JSONB antigo** (rollback seguro) e faz um **backfill
  idempotente** (`migration:63`): para cada coluna `type='relation'` com
  `relationDatabaseId`, expande `values[coluna]` (array) em linhas de
  `relation_links`, casando com itens alvo existentes (`join database_rows`) e
  usando `on conflict do nothing`. Rodar de novo não duplica.

## 3. Backend: RPCs Postgres (`security invoker`)

Todas as RPCs rodam **do navegador com a anon key** (não há API routes/server
actions no repo) e são `security invoker`: **a RLS continua valendo** para o
usuário autenticado. Validação de posse vem da RLS; a validação de regra
(duplicado/limite) vem do SQL.

### 3.1 Configuração da propriedade

- **`relation_property_create`** (`migration:192`) — cria/atualiza a coluna de
  relação na origem e, se bidirecional, o espelho no alvo, **numa transação**:
  - valida que origem e alvo existem (RLS ⇒ são do usuário);
  - lê o `reversePropertyId` antigo; se o bidirecional foi desligado **ou** o
    alvo mudou, remove o espelho obsoleto (`relation_reverse_remove`);
  - faz **upsert** da coluna de origem (`relationDatabaseId`, `limit`,
    `isBidirectional`, `reversePropertyId`);
  - se bidirecional, faz upsert do espelho no alvo
    (`relationDatabaseId` = origem, `reversePropertyId` = coluna de origem,
    `limit='many'`);
  - se `limit='one'`, chama `relation_property_set_limit` para podar excedentes;
  - retorna o id do espelho (ou `null`). É **idempotente** (pode ser chamada a
    cada alteração de config).
- **`relation_property_set_limit`** (`migration:318`) — grava `limit` no JSONB;
  se virar `"one"`, mantém **1 vínculo por origem** (o mais antigo:
  `row_number() over (partition by source_item_id order by created_at, id)`) e
  remove os excedentes **e os espelhos correspondentes** (via tabela temporária).
- **`relation_property_delete`** (`migration:380`) — apaga os vínculos da
  propriedade, remove o espelho (coluna + vínculos, via `relation_reverse_remove`)
  e tira a coluna do JSONB.

### 3.2 Vínculos

- **`relation_link_add(p_property_id, p_source_item_id, p_target_item_id)`**
  (`migration:418`) — resolve `limit`/`isBidirectional`/`reversePropertyId` a
  partir do JSONB da tabela da **origem**; valida que o alvo existe; rejeita se
  `limit='one'` e já há vínculo para a origem; insere com
  `on conflict do nothing`; se bidirecional, insere o **vínculo espelho**
  (ids invertidos + propriedade do espelho); devolve o id.
- **`relation_link_remove(...)`** (`migration:488`) — apaga o vínculo e o
  espelho correspondente.
- **`relation_links_for_rows(p_row_ids uuid[])`** (`migration:522`) — leitura
  **em lote** de todos os vínculos das linhas visíveis (evita N+1), ordenada por
  `created_at, id`.

### 3.3 Rollup (calculado on-the-fly)

- **`rollup_values_for_rows(p_configs jsonb, p_row_ids uuid[])`**
  (`migration:538`) — para cada linha × config: pega os alvos via
  `relation_links`, lê `database_rows.values -> targetPropertyId` e agrega
  conforme `fn`. Devolve `(row_id, property_id, value jsonb)`.
  - Helpers puros: `rollup_number` (`:114`, cast com guarda de regex),
    `rollup_text` (`:130`, arrays viram lista), `rollup_is_empty` (`:147`).
  - `min`/`max` decidem **numérico vs texto** pelo `targetType` enviado no
    config (datas comparam lexicograficamente, pois são ISO).
  - `show_original` devolve lista; agregações sem dados devolvem `null`.
- **Por que on-the-fly**: sempre atualizado, sem materialização nem jobs; o custo
  fica restrito aos ids da página.

### 3.4 Limpeza e filtro

- **`relation_cleanup_for_database(p_database_id)`** (`migration:604`) — chamado
  ao excluir uma database: percorre outras databases e remove colunas
  (espelhos) que apontavam para ela, junto com os vínculos dessas colunas.
- **`database_rows_page`** (`migration:635`) — mantém a assinatura e ganha um
  bloco `not exists` extra que resolve os operadores de relação
  (`relation_is`, `relation_is_not`, `relation_is_empty`,
  `relation_is_not_empty`) consultando `relation_links`, com
  `safe_uuid` (`:100`) para evitar erro de cast de valor inválido.

## 4. Camada de dados no cliente (`src/lib/database.ts`)

Funções finas que só chamam as RPCs (padrão do repo: browser → Supabase):

| Função | Linha | Chama |
| --- | --- | --- |
| `createRelationProperty` | `:1069` | `relation_property_create` |
| `setRelationLimit` | `:1095` | `relation_property_set_limit` |
| `deleteRelationProperty` | `:1110` | `relation_property_delete` |
| `addRelationLink` | `:1123` | `relation_link_add` |
| `removeRelationLink` | `:1138` | `relation_link_remove` |
| `fetchRelationLinksForRows` | `:1156` | `relation_links_for_rows` (blocos de 500) |
| `fetchRollupValues` | `:1207` | `rollup_values_for_rows` (blocos de 500) |
| `cleanupRelationsForDatabase` | `:1239` | `relation_cleanup_for_database` |

Tipos: `RelationLink` (`:1049`), `RELATION_LINKS_CHUNK` (`:1062`),
`RollupValueRequest` (`:1181`). `duplicateDatabase` (`:240`) copia vínculos
(ver §7.4).

## 5. Hooks (estado no cliente)

Padrão comum: **cache em módulo** + `Set` de listeners + função de invalidação
exportada + `requestRef` para descartar respostas antigas.

- **`use-related-rows.ts`** — resolve **títulos** das linhas alvo
  (`fetchRowsByIds`, lote, marca órfãos). É o modelo copiado.
- **`use-relation-links.ts`** — `invalidateRelationLinks(ids?)` (`:31`),
  `useRelationLinks(rowIds)` (`:62`) com cache `Map<"rowId|propertyId", string[]>`.
  Expõe `getTargets(rowId, propertyId)`, `setTargets(...)` (otimista) e `loading`.
  Carrega só as linhas ainda não buscadas, deduplica e descarta resposta de
  requisição antiga.
- **`use-rollup-values.ts`** — `invalidateRollupValues(ids?)` (`:55`, descarta o
  valor), `staleRollupValues(ids?)` (`:65`, mantém o valor e só marca para
  recalcular) e `useRollupValues(rowIds, configs)` (`:81`). Chave do cache inclui
  uma **assinatura da config** (mudar função/propriedade alvo invalida o antigo).

## 6. Interface

### 6.1 Célula de relação

`DatabaseView.tsx:2195` (ramo `renderCell` de `relation`):

- os ids vêm de `getTargets(row.id, column.id)` (não de `values`);
- **`RelationCell.tsx`** renderiza os chips: título resolvido (via
  `useRelatedRows`), badge `+N` quando não cabem na largura, chip esmaecido
  "linha removida" para órfãos e botão **"x"** para remover (chama
  `toggleRelationLink(..., false)`);
- **`RelationSelect.tsx`** é o seletor: lista o alvo **paginado** (mesma RPC de
  busca/paginação da Tabela, com debounce de 250 ms). O modo
  `multiple={column.limit !== "one"}` define seleção múltipla vs única.
- a célula é mantida em **uma linha** (sem `flex-wrap`) para não quebrar a
  virtualização de altura fixa da Tabela.

### 6.2 Escrita de vínculo (otimista + diff)

`applyRelationSelection` (`DatabaseView.tsx:1462`):

1. compara a lista atual (`getTargets`) com a nova → `added`/`removed`;
2. aplica **otimista** com `setTargets`;
3. chama as RPCs **removendo antes de adicionar** — necessário porque em
   `limit="one"` trocar o alvo precisa remover o antigo para o `add` não ser
   rejeitado;
4. em sucesso invalida os **alvos** (o espelho muda os vínculos deles) e os
   rollups; em erro invalida a origem + alvos (reverte a UI).

### 6.3 Configuração (popover da tabela)

`TableSettingsPopover.tsx`:

- **Relação** (`:477`): database de destino (já existia), **limite**
  (um/vários), **bidirecional** + **nome do espelho** e botão **"Salvar
  relação"** (`:589`) → `onSaveRelation` → `saveRelationConfig`
  (`DatabaseView.tsx:1510`), que chama `createRelationProperty` e **recarrega
  origem e destino** (`fetchDatabaseById`) para refletir a coluna espelho.
- **Rollup** (`:593`): relação, propriedade do item alvo (a lista **exclui
  colunas rollup** — proíbe rollup de rollup) e função, com botão
  **"Salvar rollup"** (`:695`) → grava `column.rollup` via `updateDatabaseColumns`.

### 6.4 Célula de rollup (somente leitura)

`DatabaseView.tsx:2293`: lê `getRollupValue(row.id, column.id)` (o hook em lote),
formata número com `formatNumberByColumn`/`parseNumberValue`, mostra `—` quando
vazio e `…` enquanto calcula. Nunca quebra linha.

### 6.5 Filtro de relação

- `filterOperatorsFor(relation)` (`DatabaseView.tsx:335`) oferece
  `contém / não contém / está vazio / não está vazio`; `rollup` **não** é
  filtrável.
- `serverFilters` traduz para `relation_*` (inclusive para views antigas salvas
  com operador genérico, via `relationFilterOperator`).
- No cliente (Kanban/Gráfico) o `filtered` usa `getTargets` para colunas de
  relação.

### 6.6 Read-only em outros lugares

`DatabaseItemPopover.tsx` (calendário) e `RowPageContent.tsx` mostram relação e
rollup como **somente leitura** (a edição acontece na tabela de origem).

## 7. Fluxos ponta a ponta

### 7.1 Criar relação bidirecional
`Salvar relação` → `createRelationProperty` → RPC cria a coluna de origem e a
espelho no alvo + grava `reversePropertyId` → cliente recarrega as duas
databases → a coluna espelho aparece no alvo.

### 7.2 Adicionar/remover um vínculo
`RelationSelect`/chip "x" → `applyRelationSelection` → RPC(s) `relation_link_add`
/ `relation_link_remove` → se bidirecional, a RPC mantém o **espelho**
sincronizado → caches invalidados → as duas tabelas refletem.

### 7.3 Limite "um item"
`relation_property_create(limit='one')` → `relation_property_set_limit` poda
excedentes (mantém o mais antigo por origem); novos `add` são rejeitados se já
existir vínculo. No cliente, `multiple=false`.

### 7.4 Duplicar database
`duplicateDatabase` (`src/lib/database.ts:240`) gera os **ids das linhas no
cliente** (para conhecer o mapa antigo→novo), **remove as chaves de relação de
`values`** e copia os vínculos das linhas copiadas: alvo **interno** remapeia
para o id novo; alvo **externo** mantém o mesmo id.

### 7.5 Exclusões
- **Item** → cascade em `relation_links`; a célula vira "linha removida".
- **Propriedade de relação** → `relation_property_delete` (coluna + vínculos +
  espelho).
- **Database** → `cleanupRelationsForDatabase` (remove espelhos que apontavam
  para ela) e depois `deleteDatabase`; o cliente também limpa as colunas
  espelho localmente.

### 7.6 Rollup
`rollup_values_for_rows` agrega os valores dos alvos para os ids da página.
Mudar vínculo invalida o rollup; editar o **valor** de um item usa
`staleRollupValues` (mantém o número visível e recalcula; se a coluna for alvo
de rollup em alguma tabela, marca todos).

## 8. Decisões de projeto (e por quê)

- **Tabela de junção** em vez de array em `values`: suporta bidirecional,
  limite, consultas por alvo (backlinks/limpeza) e rollup eficiente.
- **RPCs `security invoker`** em vez de API routes: segue o padrão do repo
  (browser → Supabase com anon key) e mantém a RLS como garantia de posse.
- **Rollup on-the-fly**: sempre consistente, sem materializar nem agendar.
- **Config em JSONB** (`databases.columns`): não exige tabela de propriedades
  nova; `property_id`/`reversePropertyId` são ids de coluna (sem FK), e a
  integridade é mantida pelas RPCs.
- **Lote por página**: `relation_links_for_rows`/`rollup_values_for_rows`
  evitam N+1 e não carregam a tabela alvo inteira no render.

## 9. Limitações conhecidas

- **Sem Postgres local/harness SQL** no repo: as RPCs são validadas
  manualmente no SQL Editor. Há um guarda estático
  `src/lib/database-rpc-contract.test.ts` (nomes/parâmetros/`$$`), que não
  substitui teste de comportamento.
- `limit="one"` mantém o vínculo **mais antigo** por origem.
- A busca textual do servidor casa **ids** de linhas, não títulos dos alvos.
- Editar o valor de um alvo atualiza rollups via `stale` (recalcula em
  background, sem "piscar"), mas depende do hook montado.
- Fora de escopo (follow-ups): ordenar por relação, buscar por título da
  relação, backlink manual, rollup de rollup, navegar para a database alvo.

## 10. Mapa de arquivos

| Camada | Arquivo |
| --- | --- |
| Schema/backfill/RPCs | `supabase/migrations/20261018000000_relation_links.sql`, `supabase/schema.sql` |
| Tipos | `src/types/database.ts` |
| Dados | `src/lib/database.ts` |
| Hooks | `src/components/database/use-relation-links.ts`, `use-rollup-values.ts`, `use-related-rows.ts` |
| UI | `src/components/database/DatabaseView.tsx`, `RelationCell.tsx`, `RelationSelect.tsx`, `TableSettingsPopover.tsx`, `database-fields.ts` |
| Read-only | `src/components/calendar/DatabaseItemPopover.tsx`, `src/components/database/RowPageContent.tsx` |
| Testes | `src/components/database/use-relation-links.test.tsx`, `use-rollup-values.test.tsx`, `RelationCell.test.tsx`, `src/lib/database-relations.test.ts`, `src/lib/database-rpc-contract.test.ts` |

## 11. Validação

- `npx tsc --noEmit`, `npm run lint` (só 2 warnings pré-existentes),
  `npm test` (76/76), `npm run build` — todos OK na última execução.
- Roteiro manual sugerido: criar relação bidirecional, sincronizar dos dois
  lados, testar limite "um", auto-relação, excluir propriedade/item/database,
  duplicar database, conferir rollup de cada função e o filtro por relação.

---

> Observação: este arquivo está em `.kilo/plans/` porque, no modo de plano, só
> posso criar/editar arquivos Markdown de plano. Se quiser este texto como
> documentação do repositório (ex.: `docs/relacao.md` ou no `README`), é preciso
> usar um agente com permissão de escrita em código/docs.
