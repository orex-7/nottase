-- Migration: adiciona data de término (intervalo de datas) aos eventos.
-- Aplicar com: supabase db push

alter table public.events
  add column if not exists end_date date;

-- Garante que o término não seja anterior ao início.
alter table public.events
  add constraint events_end_date_after_start
  check (end_date is null or end_date >= date);
