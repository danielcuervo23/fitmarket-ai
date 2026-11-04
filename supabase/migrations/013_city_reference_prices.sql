-- FitMarket AI: precio de referencia por ciudad y alimento (base de los precios "Aproximado").
-- Fuente: DANE - SIPSA (precios mayoristas publicos y oficiales), ya convertidos al
-- precio de venta al detal aproximado, en la unidad base del alimento (g, ml o unidad).
-- Requiere: 010 (cities) y 011 (foods, set_updated_at).
-- Idempotente: se puede ejecutar mas de una vez sin error.
-- Solo lectura para usuarios: las escrituras las hace el servicio (service_role).

create table if not exists public.city_reference_prices (
  city text not null references public.cities (slug),
  food_id text not null references public.foods (id),
  price_cop_per_unit numeric(12,4) not null check (price_cop_per_unit > 0),
  observed_on date not null,
  source text not null check (source = 'dane_sipsa'),
  updated_at timestamptz not null default now(),
  primary key (city, food_id, source)
);

comment on table public.city_reference_prices is
  'Precio de referencia por ciudad y alimento (COP por g, ml o unidad), derivado de DANE SIPSA. Siempre se muestra como Aproximado.';

-- La llave primaria ya cubre la consulta por ciudad; este indice cubre la llave foranea food_id.
create index if not exists city_reference_prices_food_id_idx
  on public.city_reference_prices (food_id);

drop trigger if exists city_reference_prices_updated_at on public.city_reference_prices;
create trigger city_reference_prices_updated_at
  before update on public.city_reference_prices
  for each row execute function public.set_updated_at();

alter table public.city_reference_prices enable row level security;

revoke all on public.city_reference_prices from anon, authenticated;
grant select on public.city_reference_prices to authenticated;

drop policy if exists "city_reference_prices_select_authenticated" on public.city_reference_prices;
create policy "city_reference_prices_select_authenticated"
  on public.city_reference_prices for select to authenticated using (true);
