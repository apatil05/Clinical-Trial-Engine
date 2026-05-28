"""
persistence.py — Supabase read/write helpers for patients, trials, and match results.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

from db import supabase
from models import CriterionVerdict, MatchOutput, MatchResultRow, PatientProfile, TrialResult

logger = logging.getLogger(__name__)


class DatabaseNotReadyError(RuntimeError):
    """Raised when required tables/columns/policies are missing."""


def patient_content_hash(raw_text: str) -> str:
    normalized = " ".join(raw_text.split()).strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def check_database_ready() -> dict[str, Any]:
    """Lightweight schema + RLS probe for /health."""
    status: dict[str, Any] = {
        "ready": True,
        "tables": {},
        "errors": [],
    }

    probes = {
        "patients": ("patients", "id,content_hash,raw_text,extracted_profile"),
        "trials": ("trials", "id,nct_id,title,parsed_criteria"),
        "match_results": ("match_results", "id,patient_id,trial_id,overall_score"),
    }

    for key, (table, cols) in probes.items():
        try:
            supabase.table(table).select(cols).limit(1).execute()
            status["tables"][key] = "ok"
        except Exception as e:
            status["ready"] = False
            status["tables"][key] = "error"
            status["errors"].append(f"{table}: {e}")

    return status


def find_or_create_patient(raw_text: str, profile: PatientProfile) -> tuple[str, bool]:
    """
    Return (patient_id, is_new).
    Same notes → same content_hash → reuse patient row (no duplicate patients).
    """
    content_hash = patient_content_hash(raw_text)
    try:
        existing = (
            supabase.table("patients")
            .select("id")
            .eq("content_hash", content_hash)
            .limit(1)
            .execute()
        )
        if existing.data:
            return existing.data[0]["id"], False

        created = (
            supabase.table("patients")
            .insert(
                {
                    "content_hash": content_hash,
                    "raw_text": raw_text,
                    "extracted_profile": profile.model_dump(),
                }
            )
            .execute()
        )
        return created.data[0]["id"], True
    except Exception as e:
        if "content_hash" in str(e):
            # Older schema without content_hash — fall back to always inserting.
            created = (
                supabase.table("patients")
                .insert(
                    {
                        "raw_text": raw_text,
                        "extracted_profile": profile.model_dump(),
                    }
                )
                .execute()
            )
            return created.data[0]["id"], True
        raise


def get_cached_parsed_criteria(nct_id: str) -> dict | None:
    """Return parsed criteria JSON from trials table if previously cached."""
    try:
        response = (
            supabase.table("trials")
            .select("parsed_criteria")
            .eq("nct_id", nct_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        parsed = response.data[0].get("parsed_criteria") or {}
        if parsed.get("inclusion") or parsed.get("exclusion"):
            return parsed
    except Exception as e:
        logger.debug("Could not read cached criteria for %s: %s", nct_id, e)
    return None


def _match_output_from_row(row: dict, trial: TrialResult) -> MatchOutput:
    """
    Re-score cached rows using the current deterministic formula. The breakdown
    is the source of truth; the stored score is ignored. This way, old cached
    rows from before the penalty existed automatically display the corrected
    score on next load — no cache wipe needed when the formula changes.
    """
    from matcher import compute_score_from_breakdown  # local import to avoid cycle

    breakdown = [CriterionVerdict(**v) for v in row.get("criteria_breakdown", [])]
    score, status = compute_score_from_breakdown(breakdown)
    return MatchOutput(
        overall_score=score,
        status=status,
        summary=row.get("summary") or "",
        criteria_breakdown=breakdown,
    )


def get_cached_matches_for_patient(patient_id: str) -> dict[str, tuple[TrialResult, MatchOutput]]:
    """
    Load prior AI match results for this patient keyed by nct_id.
    Powers instant re-runs for the same synthetic patient in demos.
    """
    try:
        response = (
            supabase.table("match_results")
            .select(
                "overall_score, status, summary, criteria_breakdown, "
                "trials(nct_id, title, condition, raw_criteria)"
            )
            .eq("patient_id", patient_id)
            .execute()
        )
    except Exception as e:
        logger.warning("Could not load cached matches: %s", e)
        return {}

    cached: dict[str, tuple[TrialResult, MatchOutput]] = {}
    for row in response.data or []:
        trial_data = row.get("trials")
        if not trial_data:
            continue
        nct_id = trial_data["nct_id"]
        trial = TrialResult(
            nct_id=nct_id,
            title=trial_data.get("title") or nct_id,
            condition=trial_data.get("condition") or "",
            status="RECRUITING",
            raw_criteria=trial_data.get("raw_criteria") or "",
        )
        cached[nct_id] = (trial, _match_output_from_row(row, trial))
    return cached


def upsert_trial(trial: TrialResult, parsed_criteria: dict | None = None) -> str:
    payload = {
        "nct_id": trial.nct_id,
        "title": trial.title,
        "condition": trial.condition,
        "raw_criteria": trial.raw_criteria,
        "parsed_criteria": parsed_criteria or {},
    }
    response = supabase.table("trials").upsert(payload, on_conflict="nct_id").execute()
    return response.data[0]["id"]


def upsert_match_result(
    patient_id: str,
    trial_id: str,
    match_output: MatchOutput,
) -> str:
    payload = {
        "patient_id": patient_id,
        "trial_id": trial_id,
        "overall_score": match_output.overall_score,
        "status": match_output.status,
        "criteria_breakdown": [v.model_dump() for v in match_output.criteria_breakdown],
        "summary": match_output.summary,
    }
    try:
        response = (
            supabase.table("match_results")
            .upsert(payload, on_conflict="patient_id,trial_id")
            .execute()
        )
    except Exception:
        # Fallback if unique index not applied yet.
        response = supabase.table("match_results").insert(payload).execute()
    return response.data[0]["id"]


def persist_match_results(
    patient_id: str,
    top_results: list[tuple[TrialResult, MatchOutput]],
    parsed_by_nct: dict[str, dict] | None = None,
) -> list[MatchResultRow]:
    """Upsert trials + match rows (no duplicate patient/trial pairs)."""
    parsed_by_nct = parsed_by_nct or {}
    rows: list[MatchResultRow] = []

    for trial, match_output in top_results:
        trial_id = upsert_trial(trial, parsed_by_nct.get(trial.nct_id))
        result_id = upsert_match_result(patient_id, trial_id, match_output)
        rows.append(
            MatchResultRow(
                id=result_id,
                patient_id=patient_id,
                trial_id=trial_id,
                nct_id=trial.nct_id,
                trial_title=trial.title,
                overall_score=match_output.overall_score,
                status=match_output.status,
                summary=match_output.summary,
                criteria_breakdown=match_output.criteria_breakdown,
                contact_name=trial.contact_name,
                contact_email=trial.contact_email,
                contact_phone=trial.contact_phone,
            )
        )
    return rows


def load_result_rows_for_patient(
    patient_id: str,
    top_results: list[tuple[TrialResult, MatchOutput]],
) -> list[MatchResultRow]:
    """Load persisted row ids for top results (used when everything came from cache)."""
    rows: list[MatchResultRow] = []
    for trial, match_output in top_results:
        try:
            response = (
                supabase.table("match_results")
                .select("id, trial_id, trials!inner(nct_id)")
                .eq("patient_id", patient_id)
                .eq("trials.nct_id", trial.nct_id)
                .limit(1)
                .execute()
            )
            if response.data:
                row = response.data[0]
                rows.append(
                    MatchResultRow(
                        id=row["id"],
                        patient_id=patient_id,
                        trial_id=row["trial_id"],
                        nct_id=trial.nct_id,
                        trial_title=trial.title,
                        overall_score=match_output.overall_score,
                        status=match_output.status,
                        summary=match_output.summary,
                        criteria_breakdown=match_output.criteria_breakdown,
                    )
                )
                continue
        except Exception as e:
            logger.debug("Could not load row for %s: %s", trial.nct_id, e)
        rows.extend(persist_match_results(patient_id, [(trial, match_output)]))
    return rows


def list_queue(limit: int = 50) -> list[dict]:
    response = (
        supabase.table("match_results")
        .select("*, trials(nct_id, title, condition)")
        .order("overall_score", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data
