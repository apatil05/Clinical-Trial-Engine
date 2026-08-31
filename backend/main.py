"""
main.py — FastAPI application entry point.

Routes:
  POST /extract          — patient notes to a structured profile, no matching
  POST /match            — full pipeline: extract, fetch trials, score, save, return top 10
  POST /generate-sample  — synthetic patient note for a random condition
  GET  /trials/search    — direct ClinicalTrials.gov search
  GET  /queue            — all match_results ranked by score
  GET  /queue/{id}       — single match result with full breakdown
  GET  /health           — API + Supabase readiness

CORS is on because the React dev server runs on a different port.

No auth, no rate limiting. /extract, /match and /generate-sample all spend
Nebius credits on unauthenticated input. Run this locally. See the known
limitations section of the README before putting it on a public address.
"""

import asyncio
import logging
import traceback
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import (
    ExtractRequest,
    MatchRequest,
    BulkMatchResponse,
    MatchResultRow,
    MatchOutput,
    PatientProfile,
    TrialResult,
)
from extractor import extract_patient_profile, parse_trial_criteria, generate_sample_patient
from matcher import bulk_match
from trials_fetcher import search_trials
from persistence import (
    check_database_ready,
    find_or_create_patient,
    get_cached_matches_for_patient,
    get_cached_parsed_criteria,
    list_queue,
    persist_match_results,
    upsert_trial,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Clinical Trial Eligibility Engine", version="1.0.0")

# wildcard origin for local dev. allow_credentials is deliberately off:
# browsers reject "*" together with credentials, so leaving it True only
# signalled an intent the app does not have. Narrow allow_origins to your
# real frontend origin before deploying this anywhere.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _in_memory_rows(
    patient_id: str,
    top_results: list[tuple[TrialResult, MatchOutput]],
) -> list[MatchResultRow]:
    rows: list[MatchResultRow] = []
    for trial, match_output in top_results:
        rows.append(
            MatchResultRow(
                id=str(uuid4()),
                patient_id=patient_id,
                trial_id=str(uuid4()),
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


async def _enrich_trial_criteria_cache(trials: list[TrialResult]) -> None:
    """
    Parse eligibility criteria and cache them in Supabase.
    Fired after /match has already responded, so the parse cost never lands on
    the request the user is waiting for.
    """
    sem = asyncio.Semaphore(4)

    async def _one(trial: TrialResult) -> None:
        if get_cached_parsed_criteria(trial.nct_id):
            return
        async with sem:
            try:
                parsed = await parse_trial_criteria(trial.raw_criteria)
                upsert_trial(trial, parsed.model_dump())
                logger.info("Cached parsed criteria for %s", trial.nct_id)
            except Exception as e:
                logger.warning("Criteria cache failed for %s: %s", trial.nct_id, e)

    await asyncio.gather(*[_one(t) for t in trials])


@app.get("/health")
async def health():
    db = check_database_ready()
    return {
        "status": "ok",
        "database": db,
    }


@app.post("/extract")
async def extract(req: ExtractRequest):
    """Extract a structured patient profile from raw health notes. No matching."""
    try:
        profile: PatientProfile = await extract_patient_profile(req.patient_text)
        return {"extracted_profile": profile.model_dump()}
    except Exception as e:
        logger.error("Error in /extract: %s", e)
        raise HTTPException(status_code=500, detail={"error": str(e)})


@app.post("/match", response_model=BulkMatchResponse)
async def match(req: MatchRequest):
    """
    Full pipeline:
    1. Extract patient profile (or reuse from /extract)
    2. Search ClinicalTrials.gov
    3. Bulk AI match (parallel Nebius calls)
    4. Persist to Supabase
    5. Background-cache parsed criteria for screened trials
    """
    try:
        if req.extracted_profile:
            patient_profile = req.extracted_profile
        else:
            patient_profile = await extract_patient_profile(req.patient_text)

        condition = req.confirmed_condition or patient_profile.primary_condition
        if not condition:
            raise HTTPException(
                status_code=400,
                detail={"error": "Could not determine a condition. Please confirm your condition and try again."},
            )

        trials = await search_trials(condition, max_results=req.max_trials)
        if not trials:
            raise HTTPException(
                status_code=404,
                detail={"error": f"No recruiting trials found for '{condition}' on ClinicalTrials.gov."},
            )

        persisted_to_db = True
        db_message: str | None = None
        patient_reused = False
        cache_hits = 0
        llm_calls = 0
        cached_by_nct: dict[str, tuple[TrialResult, MatchOutput]] = {}

        try:
            patient_id, patient_is_new = find_or_create_patient(
                req.patient_text, patient_profile
            )
            patient_reused = not patient_is_new
            if patient_reused:
                cached_by_nct = get_cached_matches_for_patient(patient_id)
        except Exception as db_error:
            persisted_to_db = False
            db_message = f"Database unavailable: {db_error}"
            patient_id = str(uuid4())

        overlap = sum(1 for t in trials if t.nct_id in cached_by_nct)
        cache_hits = overlap

        top_n = min(10, len(trials))
        top_results, llm_calls = await bulk_match(
            patient_profile,
            trials,
            top_n=top_n,
            cached_by_nct=cached_by_nct,
        )

        result_rows: list[MatchResultRow] = []
        if persisted_to_db:
            try:
                if top_results:
                    result_rows = persist_match_results(patient_id, top_results)
            except Exception as db_error:
                persisted_to_db = False
                db_message = (
                    "Results generated but not saved. "
                    f"Details: {db_error}"
                )
                logger.warning(db_message)
                result_rows = _in_memory_rows(patient_id, top_results)
        else:
            result_rows = _in_memory_rows(patient_id, top_results)

        # only enrich what we actually scored. cached trials already have their
        # parsed criteria in the trials table.
        trials_to_enrich = [t for t in trials if t.nct_id not in cached_by_nct]
        if trials_to_enrich:
            asyncio.create_task(_enrich_trial_criteria_cache(trials_to_enrich))

        return BulkMatchResponse(
            patient_id=patient_id,
            extracted_profile=patient_profile,
            total_screened=len(trials),
            results=result_rows,
            persisted_to_db=persisted_to_db,
            db_message=db_message,
            cache_hits=cache_hits,
            llm_calls=llm_calls,
            patient_reused=patient_reused,
        )

    except HTTPException:
        # the 400 and 404 above are raised inside this try. HTTPException
        # subclasses Exception, so without this the clean message written for
        # the user came back as "Matching failed: {'error': ...}" with a 500.
        raise
    except Exception as e:
        logger.error("Error in /match: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail={"error": str(e)})


@app.post("/generate-sample")
async def generate_sample():
    """Generate a synthetic patient health summary using the LLM."""
    try:
        note = await generate_sample_patient()
        return {"patient_text": note}
    except Exception as e:
        logger.error("Error in /generate-sample: %s", e)
        raise HTTPException(status_code=500, detail={"error": str(e)})


@app.get("/trials/search")
async def trials_search(condition: str, max_results: int = 20):
    """Search ClinicalTrials.gov by condition or keyword."""
    try:
        trials = await search_trials(condition, max_results=max_results)
        return {"condition": condition, "count": len(trials), "trials": [t.model_dump() for t in trials]}
    except Exception as e:
        logger.error("Error in /trials/search: %s", e)
        raise HTTPException(status_code=500, detail={"error": str(e)})


@app.get("/queue")
async def get_queue():
    """
    Every match result in the database, ranked by score.

    No auth and no patient filter, so this hands one caller every patient's
    results. Nothing in the UI calls it. It stays for local inspection until
    accounts land. Do not expose this route publicly.
    """
    try:
        results = list_queue()
        return {"count": len(results), "results": results}
    except Exception as e:
        logger.error("Error in /queue: %s", e)
        raise HTTPException(status_code=500, detail={"error": str(e)})


@app.get("/queue/{result_id}")
async def get_queue_item(result_id: str):
    """Return a single match result with full criterion breakdown."""
    try:
        from db import supabase

        response = (
            supabase.table("match_results")
            .select("*, trials(nct_id, title, condition, raw_criteria)")
            .eq("id", result_id)
            .single()
            .execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail={"error": "Result not found."})
        return response.data
    except HTTPException:
        # same reason as /match. without this the 404 becomes a 500.
        raise
    except Exception as e:
        logger.error("Error in /queue/%s: %s", result_id, e)
        raise HTTPException(status_code=500, detail={"error": str(e)})
