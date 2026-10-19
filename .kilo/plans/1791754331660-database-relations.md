# Plano — Relação entre databases (coluna `relation`, múltipla, unidirecional)

## Objetivo
Adicionar o tipo de propriedade **`relation`**: cada linha referencia **N linhas** de outro
database (escolhido na configuração da coluna). A célula guarda **ids**; exibe **chips** com o
título das linhas alvo; clicar num chip abre o `DatabaseItemPopover` da linha alvo.

## Escopo (decidido com o usuário)
- ✅ **Múltipla** (array de ids), **unidirecional** (sem backlink).
- ✅ Clique no chip → **`DatabaseItemPopover`** (read-only, já existe em
  `src/components/calendar/DatabaseItemPopover.tsx` e aceita `{ databaseId, rowId, anchorEl, onUpdated, onClose }`).
- ✅ Títulos resolvidos por **busca em lote por ids** + cache por database alvo.
- ✅ Referência órfã → chip esmaecido "linha removida" (sem cascata, lazy).
- ❌ Fora: backlinks, rollups, ordenação por relação, navegação para o database alvo.

## Modelo de dados — **sem migração**
`values[columnId]` já aceita `string[]` (`CellValue = string | string[]`, `src/types/database.ts:66`);
a config da coluna vive no JSONB `databases.columns`:
```ts
export interface Column {
  ...
  /** Id do database alvo quando `type === "relation"`. */
  relationDatabaseId?: string;
}
```
`ColumnType` ganha `"relation"`. O servidor já cobre: `database_row_set_cell` grava arrays;
`database_row_matches_filter` trata array (`@>` / `is_empty`); `database_row_search_text` concatena arrays.
**Nenhum SQL novo.**

## Etapas (cada uma deixa o app funcionando)
1. **Tipo + configuração**
   - `ColumnType` += `"relation"`; `Column.relationDatabaseId?`; `COLUMN_TYPES` +=
     `{ type: "relation", label: "Relação", icon: Link2 }` (`src/components/database/database-fields.ts`);
     `emptyValuesFor` → `[]` para `relation` (`src/lib/database.ts`).
   - Em `TableSettingsPopover` ("Editar propriedades"), ao escolher **Relação** exibir um
     **seletor de database alvo** (databases do usuário, exceto o atual). Sem alvo, a coluna fica inerte
     ("Escolha um database").
2. **Resolução de títulos (camada de dados)**
   - `fetchRowsByIds(ids: string[]): Promise<Map<string, DbRow>>` em `src/lib/database.ts`
     (`.in("id", ids)`, em blocos de ~500). Reaproveita `rowToDbRow` (traz `position`).
   - Hook `useRelatedRows(databaseId, ids)` (`src/components/database/use-related-rows.ts`): busca só os
     ids **ainda não cacheados** (cache em `Map` por id de linha), dedup, descarte de resposta antiga;
     devolve `{ getTitle(rowId), loading }`. Invalidação simples (etapa 6).
3. **Exibição na tabela** — novo ramo em `renderCell` (`DatabaseView.tsx`) para `relation`:
   chips com o título resolvido (fallback: id curto / "Carregando…"), órfão esmaecido "linha removida",
   `+N` quando não couber. **Resolve títulos só das linhas renderizadas** (a virtualização limita a ~30),
   nunca do database inteiro. Mantém `white-space: nowrap` (altura de linha fixa — não quebra a virtualização).
4. **Seletor (edição)** — popover em portal com: **busca** (debounce 250 ms) + lista **paginada** do
   database alvo reutilizando **`useDatabaseRows`** (mesma RPC/busca no servidor) e **checkboxes**;
   botão "Limpar". Ao confirmar: `updateCell(rowId, columnId, ids)`. Componente reutilizável com
   `multiple` (true = célula; false = valor de filtro, etapa 7).
5. **Clique no chip** — abre `DatabaseItemPopover` com `databaseId = column.relationDatabaseId`,
   `rowId = id do chip`, `anchorEl = chip`, `onUpdated`/`onClose`. (O popover já busca a linha por id.)
6. **Órfãos e cache** — se a linha alvo for excluída/editada, os ids que a referenciam ficam órfãos:
   exibir "linha removida" (lazy — **não** reescrever `values`). Invalidar o cache de títulos ao editar
   (`updateCell` na linha alvo) e ao excluir (`removeRow`).
7. **Filtro** (mesmo passo do seletor) — `filterOperatorsFor(relation)` → **contém / não contém /
   está vazio / não está vazio**; o valor é uma linha alvo escolhida pelo **seletor em modo único**
   (busca no servidor). Se ficar de fora, relação aparece sem opções de filtro — documentar.
8. **Testes + validação** — unit: `fetchRowsByIds` (blocos, vazio, ids inexistentes), `useRelatedRows`
   (só busca ids faltantes, dedup, resposta antiga), ramo de exibição (título resolvido / órfão);
   componente (jsdom) com paginação mockada para o seletor. Rodar `npm test`, `npm run lint`,
   `npx tsc --noEmit`, `npm run build`.

## Riscos / bordas
- **Título fresco vs denormalizar**: ids + resolução em lote (títulos sempre atualizados; `values` limpo).
  Denormalizar o título no `values` foi descartado (fica obsoleto).
- **Custo**: buscar só os ids das linhas **renderizadas** (virtualização) e cacheados — nunca o alvo inteiro.
- **Database alvo excluído**: a coluna fica sem alvo → exibir "database removido" e permitir reconfigurar.
- **`relationDatabaseId` ausente** (coluna antiga/sem alvo): tratar como "sem alvo" e pedir configuração.
- **Kanban/Gráfico/Calendário** ignoram `relation` (não são categoria/valor/data) — sem regressão.
- **Busca textual** casa **ids** de relação, não títulos — follow-up.

## Validação manual
Criar 2 databases ("Projetos" e "Tarefas"); adicionar uma coluna **Relação** em Tarefas apontando para
Projetos; marcar 2-3 projetos numa tarefa; conferir: chips com títulos, clique abrindo o popover do item,
órfão ao excluir um projeto, e o comportamento na Tabela paginada (busca/filtros) e no seletor.

## Follow-ups (não implementados)
- Backlink bidirecional; rollups (somar/contar valores das linhas relacionadas); ordenação por relação;
  busca por **título** da relação (não id); navegação para o database alvo.

## Fora de escopo / observações
- Sem mudança de schema/migrations (JSONB já cobre).
- Reutiliza `useDatabaseRows` (paginação por cursor) no seletor — alvos grandes já escalam.
