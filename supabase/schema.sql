-- ============================================================================
-- Supabase — Schema do Calendário Anual
-- Execute este script no SQL Editor do seu projeto Supabase
-- (Dashboard → SQL Editor → New query → colar → Run).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabela de eventos (privada por usuário)
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  description text,
  date        date not null,
  all_day     boolean not null default true,
  start_time  text,
  end_time    text,
  color       text not null default '#3b82f6',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists events_user_date_idx on public.events (user_id, date);

-- ----------------------------------------------------------------------------
-- Row Level Security: cada usuário só enxerga/edita os próprios eventos
-- ----------------------------------------------------------------------------
alter table public.events enable row level security;

drop policy if exists "Events são visíveis apenas pelo dono" on public.events;
create policy "Events são visíveis apenas pelo dono"
  on public.events for select
  using (auth.uid() = user_id);

drop policy if exists "Usuário insere seus próprios eventos" on public.events;
create policy "Usuário insere seus próprios eventos"
  on public.events for insert
  with check (auth.uid() = user_id);

drop policy if exists "Usuário atualiza seus próprios eventos" on public.events;
create policy "Usuário atualiza seus próprios eventos"
  on public.events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Usuário remove seus próprios eventos" on public.events;
create policy "Usuário remove seus próprios eventos"
  on public.events for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Trigger para manter updated_at atualizado
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row
  execute function public.set_updated_at();

-- ============================================================================
-- Databases (protótipo estilo Notion) — persistidos por usuário via RLS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabela de projetos (agrupadores de databases)
-- Um projeto reúne vários databases (hierarquia: Projeto > Databases).
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'Novo projeto',
  -- Categoria do projeto (ex.: Pessoal, Trabalho, Estudos...). Nullable.
  category    text,
  -- Classe de cor do marcador do projeto (estilo Notion). Nullable.
  color       text,
  -- Ordem de exibição na sidebar de projetos (drag & drop). Menor = primeiro.
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects (user_id);

create index if not exists projects_user_position_idx
  on public.projects (user_id, position);

-- ----------------------------------------------------------------------------
-- Tabela de databases (metadados + definição de colunas)
-- ----------------------------------------------------------------------------
create table if not exists public.databases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Projeto ao qual o database pertence (nullable para dados legados).
  project_id  uuid references public.projects (id) on delete cascade,
  name        text not null default 'Novo database',
  -- Nome de um ícone lucide escolhido pelo usuário (ex.: "Table2"). Null = padrão.
  icon        text,
  -- Array de colunas/propriedades: [{ id, name, type }, ...]
  columns     jsonb not null default '[]'::jsonb,
  -- Visão vinculada: aponta para o database de origem cujas propriedades e
  -- itens este database exibe (editar em um reflete no outro). Null = próprio.
  linked_database_id uuid references public.databases (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists databases_user_idx on public.databases (user_id);

create index if not exists databases_project_idx
  on public.databases (user_id, project_id);

create index if not exists databases_linked_idx
  on public.databases (linked_database_id);

-- ----------------------------------------------------------------------------
-- Tabela de linhas de um database
-- ----------------------------------------------------------------------------
create table if not exists public.database_rows (
  id          uuid primary key default gen_random_uuid(),
  database_id uuid not null references public.databases (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Mapa de valores: { columnId: string | string[], "__content": string }
  values      jsonb not null default '{}'::jsonb,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Índice com o tiebreak do cursor: (user_id, database_id) casa a RLS + o filtro
-- por database; (position, id) casa o ORDER BY e o keyset da paginação.
create index if not exists database_rows_user_db_idx
  on public.database_rows (user_id, database_id, position, id);

-- Busca por substring sobre os VALORES (não as chaves do JSON), reproduzindo a
-- semântica do cliente (arrays unidos por espaço). Índice GIN pg_trgm na
-- expressão — mantido automaticamente pelo Postgres.
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

-- ----------------------------------------------------------------------------
-- Relação (junção): tabela de vínculos entre linhas.
-- ----------------------------------------------------------------------------
-- Definida antes de `database_rows_page`, que a referencia nos filtros de
-- relação. `property_id` = id da coluna (databases.columns[].id), sem FK.
create table if not exists public.relation_links (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  property_id     text not null,
  source_item_id  uuid not null references public.database_rows (id) on delete cascade,
  target_item_id  uuid not null references public.database_rows (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (property_id, source_item_id, target_item_id)
);

create index if not exists relation_links_src_idx
  on public.relation_links (user_id, property_id, source_item_id);

create index if not exists relation_links_tgt_idx
  on public.relation_links (user_id, property_id, target_item_id);

-- uuid válido ou null (evita erro de cast em filtros de relação).
create or replace function public.safe_uuid(v text)
returns uuid
language sql
immutable
parallel safe
as $$
  select case
    when v ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then v::uuid
    else null
  end;
$$;

-- Filtro por propriedade (operadores: is | is_not | is_empty | is_not_empty).
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

-- Página de linhas por keyset, com busca e filtros no servidor (security invoker:
-- a RLS continua valendo). Dropa a assinatura antiga (p_checkbox) antes de
-- recriar, pois `create or replace` não renomeia parâmetros.
drop function if exists public.database_rows_page(
  uuid, integer, integer, uuid, text, jsonb
);

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
    and (
      p_cursor_position is null
      or (r.position, r.id) > (p_cursor_position, p_cursor_id)
    )
    and (
      p_search is null
      or p_search = ''
      or public.database_row_search_text(r.values) ilike '%' || p_search || '%'
    )
    -- Filtros por propriedade (valores no JSONB).
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) as f
      where not public.database_row_matches_filter(r.values, f)
    )
    -- Filtros de relação (vínculos na tabela de junção).
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) as f
      where (f ->> 'operator') like 'relation_%'
        and not (
          case f ->> 'operator'
            when 'relation_is' then exists (
              select 1 from public.relation_links l
              where l.property_id = f ->> 'columnId'
                and l.source_item_id = r.id
                and l.target_item_id = public.safe_uuid(f ->> 'value')
            )
            when 'relation_is_not' then not exists (
              select 1 from public.relation_links l
              where l.property_id = f ->> 'columnId'
                and l.source_item_id = r.id
                and l.target_item_id = public.safe_uuid(f ->> 'value')
            )
            when 'relation_is_empty' then not exists (
              select 1 from public.relation_links l
              where l.property_id = f ->> 'columnId'
                and l.source_item_id = r.id
            )
            when 'relation_is_not_empty' then exists (
              select 1 from public.relation_links l
              where l.property_id = f ->> 'columnId'
                and l.source_item_id = r.id
            )
            else true
          end
        )
    )
  order by r.position, r.id
  limit greatest(1, least(p_limit, 1000));
