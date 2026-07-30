-- Run in the Supabase SQL Editor for this project.
-- Shared with the AdminDashboard project (E:\GithubAdminDashboard) — table
-- names below are prefixed booking_/bookings to avoid colliding with its
-- existing products/orders/order_items/customers/business_settings tables.
--
-- Booking System — customers self-serve booking on the public page,
-- the business owner manages hours/bookings from /dashboard.
--
-- Note: RLS here uses `auth.role() = 'authenticated'` (matches this
-- single-tenant model — one deployment per business, so "any authenticated
-- user" is fine). If this project ever serves two different real clients
-- with separate logins, split into separate Supabase projects instead of
-- adding per-owner row scoping here.

-- ── booking_settings (singleton row) ────────────────────────────────
create table if not exists booking_settings (
  id uuid primary key default gen_random_uuid(),
  business_name text not null default 'Sample Business',
  phone text,
  venmo_handle text,
  created_at timestamptz not null default now()
);

-- Safe to re-run on a database created before this column existed.
alter table booking_settings add column if not exists venmo_handle text;

insert into booking_settings (business_name, phone)
select 'Sample Business', '(555) 123-4567'
where not exists (select 1 from booking_settings);

alter table booking_settings enable row level security;

drop policy if exists "anyone can read booking settings" on booking_settings;
create policy "anyone can read booking settings" on booking_settings
  for select
  using (true);

drop policy if exists "owner can update booking settings" on booking_settings;
create policy "owner can update booking settings" on booking_settings
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── booking_hours (one row per weekday, 0 = Sunday) ─────────────────
create table if not exists booking_hours (
  day_of_week int primary key check (day_of_week between 0 and 6),
  is_open boolean not null default false,
  start_time time not null default '09:00',
  end_time time not null default '17:00'
);

insert into booking_hours (day_of_week, is_open, start_time, end_time)
select d, d between 1 and 6, '09:00', '17:00'
from generate_series(0, 6) as d
where not exists (select 1 from booking_hours);

alter table booking_hours enable row level security;

drop policy if exists "anyone can read booking hours" on booking_hours;
create policy "anyone can read booking hours" on booking_hours
  for select
  using (true);

drop policy if exists "owner can update booking hours" on booking_hours;
create policy "owner can update booking hours" on booking_hours
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Needed because the dashboard saves hours via upsert(), which Postgres
-- executes as INSERT ... ON CONFLICT DO UPDATE — the INSERT half still
-- needs a policy to pass even though every row already exists.
drop policy if exists "owner can insert booking hours" on booking_hours;
create policy "owner can insert booking hours" on booking_hours
  for insert
  with check (auth.role() = 'authenticated');

-- ── booking_blocked_dates (specific days closed — holidays, days off) ─
create table if not exists booking_blocked_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  reason text,
  created_at timestamptz not null default now()
);

alter table booking_blocked_dates enable row level security;

drop policy if exists "anyone can read blocked dates" on booking_blocked_dates;
create policy "anyone can read blocked dates" on booking_blocked_dates
  for select
  using (true);

drop policy if exists "owner can insert blocked dates" on booking_blocked_dates;
create policy "owner can insert blocked dates" on booking_blocked_dates
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "owner can delete blocked dates" on booking_blocked_dates;
create policy "owner can delete blocked dates" on booking_blocked_dates
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
  price numeric(10, 2),
  invoice_sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Safe to re-run on a database created before these columns existed.
alter table bookings add column if not exists price numeric(10, 2);
alter table bookings add column if not exists invoice_sent_at timestamptz;

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
