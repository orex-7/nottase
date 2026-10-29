-- Migration: automações dos databases (regras "quando → então") com fila no
-- Postgres e worker em Edge Function.
-- Cria as tabelas `database_automations` (regras) e `automation_jobs` (fila),
-- o gatilho que enfileira um job por escrita em `database_rows` e a RPC de
-- claim usada pelo worker (o PostgREST não faz `SKIP LOCKED`).
-- Aplicar com: supabase db push
--
-- O agendamento (pg_cron + pg_net + Vault) fica **fora** desta migration de
-- propósito: se as extensões não estiverem habilitadas, o `db push` quebraria.
-- O passo a passo está em supabase/functions/automation-worker/README.md.

-- ----------------------------------------------------------------------------
-- Regras de automação (por database). RLS por dono, como as demais tabelas.
-- ----------------------------------------------------------------------------
create table if not exists public.database_automations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  database_id uuid not null references public.databases (id) on delete cascade,
  name        text not null default 'Nova automação',
  enabled     boolean not null default true,
  position    integer not null default 0,
  -- Gatilho: { kind: 'row_created' | 'column_changed' | 'date_arrived', ... }
  trigger     jsonb not null default '{}'::jsonb,
  -- Ações: [{ kind: 'set_value' | 'create_row', ... }, ...]
  actions     jsonb not null default '[]'::jsonb,
  -- Observabilidade: última vez que a regra disparou (sem UI de erros).
  last_run_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists database_automations_db_idx
  on public.database_automations (user_id, database_id, position);

alter table public.database_automations enable row level security;

drop policy if exists "Automações são visíveis apenas pelo dono" on public.database_automations;
create policy "Automações são visíveis apenas pelo dono"
  on public.database_automations for select
  using (auth.uid() = user_id);

drop policy if exists "Usuário insere suas próprias automações" on public.database_automations;
create policy "Usuário insere suas próprias automações"
  on public.database_automations for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.databases d
      where d.id = database_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "Usuário atualiza suas próprias automações" on public.database_automations;
create policy "Usuário atualiza suas próprias automações"
  on public.database_automations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Usuário remove suas próprias automações" on public.database_automations;
create policy "Usuário remove suas próprias automações"
  on public.database_automations for delete
  using (auth.uid() = user_id);

drop trigger if exists database_automations_set_updated_at on public.database_automations;
create trigger database_automations_set_updated_at
  before update on public.database_automations
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Fila de jobs (server-only). Sem policies: só o `service_role` (que ignora a
-- RLS) e o gatilho `security definer` tocam nesta tabela.
-- ----------------------------------------------------------------------------
create table if not exists public.automation_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  database_id uuid not null references public.databases (id) on delete cascade,
  row_id      uuid references public.database_rows (id) on delete cascade,
  -- Evento: { kind, changed?, columnId?, date? }
  event       jsonb not null,
  -- Idempotência: impede duplicar o mesmo evento na mesma linha.
  trigger_key text not null,
  -- Profundidade do encadeamento (teto em 3, ver o worker).
  depth       integer not null default 0,
  status      text not null default 'pending',
  attempts    integer not null default 0,
  last_error  text,
  run_after   timestamptz not null default now(),
  locked_at   timestamptz,
  started_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (database_id, row_id, trigger_key)
);

create index if not exists automation_jobs_claim_idx
  on public.automation_jobs (status, run_after, created_at);

alter table public.automation_jobs enable row level security;

drop trigger if exists automation_jobs_set_updated_at on public.automation_jobs;
create trigger automation_jobs_set_updated_at
  before update on public.automation_jobs
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Enfileiramento por escrita em `database_rows`.
-- Registra um job por **escrita** (não por regra): o worker carrega as regras do
-- database e casa todas em TS. O caminho barato (sem regras habilitadas) sai
-- antes de qualquer trabalho.
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_automation_jobs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_depth integer := 0;
  v_headers text;
  v_changed jsonb;
