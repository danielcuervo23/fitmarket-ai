-- FitMarket AI: restricciones alimentarias y alergias en profiles
-- Requiere: 001_create_profiles.sql
-- Ejecutar en Supabase → SQL Editor → New query → Run

alter table public.profiles
  add column if not exists dietary_restrictions text[] not null default '{}';

comment on column public.profiles.dietary_restrictions is
  'Restricciones y alergias: ids predefinidos (lactose, gluten, vegan, etc.) y texto libre para otros alimentos a evitar. Vacío = sin restricciones.';
