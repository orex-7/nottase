-- Migration: cria as tabelas de Databases (databases, linhas e modelos de página) com RLS por usuário.
-- Aplicar com: supabase db push

-- ----------------------------------------------------------------------------
-- Tabela de databases (metadados + definição de colunas)
-- ----------------------------------------------------------------------------
create table if not exists public.databases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'Novo database',
  -- Array de colunas/propriedades: [{ id, name, type }, ...]
  columns     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists databases_user_idx on public.databases (user_id);

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

create index if not exists database_rows_user_db_idx
  on public.database_rows (user_id, database_id, position);

-- ----------------------------------------------------------------------------
-- Tabela de modelos de página (templates) de um database
-- ----------------------------------------------------------------------------
create table if not exists public.database_templates (
  id          uuid primary key default gen_random_uuid(),
  database_id uuid not null references public.databases (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  content     text not null default '',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists database_templates_user_db_idx
  on public.database_templates (user_id, database_id, position);

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

-- ----------------------------------------------------------------------------
-- Triggers para manter updated_at atualizado (reutiliza public.set_updated_at)
-- ----------------------------------------------------------------------------
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
