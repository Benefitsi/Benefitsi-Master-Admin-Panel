-- Date-specific opening-hour exceptions. Existing rows remain full-day,
-- one-time closures. A recurring row matches the month and day each year.
alter table if exists public.partner_holidays
  add column if not exists is_closed boolean not null default true,
  add column if not exists opens_at time without time zone,
  add column if not exists closes_at time without time zone,
  add column if not exists repeats_yearly boolean not null default false;

alter table if exists public.partner_holidays
  drop constraint if exists partner_holidays_exception_hours_valid;

alter table if exists public.partner_holidays
  add constraint partner_holidays_exception_hours_valid
  check (
    (is_closed and opens_at is null and closes_at is null)
    or
    (not is_closed and opens_at is not null and closes_at is not null and opens_at <> closes_at)
  );

comment on column public.partner_holidays.is_closed is
  'True for a full-day closure; false for replacement opening hours.';
comment on column public.partner_holidays.repeats_yearly is
  'When true, holiday_date month/day repeats annually.';

notify pgrst, 'reload schema';
