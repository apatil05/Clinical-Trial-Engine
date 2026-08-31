-- Clinical Trial Eligibility Engine — Supabase schema
-- Run in Supabase Dashboard → SQL Editor → Run, then run migration_add_cache.sql.
--
-- This DROPS all three tables before recreating them. Re-running it deletes
-- every patient, trial and match result you have. That is fine on a dev
-- project with synthetic data and it is not fine anywhere else.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

drop table if exists public.match_results cascade;
drop table if exists public.trials cascade;
drop table if exists public.patients cascade;

create table public.patients (
  id                  uuid primary key default gen_random_uuid(),
  content_hash        text not null unique,
  raw_text            text not null,
  extracted_profile   jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create table public.trials (
  id                  uuid primary key default gen_random_uuid(),
  nct_id              text not null unique,
  title               text not null,
  condition           text,
  raw_criteria        text,
  parsed_criteria     jsonb not null default '{}'::jsonb,
  -- pulled from the CTGov central contact. upsert_trial() writes all three on
  -- every write and get_cached_matches_for_patient() selects them back, so
  -- leaving them out makes /match fail against a fresh database.
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  created_at          timestamptz not null default now()
);

create table public.match_results (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients(id) on delete cascade,
  trial_id            uuid not null references public.trials(id) on delete cascade,
  overall_score       int not null check (overall_score between 0 and 100),
  status              text not null,
  criteria_breakdown  jsonb not null default '[]'::jsonb,
  summary             text,
  created_at          timestamptz not null default now()
);

create unique index match_results_patient_trial_uniq on public.match_results (patient_id, trial_id);
create index match_results_patient_id_idx on public.match_results (patient_id);
create index match_results_score_idx on public.match_results (overall_score desc);
create index trials_nct_id_idx on public.trials (nct_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- READ THIS BEFORE DEPLOYING ANYTHING.
--
-- RLS is enabled below, and then every policy grants anon full read and write
-- on every table. Enabled RLS with an open policy is not protection. Anyone
-- holding the anon key can read and write every row, and patients.raw_text
-- holds the complete note somebody pasted in.
--
-- This is deliberate for a local demo where all the data is synthetic. It is
-- not a configuration to point at real patient data. Narrow these policies and
-- move the backend to a service-role key before this goes anywhere near PHI.
-- ---------------------------------------------------------------------------

alter table public.patients enable row level security;
alter table public.trials enable row level security;
alter table public.match_results enable row level security;

create policy "patients_anon_all"
  on public.patients for all
  to anon, authenticated
  using (true) with check (true);

create policy "trials_anon_all"
  on public.trials for all
  to anon, authenticated
  using (true) with check (true);

create policy "match_results_anon_all"
  on public.match_results for all
  to anon, authenticated
  using (true) with check (true);
