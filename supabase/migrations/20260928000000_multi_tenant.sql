-- Round 2: real accounts, one business per account, strict tenant isolation.
-- The database is the security boundary: every rule below holds even if the app has a bug.

-- ── Round 1 out ────────────────────────────────────────────────────────────
-- Keep real (email) accounts' entries; they move into that account's new business below.
create temp table round1_entries on commit drop as
  select e.id, e.user_id, e.type::text as type, e.customer, e.description, e.amount_cents,
         e.occurred_at, e.created_at
  from public.entries e join auth.users u on u.id = e.user_id
  where not u.is_anonymous;
drop function if exists public.seed_demo(text);
drop function if exists public.month_totals(text);
drop function if exists public.month_entries(text);
drop function if exists public.month_start(text);
drop table if exists public.entries;
drop type if exists public.entry_type;
delete from auth.users where is_anonymous; -- demo sessions; anonymous sign-ins are now off

-- GraphQL is unused. One API surface (PostgREST) is one to lock down.
drop extension if exists pg_graphql;

-- ── Schemas ────────────────────────────────────────────────────────────────
-- Helpers live in `private`, which the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ── Tables ─────────────────────────────────────────────────────────────────
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'member');

create table public.memberships (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- Money is integer cents, never floats.
create type public.entry_type as enum ('in', 'out');

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type public.entry_type not null,
  customer text check (customer is null or length(customer) <= 80),
  description text not null check (length(trim(description)) between 1 and 80),
  amount_cents integer not null check (amount_cents > 0 and amount_cents < 100000000),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint customer_required_for_in
    check (type = 'out' or (customer is not null and length(trim(customer)) > 0)),
  constraint customer_only_for_in check (type = 'in' or customer is null)
);
create index entries_business_month_idx on public.entries (business_id, occurred_at desc);
create index entries_created_by_idx on public.entries (created_by);

-- Append-only. Written by triggers only; no customer names or free text.
create table public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete cascade,
  actor_id uuid,
  action text not null, -- 'entry.insert', 'entry.delete', 'business.create'
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_business_idx on public.audit_log (business_id, created_at desc);

-- ── Helpers (security definer: no recursive RLS on memberships) ────────────
create function private.is_member(bid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = bid and m.user_id = (select auth.uid())
  );
$$;

create function private.is_owner(bid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = bid and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- The session behind this JWT is still live (not signed out, not revoked by "Log out everywhere"),
-- and if the user has turned on 2-step login, this session has done the second step.
-- JWTs stay valid until they expire; checking the session row makes a logout take effect at once.
create function private.session_ok()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
      select 1 from auth.sessions s
      where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
        and s.user_id = (select auth.uid())
    )
    and (
      (select auth.jwt() ->> 'aal') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      )
    );
$$;

revoke all on function private.is_member(uuid), private.is_owner(uuid), private.session_ok()
  from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid), private.is_owner(uuid), private.session_ok()
  to authenticated;

-- ── Row level security ────────────────────────────────────────────────────
alter table public.businesses  enable row level security;
alter table public.memberships enable row level security;
alter table public.entries     enable row level security;
alter table public.audit_log   enable row level security;
alter table public.businesses  force row level security;
alter table public.memberships force row level security;
alter table public.entries     force row level security;
alter table public.audit_log   force row level security;

create policy "members read their business"
  on public.businesses for select to authenticated
  using (private.is_member(id));

create policy "users read their own memberships"
  on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));

create policy "members read entries"
  on public.entries for select to authenticated
  using (private.is_member(business_id));

create policy "members add entries to their business"
  on public.entries for insert to authenticated
  with check (private.is_member(business_id) and created_by = (select auth.uid()));

create policy "members delete entries in their business"
  on public.entries for delete to authenticated
  using (private.is_member(business_id));

create policy "owners read audit log"
  on public.audit_log for select to authenticated
  using (private.is_owner(business_id));

-- Live session + 2-step login (once enrolled) on every table. Restrictive: ANDed with the rules above.
create policy "live session, mfa when enrolled" on public.businesses
  as restrictive for all to authenticated using ((select private.session_ok()));
