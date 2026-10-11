-- Migration: cria a tabela de Projetos e a hierarquia Projeto > Databases.
-- Um projeto agrupa vários databases; `databases.project_id` aponta para ele
-- (com cascade, para que excluir um projeto remova os databases dele).
-- Aplicar com: supabase db push

-- ----------------------------------------------------------------------------
-- Tabela de projetos (agrupadores de databases)
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'Novo projeto',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects (user_id);

-- ----------------------------------------------------------------------------
-- Vincula cada database a um projeto (nullable para dados legados)
-- ----------------------------------------------------------------------------
alter table public.databases
  add column if not exists project_id uuid references public.projects (id) on delete cascade;

create index if not exists databases_project_idx
  on public.databases (user_id, project_id);

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
-- Trigger para manter updated_at atualizado (reutiliza public.set_updated_at)
-- ----------------------------------------------------------------------------
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();
