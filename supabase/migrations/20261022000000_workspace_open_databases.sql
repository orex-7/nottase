-- Migration: cria a tabela de navegação entre databases abertos (por usuário).
-- Guarda os databases "abertos" na faixa acima da tabela (chips) e o database
-- aberto no momento, para que essa navegação acompanhe a conta do usuário em
-- qualquer dispositivo. Uma linha por usuário (upsert por `user_id`).
-- Aplicar com: supabase db push

-- ----------------------------------------------------------------------------
-- Tabela de navegação entre databases abertos
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