$$;

-- Grava uma única célula (merge no JSONB), sem precisar do mapa inteiro.
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

-- Próxima posição (fim da lista) para uma linha nova.
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

-- Contagem agrupada por database (uma consulta para a tela de databases).
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

-- Busca global de itens (linhas) para a paleta do Workspace: procura por
-- substring nos valores de TODAS as linhas do usuário, reusando o índice trigram
-- (`database_rows_search_trgm_idx`). `security invoker` → a RLS limita ao dono.
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
-- Rollup (calculado): helpers puros usados por `rollup_values_for_rows`.
-- ----------------------------------------------------------------------------
-- (A tabela `relation_links` e o `safe_uuid` — usados por `database_rows_page` —
--  são definidos acima, junto das demais funções das linhas.)

-- Valor numérico de uma célula (null quando não é número).
create or replace function public.rollup_number(v jsonb)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
    when jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (v #>> '{}')::numeric
    else null
  end;
$$;

-- Texto de uma célula (null quando vazia). Arrays viram lista separada por vírgula.
create or replace function public.rollup_text(v jsonb)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'array'
      then nullif((select string_agg(x, ', ') from jsonb_array_elements_text(v) as x), '')
    when jsonb_typeof(v) = 'boolean'
      then case when (v #>> '{}') = 'true' then 'true' else 'false' end
    else nullif(v #>> '{}', '')
  end;
$$;

-- Célula vazia (sem valor)?
create or replace function public.rollup_is_empty(v jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when v is null then true
    when jsonb_typeof(v) = 'array' then jsonb_array_length(v) = 0
    when jsonb_typeof(v) = 'string' then (v #>> '{}') = ''
    else false
  end;
$$;

-- ----------------------------------------------------------------------------
-- Calcular (agregado de coluna no rodapé): parser pt-BR + RPC somente leitura.
-- ----------------------------------------------------------------------------

-- Parser numérico pt-BR (espelha `parseNumberValue` do cliente): remove espaços,
-- remove `.` de milhar (seguido de exatamente 3 dígitos), troca a vírgula
-- decimal por ponto e valida. Vazio/não numérico → null.
create or replace function public.database_parse_number(v text)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when t.norm ~ '^-?[0-9]+(\.[0-9]+)?$' then t.norm::numeric
    else null
  end
  from (
    select replace(
      regexp_replace(
        regexp_replace(coalesce(v, ''), '\s', '', 'g'),
        '\.(?=[0-9]{3}([^0-9]|$))',
        '',
        'g'
      ),
      ',',
      '.'
    ) as norm
  ) t;
$$;

-- Agrega colunas numéricas sobre **todas** as linhas do database, respeitando a
-- busca e os filtros (o mesmo WHERE de `database_rows_page`, sem keyset/limit).
-- p_configs: [{ "columnId": "<id>", "fn": "<fn>" }, ...].
create or replace function public.database_column_aggregates(
  p_database_id uuid,
  p_configs jsonb,
  p_search text default null,
  p_filters jsonb default null
)
returns table (column_id text, value jsonb)
language sql
security invoker
stable
as $$
  with cfg as (
    select c ->> 'columnId' as column_id,
           c ->> 'fn' as fn
    from jsonb_array_elements(coalesce(p_configs, '[]'::jsonb)) as c
  ),
  filtered as (
    select r.values
    from public.database_rows r
    where r.database_id = p_database_id
      and (
        p_search is null
        or p_search = ''
        or public.database_row_search_text(r.values) ilike '%' || p_search || '%'
      )
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) as f
        where not public.database_row_matches_filter(r.values, f)
      )
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) as f
        where (f ->> 'operator') like 'relation_%'
          and not (
            case f ->> 'operator'
              when 'relation_is' then exists (
                select 1 from public.relation_links l
                where l.property_id = f ->> 'columnId'
                  and l.source_item_id = r.id
                  and l.target_item_id = public.safe_uuid(f ->> 'value')
              )
              when 'relation_is_not' then not exists (
                select 1 from public.relation_links l
                where l.property_id = f ->> 'columnId'
                  and l.source_item_id = r.id
                  and l.target_item_id = public.safe_uuid(f ->> 'value')
              )
              when 'relation_is_empty' then not exists (
                select 1 from public.relation_links l
                where l.property_id = f ->> 'columnId'
                  and l.source_item_id = r.id
              )
              when 'relation_is_not_empty' then exists (
                select 1 from public.relation_links l
                where l.property_id = f ->> 'columnId'
                  and l.source_item_id = r.id
              )
              else true
            end
          )
      )
  )
  select cfg.column_id, agg.value
  from cfg
  cross join lateral (
    select case cfg.fn
      when 'count_all' then
        to_jsonb(count(*))
      when 'count_filled' then
        to_jsonb(count(*) filter (where not public.rollup_is_empty(fr.values -> cfg.column_id)))
      when 'count_empty' then
        to_jsonb(count(*) filter (where public.rollup_is_empty(fr.values -> cfg.column_id)))
      when 'count_unique' then
        to_jsonb(count(distinct coalesce(
          public.database_parse_number(fr.values ->> cfg.column_id)::text,
          fr.values ->> cfg.column_id
        )) filter (where not public.rollup_is_empty(fr.values -> cfg.column_id)))
      when 'percent_filled' then
        case when count(*) = 0 then to_jsonb(0)
             else to_jsonb(round(
               100.0 * count(*) filter (where not public.rollup_is_empty(fr.values -> cfg.column_id))
               / count(*), 1))
        end
      when 'percent_empty' then
        case when count(*) = 0 then to_jsonb(0)
             else to_jsonb(round(
               100.0 * count(*) filter (where public.rollup_is_empty(fr.values -> cfg.column_id))
               / count(*), 1))
        end
      when 'sum' then
        case when count(public.database_parse_number(fr.values ->> cfg.column_id)) = 0
             then 'null'::jsonb
             else to_jsonb(sum(public.database_parse_number(fr.values ->> cfg.column_id)))
        end
      when 'avg' then
        to_jsonb(avg(public.database_parse_number(fr.values ->> cfg.column_id)))
      when 'median' then
        to_jsonb(percentile_cont(0.5) within group (
          order by public.database_parse_number(fr.values ->> cfg.column_id)
        ))
      when 'min' then
        to_jsonb(min(public.database_parse_number(fr.values ->> cfg.column_id)))
      when 'max' then
        to_jsonb(max(public.database_parse_number(fr.values ->> cfg.column_id)))
      when 'range' then
        case when count(public.database_parse_number(fr.values ->> cfg.column_id)) = 0
             then 'null'::jsonb
             else to_jsonb(
               max(public.database_parse_number(fr.values ->> cfg.column_id))
               - min(public.database_parse_number(fr.values ->> cfg.column_id)))
        end
      else 'null'::jsonb
    end as value
    from filtered fr
  ) agg;
$$;

-- Remove uma coluna espelho (e os vínculos dela) de onde ela estiver.
create or replace function public.relation_reverse_remove(p_reverse_column_id text)
returns void
language plpgsql
security invoker
as $$
begin
  if p_reverse_column_id is null or p_reverse_column_id = '' then
    return;
  end if;
  delete from public.relation_links where property_id = p_reverse_column_id;
  update public.databases d
  set columns = coalesce((
    select jsonb_agg(c)
    from jsonb_array_elements(d.columns) c
    where c ->> 'id' <> p_reverse_column_id
  ), '[]'::jsonb)
  where exists (
    select 1 from jsonb_array_elements(d.columns) c
    where c ->> 'id' = p_reverse_column_id
  );
end;
$$;

-- Cria/atualiza a coluna de relação na origem e, quando bidirecional, o espelho
-- no database alvo (numa única transação). Devolve o id do espelho (ou null).
create or replace function public.relation_property_create(
  p_database_id uuid,
  p_column_id text,
  p_name text,
  p_relation_database_id uuid,
  p_limit text,
  p_bidirectional boolean,
  p_reverse_column_id text,
  p_reverse_name text
)
returns text
language plpgsql
security invoker
as $$
declare
  v_old_reverse text;
  v_old_reverse_db uuid;
  v_reverse_id text;
  v_new_col jsonb;
  v_reverse_col jsonb;
begin
  if not exists (select 1 from public.databases where id = p_database_id) then
    raise exception 'database de origem não encontrado';
  end if;
  if not exists (select 1 from public.databases where id = p_relation_database_id) then
    raise exception 'database de destino não encontrado';
  end if;

  select c ->> 'reversePropertyId'
    into v_old_reverse
  from public.databases d, jsonb_array_elements(d.columns) c
  where d.id = p_database_id and c ->> 'id' = p_column_id;

  if v_old_reverse is not null then
    select d.id into v_old_reverse_db
    from public.databases d, jsonb_array_elements(d.columns) c
    where c ->> 'id' = v_old_reverse;
  end if;

  if v_old_reverse is not null
     and (not coalesce(p_bidirectional, false) or v_old_reverse_db is distinct from p_relation_database_id)
  then
    perform public.relation_reverse_remove(v_old_reverse);
    v_old_reverse := null;
    v_old_reverse_db := null;
  end if;

  if coalesce(p_bidirectional, false) then
    v_reverse_id := coalesce(
      v_old_reverse,
      nullif(p_reverse_column_id, ''),
      'col_' || replace(gen_random_uuid()::text, '-', '')
    );
  else
    v_reverse_id := null;
  end if;

  v_new_col := jsonb_strip_nulls(jsonb_build_object(
    'id', p_column_id,
    'name', p_name,
    'type', 'relation',
    'relationDatabaseId', p_relation_database_id,
    'limit', coalesce(nullif(p_limit, ''), 'many'),
    'isBidirectional', coalesce(p_bidirectional, false),
    'reversePropertyId', v_reverse_id
  ));

  if exists (
    select 1 from public.databases d, jsonb_array_elements(d.columns) c
    where d.id = p_database_id and c ->> 'id' = p_column_id
  ) then
    update public.databases d
    set columns = (
      select jsonb_agg(case when c ->> 'id' = p_column_id then v_new_col else c end)
      from jsonb_array_elements(d.columns) c
    )
    where d.id = p_database_id;
  else
    update public.databases d
    set columns = d.columns || jsonb_build_array(v_new_col)
    where d.id = p_database_id;
  end if;

  if v_reverse_id is not null then
    v_reverse_col := jsonb_build_object(
      'id', v_reverse_id,
      'name', coalesce(nullif(p_reverse_name, ''), 'Relacionado'),
      'type', 'relation',
      'relationDatabaseId', p_database_id,
      'limit', 'many',
      'isBidirectional', true,
      'reversePropertyId', p_column_id
    );

    if exists (
      select 1 from public.databases d, jsonb_array_elements(d.columns) c
      where d.id = p_relation_database_id and c ->> 'id' = v_reverse_id
    ) then
      update public.databases d
      set columns = (
        select jsonb_agg(case when c ->> 'id' = v_reverse_id then v_reverse_col else c end)
        from jsonb_array_elements(d.columns) c
      )
      where d.id = p_relation_database_id;
    else
      update public.databases d
      set columns = d.columns || jsonb_build_array(v_reverse_col)
      where d.id = p_relation_database_id;
    end if;
  end if;

  -- Ao configurar como "um item", remove os vínculos excedentes (mantém o mais
  -- antigo por origem) e os espelhos correspondentes.
  if coalesce(nullif(p_limit, ''), 'many') = 'one' then
    perform public.relation_property_set_limit(p_database_id, p_column_id, 'one');
  end if;

  return v_reverse_id;
end;
$$;

-- Atualiza o limite (um/vários). Ao virar "um", mantém o vínculo mais antigo de
-- cada origem (e o espelho correspondente) e remove os excedentes.
create or replace function public.relation_property_set_limit(
  p_database_id uuid,
  p_column_id text,
  p_limit text
)
returns void
language plpgsql
security invoker
as $$
declare
  v_reverse text;
begin
  select c ->> 'reversePropertyId'
    into v_reverse
  from public.databases d, jsonb_array_elements(d.columns) c
  where d.id = p_database_id and c ->> 'id' = p_column_id;

  update public.databases d
  set columns = (
    select jsonb_agg(
      case when c ->> 'id' = p_column_id
        then c || jsonb_build_object('limit', coalesce(nullif(p_limit, ''), 'many'))
        else c end
    )
    from jsonb_array_elements(d.columns) c
  )
  where d.id = p_database_id
    and exists (
      select 1 from jsonb_array_elements(d.columns) c
      where c ->> 'id' = p_column_id
    );

  if p_limit = 'one' then
    create temp table _relation_excess on commit drop as
      select id, source_item_id, target_item_id
      from (
        select id, source_item_id, target_item_id,
               row_number() over (partition by source_item_id order by created_at, id) as rn
        from public.relation_links
        where property_id = p_column_id
      ) t
      where rn > 1;

    delete from public.relation_links l
    using _relation_excess e
    where l.id = e.id;

    if v_reverse is not null then
      delete from public.relation_links m
      using _relation_excess e
      where m.property_id = v_reverse
        and m.source_item_id = e.target_item_id
        and m.target_item_id = e.source_item_id;
    end if;

    drop table _relation_excess;
  end if;
end;
$$;

-- Remove a propriedade de relação: coluna da origem, vínculos e espelho.
create or replace function public.relation_property_delete(
  p_database_id uuid,
  p_column_id text
)
returns void
language plpgsql
security invoker
as $$
declare
  v_reverse text;
begin
  select c ->> 'reversePropertyId'
    into v_reverse
  from public.databases d, jsonb_array_elements(d.columns) c
  where d.id = p_database_id and c ->> 'id' = p_column_id;

  delete from public.relation_links where property_id = p_column_id;

  if v_reverse is not null then
    perform public.relation_reverse_remove(v_reverse);
  end if;

  update public.databases d
  set columns = coalesce((
    select jsonb_agg(c)
    from jsonb_array_elements(d.columns) c
    where c ->> 'id' <> p_column_id
  ), '[]'::jsonb)
  where d.id = p_database_id;
end;
$$;

-- Adiciona um vínculo (valida posse, duplicado e limite) e o espelho.
create or replace function public.relation_link_add(
  p_property_id text,
  p_source_item_id uuid,
  p_target_item_id uuid
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user uuid := auth.uid();
  v_limit text;
  v_bidirectional boolean;
  v_reverse text;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'não autenticado';
  end if;

  select c ->> 'limit',
         coalesce((c ->> 'isBidirectional')::boolean, false),
         c ->> 'reversePropertyId'
    into v_limit, v_bidirectional, v_reverse
  from public.database_rows r
  join public.databases d on d.id = r.database_id
  cross join lateral jsonb_array_elements(d.columns) c
  where r.id = p_source_item_id and c ->> 'id' = p_property_id;

  if not found then
    raise exception 'propriedade de relação não encontrada';
  end if;

  if not exists (select 1 from public.database_rows where id = p_target_item_id) then
    raise exception 'item de destino não encontrado';
  end if;

  if v_limit = 'one'
     and exists (
       select 1 from public.relation_links
       where property_id = p_property_id and source_item_id = p_source_item_id
     )
  then
    raise exception 'Esta relação permite apenas um item.';
  end if;

  insert into public.relation_links (user_id, property_id, source_item_id, target_item_id)
  values (v_user, p_property_id, p_source_item_id, p_target_item_id)
  on conflict (property_id, source_item_id, target_item_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.relation_links
    where property_id = p_property_id
      and source_item_id = p_source_item_id
      and target_item_id = p_target_item_id;
  end if;

  if v_bidirectional and v_reverse is not null then
    insert into public.relation_links (user_id, property_id, source_item_id, target_item_id)
    values (v_user, v_reverse, p_target_item_id, p_source_item_id)
    on conflict (property_id, source_item_id, target_item_id) do nothing;
  end if;

  return v_id;
end;
$$;

-- Remove um vínculo e o espelho correspondente (quando houver).
create or replace function public.relation_link_remove(
  p_property_id text,
  p_source_item_id uuid,
  p_target_item_id uuid
)
returns void
language plpgsql
security invoker
as $$
declare
  v_reverse text;
begin
  select c ->> 'reversePropertyId'
    into v_reverse
  from public.database_rows r
  join public.databases d on d.id = r.database_id
  cross join lateral jsonb_array_elements(d.columns) c
  where r.id = p_source_item_id and c ->> 'id' = p_property_id;

  delete from public.relation_links
  where property_id = p_property_id
    and source_item_id = p_source_item_id
    and target_item_id = p_target_item_id;

  if v_reverse is not null then
    delete from public.relation_links
    where property_id = v_reverse
      and source_item_id = p_target_item_id
      and target_item_id = p_source_item_id;
  end if;
end;
$$;

-- Carrega em lote os vínculos das linhas informadas (evita N+1).
create or replace function public.relation_links_for_rows(p_row_ids uuid[])
returns table (property_id text, source_item_id uuid, target_item_id uuid)
language sql
security invoker
stable
as $$
  select l.property_id, l.source_item_id, l.target_item_id
  from public.relation_links l
  where l.source_item_id = any(p_row_ids)
  order by l.created_at, l.id;
$$;

-- Rollup calculado on-the-fly (somente leitura) para as linhas da página.
-- p_configs: [{ "propertyId", "relationPropertyId", "targetPropertyId", "fn", "targetType" }]
create or replace function public.rollup_values_for_rows(p_configs jsonb, p_row_ids uuid[])
returns table (row_id uuid, property_id text, value jsonb)
language sql
security invoker
stable
as $$
  with cfg as (
    select c ->> 'propertyId' as property_id,
           c ->> 'relationPropertyId' as relation_property_id,
           c ->> 'targetPropertyId' as target_property_id,
           c ->> 'fn' as fn,
           coalesce(c ->> 'targetType', '') as target_type
    from jsonb_array_elements(coalesce(p_configs, '[]'::jsonb)) c
  ),
  cells as (
    select ri.row_id,
           cfg.property_id,
           cfg.fn,
           cfg.target_type,
           l.id as link_id,
           l.created_at as link_created,
           t.values -> cfg.target_property_id as cell
    from unnest(p_row_ids) as ri(row_id)
    cross join cfg
    left join public.relation_links l
      on l.property_id = cfg.relation_property_id
     and l.source_item_id = ri.row_id
    left join public.database_rows t on t.id = l.target_item_id
  )
  select
    row_id,
    property_id,
    case fn
      when 'count_all' then to_jsonb(count(link_id))
      when 'count_filled' then to_jsonb(count(link_id) filter (where not public.rollup_is_empty(cell)))
      when 'count_empty' then to_jsonb(count(link_id) - count(link_id) filter (where not public.rollup_is_empty(cell)))
      when 'sum' then
        case when count(link_id) = 0 then 'null'::jsonb
             else to_jsonb(coalesce(sum(public.rollup_number(cell)), 0)) end
      when 'avg' then to_jsonb(avg(public.rollup_number(cell)))
      when 'median' then to_jsonb(percentile_cont(0.5) within group (order by public.rollup_number(cell)))
      when 'min' then
        case when target_type = 'number' then to_jsonb(min(public.rollup_number(cell)))
             else to_jsonb(min(public.rollup_text(cell))) end
      when 'max' then
        case when target_type = 'number' then to_jsonb(max(public.rollup_number(cell)))
             else to_jsonb(max(public.rollup_text(cell))) end
      when 'range' then
        case when count(public.rollup_number(cell)) = 0 then 'null'::jsonb
             else to_jsonb(max(public.rollup_number(cell)) - min(public.rollup_number(cell))) end
      when 'percent_checked' then
        case when count(link_id) = 0 then to_jsonb(0)
             else to_jsonb(round(100.0 * count(link_id) filter (where public.rollup_text(cell) = 'true') / count(link_id), 1)) end
      when 'earliest_date' then to_jsonb(min(public.rollup_text(cell)))
      when 'latest_date' then to_jsonb(max(public.rollup_text(cell)))
      when 'show_original' then to_jsonb(array_remove(array_agg(public.rollup_text(cell) order by link_created), null))
      else 'null'::jsonb
    end as value
  from cells
  group by row_id, property_id, fn, target_type;
$$;

-- Limpeza ao excluir um database: remove espelhos que apontavam para ele.
create or replace function public.relation_cleanup_for_database(p_database_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  r record;
begin
  for r in
    select d.id as db_id, c ->> 'id' as col_id
    from public.databases d, jsonb_array_elements(d.columns) c
    where c ->> 'relationDatabaseId' = p_database_id::text
  loop
    delete from public.relation_links where property_id = r.col_id;
    update public.databases d
    set columns = coalesce((
      select jsonb_agg(c)
      from jsonb_array_elements(d.columns) c
      where c ->> 'id' <> r.col_id
    ), '[]'::jsonb)
    where d.id = r.db_id;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Tabela de modelos de página (templates) de um database
-- ----------------------------------------------------------------------------
create table if not exists public.database_templates (
  id          uuid primary key default gen_random_uuid(),
  database_id uuid not null references public.databases (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  content     text not null default '',
  -- Regra de recorrência opcional: { frequency, interval, weekdays, end, ... }
  recurrence  jsonb,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists database_templates_user_db_idx
  on public.database_templates (user_id, database_id, position);

-- ----------------------------------------------------------------------------
-- Tabela de categorias de projetos (por usuário)
-- Classificam projetos e guardam a ordem exibida no seletor do popover
-- "Novo projeto"; `position` é atualizada quando o usuário arrasta (drag & drop).
-- ----------------------------------------------------------------------------
create table if not exists public.project_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Nome exibido da categoria (ex.: Pessoal, Trabalho...). Único por usuário.
  name        text not null,
  -- Classe de cor do marcador da categoria (estilo Notion). Nullable = padrão.
  color       text,
  -- Ordem de exibição (menor = primeiro). Atualizada no drag & drop.
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists project_categories_user_idx
  on public.project_categories (user_id, position);

-- ----------------------------------------------------------------------------
-- Row Level Security: cada usuário só acessa os próprios projetos
-- ----------------------------------------------------------------------------
alter table public.projects enable row level security;

drop policy if exists "Projetos são visíveis apenas pelo dono" on public.projects;
create policy "Projetos são visíveis apenas pelo dono"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "Usuário insere seus próprios projetos" on public.projects;
create policy "Usuário insere seus próprios projetos"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "Usuário atualiza seus próprios projetos" on public.projects;
create policy "Usuário atualiza seus próprios projetos"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Usuário remove seus próprios projetos" on public.projects;
create policy "Usuário remove seus próprios projetos"
  on public.projects for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Row Level Security: cada usuário só acessa as próprias categorias de projetos
-- ----------------------------------------------------------------------------
alter table public.project_categories enable row level security;

drop policy if exists "Categorias são visíveis apenas pelo dono" on public.project_categories;
create policy "Categorias são visíveis apenas pelo dono"
  on public.project_categories for select
  using (auth.uid() = user_id);

drop policy if exists "Usuário insere suas próprias categorias" on public.project_categories;
create policy "Usuário insere suas próprias categorias"
  on public.project_categories for insert
  with check (auth.uid() = user_id);

drop policy if exists "Usuário atualiza suas próprias categorias" on public.project_categories;
create policy "Usuário atualiza suas próprias categorias"
  on public.project_categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Usuário remove suas próprias categorias" on public.project_categories;
create policy "Usuário remove suas próprias categorias"
  on public.project_categories for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Trigger para manter updated_at atualizado (reutiliza public.set_updated_at)
-- ----------------------------------------------------------------------------
drop trigger if exists project_categories_set_updated_at on public.project_categories;
create trigger project_categories_set_updated_at
  before update on public.project_categories
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security: cada usuário só acessa os próprios databases
-- ----------------------------------------------------------------------------
alter table public.databases enable row level security;

drop policy if exists "Databases são visíveis apenas pelo dono" on public.databases;
create policy "Databases são visíveis apenas pelo dono"
  on public.databases for select
  using (auth.uid() = user_id);

drop policy if exists "Usuário insere seus próprios databases" on public.databases;
create policy "Usuário insere seus próprios databases"
  on public.databases for insert
  with check (auth.uid() = user_id);

drop policy if exists "Usuário atualiza seus próprios databases" on public.databases;
create policy "Usuário atualiza seus próprios databases"
  on public.databases for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Usuário remove seus próprios databases" on public.databases;
create policy "Usuário remove seus próprios databases"
  on public.databases for delete
  using (auth.uid() = user_id);

alter table public.database_rows enable row level security;

drop policy if exists "Linhas de database visíveis apenas pelo dono" on public.database_rows;
create policy "Linhas de database visíveis apenas pelo dono"
  on public.database_rows for select
  using (auth.uid() = user_id);

drop policy if exists "Usuário insere linhas dos seus databases" on public.database_rows;
create policy "Usuário insere linhas dos seus databases"
  on public.database_rows for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.databases d
      where d.id = database_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "Usuário atualiza linhas dos seus databases" on public.database_rows;
create policy "Usuário atualiza linhas dos seus databases"
  on public.database_rows for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Usuário remove linhas dos seus databases" on public.database_rows;
create policy "Usuário remove linhas dos seus databases"
  on public.database_rows for delete
  using (auth.uid() = user_id);

alter table public.database_templates enable row level security;

drop policy if exists "Modelos visíveis apenas pelo dono" on public.database_templates;
create policy "Modelos visíveis apenas pelo dono"
  on public.database_templates for select
  using (auth.uid() = user_id);

drop policy if exists "Usuário insere modelos dos seus databases" on public.database_templates;
create policy "Usuário insere modelos dos seus databases"
  on public.database_templates for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.databases d
      where d.id = database_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "Usuário atualiza modelos dos seus databases" on public.database_templates;
create policy "Usuário atualiza modelos dos seus databases"
  on public.database_templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Usuário remove modelos dos seus databases" on public.database_templates;
create policy "Usuário remove modelos dos seus databases"
  on public.database_templates for delete
  using (auth.uid() = user_id);

-- Vínculos de relação: cada usuário só acessa os próprios vínculos.
alter table public.relation_links enable row level security;

drop policy if exists "Vínculos visíveis apenas pelo dono" on public.relation_links;
create policy "Vínculos visíveis apenas pelo dono"
  on public.relation_links for select
  using (auth.uid() = user_id);

drop policy if exists "Usuário insere seus próprios vínculos" on public.relation_links;
create policy "Usuário insere seus próprios vínculos"
  on public.relation_links for insert
  with check (auth.uid() = user_id);

drop policy if exists "Usuário atualiza seus próprios vínculos" on public.relation_links;
create policy "Usuário atualiza seus próprios vínculos"
  on public.relation_links for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Usuário remove seus próprios vínculos" on public.relation_links;
create policy "Usuário remove seus próprios vínculos"
  on public.relation_links for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Triggers para manter updated_at atualizado (reutiliza public.set_updated_at)
-- ----------------------------------------------------------------------------
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();

drop trigger if exists databases_set_updated_at on public.databases;
create trigger databases_set_updated_at
  before update on public.databases
  for each row
  execute function public.set_updated_at();

drop trigger if exists database_rows_set_updated_at on public.database_rows;
create trigger database_rows_set_updated_at
  before update on public.database_rows
  for each row
  execute function public.set_updated_at();

drop trigger if exists database_templates_set_updated_at on public.database_templates;
create trigger database_templates_set_updated_at
  before update on public.database_templates
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Tabela de navegação entre databases abertos (por usuário)
-- Guarda os databases "abertos" na faixa acima da tabela (chips) e o database
-- aberto no momento, para que a navegação acompanhe a conta em qualquer
-- dispositivo. Uma linha por usuário (upsert por `user_id`).
-- ----------------------------------------------------------------------------
create table if not exists public.workspace_open_databases (
  -- Uma linha por usuário.
  user_id      uuid primary key references auth.users (id) on delete cascade,
  -- Ids dos databases abertos (chips), na ordem de exibição.
  database_ids jsonb not null default '[]'::jsonb,
  -- Database aberto no momento (null = nenhum). Vira null se for excluído.
  selected_id  uuid references public.databases (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Row Level Security: cada usuário só acessa a própria navegação
-- ----------------------------------------------------------------------------
alter table public.workspace_open_databases enable row level security;

drop policy if exists "Navegação é visível apenas pelo dono" on public.workspace_open_databases;
create policy "Navegação é visível apenas pelo dono"
  on public.workspace_open_databases for select
  using (auth.uid() = user_id);

drop policy if exists "Usuário insere sua própria navegação" on public.workspace_open_databases;
create policy "Usuário insere sua própria navegação"
  on public.workspace_open_databases for insert
  with check (auth.uid() = user_id);

drop policy if exists "Usuário atualiza sua própria navegação" on public.workspace_open_databases;
create policy "Usuário atualiza sua própria navegação"
  on public.workspace_open_databases for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Usuário remove sua própria navegação" on public.workspace_open_databases;
create policy "Usuário remove sua própria navegação"
  on public.workspace_open_databases for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Trigger para manter updated_at atualizado (reutiliza public.set_updated_at)
-- ----------------------------------------------------------------------------
drop trigger if exists workspace_open_databases_set_updated_at on public.workspace_open_databases;
create trigger workspace_open_databases_set_updated_at
  before update on public.workspace_open_databases
  for each row
  execute function public.set_updated_at();


-- ============================================================================
-- Storage — imagens das páginas (editor estilo Notion)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Bucket público `page-images` (leitura pública, escrita restrita ao dono)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'page-images',
  'page-images',
  true,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- NÃO criamos policy de SELECT: o bucket é público, então a leitura da imagem
-- usa o endpoint /object/public/... (não passa pelo RLS). Sem policy SELECT,
-- ninguém consegue LISTAR o conteúdo do bucket.
drop policy if exists "Imagens de página são públicas" on storage.objects;

drop policy if exists "Usuário envia imagens para sua pasta" on storage.objects;
create policy "Usuário envia imagens para sua pasta"
  on storage.objects for insert
  with check (
    bucket_id = 'page-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Usuário atualiza imagens da sua pasta" on storage.objects;
create policy "Usuário atualiza imagens da sua pasta"
  on storage.objects for update
  using (
    bucket_id = 'page-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'page-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Usuário remove imagens da sua pasta" on storage.objects;
create policy "Usuário remove imagens da sua pasta"
  on storage.objects for delete
  using (
    bucket_id = 'page-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

