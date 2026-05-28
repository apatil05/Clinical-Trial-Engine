"""
matcher.py — Per-criterion matching logic + bulk async orchestration.

match_patient_to_trial() runs one patient vs one trial.
bulk_match() fans out across all trials concurrently via asyncio.gather().
Temperature is always 0.1. Prompts return JSON only.
UNCERTAIN is always preferred over INELIGIBLE when data is missing.
"""

import os
import asyncio
import logging
from openai import AsyncOpenAI
from dotenv import load_dotenv
from models import (
    PatientProfile,
    TrialResult,
    MatchOutput,
    CriterionVerdict,
)
from extractor import _parse_llm_json

load_dotenv()

logger = logging.getLogger(__name__)

# Tunable for hackathon demos — higher concurrency uses more Nebius credits, finishes faster.
MAX_CRITERIA_CHARS = int(os.getenv("MAX_CRITERIA_CHARS", "6000"))
MATCH_CONCURRENCY = int(os.getenv("MATCH_CONCURRENCY", "8"))
DEFAULT_MAX_TRIALS = int(os.getenv("MAX_TRIALS", "8"))
MATCH_MAX_TOKENS = int(os.getenv("MATCH_MAX_TOKENS", "2048"))

client = AsyncOpenAI(
    api_key=os.environ["NEBIUS_API_KEY"],
    base_url="https://api.studio.nebius.ai/v1/",
)

MODEL = os.getenv("NEBIUS_MODEL", "meta-llama/Llama-3.3-70B-Instruct")


# ---------------------------------------------------------------------------
# Matching prompt
# ---------------------------------------------------------------------------

MATCHING_PROMPT = """You are a clinical trial eligibility assessment assistant. Evaluate whether a patient meets the eligibility criteria for a clinical trial.

Return ONLY valid JSON matching the schema below. No markdown, no explanation, no extra text.

Schema:
{
  "overall_score": integer (0-100),
  "status": "LIKELY_ELIGIBLE" | "LIKELY_INELIGIBLE" | "UNCERTAIN",
  "summary": string (2-3 sentences, written in plain language for the patient),
  "criteria_breakdown": [
    {
      "criterion_id": string,
      "criterion_text": string,
      "type": "inclusion" | "exclusion",
      "verdict": "ELIGIBLE" | "INELIGIBLE" | "UNCERTAIN",
      "reason": string (1 sentence, plain language)
    }
  ]
}

Scoring rules:
- Start at 100 and deduct points for each INELIGIBLE criterion.
- Deduct 15-25 points per failed inclusion criterion (based on severity).
- Deduct 30-40 points per met exclusion criterion (exclusions are disqualifying).
- UNCERTAIN criteria do not reduce the score — missing data is not a failure.
- overall_score must reflect the final sum after all deductions.

Verdict rules:
- ELIGIBLE: Patient data clearly meets this criterion.
- INELIGIBLE: Patient data clearly fails this criterion.
- UNCERTAIN: The patient's notes do not contain enough information to evaluate this criterion. ALWAYS prefer UNCERTAIN over INELIGIBLE when data is simply missing.
- For exclusion criteria: ELIGIBLE means the patient does NOT trigger the exclusion (i.e. they pass).

Status rules:
- LIKELY_ELIGIBLE: score >= 70 and no INELIGIBLE exclusion criteria
- LIKELY_INELIGIBLE: any exclusion criterion is INELIGIBLE, or score < 40
- UNCERTAIN: everything else

Summary must be written for a patient — avoid clinical jargon where possible. Mention the score and any key uncertain items.

---

Patient profile (JSON):
{patient_profile}

---

Trial eligibility criteria (raw text):
{raw_criteria}

Evaluate up to 15 of the most important inclusion/exclusion criteria (prioritize disqualifying rules)."""


# ---------------------------------------------------------------------------
# Single match
# ---------------------------------------------------------------------------

async def match_patient_to_trial(
    patient: PatientProfile,
    trial: TrialResult,
) -> MatchOutput:
    """Run LLM matching for one patient vs one trial's raw eligibility text."""
    raw_criteria = (trial.raw_criteria or "").strip()
    if len(raw_criteria) > MAX_CRITERIA_CHARS:
        raw_criteria = raw_criteria[:MAX_CRITERIA_CHARS] + "\n...[truncated for screening]"

    prompt = (
        MATCHING_PROMPT
        .replace("{patient_profile}", patient.model_dump_json(indent=2))
        .replace("{raw_criteria}", raw_criteria)
    )

    response = await client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=MATCH_MAX_TOKENS,
    )

    raw_json = response.choices[0].message.content.strip()

    try:
        data = _parse_llm_json(raw_json)
    except (ValueError, TypeError) as e:
        logger.error(
            "Matching JSON parse error for %s: %s\nRaw: %s",
            trial.nct_id, e, raw_json,
        )
        raise ValueError(f"LLM returned invalid JSON for trial {trial.nct_id}: {e}")

    breakdown = [CriterionVerdict(**v) for v in data.get("criteria_breakdown", [])]
    return MatchOutput(
        overall_score=data["overall_score"],
        status=data["status"],
        summary=data["summary"],
        criteria_breakdown=breakdown,
    )


# ---------------------------------------------------------------------------
# Bulk match orchestration
# ---------------------------------------------------------------------------

async def _match_one(
    patient: PatientProfile,
    trial: TrialResult,
    semaphore: asyncio.Semaphore,
) -> tuple[TrialResult, MatchOutput] | None:
    """Match one trial. Returns None on any error so bulk continues."""
    async with semaphore:
        try:
            result = await match_patient_to_trial(patient, trial)
            return (trial, result)
        except Exception as e:
            logger.warning("Skipping trial %s due to error: %s", trial.nct_id, e)
            return None


async def bulk_match(
    patient: PatientProfile,
    trials: list[TrialResult],
    top_n: int = 5,
    cached_by_nct: dict[str, tuple[TrialResult, MatchOutput]] | None = None,
) -> tuple[list[tuple[TrialResult, MatchOutput]], int]:
    """
    Match patient against trials with bounded concurrency.
    Returns (top_n results sorted by score, number of LLM calls made).
    Skips trials present in cached_by_nct.
    """
    cached_by_nct = cached_by_nct or {}
    cached_hits = [
        cached_by_nct[t.nct_id]
        for t in trials
        if t.nct_id in cached_by_nct
    ]
    to_score = [t for t in trials if t.nct_id not in cached_by_nct]

    llm_calls = 0
    if to_score:
        semaphore = asyncio.Semaphore(MATCH_CONCURRENCY)
        tasks = [_match_one(patient, trial, semaphore) for trial in to_score]
        raw_results = await asyncio.gather(*tasks)
        llm_calls = len(to_score)
        fresh = [r for r in raw_results if r is not None]
    else:
        fresh = []

    valid = cached_hits + fresh
    valid.sort(key=lambda x: x[1].overall_score, reverse=True)
    return valid[:top_n], llm_calls
