create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('admin', 'analyst', 'subscriber');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.plan_tier as enum ('free', 'premium', 'pro');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'none');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.report_visibility as enum ('free', 'premium', 'pro', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role public.app_role not null default 'subscriber',
  plan public.plan_tier not null default 'free',
  subscription_status public.subscription_status not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  source_url text,
  source_label text not null,
  report_date date,
  title text,
  raw_hash text not null unique,
  visibility public.report_visibility not null default 'premium',
  published_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.picks (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  event_date date,
  event_time text,
  sport text,
  league text,
  match_name text not null,
  market text,
  selection text,
  bookmaker text,
  probability numeric,
  odds numeric,
  ev numeric,
  confidence text,
  risk text,
  raw_payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  pick_key text not null unique,
  event_date date,
  match_name text not null,
  selection text not null,
  settlement text not null,
  reason text,
  fixture jsonb,
  source text not null default 'local',
  settled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  plan public.plan_tier not null default 'free',
  status public.subscription_status not null default 'none',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists picks_report_id_idx on public.picks(report_id);
create index if not exists picks_event_date_idx on public.picks(event_date desc);
create index if not exists picks_match_name_idx on public.picks(match_name);
create index if not exists reports_report_date_idx on public.reports(report_date desc);
create index if not exists settlements_event_date_idx on public.settlements(event_date desc);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.has_paid_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (
        role in ('admin', 'analyst')
        or (plan in ('premium', 'pro') and subscription_status in ('trialing', 'active'))
      )
  );
$$;

create or replace function public.can_read_report(report_visibility public.report_visibility)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    case
      when auth.uid() is null then false
      when public.is_admin() then true
      when report_visibility = 'free' then true
      when report_visibility = 'premium' then public.has_paid_access()
      when report_visibility = 'pro' then exists (
        select 1 from public.profiles
        where id = auth.uid()
          and (role in ('admin', 'analyst') or (plan = 'pro' and subscription_status in ('trialing', 'active')))
      )
      else false
    end;
$$;

alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.picks enable row level security;
alter table public.settlements enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "profiles select own or admin" on public.profiles;
create policy "profiles select own or admin"
on public.profiles for select
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles update own or admin" on public.profiles;
create policy "profiles update own or admin"
on public.profiles for update
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "reports select by plan" on public.reports;
create policy "reports select by plan"
on public.reports for select
using (public.can_read_report(visibility));

drop policy if exists "reports write admin" on public.reports;
create policy "reports write admin"
on public.reports for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "picks select by report plan" on public.picks;
create policy "picks select by report plan"
on public.picks for select
using (
  exists (
    select 1
    from public.reports
    where reports.id = picks.report_id
      and public.can_read_report(reports.visibility)
  )
);

drop policy if exists "picks write admin" on public.picks;
create policy "picks write admin"
on public.picks for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "settlements select paid" on public.settlements;
create policy "settlements select paid"
on public.settlements for select
using (public.has_paid_access());

drop policy if exists "settlements write admin" on public.settlements;
create policy "settlements write admin"
on public.settlements for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "subscriptions select own or admin" on public.subscriptions;
create policy "subscriptions select own or admin"
on public.subscriptions for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "subscriptions write admin" on public.subscriptions;
create policy "subscriptions write admin"
on public.subscriptions for all
using (public.is_admin())
with check (public.is_admin());
