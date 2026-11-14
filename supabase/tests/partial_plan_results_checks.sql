-- Manual verification for migration 016 (partial_plan_results).
-- Run on a STAGING / branch database only (never production), after applying
-- 016. Everything runs in one transaction and is rolled back.
-- Needs at least TWO users in auth.users: "user A" is the first by id, "user B"
-- the last. Run in psql with ON_ERROR_STOP off (some checks are EXPECTED to
-- fail and rely on savepoints), or statement by statement in the SQL editor.
-- The role "authenticated" cannot read auth.users, so both ids are captured
-- as the owner first (settings t.a and t.b) and only those are used after a
-- role switch. "set local role" inside a rolled-back savepoint is reverted;
-- "reset role" afterwards makes the owner role explicit again.

begin;

-- 0. As the owner: remember user A and user B.
select set_config('t.a', (select id::text from auth.users order by id asc limit 1), false),
       set_config('t.b', (select id::text from auth.users order by id desc limit 1), false);
-- expected: two different uuids

-- 1. RLS is on and only the two own-row policies exist.
select relrowsecurity from pg_class where oid = 'public.partial_plan_results'::regclass;
-- expected: true
select policyname, cmd from pg_policies where tablename = 'partial_plan_results' order by cmd;
-- expected: 2 rows, DELETE and SELECT

-- 2. As the owner (like the service role): one row for user A and one for user B.
insert into public.partial_plan_results (user_id, fingerprint, week, expires_at)
values
  (current_setting('t.a')::uuid, repeat('a', 64), '{"lun": {}}', now() + interval '30 minutes'),
  (current_setting('t.b')::uuid, repeat('b', 64), '{"lun": {}}', now() + interval '30 minutes');
-- expected: INSERT 0 2

-- 3. Bad values are rejected.
savepoint bad_fp;
update public.partial_plan_results set fingerprint = 'nope';
-- expected: ERROR 23514 check constraint
rollback to savepoint bad_fp;
reset role;

savepoint bad_expiry;
update public.partial_plan_results set expires_at = now() + interval '2 hours';
-- expected: ERROR 23514 check constraint "partial_plan_results_expiry_check"
rollback to savepoint bad_expiry;
reset role;

-- 4. Signed in as user A: sees only their own row.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) from public.partial_plan_results;
-- expected: 1 (only user A's row)

-- 5. User A cannot delete user B's row.
delete from public.partial_plan_results where user_id = current_setting('t.b')::uuid returning user_id;
-- expected: 0 rows

-- 6. User A cannot insert or update (no grant, no policy).
savepoint user_insert;
insert into public.partial_plan_results (user_id, fingerprint, week, expires_at)
values (current_setting('t.a')::uuid, repeat('c', 64), '{}', now());
-- expected: ERROR 42501 permission denied
rollback to savepoint user_insert;
reset role;

set local role authenticated;
savepoint user_update;
update public.partial_plan_results set fingerprint = repeat('d', 64);
-- expected: ERROR 42501 permission denied
rollback to savepoint user_update;
reset role;

-- 7. User A can take (delete ... returning) their own row.
set local role authenticated;
delete from public.partial_plan_results where fingerprint = repeat('a', 64) returning user_id;
-- expected: 1 row (user A)
reset role;

-- 8. As the owner: user B's row is still there.
select count(*) from public.partial_plan_results;
-- expected: 1

rollback;
