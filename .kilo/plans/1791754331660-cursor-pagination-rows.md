# Plano — Paginação por cursor das linhas dos databases (Supabase)

## Objetivo
Carregar as linhas da **visão Tabela** em páginas (200–500) por **keyset/cursor**, buscando mais ao rolar, com **busca e filtros no servidor**. Kanban/Gráfico/Calendário mantêm **carga completa sob demanda** (só quando ativos). Sem mudar o visual.

## Decisões (resolvidas)
- **(a)** Filtros/busca no servidor via **RPC em SQL** (`security invoker`).
- **(b)** Paginar **só a Tabela**; Kanban/Gráfico/Calendário fazem carga completa **apenas quando ativos**, em loop de páginas (respeitando o teto de 1000 do PostgREST). Follow-ups: agregação no servidor; calendário por intervalo de datas.
- **(c)** **Hook próprio** com `useReducer` (sem dependência nova).
- **(d)** "Selecionar tudo" = **só as linhas carregadas**. Follow-up: "todas as N do filtro".

## Ajustes obrigatórios (respostas)

### 1. Índice (substituir, não somar)
A policy de SELECT filtra por `auth.uid() = user_id`, então o índice atual `database_rows_user_db_idx (user_id, database_id, position)` já cobre o prefixo. **Substituir** por `(user_id, database_id, position, id)` (adiciona o tiebreak do cursor no mesmo índice). Entregar `explain analyze` **antes/depois**:
```sql
-- ANTES (índice atual)
explain analyze
select id, values, position from public.database_rows
where user_id = auth.uid() and database_id = '<DB>'
  and (position, id) > (0, '00000000-0000-0000-0000-000000000000'::uuid)
order by position, id
limit 300;

-- DEPOIS (índice novo) — repetir o mesmo explain
```
Esperado: `Index Scan`/`Index Only Scan` usando `(user_id, database_id, position, id)`, sem `Sort` e sem `Seq Scan`.
```sql
-- migration
drop index if exists public.database_rows_user_db_idx;
create index if not exists database_rows_user_db_idx
  on public.database_rows (user_id, database_id, position, id);
```

### 2. Busca — preservar a semântica atual (só VALORES, arrays com espaço)
**Não** usar `values::text` (inclui chaves/pontuação → falso positivo). Escolha: **(i) função SQL que concatena os valores + índice GIN `pg_trgm` de expressão** (recomendada) em vez de (ii) coluna + trigger.
```sql
create extension if not exists pg_trgm;

-- Concatena APENAS os valores: arrays viram "a b" (igual ao `join(" ")` do cliente);
-- escalares entram crus. Casa o comportamento de `filtered` (substring, case-insensitive).
create or replace function public.database_row_search_text(v jsonb)
returns text language sql immutable parallel safe as $$
  select coalesce(string_agg(
    case when jsonb_typeof(val) = 'array'
         then (select string_agg(x, ' ') from jsonb_array_elements_text(val) as x)
         else val #>> '{}' end, ' '), '')
  from jsonb_each(v) as e(key, val)
$$;

create index if not exists database_rows_search_trgm_idx
  on public.database_rows using gin (public.database_row_search_text(values) gin_trgm_ops);
```
**Justificativa (i) vs (ii):** (i) não adiciona coluna/trigger, não tem backfill manual (o `create index` popula) e o índice é mantido pelo Postgres — mesmo custo de escrita de um índice em coluna. (ii) exigiria trigger em INSERT/UPDATE + backfill e poderia divergir. **Caveat:** a função precisa ser `IMMUTABLE` para o índice de expressão; se o planner recusar, cair para (ii).
**Documentar (não alterar):** a busca casa o **id** do select (não o rótulo) — comportamento atual.

