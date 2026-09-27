-- One table: every dollar in or out. Money is integer cents, never floats.
create type public.entry_type as enum ('in', 'out');

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type public.entry_type not null,
  customer text check (length(customer) <= 80),  -- required for 'in', null for 'out'
  description text not null check (length(trim(description)) between 1 and 80),
  amount_cents integer not null check (amount_cents > 0 and amount_cents < 100000000),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint customer_required_for_in
    check (type = 'out' or (customer is not null and length(trim(customer)) > 0))
);

create index entries_user_month_idx on public.entries (user_id, occurred_at desc);

alter table public.entries enable row level security;

create policy "own rows select" on public.entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows insert" on public.entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows delete" on public.entries
  for delete to authenticated using ((select auth.uid()) = user_id);
-- No update policy: edits are delete + re-add. Keeps it simple.

-- Start of the current month in the business's timezone, not UTC.
create function public.month_start(tz text default 'Australia/Sydney')
returns timestamptz
language sql stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone tz) at time zone tz;
$$;

-- This month's entries. RLS scopes them to the caller.
create function public.month_entries(tz text default 'Australia/Sydney')
returns setof public.entries
language sql stable security invoker
set search_path = ''
as $$
  select * from public.entries
  where occurred_at >= public.month_start(tz)
    and occurred_at < (date_trunc('month', now() at time zone tz) + interval '1 month') at time zone tz;
$$;

create function public.month_totals(tz text default 'Australia/Sydney')
returns table (money_in bigint, money_out bigint, profit bigint)
language sql stable security invoker
set search_path = ''
as $$
  select
    coalesce(sum(amount_cents) filter (where type = 'in'), 0)::bigint,
    coalesce(sum(amount_cents) filter (where type = 'out'), 0)::bigint,
    coalesce(sum(case when type = 'in' then amount_cents else -amount_cents end), 0)::bigint
  from public.month_entries(tz);
$$;

-- Demo data for "Try it now": a realistic month so far, spread between the 1st and now.
-- Runs as the caller, so RLS only lets it write the caller's own rows. No-op if they have data.
create function public.seed_demo(tz text default 'Australia/Sydney')
returns void
language sql volatile security invoker
set search_path = ''
as $$
  insert into public.entries (type, customer, description, amount_cents, occurred_at)
  select s.type::public.entry_type, s.customer, s.description, s.amount_cents,
         public.month_start(tz) + s.at * (now() - public.month_start(tz))
  from (values
    ('in',  'Nguyen',        'Hot water system',       189000, 0.04),
    ('out', null,            'Reece Plumbing',          64250, 0.06),
    ('in',  'Smith',         'Blocked drain',           38500, 0.15),
    ('out', null,            'Fuel',                     9840, 0.22),
    ('in',  'Papadopoulos',  'Switchboard upgrade',    245000, 0.31),
    ('out', null,            'Bunnings supplies',       21275, 0.43),
    ('in',  'O''Brien',      'Leaking tap',             16500, 0.55),
    ('in',  'Harris Build',  'Bathroom rough-in',      320000, 0.68),
    ('out', null,            'Tool repair',             14500, 0.80),
    ('in',  'Kaur',          'Downlights x8',           96000, 0.92),
    ('out', null,            'Fuel',                    11260, 0.97)
  ) as s (type, customer, description, amount_cents, at)
  where not exists (select 1 from public.entries where user_id = auth.uid());
$$;

revoke execute on function public.month_entries, public.month_totals, public.seed_demo
  from public, anon;
grant execute on function public.month_entries, public.month_totals, public.seed_demo
  to authenticated;
