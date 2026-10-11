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
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists databases_user_idx on public.databases (user_id);

create index if not exists databases_project_idx
  on public.databases (user_id, project_id);

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

