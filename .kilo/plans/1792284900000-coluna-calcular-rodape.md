# Plano — Botão "Calcular" na propriedade número (rodapé da coluna)

## Objetivo

Em colunas `number`, adicionar o item **"Calcular"** no popover "Editar
propriedade" do cabeçalho da tabela (`DatabaseView.tsx:3767-4048`). Escolhida uma
função, o resultado aparece no **rodapé da coluna** (linha sticky no fim da
tabela), calculado **no servidor** sobre **todas** as linhas do database,
respeitando a busca e os filtros da visão ativa.

## Decisões (fechadas com o usuário)

- Resultado no **rodapé da coluna** (sticky bottom), estilo Notion.
- Cálculo **no servidor** sobre **todas** as linhas (respeita busca + filtros da
  visão) → nova RPC + migration.
- Persistência **por coluna** em `databases.columns` (`column.calculate`), via o
  fluxo existente `updateColumn` → `updateDatabaseColumns`.
- Funções **estilo Notion** para número + opção "Nenhum".
- Escopo: **somente colunas `number`**.

## Funções (`CalcFunction`)

`count_all` (Contagem), `count_filled` (Contagem preenchidos), `count_empty`
(Contagem vazios), `count_unique` (Contagem única), `percent_filled`
(Porcentagem preenchidos), `percent_empty` (Porcentagem vazios), `sum` (Soma),
`avg` (Média), `median` (Mediana), `min` (Mínimo), `max` (Máximo), `range`
(Intervalo).

## Etapa 1 — SQL (migration + schema)

Novo `supabase/migrations/20261018010000_column_aggregates.sql` (ts >
`20261018000000`) e **sincronizar** `supabase/schema.sql`.

1. **Helper** `public.database_parse_number(v text) returns numeric` —
   espelha `parseNumberValue` (`src/lib/number-format.ts:12`): remove espaços;
   remove `.` de milhar (lookahead `\.(?=[0-9]{3}([^0-9]|$))`); troca a 1ª `,`
   por `.`; valida `^-?[0-9]+(\.[0-9]+)?$`; senão `null`.
2. **RPC** `public.database_column_aggregates(p_database_id uuid, p_configs
   jsonb, p_search text default null, p_filters jsonb default null) returns
   table (column_id text, value jsonb)`:
   - `language sql`, `security invoker`, `stable`.
   - **Mesmo WHERE de `database_rows_page`** (`migration:635`): busca
     `database_row_search_text(r.values) ilike ...`, `database_row_matches_filter`
     (valores) e o bloco de filtros `relation_*` (vínculos), **sem** keyset/limit.
   - `p_configs` = `[{ "columnId": "<id>", "fn": "<fn>" }, ...]`; agrega por
     config com `CASE fn` (cross join linhas × cfg + `group by column_id, fn`).
   - Números via `database_parse_number(r.values ->> cfg.column_id)`; vazios via
     `rollup_is_empty` (reuso de `migration:147`).
   - Semântica: contagens → `0`; `percent_*` → `round(100*razão, 1)`; demais →
     `null` quando não há dados.
3. Rodar no SQL Editor e conferir com/sem filtro (não há Postgres local).

## Etapa 2 — Tipos e helpers

- `src/types/database.ts`: `export type CalcFunction = ...`; adicionar
  `calculate?: CalcFunction` em `Column`.
- `src/components/database/database-fields.ts`: `CALC_FUNCTIONS: { value:
  CalcFunction; label: string }[]` (rótulos pt-BR) e `calcFunctionLabel(fn)`.

## Etapa 3 — Camada de dados

- `src/lib/database.ts`:
  - `export interface ColumnAggregateRequest { columnId: string; fn: CalcFunction }`.
  - `fetchColumnAggregates(databaseId, configs, { search?, filters? }):
    Promise<Map<string, CellValue>>` — chama a RPC com `p_configs`/`p_search`/
    `p_filters` (reusa `RowsFilter` e `jsonToCell`). Sem configs → não chama.

## Etapa 4 — Hook

