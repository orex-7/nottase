-- Migration: adiciona a coluna `recurrence` (regra de recorrência) aos modelos de página.
-- Aplicar com: supabase db push

alter table public.database_templates
  add column if not exists recurrence jsonb;

comment on column public.database_templates.recurrence is
  'Regra de recorrência opcional do modelo (RRULE-like): { frequency, interval, weekdays, end, endDate?, endCount? }.';
