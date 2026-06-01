-- FitMarket AI: persistencia MVP del plan semanal generado (WeeklyPlan en JSON)
-- Requiere: auth.users (Supabase Auth)
-- Ejecutar en Supabase → SQL Editor → New query → Run

-- ---------------------------------------------------------------------------
-- 1. Tabla weekly_plans
-- ---------------------------------------------------------------------------

create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.weekly_plans is
  'Planes semanales generados (menú + lista de mercado) serializados como WeeklyPlan JSON.';

comment on column public.weekly_plans.plan_json is
  'Objeto WeeklyPlan: summary, weekly_menu, shopping_list.';

-- ---------------------------------------------------------------------------
-- 2. Índice por usuario (listar / cargar planes del dueño)
-- ---------------------------------------------------------------------------

create index if not exists weekly_plans_user_id_idx
  on public.weekly_plans (user_id);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.weekly_plans enable row level security;

drop policy if exists "Users can view own weekly plans" on public.weekly_plans;
drop policy if exists "Users can insert own weekly plans" on public.weekly_plans;
drop policy if exists "Users can update own weekly plans" on public.weekly_plans;

create policy "Users can view own weekly plans"
  on public.weekly_plans
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own weekly plans"
  on public.weekly_plans
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own weekly plans"
  on public.weekly_plans
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Trigger updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_weekly_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists weekly_plans_updated_at on public.weekly_plans;

create trigger weekly_plans_updated_at
  before update on public.weekly_plans
  for each row
  execute function public.set_weekly_plans_updated_at();
