-- Migration: cria a tabela de eventos com RLS por usuário.
-- Aplicar com: supabase db push

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
