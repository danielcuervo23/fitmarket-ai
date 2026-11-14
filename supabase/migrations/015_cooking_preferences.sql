-- FitMarket AI: preferencias de cocina del perfil (opcionales).
-- Requiere: 001 (profiles).
-- Idempotente: se puede ejecutar más de una vez sin error.
-- Columnas nulables y sin valor por defecto: agregarlas no reescribe la tabla y
-- NULL significa "no ha respondido" (la función usa valores por defecto).
-- Los valores permitidos son los mismos de supabase/functions/_shared/recipes/types.ts
-- (APPLIANCES y COOKING_LEVELS); scripts/cookingPrefsMigration.test.mjs lo comprueba.
-- Sin políticas nuevas: las políticas de fila propia de profiles ya cubren estas columnas.
-- Las condiciones de salud NO van aquí (dato sensible, Plan 3).

alter table public.profiles
  add column if not exists cooking_weekday_minutes smallint check (cooking_weekday_minutes in (10, 20, 30)),
  add column if not exists cooking_level text check (cooking_level in ('basic', 'comfortable', 'enjoys')),
  add column if not exists kitchen_appliances text[] check (
    kitchen_appliances <@ array['estufa','microondas','olla_arrocera','freidora_aire','licuadora','horno','sandwichera','olla_presion']::text[]
    and cardinality(kitchen_appliances) between 1 and 8),
  add column if not exists batch_cooking boolean;

comment on column public.profiles.cooking_weekday_minutes is
  'Opcional. Minutos para cocinar entre semana: 10, 20 o 30 (30 = 30 o más). NULL = no ha respondido.';

comment on column public.profiles.cooking_level is
  'Opcional. Qué tanto sabe cocinar: basic (lo básico), comfortable (me defiendo), enjoys (me gusta cocinar). NULL = no ha respondido.';

comment on column public.profiles.kitchen_appliances is
  'Opcional. Aparatos de cocina que tiene (1 a 8, de la lista permitida). NULL = no ha respondido.';

comment on column public.profiles.batch_cooking is
  'Opcional. Si quiere cocinar una vez para varios días. NULL = no ha respondido.';
