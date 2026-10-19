-- ----------------------------------------------------------------------------
-- Paginação por cursor (keyset) das linhas dos databases
-- ----------------------------------------------------------------------------
-- Rode em ambiente de TESTE primeiro. Não aplica em produção por aqui.
--
-- 1) Índice com o tiebreak do cursor: substitui `database_rows_user_db_idx`
--    (user_id, database_id, position) por (user_id, database_id, position, id).
--    O prefixo (user_id, database_id) casa a policy de RLS + o filtro por
--    database; (position, id) casa o ORDER BY e a comparação de tupla do cursor.
drop index if exists public.database_rows_user_db_idx;
create index if not exists database_rows_user_db_idx
  on public.database_rows (user_id, database_id, position, id);

-- 2) Gaps de 1000 entre posições, para inserir entre vizinhos sem renumerar o
--    database inteiro. (Hoje as posições são contíguas: 0,1,2...)
--    IDEMPOTENTE: só escala se as posições ainda NÃO foram escaladas — evita
--    estourar o `integer` (máx. 2.147.483.647) ao rodar a migration de novo.
do $$
declare
  max_pos integer;
begin
  select coalesce(max(position), 0) into max_pos from public.database_rows;
  if max_pos > 0 and max_pos <= 2000000 then
    update public.database_rows set position = position * 1000;
  end if;
end $$;

-- 3) Busca por substring sobre os VALORES das células (não sobre as chaves do
--    JSON, que gerariam falso positivo). Reproduz a semântica do cliente:
--    case-insensitive, arrays unidos por espaço. Ex.: {"tags":["a","b"]} -> "a b".
create extension if not exists pg_trgm;

create or replace function public.database_row_search_text(v jsonb)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(string_agg(
    case
      when jsonb_typeof(val) = 'array'
        then (select string_agg(x, ' ') from jsonb_array_elements_text(val) as x)
      else val #>> '{}'
    end, ' '), '')
  from jsonb_each(v) as e(key, val)
$$;

create index if not exists database_rows_search_trgm_idx
  on public.database_rows using gin (public.database_row_search_text(values) gin_trgm_ops);

-- 4) Página de linhas por keyset, com busca e filtros no servidor.
--    `security invoker`: a RLS (user_id = auth.uid()) continua valendo.
--    p_filters: [{ "columnId": "<id>", "operator": "is"|"is_not"|"is_empty"|"is_not_empty", "value"?: "<valor>" }]
-- O `create or replace` não renomeia parâmetros — dropa a assinatura antiga
-- (p_checkbox) antes de recriar.
drop function if exists public.database_rows_page(
  uuid, integer, integer, uuid, text, jsonb
);

create or replace function public.database_row_matches_filter(v jsonb, f jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select case f ->> 'operator'
    when 'is_empty' then
      case
        when jsonb_typeof(v -> (f ->> 'columnId')) = 'array'
          then jsonb_array_length(v -> (f ->> 'columnId')) = 0
        else coalesce(v ->> (f ->> 'columnId'), '') = ''
      end
    when 'is_not_empty' then
      case
        when jsonb_typeof(v -> (f ->> 'columnId')) = 'array'
          then jsonb_array_length(v -> (f ->> 'columnId')) > 0
        else coalesce(v ->> (f ->> 'columnId'), '') <> ''
      end
    when 'is' then
      case
        when jsonb_typeof(v -> (f ->> 'columnId')) = 'array'
          then (v -> (f ->> 'columnId')) @> jsonb_build_array(f ->> 'value')
        else coalesce(v ->> (f ->> 'columnId'), '') = coalesce(f ->> 'value', '')
      end
    when 'is_not' then
      case
        when jsonb_typeof(v -> (f ->> 'columnId')) = 'array'
          then not ((v -> (f ->> 'columnId')) @> jsonb_build_array(f ->> 'value'))
        else coalesce(v ->> (f ->> 'columnId'), '') <> coalesce(f ->> 'value', '')
      end
    else true
  end
$$;

create or replace function public.database_rows_page(
  p_database_id uuid,
  p_limit integer default 300,
  p_cursor_position integer default null,
  p_cursor_id uuid default null,
  p_search text default null,
  p_filters jsonb default null
)
returns setof public.database_rows
language sql
security invoker
stable
as $$
  select r.*
  from public.database_rows r
  where r.database_id = p_database_id
    -- Keyset: (position, id) > (cursor_position, cursor_id).
    and (
      p_cursor_position is null
      or (r.position, r.id) > (p_cursor_position, p_cursor_id)
    )
    -- Busca: substring case-insensitive sobre os valores.
    and (
      p_search is null
      or p_search = ''
      or public.database_row_search_text(r.values) ilike '%' || p_search || '%'
    )
    -- Filtros por propriedade (todos precisam bater).
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) as f
      where not public.database_row_matches_filter(r.values, f)
    )
  order by r.position, r.id
  limit greatest(1, least(p_limit, 1000));
$$;

-- 5) Grava UMA célula fazendo merge no JSONB (sem precisar do mapa inteiro de
--    `values` no cliente — que com paginação não está todo carregado).
create or replace function public.database_row_set_cell(
  p_row_id uuid,
  p_column_id text,
  p_value jsonb
)
returns void
language sql
security invoker
as $$
  update public.database_rows
  set values = values || jsonb_build_object(p_column_id, p_value)
  where id = p_row_id;
$$;

-- 6) Próxima posição (fim da lista) para uma linha nova. Antes era
--    `rows.length` no cliente — que com paginação seria o tamanho da página.
create or replace function public.database_next_row_position(p_database_id uuid)
returns integer
language sql
security invoker
stable
as $$
  select coalesce(max(position), -1000) + 1000
  from public.database_rows
  where database_id = p_database_id;
$$;

-- 6) Contagem agrupada por database (uma consulta para a tela de databases).
create or replace function public.database_row_counts()
returns table (database_id uuid, total bigint)
language sql
security invoker
stable
as $$
  select database_id, count(*)::bigint
  from public.database_rows
  group by database_id;
$$;

-- ----------------------------------------------------------------------------
-- Conferência (rodar à parte e comparar ANTES/DEPOIS do índice novo):
--
--   explain analyze
--   select id, values, position from public.database_rows
--   where user_id = auth.uid() and database_id = '<DB>'
--     and (position, id) > (0, '00000000-0000-0000-0000-000000000000'::uuid)
--   order by position, id
--   limit 300;
--
--   -- Busca (deve usar o índice GIN trgm):
--   explain analyze
--   select id from public.database_rows
--   where user_id = auth.uid() and database_id = '<DB>'
--     and public.database_row_search_text(values) ilike '%Item 42%'
--   order by position, id limit 300;
-- ----------------------------------------------------------------------------