### 3. `runAutoTemplates` — corrigir a premissa
**Achado (contra a premissa):** ele **não** verifica linhas existentes; a idempotência é `recurrence.lastGenerated` no template (`src/lib/database-recurrence.ts:112-142`). A **única** dependência de linhas é `position = rows.length` (`:103`).
**Proposta (recomendada):**
- Trocar `position = rows.length` por **posição do servidor** (`max(position)+1` do database, com incremento local entre as ocorrências).
- `runAutoTemplates` passa a retornar `{ databaseId, created }` (contagem), **sem** devolver/mergear `rows`.
- O chamador, se `created > 0`, **invalida só aquele database** (a Tabela recarrega a 1ª página; o Calendário recarrega as linhas, que já carrega todas quando ativo).
- Resultado: **nenhuma verificação de "existe linha neste período"** é necessária; e abrir um database **não** força carga completa (remove o `fetchDatabases()` com todas as linhas do mount do wrapper — `DatabaseView.tsx:3550-3584`).
**Alternativa (3B, não recomendada agora):** marca `__templateId` em `values` + checagem no servidor por `(template, data)` — custa queries extras e uma chave reservada nova. Fica como follow-up.

### 4. Reordenação com gaps
```sql
-- Roda UMA vez (teste primeiro): posições passam a ter gap de 1000.
update public.database_rows set position = position * 1000;
```
- Novas linhas: `position = max(position)+1000` (servidor).
- **Limite `integer`** = 2.147.483.647 → com gap 1000, ~2,1 milhões de inserções no fim antes de estourar.
- **Gaps esgotados entre vizinhos** (ex.: inserir entre `p` e `p+1`): renumeração **localizada** de uma janela (ex.: 100 linhas seguintes, `position = base + n*1000`) numa única transação; se a janela não bastar, renumeração do database (raro; documentar).

### 5. `persist()` — rollback local, sem `reload()`
Em erro de escrita, **não** chamar `reload()` (zera cursor/scroll). Aplicar **rollback só da linha afetada** (inverso do patch otimista em `databasesRef` + `patchDatabase`) e `setError`. Assinatura nova: `persist(action, rollback)`.

### 6. Contagem (DatabasesScreen) — 1 consulta agrupada
RPC única `database_row_counts()` (`security invoker`) devolvendo `(database_id, total)` para os databases do usuário. Substitui `rowCount: d.rows.length` (`DatabaseView.tsx:4149`).

### 7. `fetchDatabases()` sem linhas — pontos afetados (para revisão)
`fetchDatabases()` passa a trazer **só metadata/columns/templates**; `fetchDatabaseById` idem. Pontos que dependiam de `db.rows` carregado:
1. `DatabaseTable` (`database.rows`) → passa a usar o hook paginado (Tabela).
2. Dentro do `DatabaseTable`: `filtered`, `moveRow` (ids), `toggleAllRowsSelection`, checkbox "selecionar tudo" (`rows.length`), `openRow` (`rows.find`), efeito de calibração (`rows.length`), `pendingFocusRowId` (`filtered.findIndex`) → passam a operar sobre a **lista carregada**.
3. `KanbanBoard` / `ChartView` (props `rows`) → carga completa sob demanda (b).
4. `DatabasesScreen` `rowCount` → RPC de contagem (6).
5. `CalendarProvider` → `databaseRowsToEvents` (já só roda com `appView === "calendar"`).
6. `CalendarSidebar` (`fetchDatabases`) → só precisa de metadata (melhora).
7. `DatabaseItemPopover` (`fetchDatabaseById` p/ achar **1** linha) → nova `fetchRowById(rowId)`.
8. `runAutoTemplates` (3).
9. Wrapper `DatabaseView`: `handleAddRow`, `handleApplyTemplate`, `handleUpdateCell`, `handleDeleteRow`, `handleReorderRows` → adaptar (position do servidor, 1 write na reordenação, lista carregada).

## Etapas (cada uma deixa o app funcionando)
> **Etapas 5 e 6 exigem confirmação sua antes de começar.**

