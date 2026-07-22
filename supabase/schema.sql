-- Run in the Supabase SQL Editor for this project's OWN Supabase project
-- (single-tenant: one Supabase project per deployed business, not shared).
--
-- Booking System — customers self-serve booking on the public page,
-- the business owner manages hours/bookings from /dashboard.

-- ── business_settings (singleton row) ──────────────────────────────
create table if not exists business_settings (
  id uuid primary key default gen_random_uuid(),
  business_name text not null default 'Sample Business',
  phone text,
  created_at timestamptz not null default now()
);

insert into business_settings (business_name, phone)
select 'Sample Business', '(555) 123-4567'
where not exists (select 1 from business_settings);

alter table business_settings enable row level security;

drop policy if exists "anyone can read business settings" on business_settings;
create policy "anyone can read business settings" on business_settings
  for select
  using (true);

drop policy if exists "owner can update business settings" on business_settings;
create policy "owner can update business settings" on business_settings
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── business_hours (one row per weekday, 0 = Sunday) ────────────────
create table if not exists business_hours (
  day_of_week int primary key check (day_of_week between 0 and 6),
  is_open boolean not null default false,
  start_time time not null default '09:00',
  end_time time not null default '17:00'
);

insert into business_hours (day_of_week, is_open, start_time, end_time)
select d, d between 1 and 6, '09:00', '17:00'
from generate_series(0, 6) as d
where not exists (select 1 from business_hours);

alter table business_hours enable row level security;

drop policy if exists "anyone can read business hours" on business_hours;
create policy "anyone can read business hours" on business_hours
  for select
  using (true);

drop policy if exists "owner can update business hours" on business_hours;
create policy "owner can update business hours" on business_hours
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── blocked_dates (specific days closed — holidays, days off) ───────
create table if not exists blocked_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  reason text,
  created_at timestamptz not null default now()
);

alter table blocked_dates enable row level security;

drop policy if exists "anyone can read blocked dates" on blocked_dates;
create policy "anyone can read blocked dates" on blocked_dates
  for select
  using (true);

drop policy if exists "owner can insert blocked dates" on blocked_dates;
create policy "owner can insert blocked dates" on blocked_dates
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "owner can delete blocked dates" on blocked_dates;
create policy "owner can delete blocked dates" on blocked_dates
  for delete
  using (auth.role() = 'authenticated');

-- ── bookings ─────────────────────────────────────────────────────────
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  booking_date date not null,
  booking_time text not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table bookings enable row level security;

-- Customers can create a booking, but cannot read other customers' PII.
drop policy if exists "anyone can create a booking" on bookings;
create policy "anyone can create a booking" on bookings
  for insert
  with check (status = 'confirmed');

drop policy if exists "owner can read bookings" on bookings;
create policy "owner can read bookings" on bookings
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "owner can update bookings" on bookings;
create policy "owner can update bookings" on bookings
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "owner can delete bookings" on bookings;
create policy "owner can delete bookings" on bookings
  for delete
  using (auth.role() = 'authenticated');

-- Public-safe view: which (date, time) slots are taken, no customer PII.
-- Views inherit querying user's permissions by default; this one is
-- deliberately narrow (2 columns, confirmed-only) so it's safe to expose.
create or replace view booking_availability as
  select booking_date, booking_time
  from bookings
  where status = 'confirmed';

grant select on booking_availability to anon, authenticated;
