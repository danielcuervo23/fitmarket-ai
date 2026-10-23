-- FitMarket AI: sexo (opcional) y personas en el hogar.
-- El sexo solo se usa para estimar el gasto calorico basal (Mifflin-St Jeor);
-- si el usuario no lo indica se usa un valor intermedio. Requiere: 001.

alter table public.profiles
  add column if not exists sex text
  check (sex is null or sex in ('female', 'male'));

comment on column public.profiles.sex is
  'Opcional. Solo para estimar calorias. NULL = prefiere no decirlo.';

alter table public.profiles
  add column if not exists household_size smallint not null default 1
  check (household_size between 1 and 8);

comment on column public.profiles.household_size is
  'Personas que comen del mismo mercado (1-8). Escala la lista de compras.';
