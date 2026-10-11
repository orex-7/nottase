-- Migration: adiciona categoria e cor aos projetos.
-- `category` classifica o projeto (ex.: Pessoal, Trabalho, Estudos...).
-- `color`    guarda a classe de cor do marcador (estilo Notion) escolhida.
-- Aplicar com: supabase db push

alter table public.projects
  add column if not exists category text,
  add column if not exists color    text;
