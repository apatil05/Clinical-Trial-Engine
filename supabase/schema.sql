-- Clinical Trial Eligibility Engine — Supabase schema
-- Run once in Supabase Dashboard → SQL Editor → Run
--
-- Safe to re-run: drops demo tables and recreates them (tables are empty in dev).

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
-- Row Level Security (anon key from frontend/backend .env)
-- Hackathon-friendly: allow read/write on demo tables.
-- Tighten these policies before any real PHI deployment.
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