- `src/components/database/use-column-aggregates.ts` (novo):
  `useColumnAggregates({ databaseId, configs, search, filters, revision })` →
  `{ getValue(columnId): CellValue | null, loading }`.
  - Recalcula quando `[databaseId, configsKey, search, filtersKey, revision]`
    mudam; descarta resposta antiga (`requestRef`); estado local (sem cache
    global — o resultado depende da visão).

## Etapa 5 — UI (`DatabaseView.tsx`)

- Derivados: `calcColumns = columns.filter(c => c.type === "number" &&
  c.calculate)` e `calcConfigs` (memo).
- `dataRevision` (state) incrementado nos handlers de mutação: `updateCell`
  (`:1423`), `addRow` (`:1527`) e `removeRow`. Não incrementar em paginação.
- Hook com `search={debouncedQuery}`, `filters={serverFilters}`, `revision`.
- **Rodapé**: `<tfoot className="sticky bottom-0 z-10 bg-card">` (espelha o
  `<thead sticky top-0>` em `:3551`), renderizado **só** quando
  `calcColumns.length > 0`. Uma `<tr>` com: célula gutter vazia, uma célula por
  coluna **visível** (valor formatado quando `column.calculate`, senão vazia),
  célula de ações vazia e coluna fantasma vazia — alinhado ao `colgroup`.
- Formatação: `formatNumberByColumn(n, column)` para soma/média/mediana/mín/máx/
  intervalo; contagens com `toLocaleString("pt-BR")`; percentuais com `%`; `—`
  quando `null`; uma única linha (sem `flex-wrap`).
- **Popover (número)**: novo submenu **"Calcular"** ao lado de "Formato de
  número"/"Casas decimais":
  - estado `openCalcMenu` + `calcMenuFlip` (`useFlipPopover`);
  - resetar `openCalcMenu` ao abrir/fechar os outros submenus do popover;
  - guardas de clique-fora: adicionar `[data-calc-menu-trigger]` e
    `[data-calc-menu]` na lista em `:1015-1020`;
  - itens = `CALC_FUNCTIONS` + **"Nenhum"** (limpa);
  - seleção → `updateColumn(column.id, { calculate })` (ou `undefined` em
    "Nenhum").

## Etapa 6 — Testes e validação

- `src/lib/database-column-aggregates.test.ts`: `fetchColumnAggregates`
  (não chama com configs vazio; envia `p_search`/`p_filters`; mapeia o retorno;
  propaga erro).
- `src/lib/database-rpc-contract.test.ts`: coberto automaticamente (extrai as
  RPCs do cliente e confere `function public.<nome>(` no schema) — garantir que
  a RPC nova esteja no `schema.sql`.
- Comandos: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Manual (SQL Editor): aplicar a migration e conferir agregações com/sem filtro
  e com valores pt-BR ("1.234,56").

## Riscos / pontos de atenção

- **Rodapé sticky + virtualização**: o `<tfoot>` fica dentro do container
  rolável (`tableScrollRef`, `:3511`); validar que não afeta `scrollMargin`
  (`tableHeadHeight`) nem os spacers do virtualizador. Espelha o `<thead>`; se
  houver interferência, renderizar o rodapé fora do container com as mesmas
  larguras do `colgroup`.
- **Números em pt-BR**: valores são strings cruas (`database-cells.tsx:36`);
  o parser SQL precisa espelhar `parseNumberValue`. **O mesmo gap existe hoje em
  `rollup_number`** (`migration:114`) — follow-up: reusar o novo parser no rollup.
- **Recompute**: depende de busca/filtros/config/mutações; **não** recalcular por
  paginação (evitar RPC a cada scroll).
- **Filtros de relação**: a RPC precisa do mesmo bloco `relation_*` para ficar
  consistente com a Tabela.
- Sem harness SQL local → validar manualmente no SQL Editor.

## Fora de escopo

- Calcular em colunas não-numéricas (contagem/vazios em texto/data/checkbox/
  seleção/relação).
- Cálculo por visualização (a escolha foi **por coluna**).
- Materializar/armazenar o resultado no banco.
