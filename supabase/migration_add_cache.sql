-- Run in SQL Editor if you already applied an older schema.sql (additive migration).

alter table public.patients
  add column if not exists content_hash text;

update public.patients
set content_hash = encode(sha256(raw_text::bytea), 'hex')
where content_hash is null;

alter table public.patients
  alter column content_hash set not null;

create unique index if not exists patients_content_hash_uniq on public.patients (content_hash);

create unique index if not exists match_results_patient_trial_uniq
  on public.match_results (patient_id, trial_id);
