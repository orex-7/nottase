-- ----------------------------------------------------------------------------
-- Calcular (agregado de coluna) no rodapé da tabela
-- ----------------------------------------------------------------------------
-- Rode em ambiente de TESTE primeiro. Não aplica em produção por aqui.
--
-- Agrega, **no servidor**, os valores de uma coluna numérica sobre **todas** as
-- linhas do database, respeitando a busca e os filtros da visão ativa (o mesmo
-- WHERE de `database_rows_page`, sem keyset/limit). A configuração fica em
-- `databases.columns[].calculate` (JSONB, camelCase) e é persistida pelo fluxo
-- normal de `updateDatabaseColumns` — não há tabela nova nem RPC de escrita.
--
-- `database_column_aggregates` é somente leitura (`security invoker` → a RLS
-- continua valendo) e devolve uma linha por config.

-- ----------------------------------------------------------------------------
-- 1) Parser numérico pt-BR (espelha `parseNumberValue` do cliente)
-- ----------------------------------------------------------------------------
-- Remove espaços; remove `.` de milhar (só quando seguido de exatamente 3
-- dígitos e o fim/um não-dígito); troca a vírgula decimal por ponto; valida o
-- formato. Vazio/não numérico → null.
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

-- ----------------------------------------------------------------------------
-- 2) Agregados por coluna (uma linha por config)
-- ----------------------------------------------------------------------------
-- p_configs: [{ "columnId": "<id>", "fn": "<fn>" }, ...]
-- p_search: texto da busca (debounced) da visão ativa.
-- p_filters: filtros por propriedade/relação (mesmo formato de `p_filters` de
--            `database_rows_page`).
--
-- Semântica: contagens/porcentagens → 0 quando não há linhas; demais funções →
-- null quando não há números. `database_parse_number` aceita "1.234,56".
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
  )
  select cfg.column_id, agg.value
  from cfg
  -- Agregação sem GROUP BY: sempre devolve uma linha, mesmo sem linhas filtradas
  -- (assim contagens viram 0 e as demais funções viram null).
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

-- ----------------------------------------------------------------------------
-- Conferência (rodar à parte):
--
--   -- Soma e contagem de uma coluna, sem filtros.
--   select * from public.database_column_aggregates(
--     '<DB>'::uuid,
--     '[{"columnId":"amount","fn":"sum"},{"columnId":"amount","fn":"count_filled"}]'::jsonb);
--
--   -- Mesmo cálculo com busca/filtros (deve bater com a Tabela filtrada).
--   select * from public.database_column_aggregates(
--     '<DB>'::uuid,
--     '[{"columnId":"amount","fn":"avg"}]'::jsonb,
--     'texto',
--     '[{"columnId":"status","operator":"is","value":"done"}]'::jsonb);
--
--   -- Parser pt-BR.
--   select public.database_parse_number('1.234,56'); -- 1234.56
--   select public.database_parse_number('1.234');    -- 1234
-- ----------------------------------------------------------------------------
