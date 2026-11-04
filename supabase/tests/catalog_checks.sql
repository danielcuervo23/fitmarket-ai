-- Manual verification for migrations 010 and 011.
-- Run on a STAGING / branch database only (never production), after applying
-- 010 and 011. Everything runs in one transaction and is rolled back.
-- Use psql or the SQL editor; each check states its expected result.

begin;

-- Fixture (as the table owner): one store, one food, one product, one price.
insert into public.supermarkets (id, name) values ('D1', 'D1') on conflict (id) do nothing;
insert into public.foods (id, name_es, name_en, shopping_category, unit, kcal, protein_g,
  carbs_g, fat_g, fiber_g, free_sugars_g, sat_fat_g, sodium_mg, iron_mg, default_pack,
  ref_price_cop, ref_price_source, nutrition_source, nutrition_ref)
values ('check_food', 'Prueba', 'Test', 'otros', 'g', 100, 1, 10, 1, 1, 1, 0.5, 5, 0.1, 500,
  10, 'estimate', 'usda', 'x');
insert into public.store_products (store_id, food_id, external_id, name, pack_size)
values ('D1', 'check_food', 'check-ext', 'Producto prueba', 500);
insert into public.prices (store_product_id, city, source, regular_price_cop, observed_on)
select id, 'bucaramanga', 'official', 5000, current_date
from public.store_products where external_id = 'check-ext';

-- 1. authenticated can read every table and the view.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

select count(*) from public.cities;          -- expected: 12
select count(*) from public.foods;           -- expected: >= 1
select count(*) from public.store_products;  -- expected: >= 1
select count(*) from public.prices;          -- expected: >= 1
select * from public.current_prices where city = 'bucaramanga';  -- expected: includes check-ext row, 5000, official

-- 2. authenticated cannot write.
insert into public.foods (id, name_es, name_en, shopping_category, unit, kcal, protein_g,
  carbs_g, fat_g, fiber_g, free_sugars_g, sat_fat_g, sodium_mg, iron_mg, default_pack,
  ref_price_cop, ref_price_source, nutrition_source, nutrition_ref)
values ('hack', 'x', 'x', 'otros', 'g', 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 'estimate', 'usda', 'x');
-- expected: ERROR: permission denied for table foods
-- (run the next statements in a new transaction if this one is aborted)

rollback;

begin;
-- 3. anon cannot read.
set local role anon;
select * from public.foods;          -- expected: ERROR: permission denied for table foods
rollback;

begin;
-- 4. current_prices uses the index on (city, store_product_id, observed_on desc).
-- With few rows Postgres may prefer a seq scan; disable it to see the index is usable.
set local enable_seqscan = off;
explain select * from public.current_prices where city = 'bucaramanga';
-- expected: plan contains "Index Scan ... using prices_city_product_date_idx"
rollback;

begin;
-- 5. A second price for the same product, city, source and day is rejected.
insert into public.supermarkets (id, name) values ('D1', 'D1') on conflict (id) do nothing;
insert into public.foods (id, name_es, name_en, shopping_category, unit, kcal, protein_g,
  carbs_g, fat_g, fiber_g, free_sugars_g, sat_fat_g, sodium_mg, iron_mg, default_pack,
  ref_price_cop, ref_price_source, nutrition_source, nutrition_ref)
values ('check_food', 'Prueba', 'Test', 'otros', 'g', 100, 1, 10, 1, 1, 1, 0.5, 5, 0.1, 500,
  10, 'estimate', 'usda', 'x');
insert into public.store_products (store_id, food_id, external_id, name, pack_size)
values ('D1', 'check_food', 'check-ext', 'Producto prueba', 500);
insert into public.prices (store_product_id, city, source, regular_price_cop, observed_on)
select id, 'bucaramanga', 'official', 5000, current_date from public.store_products where external_id = 'check-ext';
insert into public.prices (store_product_id, city, source, regular_price_cop, observed_on)
select id, 'bucaramanga', 'official', 5100, current_date from public.store_products where external_id = 'check-ext';
-- expected: ERROR: duplicate key value violates unique constraint
--           "prices_store_product_id_city_source_observed_on_key"
rollback;

begin;
-- 6. Strict nutrition checks reject impossible rows.
insert into public.foods (id, name_es, name_en, shopping_category, unit, kcal, protein_g,
  carbs_g, fat_g, fiber_g, free_sugars_g, sat_fat_g, sodium_mg, iron_mg, default_pack,
  ref_price_cop, ref_price_source, nutrition_source, nutrition_ref)
values ('bad_fiber', 'x', 'x', 'otros', 'g', 1, 0, 1, 0, 5, 0, 0, 0, 0, 1, 1, 'estimate', 'usda', 'x');
-- expected: ERROR: new row for relation "foods" violates check constraint (fiber_g <= carbs_g)
rollback;

-- 7. Advisors (run from the CLI against the staging project):
--   supabase db advisors        -- expected: no security errors

begin;
-- 8. city_reference_prices (migration 013): only the service writes; users read.
--   As a signed-in user (role authenticated):
--     select count(*) from public.city_reference_prices;        -- expected: works
--     insert into public.city_reference_prices (city, food_id, price_cop_per_unit, observed_on, source)
--       values ('bucaramanga', 'papa', 5, current_date, 'dane_sipsa');
--       -- expected: ERROR: permission denied for table city_reference_prices
--   With the service role, these must fail on the checks:
insert into public.city_reference_prices (city, food_id, price_cop_per_unit, observed_on, source)
values ('bucaramanga', 'papa', 0, current_date, 'dane_sipsa');
-- expected: ERROR: violates check constraint (price_cop_per_unit > 0)
rollback;
