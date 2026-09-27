-- A cost ('out') never has a customer; only jobs ('in') do.
alter table public.entries
  add constraint customer_only_for_in check (type = 'in' or customer is null);
