-- FitMarket AI: corrected static reference prices (public.foods.ref_price_cop).
-- Approved by the owner on 2026-11-04 after auditing every static price against
-- DANE SIPSA (Bucaramanga, Centroabastos) x the retail markup in
-- scripts/prices/dane/markup.ts. Method and figures: docs/DATA_SOURCES.md,
-- "Static reference prices vs DANE".
--   cebolla_junca, cilantro: yearly SIPSA median x 1.35 (the old values were a
--     packaged-herb shelf price read outside Bucaramanga, 4-6x above DANE).
--   the rest: rough placeholders replaced by values near DANE x markup.
-- Migration 012 is already applied on staging, so the change goes here; 012 was
-- regenerated from data/foods/foods.json so a fresh database ends the same.
-- Idempotent: each row is touched only when it still differs, so re-running is
-- a no-op and updated_at is not bumped needlessly. COP per g (per unit for
-- naranja and aguacate).

update public.foods set ref_price_cop = 2.7, ref_price_source = 'estimate'
  where id = 'cebolla_junca' and (ref_price_cop, ref_price_source) is distinct from (2.7, 'estimate');
update public.foods set ref_price_cop = 9.5, ref_price_source = 'estimate'
  where id = 'cilantro' and (ref_price_cop, ref_price_source) is distinct from (9.5, 'estimate');
update public.foods set ref_price_cop = 4, ref_price_source = 'estimate'
  where id = 'lechuga' and (ref_price_cop, ref_price_source) is distinct from (4, 'estimate');
update public.foods set ref_price_cop = 3.5, ref_price_source = 'estimate'
  where id = 'pepino' and (ref_price_cop, ref_price_source) is distinct from (3.5, 'estimate');
update public.foods set ref_price_cop = 11, ref_price_source = 'estimate'
  where id = 'ajo' and (ref_price_cop, ref_price_source) is distinct from (11, 'estimate');
update public.foods set ref_price_cop = 1.8, ref_price_source = 'estimate'
  where id = 'repollo' and (ref_price_cop, ref_price_source) is distinct from (1.8, 'estimate');
update public.foods set ref_price_cop = 2.5, ref_price_source = 'estimate'
  where id = 'remolacha' and (ref_price_cop, ref_price_source) is distinct from (2.5, 'estimate');
update public.foods set ref_price_cop = 3, ref_price_source = 'estimate'
  where id = 'calabacin' and (ref_price_cop, ref_price_source) is distinct from (3, 'estimate');
update public.foods set ref_price_cop = 8, ref_price_source = 'estimate'
  where id = 'espinaca' and (ref_price_cop, ref_price_source) is distinct from (8, 'estimate');
update public.foods set ref_price_cop = 450, ref_price_source = 'estimate'
  where id = 'naranja' and (ref_price_cop, ref_price_source) is distinct from (450, 'estimate');
update public.foods set ref_price_cop = 2500, ref_price_source = 'estimate'
  where id = 'aguacate' and (ref_price_cop, ref_price_source) is distinct from (2500, 'estimate');
update public.foods set ref_price_cop = 4.5, ref_price_source = 'estimate'
  where id = 'guayaba' and (ref_price_cop, ref_price_source) is distinct from (4.5, 'estimate');
update public.foods set ref_price_cop = 17, ref_price_source = 'estimate'
  where id = 'tilapia' and (ref_price_cop, ref_price_source) is distinct from (17, 'estimate');
update public.foods set ref_price_cop = 25, ref_price_source = 'estimate'
  where id = 'sardina_lata' and (ref_price_cop, ref_price_source) is distinct from (25, 'estimate');
