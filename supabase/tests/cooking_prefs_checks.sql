-- Manual verification for migration 015 (cooking preferences).
-- Run on a STAGING / branch database only (never production), after applying
-- 015 (rollout step 1). Everything runs in one transaction and is rolled back.
-- Needs at least one row in public.profiles. Each check states its expected result.
-- HOW TO RUN: checks 2-5 are EXPECTED to fail and rely on savepoints to keep the
-- transaction alive. Run it in psql with ON_ERROR_STOP off (the default; do not
-- pass -v ON_ERROR_STOP=1), e.g. psql -f supabase/tests/cooking_prefs_checks.sql,
-- or run it statement by statement in the SQL editor. With ON_ERROR_STOP on,
-- psql stops at the first expected error and the later checks never run.

begin;

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

-- 8. No new policy on profiles: only the own-row policies of 001 and 007.
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'profiles' order by policyname;
-- expected: exactly these 4 rows (001 and 007), no new policy from 015:
--   Users can delete own profile | DELETE
--   Users can insert own profile | INSERT
--   Users can update own profile | UPDATE
--   Users can view own profile   | SELECT

rollback;
