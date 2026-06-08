-- Run this in your Supabase project: SQL Editor > New query > paste > Run

-- ---------------------------------------------------------------------------
-- waitlist
-- ---------------------------------------------------------------------------
create table public.waitlist (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  email           text        not null unique,
  genre           text        not null,
  youtube_channel text        not null,
  created_at      timestamptz not null default now()
);

-- Enable RLS (rows are only accessible via the service role key used by our API)
alter table public.waitlist enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- One row per auth.users entry. Created at signup, populated at onboarding.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid        primary key references auth.users (id) on delete cascade,
  email               text        not null,
  name                text        not null default '',
  genre               text,
  youtube_channel_url text,
  top_artist_1        text,
  top_artist_2        text,
  top_artist_3        text,
  subscription_tier   text        not null default 'free',
  onboarding_complete boolean     not null default false,
  created_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read and update only their own profile row
create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