- **Etapa 0 — Banco (migration).** Índice `(user_id, database_id, position, id)` (substitui o antigo); `pg_trgm` + `database_row_search_text` + índice GIN de expressão; `update ... position * 1000`; RPCs `database_rows_page`, `database_row_counts`, `database_next_row_position`, `fetchRowById`. **Entrego o SQL; você roda em ambiente de teste** e me devolve os `explain analyze`.
- **Etapa 1 — Camada de dados (aditiva).** `fetchDatabaseRowsPage(dbId, { cursor, limit, search, filters })`, `countDatabaseRows`, `nextRowPosition`, `fetchRowById`, `createRowAtEnd`, `updateRowPosition`; `fetchDatabases`/`fetchDatabaseById` sem linhas. Testes com cliente mockado. App ainda usa o caminho antigo.
- **Etapa 2 — Hook `useDatabaseRows`.** `useReducer` com `{ rows, cursor, total, loading, loadingMore, error, hasMore }`, `fetchNextPage`, `reset`, `retry`, descarte de resposta antiga (request id). Testes (1ª página, próxima, fim, reset, race, retry, cursor com `position` repetida).
- **Etapa 3 — Tabela.** Plugar o hook: `count` do virtualizer = carregadas (+1 "carregando" quando `hasMore`); `fetchNextPage` a ~15–20 do fim (uma requisição por vez); reset de cursor + scroll ao topo ao mudar busca/filtro (busca com debounce 250–300 ms). Escritas ainda pelo caminho antigo.
- **Etapa 4 — Contadores e demais leitores.** `DatabasesScreen` via `database_row_counts`; `CalendarSidebar` sem linhas; `DatabaseItemPopover` via `fetchRowById`; Kanban/Gráfico/Calendário em **carga completa sob demanda** (loop de páginas).
- **Etapa 5 — Escritas (CONFIRMAR ANTES).** Criar com position do servidor (linha nova "pinada" visível mesmo sem página carregada); editar/excluir otimista com **rollback local** (5); reordenar atualizando **1 linha** com gaps (4).
- **Etapa 6 — `runAutoTemplates` (CONFIRMAR ANTES).** Position do servidor + retorno por contagem + invalidação do database afetado.

## Casos de borda
- Vazio, menos que 1 página, exatamente 1 página cheia (próximo fetch vazio).
- Troca de database no meio da requisição (descartar resposta por id de database + request id).
- Scroll rápido ao fim / volta ao topo.
- Falha de rede no meio: manter o carregado + botão "tentar de novo" (retry da página).
- Mudança em outra aba/usuário: **sem realtime** — o cursor pode ficar defasado até um `reset`/reload (documentar).

## Testes (Vitest + jsdom)
- Camada de dados com cliente mockado: 1ª página, próxima, fim, reset ao mudar filtro, descarte de resposta antiga, retry.
- Cursor `(position, id)` com `position` repetida.
- Tradução de filtros (checkbox: `checked`/`unchecked`) e busca (valores, arrays) para a chamada do servidor.
- Rodar `npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Entrega
1. Arquivos alterados por etapa.
2. Tratado vs. fora de escopo (com motivo).
3. SQL das migrations + `explain analyze` antes/depois.
4. Como testar manualmente com 10k/50k/100k linhas (ambiente de teste): Network (tamanho/tempo por página), memória, fluidez, busca e filtros.
5. Antes/depois: tempo até a tabela aparecer e nº de linhas em memória.

## Restrições
- Sem `any`; sem dependências novas; não refatorar fora do escopo; não mudar o visual (documentar exceções inevitáveis: indicador "carregando" no fim da lista e, se necessário, "N de M").
- **Não executar as migrations em produção** — só ambiente de teste.

## Follow-ups (registrar, não implementar)
- Memoização de linha; ordenação; realtime.
- Agregação no servidor para o Gráfico; calendário por intervalo de datas.
- "Selecionar todas as N do filtro" (consulta de ids no servidor).
- Hardening opcional do `runAutoTemplates` (3B).