create policy "live session, mfa when enrolled" on public.memberships
  as restrictive for all to authenticated using ((select private.session_ok()));
create policy "live session, mfa when enrolled" on public.entries
  as restrictive for all to authenticated
  using ((select private.session_ok())) with check ((select private.session_ok()));
create policy "live session, mfa when enrolled" on public.audit_log
  as restrictive for all to authenticated using ((select private.session_ok()));

-- No update policies anywhere. Businesses and memberships are created by the signup trigger only.

-- ── Signup: business + owner membership in the same transaction ───────────
create function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  bid uuid;
  bname text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''), 'My business');
begin
  if new.is_anonymous then return new; end if; -- belt and braces: anonymous sign-ins are off
  insert into public.businesses (name) values (left(bname, 80)) returning id into bid;
  insert into public.memberships (business_id, user_id, role) values (bid, new.id, 'owner');
  insert into public.audit_log (business_id, actor_id, action, entity_id)
    values (bid, new.id, 'business.create', bid);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Round 1 email accounts get a business too, so they can still sign in.
do $$
declare
  u record;
  bid uuid;
begin
  for u in select id from auth.users where not is_anonymous loop
    insert into public.businesses (name) values ('My business') returning id into bid;
    insert into public.memberships (business_id, user_id, role) values (bid, u.id, 'owner');
  end loop;
end;
$$;

-- ── Audit ─────────────────────────────────────────────────────────────────
create function private.audit_entries()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (business_id, actor_id, action, entity_id, metadata)
    values (new.business_id, (select auth.uid()), 'entry.insert', new.id,
            jsonb_build_object('type', new.type, 'amount_cents', new.amount_cents));
    return new;
  end if;
  insert into public.audit_log (business_id, actor_id, action, entity_id, metadata)
  values (old.business_id, (select auth.uid()), 'entry.delete', old.id,
          jsonb_build_object('type', old.type, 'amount_cents', old.amount_cents));
  return old;
end;
$$;

create trigger entries_audit
  after insert or delete on public.entries
  for each row execute function private.audit_entries();

-- ── Reads for the money screen (security invoker: RLS still applies) ──────
-- Start of the current month in the business's timezone, not UTC.
create function public.month_entries(bid uuid, tz text default 'Australia/Sydney')
returns setof public.entries
language sql stable security invoker
set search_path = ''
as $$
  select * from public.entries e
  where e.business_id = bid
    and e.occurred_at >= (date_trunc('month', now() at time zone tz) at time zone tz)
    and e.occurred_at < ((date_trunc('month', now() at time zone tz) + interval '1 month') at time zone tz);
$$;

-- Another business's id returns zeros, never their numbers.
create function public.month_totals(bid uuid, tz text default 'Australia/Sydney')
returns table (money_in bigint, money_out bigint, profit bigint)
language sql stable security invoker
set search_path = ''
as $$
  select
    coalesce(sum(e.amount_cents) filter (where e.type = 'in'), 0)::bigint,
    coalesce(sum(e.amount_cents) filter (where e.type = 'out'), 0)::bigint,
    coalesce(sum(case when e.type = 'in' then e.amount_cents else -e.amount_cents end), 0)::bigint
  from public.month_entries(bid, tz) e;
$$;

-- ── Round 1 email accounts keep their entries ─────────────────────────────
insert into public.entries (id, business_id, created_by, type, customer, description, amount_cents, occurred_at, created_at)
select r.id, m.business_id, r.user_id, r.type::public.entry_type, r.customer, r.description, r.amount_cents,
       r.occurred_at, r.created_at
from round1_entries r join public.memberships m on m.user_id = r.user_id;

-- ── Privileges: deny by default ───────────────────────────────────────────
revoke all on all tables in schema public from anon, authenticated, public;
revoke all on all functions in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated, public;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
alter default privileges in schema public revoke all on sequences from anon, authenticated, public;

grant usage on schema public to authenticated;
grant select on public.businesses, public.memberships, public.audit_log to authenticated;
grant select, insert, delete on public.entries to authenticated;
grant execute on function public.month_entries(uuid, text), public.month_totals(uuid, text)
  to authenticated;
-- No update anywhere from the client. No insert/delete on businesses, memberships or audit_log.
