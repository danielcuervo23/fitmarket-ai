-- FitMarket AI: registro de generaciones de plan para limitar el uso diario por usuario
-- (protege la factura de OpenAI). La Edge Function inserta una fila por solicitud
-- y rechaza con 429 al superar GENERATION_DAILY_LIMIT en 24 horas.

create table if not exists public.plan_generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.plan_generation_requests is
  'Una fila por solicitud de generacion de plan. Sirve para aplicar el limite diario.';

create index if not exists plan_generation_requests_user_created_idx
  on public.plan_generation_requests (user_id, created_at desc);

alter table public.plan_generation_requests enable row level security;

drop policy if exists "Users can view own generation requests" on public.plan_generation_requests;
drop policy if exists "Users can insert own generation requests" on public.plan_generation_requests;

create policy "Users can view own generation requests"
  on public.plan_generation_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own generation requests"
  on public.plan_generation_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Sin politicas de update/delete: un usuario no puede reiniciar su propio contador.
