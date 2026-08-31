-- Additive migration. Run this in the SQL Editor after schema.sql, and run it
-- on its own if you applied an older schema.sql before these columns existed.
-- Nothing here drops or rewrites data.

-- trials.contact_* — upsert_trial() writes these on every trial. an older
-- schema without them makes every /match run fail on the write.
alter table public.trials
  add column if not exists contact_name  text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

-- patients.content_hash — the patient dedup key. without it find_or_create_patient()
-- falls back to inserting a new patient every run and nothing ever caches.

alter table public.patients
  add column if not exists content_hash text;

-- must match patient_content_hash() in backend/persistence.py exactly:
--   " ".join(raw_text.split()).strip().lower()  then sha256
-- hashing raw_text directly gives a different digest, so every backfilled row
-- would miss on lookup and the app would insert a duplicate patient beside it.
update public.patients
set content_hash = encode(
      sha256(lower(btrim(regexp_replace(raw_text, '\s+', ' ', 'g')))::bytea),
      'hex'
    )
where content_hash is null;

alter table public.patients
  alter column content_hash set not null;

create unique index if not exists patients_content_hash_uniq on public.patients (content_hash);

create unique index if not exists match_results_patient_trial_uniq
  on public.match_results (patient_id, trial_id);
