begin;

-- Manual verification for migration 015 (cooking preferences).
-- Run on a STAGING / branch database only (never production), after applying
-- 015 (rollout step 1). Everything runs in one transaction and is rolled back.
-- Needs at least one row in public.profiles. Use psql or the SQL editor; each
-- check states its expected result. Each rejected update runs inside a
-- savepoint so the transaction can continue.

-- 1. The four columns exist, are nullable and have no default.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('cooking_weekday_minutes', 'cooking_level', 'kitchen_appliances', 'batch_cooking')
order by column_name;
-- expected: 4 rows, is_nullable = YES, column_default = NULL

-- 2. A minutes value outside 10/20/30 is rejected.
savepoint bad_minutes;
update public.profiles set cooking_weekday_minutes = 15
where id = (select id from public.profiles limit 1);
-- expected: ERROR 23514 check constraint "profiles_cooking_weekday_minutes_check"
rollback to savepoint bad_minutes;

-- 3. An unknown level is rejected.
savepoint bad_level;
update public.profiles set cooking_level = 'chef'
where id = (select id from public.profiles limit 1);
-- expected: ERROR 23514 check constraint "profiles_cooking_level_check"
rollback to savepoint bad_level;

-- 4. An unknown appliance is rejected.
savepoint bad_appliance;
update public.profiles set kitchen_appliances = array['fogon']
where id = (select id from public.profiles limit 1);
-- expected: ERROR 23514 check constraint "profiles_kitchen_appliances_check"
rollback to savepoint bad_appliance;

-- 5. An empty appliance list is rejected.
savepoint empty_appliances;
update public.profiles set kitchen_appliances = array[]::text[]
where id = (select id from public.profiles limit 1);
-- expected: ERROR 23514 check constraint "profiles_kitchen_appliances_check"
rollback to savepoint empty_appliances;

-- 6. Valid values are accepted.
update public.profiles
set cooking_weekday_minutes = 30, cooking_level = 'enjoys',
    kitchen_appliances = array['estufa', 'microondas'], batch_cooking = true
where id = (select id from public.profiles limit 1);
-- expected: UPDATE 1

-- 7. NULL (not answered) is accepted in every column.
update public.profiles
set cooking_weekday_minutes = null, cooking_level = null,
    kitchen_appliances = null, batch_cooking = null
where id = (select id from public.profiles limit 1);
-- expected: UPDATE 1

-- 8. No new policy on profiles (same policies as before 015).
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'profiles' order by policyname;
-- expected: the same own-row policies listed before applying 015

rollback;
