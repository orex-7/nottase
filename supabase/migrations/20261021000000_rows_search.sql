-- ----------------------------------------------------------------------------
-- Busca global de itens (linhas) — paleta de busca do Workspace
-- ----------------------------------------------------------------------------
-- Rode em ambiente de TESTE primeiro. Não aplica em produção por aqui.
--
-- Busca por substring sobre os **valores** de todas as linhas do usuário,
-- reusando o índice trigram já existente (`database_rows_search_trgm_idx`, sobre
-- `database_row_search_text(values)`), de modo que a expressão do WHERE casa o
-- índice. `security invoker` → a RLS continua limitando ao dono (não há filtro
-- manual por `user_id`).
--
-- É uma função **nova**, então `create or replace` basta (sem `drop function`).

create or replace function public.database_rows_search(
  p_search text,
  p_limit integer default 10
)
returns setof public.database_rows
language sql
security invoker
stable
as $$
  select r.*
  from public.database_rows r
  where coalesce(p_search, '') <> ''
    and public.database_row_search_text(r.values) ilike '%' || p_search || '%'
  order by r.database_id, r.position, r.id
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

-- ----------------------------------------------------------------------------
-- Conferência (rodar à parte):
--
--   select id, database_id from public.database_rows_search('reunião');
--   select id, database_id from public.database_rows_search('projeto', 5);
-- ----------------------------------------------------------------------------
