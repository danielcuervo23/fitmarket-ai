-- FitMarket AI: "Quiero el plan igual" sin gastar otro intento diario.
-- Requiere: 006 (plan_generation_requests, mismo esquema de RLS).
-- Idempotente: se puede ejecutar más de una vez sin error.
--
-- Cuando un plan no cumple todas las metas (goals_unreachable), la Edge
-- Function guarda aquí la semana que ya calculó, por 30 minutos. Si el
-- usuario pide "Quiero el plan igual" con los MISMOS datos (misma huella),
-- la función arma el plan con esa semana: sin otra llamada a OpenAI y sin
-- otro intento diario. Si cambió algo (presupuesto, metas, tiendas, perfil,
-- cocina, ciudad, recetas o el día de precios), la huella no coincide y se
-- genera de nuevo como siempre.
--
-- Qué se guarda (lo mínimo): la semana (recetas y cantidades) y una huella
-- SHA-256 de los datos de la solicitud. Ningún dato de salud, cuerpo,
-- presupuesto ni texto libre en columnas propias.
-- Limpieza: una sola fila por usuario (clave primaria user_id), que se
-- reemplaza en cada nuevo guardado y se borra al usarla; la tabla nunca
-- crece más que el número de usuarios. Las filas vencidas se ignoran.

create table if not exists public.partial_plan_results (
  user_id uuid primary key references auth.users (id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  week jsonb not null check (jsonb_typeof(week) = 'object' and octet_length(week::text) <= 32768),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint partial_plan_results_expiry_check check (expires_at <= created_at + interval '1 hour')
);

comment on table public.partial_plan_results is
  'Semana de un plan que no cumplió todas las metas, guardada 30 min para "Quiero el plan igual". Una fila por usuario; la escribe solo la Edge Function (service role).';
comment on column public.partial_plan_results.fingerprint is
  'SHA-256 de los datos de la solicitud (presupuesto, metas, tiendas, restricciones, hogar, perfil, cocina, ciudad, versión de recetas, día de precios).';
comment on column public.partial_plan_results.week is
  'Semana ya optimizada (receta y cantidades por comida). Se vuelve a validar antes de usarla.';
comment on column public.partial_plan_results.expires_at is
  'Después de esta hora la fila no se usa.';

alter table public.partial_plan_results enable row level security;

-- Permisos mínimos: el usuario solo puede leer y borrar su propia fila (la
-- función la "toma" con un delete ... returning usando el JWT del usuario).
-- Nadie más que el service role puede insertar o modificar: así nadie puede
-- fabricar una semana para saltarse el límite diario.
revoke all on table public.partial_plan_results from anon;
revoke insert, update, truncate, references, trigger on table public.partial_plan_results from authenticated;
grant select, delete on table public.partial_plan_results to authenticated;

drop policy if exists "Users can view own partial plan" on public.partial_plan_results;
drop policy if exists "Users can delete own partial plan" on public.partial_plan_results;

create policy "Users can view own partial plan"
  on public.partial_plan_results
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users can delete own partial plan"
  on public.partial_plan_results
  for delete to authenticated using ((select auth.uid()) = user_id);
