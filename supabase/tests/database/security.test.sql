-- Structural guarantees, checked in the database itself. Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select is(
  (select array_agg(relname::text order by relname) from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity),
  null, 'RLS is enabled on every table in public');

select is(
  (select array_agg(relname::text order by relname) from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' and not relforcerowsecurity),
  null, 'RLS is forced on every table in public');

select is(
  (select array_agg(table_name || ':' || privilege_type) from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'PUBLIC')),
  null, 'anon and PUBLIC have no table privileges in public');

select is(
  (select array_agg(p.proname::text) from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (has_function_privilege('anon', p.oid, 'execute'))),
  null, 'anon cannot execute any function in public');

select is(
  (select array_agg(table_name || ':' || privilege_type) from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('UPDATE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
  null, 'authenticated can never update, truncate, reference or trigger');

select is(
  (select array_agg(tablename || ':' || policyname) from pg_policies
   where schemaname = 'public' and cmd in ('UPDATE', 'ALL') and permissive = 'PERMISSIVE'),
  null, 'no permissive update (or catch-all) policies exist');

select policies_are('public', 'entries', array[
  'members read entries',
  'members add entries to their business',
  'members delete entries in their business',
  'live session, mfa when enrolled'
], 'entries has exactly the expected policies');

select is(
  (select array_agg(p.proname::text) from pg_proc p
   where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
     and p.prosecdef and not coalesce('search_path=""' = any(p.proconfig), false)),
  null, 'every security definer function pins search_path');

select hasnt_extension('pg_graphql', 'GraphQL is not installed');

select * from finish();
rollback;
