-- Migration: adiciona a ordem de exibição (`position`) dos projetos.
-- A sidebar de projetos permite reordenar por arraste (drag & drop); a nova
-- ordem é persistida nesta coluna. Aplicar com: supabase db push

alter table public.projects
  add column if not exists position integer not null default 0;

-- Inicializa a ordem dos projetos existentes pela data de criação.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at asc, id asc
    ) - 1 as rn
  from public.projects
)
update public.projects p
  set position = ranked.rn
  from ranked
  where p.id = ranked.id and p.position = 0 and ranked.rn > 0;

create index if not exists projects_user_position_idx
  on public.projects (user_id, position);