begin
  -- Sem regras habilitadas no database, nada a fazer (não penaliza quem não usa).
  if not exists (
    select 1
    from public.database_automations a
    where a.database_id = new.database_id and a.enabled
  ) then
    return new;
  end if;

  -- Profundidade do encadeamento: o worker propaga via header, que o PostgREST
  -- expõe no GUC `request.headers`. Sem o GUC (ou valor inválido), assume 0.
  begin
    v_headers := current_setting('request.headers', true);
    if v_headers is not null and v_headers <> '' then
      v_depth := coalesce((v_headers::json ->> 'x-automation-depth')::integer, 0);
    end if;
  exception when others then
    v_depth := 0;
  end;

  if tg_op = 'INSERT' then
    insert into public.automation_jobs
      (user_id, database_id, row_id, event, trigger_key, depth)
    values
      (new.user_id, new.database_id, new.id,
       jsonb_build_object('kind', 'row_created'),
       'row:created', v_depth)
    on conflict (database_id, row_id, trigger_key) do nothing;
    return new;
  end if;

  -- UPDATE: diff das colunas que mudaram (só valores). Chaves removidas também
  -- entram (`from` presente, `to` nulo).
  select coalesce(
    jsonb_object_agg(
      d.key,
      jsonb_build_object('from', d.old_val, 'to', d.new_val)
    ),
    '{}'::jsonb
  )
  into v_changed
  from (
    select coalesce(n.key, o.key) as key,
           o.value as old_val,
           n.value as new_val
    from jsonb_each(new.values) as n(key, value)
    full join jsonb_each(old.values) as o(key, value) on o.key = n.key
  ) as d
  where d.old_val is distinct from d.new_val;

  -- Nenhuma coluna mudou (ex.: só a posição): não enfileira.
  if v_changed = '{}'::jsonb then
    return new;
  end if;

  insert into public.automation_jobs
    (user_id, database_id, row_id, event, trigger_key, depth)
  values
    (new.user_id, new.database_id, new.id,
     jsonb_build_object('kind', 'row_updated', 'changed', v_changed),
     'row:' || new.updated_at::text, v_depth)
  on conflict (database_id, row_id, trigger_key) do nothing;

  return new;
end;
$$;

drop trigger if exists database_rows_enqueue_automations on public.database_rows;
create trigger database_rows_enqueue_automations
  after insert or update on public.database_rows
  for each row
  execute function public.enqueue_automation_jobs();

-- ----------------------------------------------------------------------------
-- Claim do worker: pega os próximos jobs pendentes com `FOR UPDATE SKIP LOCKED`
-- (o PostgREST não expõe `SKIP LOCKED`, por isso a RPC). Marca como `running`,
-- incrementa `attempts` e devolve as linhas para o worker processar.
-- `security definer` + acesso restrito ao `service_role`: a função enxerga
-- jobs de todos os usuários, então NÃO pode ser chamável com a chave anônima.
-- ----------------------------------------------------------------------------
create or replace function public.automation_claim_jobs(p_limit integer default 10)
returns setof public.automation_jobs
language sql
security definer
set search_path = ''
as $$
  update public.automation_jobs j
  set status = 'running',
      locked_at = now(),
      started_at = now(),
      attempts = j.attempts + 1
  where j.id in (
    select id
    from public.automation_jobs
    where status = 'pending'
      and run_after <= now()
    order by created_at
    limit greatest(1, least(coalesce(p_limit, 10), 100))
    for update skip locked
  )
  returning j.*;
$$;

revoke execute on function public.automation_claim_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.automation_claim_jobs(integer)
  to service_role;

-- ----------------------------------------------------------------------------
-- Varredura dos gatilhos por data (`date_arrived`).
-- Enfileira 1 job por (linha, coluna, data) quando a data da coluna cai na
-- janela [hoje-1, hoje] no fuso America/Sao_Paulo. A chave única
-- `(database_id, row_id, trigger_key)` torna a varredura idempotente, então
-- rodar o cron de novo (ou perto da meia-noite) não duplica.
-- É uma função pura (sem pg_cron); o agendamento em si fica no README.
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_date_automations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_count integer := 0;
begin
  with due as (
    select a.user_id,
           a.database_id,
           a.trigger ->> 'columnId' as column_id,
           r.id as row_id,
           (r.values ->> (a.trigger ->> 'columnId')) as due_date
    from public.database_automations a
    join public.database_rows r on r.database_id = a.database_id
    where a.enabled
      and a.trigger ->> 'kind' = 'date_arrived'
      and (r.values ->> (a.trigger ->> 'columnId')) in (
        to_char(v_today, 'YYYY-MM-DD'),
        to_char(v_today - 1, 'YYYY-MM-DD')
      )
  )
  insert into public.automation_jobs
    (user_id, database_id, row_id, event, trigger_key)
  select user_id,
         database_id,
         row_id,
         jsonb_build_object(
           'kind', 'date_arrived',
           'columnId', column_id,
           'date', due_date
         ),
         'date:' || column_id || ':' || due_date
  from due
  on conflict (database_id, row_id, trigger_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.enqueue_date_automations()
  from public, anon, authenticated;
