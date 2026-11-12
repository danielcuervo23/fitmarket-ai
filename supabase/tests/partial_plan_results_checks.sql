-- Manual verification for migration 016 (partial_plan_results).
-- Run on a STAGING / branch database only (never production), after applying
-- 016. Everything runs in one transaction and is rolled back.
-- Needs at least one user in auth.users. Run in psql with ON_ERROR_STOP off
-- (checks 3-5 are EXPECTED to fail and rely on savepoints).

begin;

-- 1. RLS is on and only the two own-row policies exist.
select relrowsecurity from pg_class where oid = 'public.partial_plan_results'::regclass;
-- expected: true
select policyname, cmd from pg_policies where tablename = 'partial_plan_results' order by cmd;
-- expected: 2 rows, DELETE and SELECT

-- 2. A valid row is accepted (as the table owner, like the service role).
insert into public.partial_plan_results (user_id, fingerprint, week, expires_at)
values ((select id from auth.users limit 1), repeat('a', 64), '{"lun": {}}', now() + interval '30 minutes');
-- expected: INSERT 0 1

-- 3. A bad fingerprint is rejected.
savepoint bad_fp;
update public.partial_plan_results set fingerprint = 'nope';
-- expected: ERROR 23514 check constraint
rollback to savepoint bad_fp;

-- 4. An expiry more than an hour away is rejected.
savepoint bad_expiry;
update public.partial_plan_results set expires_at = now() + interval '2 hours';
-- expected: ERROR 23514 check constraint "partial_plan_results_expiry_check"
rollback to savepoint bad_expiry;

-- 5. An authenticated user cannot insert (no insert grant or policy).
savepoint user_insert;
set local role authenticated;
insert into public.partial_plan_results (user_id, fingerprint, week, expires_at)
values ((select id from auth.users limit 1), repeat('b', 64), '{}', now());
-- expected: ERROR 42501 permission denied
rollback to savepoint user_insert;

rollback;
