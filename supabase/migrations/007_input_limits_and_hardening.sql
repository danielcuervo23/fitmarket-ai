-- FitMarket AI: limites de entrada y endurecimiento de la base de datos.
-- Requiere: 001 a 006.
-- Las restricciones se agregan NOT VALID para no fallar con datos antiguos;
-- se aplican igual a toda fila nueva o modificada.

-- 1. Limites para el texto libre que termina dentro del prompt de la IA
alter table public.profiles
  drop constraint if exists profiles_dietary_restrictions_limits;

alter table public.profiles
  add constraint profiles_dietary_restrictions_limits check (
    cardinality(dietary_restrictions) <= 20
    and char_length(array_to_string(dietary_restrictions, ',')) <= 600
  ) not valid;

-- 2. Tope razonable para el presupuesto semanal (COP)
alter table public.profiles
  drop constraint if exists profiles_weekly_budget_upper_bound;

alter table public.profiles
  add constraint profiles_weekly_budget_upper_bound check (
    weekly_budget_cop is null or weekly_budget_cop <= 20000000
  ) not valid;

-- 3. Funciones de trigger con search_path fijo
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_weekly_plans_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 4. Derecho a borrar los propios datos
drop policy if exists "Users can delete own weekly plans" on public.weekly_plans;
drop policy if exists "Users can delete own profile" on public.profiles;

create policy "Users can delete own weekly plans"
  on public.weekly_plans
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete own profile"
  on public.profiles
  for delete
  to authenticated
  using (auth.uid() = id);
