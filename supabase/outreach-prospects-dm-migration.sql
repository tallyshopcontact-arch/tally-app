-- DM Composer (Brief 3) — adds contacted-tracking columns to
-- outreach_prospects (see supabase/outreach-prospects-migration.sql).
-- Run in Supabase SQL Editor → New query → paste → Run.

alter table public.outreach_prospects
  add column if not exists contacted_at timestamptz,
  add column if not exists dm_variation_used text;
