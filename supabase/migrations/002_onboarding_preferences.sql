-- FitMarket AI: preferencias de onboarding (objetivos, presupuesto, supermercados)
-- Requiere: 001_create_profiles.sql
-- Ejecutar en Supabase → SQL Editor → New query → Run

-- ---------------------------------------------------------------------------
-- 1. Presupuesto semanal en profiles (1:1 con auth.users)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists weekly_budget_cop integer
  check (weekly_budget_cop is null or weekly_budget_cop > 0);

comment on column public.profiles.weekly_budget_cop is
  'Presupuesto semanal de mercado en COP. NULL hasta completar BudgetScreen.';

-- ---------------------------------------------------------------------------
-- 2. Catálogo de supermercados (datos maestros)
-- ---------------------------------------------------------------------------

create table if not exists public.supermarkets (
  id text primary key,
  name text not null,
  tagline text,
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.supermarkets is
  'Catálogo fijo de cadenas disponibles en la app (Colombia).';

-- ---------------------------------------------------------------------------
-- 3. Objetivos del usuario (M:N lógico: varios objetivos por usuario)
-- ---------------------------------------------------------------------------

create table if not exists public.user_goals (
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_type text not null check (
    goal_type in ('muscle', 'fat', 'healthy', 'save', 'family', 'energy')
  ),
  created_at timestamptz not null default now(),
  primary key (user_id, goal_type)
);

comment on table public.user_goals is
  'Objetivos seleccionados en GoalsScreen (multi-select).';

-- ---------------------------------------------------------------------------
-- 4. Supermercados preferidos del usuario (M:N)
-- ---------------------------------------------------------------------------

create table if not exists public.user_supermarkets (
  user_id uuid not null references auth.users (id) on delete cascade,
  supermarket_id text not null references public.supermarkets (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, supermarket_id)
);

comment on table public.user_supermarkets is
  'Tiendas elegidas en SupermarketsScreen (multi-select).';

-- ---------------------------------------------------------------------------
-- 5. Seed: supermercados (ids alineados con SupermarketsScreen.tsx)
-- ---------------------------------------------------------------------------

insert into public.supermarkets (id, name, tagline, sort_order)
values
  ('D1', 'D1', 'Precios bajos siempre', 1),
  ('Ara', 'Ara', 'Precios que te sorprenden', 2),
  ('Exito', 'Éxito', 'Todo lo que necesitas', 3),
  ('Jumbo', 'Jumbo', 'Lo mejor en un solo lugar', 4),
  ('Carulla', 'Carulla', 'Calidad y frescura', 5)
on conflict (id) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  sort_order = excluded.sort_order,
  is_active = true;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.supermarkets enable row level security;
alter table public.user_goals enable row level security;
alter table public.user_supermarkets enable row level security;

-- Catálogo: lectura para usuarios autenticados
drop policy if exists "Authenticated users can view supermarkets" on public.supermarkets;

create policy "Authenticated users can view supermarkets"
  on public.supermarkets
  for select
  to authenticated
  using (is_active = true);

-- user_goals: solo el dueño
drop policy if exists "Users can view own goals" on public.user_goals;
drop policy if exists "Users can insert own goals" on public.user_goals;
drop policy if exists "Users can delete own goals" on public.user_goals;

create policy "Users can view own goals"
  on public.user_goals
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own goals"
  on public.user_goals
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own goals"
  on public.user_goals
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- user_supermarkets: solo el dueño
drop policy if exists "Users can view own supermarkets" on public.user_supermarkets;
drop policy if exists "Users can insert own supermarkets" on public.user_supermarkets;
drop policy if exists "Users can delete own supermarkets" on public.user_supermarkets;

create policy "Users can view own supermarkets"
  on public.user_supermarkets
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own supermarkets"
  on public.user_supermarkets
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own supermarkets"
  on public.user_supermarkets
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 7. Índices (consultas por usuario)
-- ---------------------------------------------------------------------------

create index if not exists user_goals_user_id_idx
  on public.user_goals (user_id);

create index if not exists user_supermarkets_user_id_idx
  on public.user_supermarkets (user_id);
