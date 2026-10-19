-- ----------------------------------------------------------------------------
-- Databases vinculados (visão ao vivo de outro database)
-- ----------------------------------------------------------------------------
-- Um database com `linked_database_id` preenchido é uma **visão vinculada**: não
-- tem colunas nem linhas próprias — exibe as mesmas propriedades e itens do
-- database de origem, e editar em um reflete no outro. O vínculo é resolvido no
-- cliente (a origem é lida de `linked_database_id`); aqui só guardamos a
-- referência.
--
-- Excluir a origem exclui as visões (`on delete cascade`).
--
-- Rode em ambiente de TESTE primeiro.

alter table public.databases
  add column if not exists linked_database_id uuid
  references public.databases (id) on delete cascade;

create index if not exists databases_linked_idx
  on public.databases (linked_database_id);

-- ----------------------------------------------------------------------------
-- Conferência (rodar à parte):
--
--   -- Criar uma visão vinculada (o cliente faz isso pela própria tabela).
--   -- Excluir a origem deve remover as visões:
--   select id, name, linked_database_id from public.databases
--   where linked_database_id = '<ORIGEM>';
-- ----------------------------------------------------------------------------
