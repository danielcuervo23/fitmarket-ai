-- FitMarket AI: catálogo de alimentos, productos por tienda y precios semanales.
-- Requiere: 010 (cities) y 002 (supermarkets).
-- Idempotente: se puede ejecutar más de una vez sin error.
-- Solo lectura para usuarios: las escrituras las hace el servicio (service_role).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. foods: catálogo de alimentos con nutrición por 100 g / 100 ml / unidad
-- ---------------------------------------------------------------------------

create table if not exists public.foods (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name_es text not null check (char_length(name_es) between 1 and 80),
  name_en text not null check (char_length(name_en) between 1 and 80),
  plural_es text,
  plural_en text,
  shopping_category text not null check (
    shopping_category in ('proteinas', 'frutas_verduras', 'lacteos', 'granos', 'bebidas', 'condimentos', 'otros')
  ),
  unit text not null check (unit in ('g', 'ml', 'unit')),
  whole_units boolean not null default false,
  grams_per_unit numeric(7,2) check (grams_per_unit > 0),
  diet_tags text[] not null default '{}' check (
    diet_tags <@ array['lactose', 'dairy', 'egg', 'gluten', 'peanut', 'tree_nut', 'fish', 'shellfish', 'pork', 'meat', 'honey']::text[]
  ),
  kcal numeric(6,1) not null check (kcal between 0 and 900),
  protein_g numeric(5,2) not null check (protein_g between 0 and 100),
  carbs_g numeric(5,2) not null check (carbs_g between 0 and 100),
  fat_g numeric(5,2) not null check (fat_g between 0 and 100),
  fiber_g numeric(5,2) not null check (fiber_g between 0 and 100),
  free_sugars_g numeric(5,2) not null check (free_sugars_g between 0 and 100),
  sat_fat_g numeric(5,2) not null check (sat_fat_g between 0 and 100),
  sodium_mg numeric(7,1) not null check (sodium_mg between 0 and 40000),
  iron_mg numeric(5,2) not null check (iron_mg between 0 and 100),
  gaba_group text check (
    gaba_group in ('cereales_tuberculos', 'frutas_verduras', 'lacteos', 'proteicos', 'grasas', 'azucares')
  ),
  is_fruit_veg boolean not null default false,
  default_pack numeric(8,2) not null check (default_pack > 0),
  ref_price_cop numeric(10,4) not null check (ref_price_cop > 0),
  ref_price_source text not null check (ref_price_source in ('sample', 'estimate')),
  nutrition_source text not null check (nutrition_source in ('usda', 'off')),
  nutrition_ref text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (unit <> 'unit' or grams_per_unit is not null),
  check (fiber_g <= carbs_g),
  check (free_sugars_g <= carbs_g),
  check (sat_fat_g <= fat_g)
);

comment on table public.foods is
  'Catálogo de alimentos. Nutrición por 100 g/100 ml (o por unidad si unit = unit). ref_price_cop es el precio de referencia por unidad base.';

drop trigger if exists foods_updated_at on public.foods;
create trigger foods_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. store_products: producto concreto de una tienda que equivale a un alimento
-- ---------------------------------------------------------------------------

create table if not exists public.store_products (
  id bigint generated always as identity primary key,
  store_id text not null references public.supermarkets (id),
  food_id text not null references public.foods (id),
  external_id text not null check (char_length(external_id) between 1 and 120),
  name text not null check (char_length(name) between 1 and 200),
  pack_size numeric(8,2) not null check (pack_size > 0),
  url text check (url ~ '^https://'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, external_id)
);

comment on table public.store_products is
  'Producto de una tienda ligado a un alimento. pack_size está en la unidad del alimento (g, ml o unit).';

create index if not exists store_products_food_id_idx
  on public.store_products (food_id);

drop trigger if exists store_products_updated_at on public.store_products;
create trigger store_products_updated_at
  before update on public.store_products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. prices: precio regular por producto, ciudad, fuente y fecha
-- ---------------------------------------------------------------------------

create table if not exists public.prices (
  id bigint generated always as identity primary key,
  store_product_id bigint not null references public.store_products (id) on delete cascade,
  city text not null references public.cities (slug),
  source text not null check (source in ('official', 'user', 'estimate')),
  regular_price_cop integer not null check (regular_price_cop between 50 and 5000000),
  observed_on date not null,
  created_at timestamptz not null default now(),
  unique (store_product_id, city, source, observed_on)
);

comment on table public.prices is
  'Precios regulares observados por producto, ciudad y fecha.';
comment on column public.prices.source is
  'official = precio publicado por la tienda; user = reportado por un usuario; estimate = calculado por la app (no entra en current_prices).';

-- Consulta principal: último precio por ciudad y producto.
create index if not exists prices_city_product_date_idx
  on public.prices (city, store_product_id, observed_on desc);

-- ---------------------------------------------------------------------------
-- 4. current_prices: último precio official/user de productos activos
-- ---------------------------------------------------------------------------

create or replace view public.current_prices with (security_invoker = true) as
select distinct on (p.city, p.store_product_id)
  p.city,
  sp.store_id,
  sp.food_id,
  sp.id as store_product_id,
  sp.pack_size,
  p.regular_price_cop,
  p.source,
  p.observed_on
from public.prices p
join public.store_products sp on sp.id = p.store_product_id
where sp.is_active
  and p.source in ('official', 'user')
order by p.city, p.store_product_id, p.observed_on desc, (p.source = 'official') desc;

-- ---------------------------------------------------------------------------
-- 5. Permisos mínimos y RLS: solo lectura para usuarios con sesión
-- ---------------------------------------------------------------------------

alter table public.foods enable row level security;
alter table public.store_products enable row level security;
alter table public.prices enable row level security;

revoke all on public.cities, public.foods, public.store_products, public.prices, public.current_prices
  from anon, authenticated;
grant select on public.cities, public.foods, public.store_products, public.prices, public.current_prices
  to authenticated;

drop policy if exists "foods_select_authenticated" on public.foods;
create policy "foods_select_authenticated"
  on public.foods for select to authenticated using (true);

drop policy if exists "store_products_select_authenticated" on public.store_products;
create policy "store_products_select_authenticated"
  on public.store_products for select to authenticated using (true);

drop policy if exists "prices_select_authenticated" on public.prices;
create policy "prices_select_authenticated"
  on public.prices for select to authenticated using (true);
