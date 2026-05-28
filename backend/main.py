"""
main.py — FastAPI application entry point.

Routes:
  POST /match          — full pipeline: extract → fetch trials → bulk match → save → return top 10
  GET  /trials/search  — direct ClinicalTrials.gov search
  GET  /queue          — all match_results ranked by score
  GET  /queue/{id}     — single match result with full breakdown

CORS is always enabled — the React dev server runs on a different port.
"""

import logging
import traceback
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import (
    ExtractRequest,
    MatchRequest,
    BulkMatchResponse,
    MatchResultRow,
    CriterionVerdict,
    PatientProfile,
)
from extractor import extract_patient_profile
from matcher import bulk_match
from trials_fetcher import search_trials
from db import supabase

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Clinical Trial Eligibility Engine", version="1.0.0")

# ---------------------------------------------------------------------------
# CORS — must always be present; React dev server runs on a different port
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# POST /extract  — extraction only (used for condition confirmation step)
# ---------------------------------------------------------------------------

@app.post("/extract")
async def extract(req: ExtractRequest):
    """Extract a structured patient profile from raw health notes. No matching."""
    try:
        profile: PatientProfile = await extract_patient_profile(req.patient_text)
        return {"extracted_profile": profile.dict()}
    except Exception as e:
        logger.error("Error in /extract: %s", e)
        raise HTTPException(status_code=500, detail={"error": str(e)})


# ---------------------------------------------------------------------------
# POST /match  — full pipeline
# ---------------------------------------------------------------------------

@app.post("/match", response_model=BulkMatchResponse)
async def match(req: MatchRequest):
    """
    Full pipeline:
    1. Extract patient profile from raw text
    2. Use confirmed condition (or extracted) to search ClinicalTrials.gov
    3. Bulk match against up to max_trials concurrently
    4. Save patient + trials + results to Supabase
    5. Return top 10 results ranked by score
    """
    try:
        # Step 1 — Extract patient profile
        patient_profile: PatientProfile = await extract_patient_profile(req.patient_text)

        # Step 2 — Determine condition for trial search
        condition = req.confirmed_condition or patient_profile.primary_condition
        if not condition:
            return {
                "error": "Could not determine a condition. Please confirm your condition and try again."
            }

        # Step 3 — Fetch trials from ClinicalTrials.gov
        trials = await search_trials(condition, max_results=req.max_trials)
        if not trials:
            return {
                "error": f"No recruiting trials found for '{condition}' on ClinicalTrials.gov."
            }

        # Step 4 — Bulk match (async parallel, top 10 returned)
        top_results = await bulk_match(patient_profile, trials, top_n=10)

        # Step 5 — Save to Supabase (after all AI steps complete successfully)

        # 5a. Save patient
        patient_insert = supabase.table("patients").insert({
            "raw_text": req.patient_text,
            "extracted_profile": patient_profile.dict(),
        }).execute()

        patient_id = patient_insert.data[0]["id"]

        # 5b. Upsert trials + save match results
        result_rows: list[MatchResultRow] = []

        for trial, match_output in top_results:
            # Upsert trial (nct_id is unique)
            trial_upsert = supabase.table("trials").upsert({
                "nct_id": trial.nct_id,
                "title": trial.title,
                "condition": trial.condition,
                "raw_criteria": trial.raw_criteria,
                "parsed_criteria": {},  # criteria are parsed lazily in matcher
            }, on_conflict="nct_id").execute()

            trial_id = trial_upsert.data[0]["id"]

            # Save match result
            match_insert = supabase.table("match_results").insert({
                "patient_id": patient_id,
                "trial_id": trial_id,
                "overall_score": match_output.overall_score,
                "status": match_output.status,
                "criteria_breakdown": [v.dict() for v in match_output.criteria_breakdown],
                "summary": match_output.summary,
            }).execute()

            result_id = match_insert.data[0]["id"]

            result_rows.append(MatchResultRow(
                id=result_id,
                patient_id=patient_id,
                trial_id=trial_id,
                nct_id=trial.nct_id,
                trial_title=trial.title,
                overall_score=match_output.overall_score,
                status=match_output.status,
                summary=match_output.summary,
                criteria_breakdown=match_output.criteria_breakdown,
            ))

        return BulkMatchResponse(
            patient_id=patient_id,
            extracted_profile=patient_profile,
            total_screened=len(trials),
            results=result_rows,
        )

    except Exception as e:
        logger.error("Error in /match: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail={"error": str(e)})


# ---------------------------------------------------------------------------
# GET /trials/search
# ---------------------------------------------------------------------------

@app.get("/trials/search")
async def trials_search(condition: str, max_results: int = 20):
    """Search ClinicalTrials.gov by condition or keyword."""
    try:
        trials = await search_trials(condition, max_results=max_results)
        return {"condition": condition, "count": len(trials), "trials": [t.dict() for t in trials]}
    except Exception as e:
        logger.error("Error in /trials/search: %s", e)
        raise HTTPException(status_code=500, detail={"error": str(e)})


# ---------------------------------------------------------------------------
# GET /queue
# ---------------------------------------------------------------------------

@app.get("/queue")
async def get_queue():
    """Return all match results from Supabase ranked by overall_score descending."""
    try:
        response = (
            supabase.table("match_results")
            .select("*, trials(nct_id, title, condition)")
            .order("overall_score", desc=True)
            .execute()
        )
        return {"count": len(response.data), "results": response.data}
    except Exception as e:
        logger.error("Error in /queue: %s", e)
        raise HTTPException(status_code=500, detail={"error": str(e)})


# ---------------------------------------------------------------------------
# GET /queue/{id}
# ---------------------------------------------------------------------------

@app.get("/queue/{result_id}")
async def get_queue_item(result_id: str):
    """Return a single match result with full criterion breakdown."""
    try:
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
        raise
    except Exception as e:
        logger.error("Error in /queue/%s: %s", result_id, e)
        raise HTTPException(status_code=500, detail={"error": str(e)})
