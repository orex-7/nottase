-- ----------------------------------------------------------------------------
-- Relação (junção) + Rollup (calculado)
-- ----------------------------------------------------------------------------
-- Rode em ambiente de TESTE primeiro. Não aplica em produção por aqui.
--
-- Antes a relação era guardada no próprio JSONB `database_rows.values` (um array
-- de ids de linhas). Agora os vínculos vivem numa tabela de junção
-- (`relation_links`) e a configuração da propriedade continua em
-- `databases.columns` (JSONB, chaves camelCase). O backfill migra os vínculos
-- antigos mantendo o JSONB intacto (rollback seguro).
--
-- `property_id` = id da coluna (text), sem FK. `user_id` = tenancy (não há
-- workspaces). Todas as RPCs são `security invoker` (a RLS continua valendo).

-- ----------------------------------------------------------------------------
-- 1) Tabela de vínculos entre linhas (junção) + índices
-- ----------------------------------------------------------------------------
create table if not exists public.relation_links (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- Id da coluna de relação (databases.columns[].id), sem FK (JSONB).
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
-- 2) Backfill idempotente: expande `values[coluna]` (array de ids) em vínculos.
--    Só cria vínculos para alvos que ainda existem (respeita a FK) e mantém o
--    JSONB (rollback seguro). Rodar de novo não duplica (`on conflict`).
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select d.id as db_id,
           d.user_id as user_id,
           c ->> 'id' as col_id
    from public.databases d
    cross join lateral jsonb_array_elements(d.columns) c
    where c ->> 'type' = 'relation'
      and nullif(c ->> 'relationDatabaseId', '') is not null
  loop
    insert into public.relation_links (user_id, property_id, source_item_id, target_item_id)
    select r.user_id, r.col_id, src.row_id, tgt.id
    from (
      select row.id as row_id,
             case
               when jsonb_typeof(row.values -> r.col_id) = 'array'
                 then row.values -> r.col_id
               else '[]'::jsonb
             end as arr
      from public.database_rows row
      where row.database_id = r.db_id
    ) src
    cross join lateral jsonb_array_elements_text(src.arr) as tid(value)
    join public.database_rows tgt on tgt.id = tid.value::uuid
    where tid.value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    on conflict (property_id, source_item_id, target_item_id) do nothing;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Helpers puros (rollup + cast seguro de uuid em filtros)
-- ----------------------------------------------------------------------------

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

-- Valor numérico de uma célula (null quando não é número). Guarda contra texto.
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
-- 4) Configuração da propriedade de relação (origem + espelho)
-- ----------------------------------------------------------------------------

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
-- É idempotente: pode ser chamada a cada alteração de configuração.
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

  -- Espelho anterior e onde ele vive.
  select c ->> 'reversePropertyId'
    into v_old_reverse
  from public.databases d, jsonb_array_elements(d.columns) c
  where d.id = p_database_id and c ->> 'id' = p_column_id;

  if v_old_reverse is not null then
    select d.id into v_old_reverse_db
    from public.databases d, jsonb_array_elements(d.columns) c
    where c ->> 'id' = v_old_reverse;
  end if;

  -- Espelho obsoleto: desligou o bidirecional ou trocou o database de destino.
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

  -- Upsert da coluna de origem.
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

-- Remove a propriedade de relação: a coluna da origem, os vínculos dela e o
-- espelho (coluna + vínculos) quando existir.
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

-- ----------------------------------------------------------------------------
-- 5) Vínculos (add/remove, com espelho e limite)
-- ----------------------------------------------------------------------------

-- Adiciona um vínculo. Valida posse, duplicado e limite. Quando a coluna é
-- bidirecional, insere também o vínculo espelho. Devolve o id do vínculo.
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

-- ----------------------------------------------------------------------------
-- 6) Rollup: calculado on-the-fly (somente leitura) para as linhas da página.
--    p_configs: [{ "propertyId", "relationPropertyId", "targetPropertyId", "fn", "targetType" }]
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 7) Limpeza ao excluir um database: remove espelhos (colunas + vínculos) que
--    apontavam para ele em outras databases.
-- ----------------------------------------------------------------------------
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
-- 8) Filtro de relação no servidor: estende `database_rows_page` com os
--    operadores relation_is | relation_is_not | relation_is_empty |
--    relation_is_not_empty (a assinatura é mantida — `create or replace` não
--    renomeia parâmetros).
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Conferência (rodar à parte):
--
--   -- Backfill: deve ser 0 após rodar duas vezes.
--   select count(*) from public.relation_links;
--
--   -- Vínculos de uma página de linhas.
--   select * from public.relation_links_for_rows(array['<ROW>']::uuid[]);
--
--   -- Rollup (contagem) de uma linha.
--   select * from public.rollup_values_for_rows(
--     '[{"propertyId":"col_r","relationPropertyId":"rel","targetPropertyId":"amount","fn":"sum","targetType":"number"}]'::jsonb,
--     array['<ROW>']::uuid[]);
-- ----------------------------------------------------------------------------
