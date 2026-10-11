-- Migration: cria a tabela de categorias de projetos (por usuário).
-- As categorias classificam projetos (ex.: Pessoal, Trabalho, Estudos...) e
-- guardam a **ordem** exibida no seletor do popover "Novo projeto"; a ordem é
-- persistida em `position` e atualizada quando o usuário arrasta (drag & drop).
-- Aplicar com: supabase db push

-- ----------------------------------------------------------------------------
-- Tabela de categorias de projetos
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
  -- Evita categorias duplicadas para o mesmo usuário.
  unique (user_id, name)
);

create index if not exists project_categories_user_idx
  on public.project_categories (user_id, position);

-- ----------------------------------------------------------------------------
-- Row Level Security: cada usuário só acessa as próprias categorias
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
