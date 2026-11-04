-- FitMarket AI: ciudades disponibles y ciudad del perfil.
-- Requiere: 009 (y 001 para profiles).
-- Idempotente: se puede ejecutar más de una vez sin error.
-- La ciudad de lanzamiento es Bucaramanga; las demás quedan listas.

create table if not exists public.cities (
  slug text primary key check (slug ~ '^[a-z_]{2,40}$'),
  name text not null,
  sort_order smallint not null default 0,
  is_active boolean not null default true
);

comment on table public.cities is
  'Ciudades de Colombia donde se pueden mostrar precios. slug en minúscula sin tildes.';

insert into public.cities (slug, name, sort_order) values
  ('bucaramanga', 'Bucaramanga', 1),
  ('bogota', 'Bogotá', 2),
  ('medellin', 'Medellín', 3),
  ('cali', 'Cali', 4),
  ('barranquilla', 'Barranquilla', 5),
  ('cartagena', 'Cartagena', 6),
  ('cucuta', 'Cúcuta', 7),
  ('pereira', 'Pereira', 8),
  ('manizales', 'Manizales', 9),
  ('ibague', 'Ibagué', 10),
  ('villavicencio', 'Villavicencio', 11),
  ('santa_marta', 'Santa Marta', 12)
on conflict (slug) do nothing;

alter table public.cities enable row level security;

revoke all on public.cities from anon, authenticated;
grant select on public.cities to authenticated;

drop policy if exists "cities_select_authenticated" on public.cities;
create policy "cities_select_authenticated"
  on public.cities
  for select
  to authenticated
  using (true);

-- NULL = el usuario aún no eligió ciudad (las filas existentes quedan NULL).
-- Agregar una columna nullable sin default es instantáneo (no reescribe la tabla).
alter table public.profiles
  add column if not exists city text references public.cities (slug) on delete set null;

comment on column public.profiles.city is
  'Ciudad elegida por el usuario (cities.slug). NULL = sin responder.';
