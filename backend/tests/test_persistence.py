"""
test_persistence.py — cache loading, patient identity, and schema agreement.

The Supabase client is replaced with a fake, so this runs offline. What it
cannot prove is the PostgREST round trip against real Postgres. See AUDIT.md C6.
"""

import hashlib
import os
import re
import sys

import pytest

import matcher       # noqa: E402
import persistence   # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# --------------------------------------------------------------------------
# fake supabase: just enough of the fluent builder to satisfy persistence.py
# --------------------------------------------------------------------------

class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *a, **k):  return self
    def eq(self, *a, **k):      return self
    def limit(self, *a, **k):   return self
    def order(self, *a, **k):   return self
    def execute(self):          return _Resp(self._rows)


class FakeSupabase:
    def __init__(self, rows_by_table):
        self._rows = rows_by_table

    def table(self, name):
        return _Query(self._rows.get(name, []))


CACHED_ROW = {
    "overall_score": 999,           # deliberately wrong; must be ignored
    "status": "LIKELY_ELIGIBLE",    # also wrong
    "summary": "cached summary",
    "criteria_breakdown": [
        {"criterion_id": "exc_1", "criterion_text": "t", "type": "exclusion",
         "verdict": "INELIGIBLE", "reason": "r", "contested": False},
        {"criterion_id": "inc_1", "criterion_text": "t", "type": "inclusion",
         "verdict": "UNCERTAIN", "reason": "r", "contested": False},
    ],
    "trials": {"nct_id": "NCT123", "title": "A trial", "condition": "Gaucher",
               "raw_criteria": "c", "contact_name": "Dr X",
               "contact_email": "x@example.org", "contact_phone": "555"},
}


@pytest.fixture
def fake_db(monkeypatch):
    monkeypatch.setattr(persistence, "supabase",
                        FakeSupabase({"match_results": [CACHED_ROW]}))


# --------------------------------------------------------------------------
# C6 — the README claim: a cached row reflects the CURRENT formula
# --------------------------------------------------------------------------

def test_cached_score_is_recomputed_not_read_back(fake_db):
    cached = persistence.get_cached_matches_for_patient("patient-1")
    _, out = cached["NCT123"]
    assert out.overall_score == 57          # 100 -35 exclusion -8 inclusion
    assert out.overall_score != 999         # the stored value is ignored
    # stored status said LIKELY_ELIGIBLE; the triggered exclusion overrules it
    assert out.status == "LIKELY_INELIGIBLE"


def test_changing_the_formula_moves_a_cached_score(fake_db, monkeypatch):
    """The brief's exact test: change a penalty, reload a cached patient,
    confirm the score moves without touching the stored row."""
    before = persistence.get_cached_matches_for_patient("patient-1")["NCT123"][1].overall_score

    real = matcher.compute_score_from_breakdown
    monkeypatch.setattr(matcher, "compute_score_from_breakdown",
                        lambda bd: (real(bd)[0] - 10, real(bd)[1]))

    after = persistence.get_cached_matches_for_patient("patient-1")["NCT123"][1].overall_score
    assert after == before - 10, "cached rows are not being re-scored on load"


def test_cached_row_keeps_contact_details(fake_db):
    trial, _ = persistence.get_cached_matches_for_patient("patient-1")["NCT123"]
    assert (trial.contact_name, trial.contact_email, trial.contact_phone) == \
           ("Dr X", "x@example.org", "555")


def test_rows_without_a_joined_trial_are_skipped(monkeypatch):
    monkeypatch.setattr(persistence, "supabase",
                        FakeSupabase({"match_results": [{**CACHED_ROW, "trials": None}]}))
    assert persistence.get_cached_matches_for_patient("p") == {}


def test_db_failure_degrades_to_no_cache(monkeypatch):
    class Boom:
        def table(self, *a, **k): raise RuntimeError("database unavailable")
    monkeypatch.setattr(persistence, "supabase", Boom())
    assert persistence.get_cached_matches_for_patient("p") == {}


# --------------------------------------------------------------------------
# patient identity
# --------------------------------------------------------------------------

def test_same_note_reformatted_is_the_same_patient():
    a = persistence.patient_content_hash("Patient: Sarah M.\nHemoglobin: 10.2")
    b = persistence.patient_content_hash("  patient:   sarah m.   hemoglobin: 10.2  ")
    assert a == b


def test_different_notes_are_different_patients():
    assert persistence.patient_content_hash("note one") != \
           persistence.patient_content_hash("note two")


def test_migration_backfill_hash_matches_the_python_hash():
    """The migration backfills content_hash in SQL. If it normalizes differently
    from patient_content_hash(), every migrated row misses on lookup and gets
    silently duplicated."""
    raw = "  PATIENT   HEALTH\n\nSummary\tLine  \n"
    py = persistence.patient_content_hash(raw)
    sql_equivalent = hashlib.sha256(
        re.sub(r"\s+", " ", raw).strip().lower().encode()).hexdigest()
    assert py == sql_equivalent

    sql = open(os.path.join(REPO, "supabase", "migration_add_cache.sql")).read()
    assert "lower(btrim(regexp_replace(raw_text" in sql, \
        "migration no longer normalizes before hashing"


# --------------------------------------------------------------------------
# B1 — schema.sql must contain every column the code writes
# --------------------------------------------------------------------------

def test_schema_has_every_trials_column_upsert_writes():
    schema = open(os.path.join(REPO, "supabase", "schema.sql")).read()
    src = open(os.path.join(REPO, "backend", "persistence.py")).read()
    body = src[src.index("def upsert_trial("):src.index("def upsert_match_result(")]
    written = set(re.findall(r'"(\w+)":\s*(?:trial\.|parsed_criteria)', body))
    assert written, "could not parse upsert_trial payload"
    table = schema[schema.index("create table public.trials"):schema.index("create table public.match_results")]
    missing = [c for c in written if c not in table]
    assert not missing, f"schema.sql is missing columns the code writes: {missing}"


def test_schema_has_every_match_results_column_upsert_writes():
    schema = open(os.path.join(REPO, "supabase", "schema.sql")).read()
    table = schema[schema.index("create table public.match_results"):]
    for col in ("patient_id", "trial_id", "overall_score", "status",
                "criteria_breakdown", "summary"):
        assert col in table, f"schema.sql missing match_results.{col}"
