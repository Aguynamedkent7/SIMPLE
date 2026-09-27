-- Red-team hardening: rules the server actions already check now hold in the database too,
-- so a direct REST or Auth API call can't get around them.

-- ── Single-line text ──────────────────────────────────────────────────────
-- No control characters: U+0001–001F and U+007F–009F, the same set as zod's \p{Cc} (NUL can't be
-- stored in text at all). An explicit range, not [[:cntrl:]], so it doesn't depend on the locale.
-- Control and whitespace runs become one space, then trim. Used by the signup trigger and the cleanup.
create function private.one_line(t text)
returns text
language sql immutable
set search_path = ''
as $$
  select btrim(regexp_replace(t, '[\u0001-\u001f\u007f-\u009f[:space:]]+', ' ', 'g'));
$$;
revoke all on function private.one_line(text) from public, anon, authenticated;

-- Existing rows that break the new rule are cleaned, not deleted: only the text changes.
update public.businesses set name = coalesce(nullif(private.one_line(name), ''), 'My business')
  where name ~ '[\u0001-\u001f\u007f-\u009f]';
update public.entries set customer = coalesce(nullif(private.one_line(customer), ''), '?')
  where customer ~ '[\u0001-\u001f\u007f-\u009f]';
update public.entries set description = coalesce(nullif(private.one_line(description), ''), '?')
  where description ~ '[\u0001-\u001f\u007f-\u009f]';

alter table public.businesses
  add constraint name_one_line check (name !~ '[\u0001-\u001f\u007f-\u009f]');
alter table public.entries
  add constraint customer_one_line check (customer !~ '[\u0001-\u001f\u007f-\u009f]'),
  add constraint description_one_line check (description !~ '[\u0001-\u001f\u007f-\u009f]');

-- Signup: clean the business name instead of failing. A raise here would fail the whole
-- Auth signup with a 500; a cleaned name is the better outcome for a real person.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  bid uuid;
  bname text := coalesce(
    nullif(btrim(left(private.one_line(new.raw_user_meta_data ->> 'business_name'), 80)), ''),
    'My business');
begin
  if new.is_anonymous then return new; end if; -- belt and braces: anonymous sign-ins are off
  insert into public.businesses (name) values (bname) returning id into bid;
  insert into public.memberships (business_id, user_id, role) values (bid, new.id, 'owner');
  insert into public.audit_log (business_id, actor_id, action, entity_id)
    values (bid, new.id, 'business.create', bid);
  return new;
end;
$$;

-- ── When it happened ──────────────────────────────────────────────────────
-- Never in the future (5 minutes for clock skew; the app allows 1), never before One Login existed.
-- A CHECK with now() is safe here: it only runs on insert (no update privilege), and a row that
-- passes stays valid forever as now() moves on. Undo re-inserts a deleted entry with its original
-- time, which passed this check the first time.
-- NOT VALID: existing rows are left alone. Rewriting a money row's date would move it between
-- months and change reported totals.
alter table public.entries
  add constraint occurred_at_sane check (
    occurred_at >= '2026-01-01T00:00:00Z' and occurred_at <= now() + interval '5 minutes'
  ) not valid;

-- Clients choose only the columns the app sends. created_by comes from auth.uid() and
-- created_at from now(); neither can be forged.
revoke insert on public.entries from authenticated;
grant insert (id, business_id, type, customer, description, amount_cents, occurred_at)
  on public.entries to authenticated;

-- ── Month reads: one timezone, not a parameter ────────────────────────────
-- The app only ever passed Australia/Sydney (lib/entries.ts BUSINESS_TZ). A parameter was just
-- another input to validate; a bad one echoed back in the error.
drop function public.month_totals(uuid, text);
drop function public.month_entries(uuid, text);

create function public.month_entries(bid uuid)
returns setof public.entries
language sql stable security invoker
set search_path = ''
as $$
  select * from public.entries e
  where e.business_id = bid
    and e.occurred_at >= (date_trunc('month', now() at time zone 'Australia/Sydney') at time zone 'Australia/Sydney')
    and e.occurred_at < ((date_trunc('month', now() at time zone 'Australia/Sydney') + interval '1 month')
                         at time zone 'Australia/Sydney');
$$;

-- Another business's id returns zeros, never their numbers.
create function public.month_totals(bid uuid)
returns table (money_in bigint, money_out bigint, profit bigint)
language sql stable security invoker
set search_path = ''
as $$
  select
    coalesce(sum(e.amount_cents) filter (where e.type = 'in'), 0)::bigint,
    coalesce(sum(e.amount_cents) filter (where e.type = 'out'), 0)::bigint,
    coalesce(sum(case when e.type = 'in' then e.amount_cents else -e.amount_cents end), 0)::bigint
  from public.month_entries(bid) e;
$$;

revoke all on function public.month_entries(uuid), public.month_totals(uuid) from public, anon;
grant execute on function public.month_entries(uuid), public.month_totals(uuid) to authenticated;
