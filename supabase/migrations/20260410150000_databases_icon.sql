-- Migration: adiciona o ícone (nome de um ícone lucide) escolhido para um database.
-- Aplicar com: supabase db push

alter table public.databases
  add column if not exists icon text;
