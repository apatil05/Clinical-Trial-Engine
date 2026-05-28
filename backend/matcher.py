"""
matcher.py — Per-criterion matching logic + bulk async orchestration.

match_patient_to_trial() runs one patient vs one trial.
bulk_match() fans out across all trials concurrently via asyncio.gather().
Temperature is always 0.1. Prompts return JSON only.
UNCERTAIN is always preferred over INELIGIBLE when data is missing.
"""

import os
import random
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
# NOTE: each trial fires 2 LLM calls (dual-pass scoring), so effective concurrent
# requests = MATCH_CONCURRENCY * 2. Nemotron 253B takes ~20s per call — keep this low
# so we don't saturate Nebius's per-model capacity.
MATCH_CONCURRENCY = int(os.getenv("MATCH_CONCURRENCY", "2"))
DEFAULT_MAX_TRIALS = int(os.getenv("MAX_TRIALS", "8"))
MATCH_MAX_TOKENS = int(os.getenv("MATCH_MAX_TOKENS", "2048"))
# Retries per single-pass LLM call on transient failure (rate limits, timeouts).
MATCH_RETRIES = int(os.getenv("MATCH_RETRIES", "3"))
# Backoff (seconds) — rate limits need much longer waits than network blips.
RATE_LIMIT_BACKOFF_BASE = 5.0
TRANSIENT_BACKOFF_BASE = 0.6

# Bump whenever scoring formula changes. If your demo shows stale scores, wipe match_results:
#   DELETE FROM match_results;
# v2: dual-pass + deterministic uncertainty penalty (-5 inc, -3 exc, -2 contested)
SCORING_VERSION = 2

client = AsyncOpenAI(
    api_key=os.environ["NEBIUS_API_KEY"],
    base_url="https://api.studio.nebius.ai/v1/",
)

MODEL_DEFAULT = os.getenv("NEBIUS_MODEL", "meta-llama/Llama-3.3-70B-Instruct")
MODEL_MATCH = os.getenv("NEBIUS_MODEL_MATCH", MODEL_DEFAULT)


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
# Dual-pass matching: two concurrent LLM calls, reconciled into one verdict
# ---------------------------------------------------------------------------

async def _single_match_pass(
    patient: PatientProfile,
    trial: TrialResult,
    temperature: float,
) -> MatchOutput:
    """
    One LLM scoring pass at the given temperature, with retry on transient errors.
    Rate limits and network blips drop trials silently otherwise — the retry loop
    matters more here than in extraction because dual-pass doubles the call count.
    """
    raw_criteria = (trial.raw_criteria or "").strip()
    if len(raw_criteria) > MAX_CRITERIA_CHARS:
        raw_criteria = raw_criteria[:MAX_CRITERIA_CHARS] + "\n...[truncated for screening]"

    prompt = (
        MATCHING_PROMPT
        .replace("{patient_profile}", patient.model_dump_json(indent=2))
        .replace("{raw_criteria}", raw_criteria)
    )

    last_error: Exception | None = None
    for attempt in range(MATCH_RETRIES + 1):
        try:
            response = await client.chat.completions.create(
                model=MODEL_MATCH,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                max_tokens=MATCH_MAX_TOKENS,
            )
            raw_json = response.choices[0].message.content.strip()
            data = _parse_llm_json(raw_json)
            breakdown = [CriterionVerdict(**v) for v in data.get("criteria_breakdown", [])]
            return MatchOutput(
                overall_score=data["overall_score"],
                status=data["status"],
                summary=data["summary"],
                criteria_breakdown=breakdown,
            )
        except Exception as e:
            last_error = e
            if attempt >= MATCH_RETRIES:
                logger.warning(
                    "All %d retries exhausted for %s (temp=%.1f): %s",
                    MATCH_RETRIES + 1, trial.nct_id, temperature, e,
                )
                raise last_error

            # Rate limits need much longer waits than network blips. Jitter prevents
            # both passes from retrying at the exact same moment and re-hitting the limit.
            err_text = str(e).lower()
            is_rate_limit = (
                "rate" in err_text or "429" in err_text or "quota" in err_text
                or e.__class__.__name__ == "RateLimitError"
            )
            base = RATE_LIMIT_BACKOFF_BASE if is_rate_limit else TRANSIENT_BACKOFF_BASE
            delay = base * (2 ** attempt) + random.uniform(0, 1.0)
            logger.info(
                "Retry %d/%d for %s (temp=%.1f, %s, sleeping %.1fs): %s",
                attempt + 1, MATCH_RETRIES, trial.nct_id, temperature,
                "rate_limit" if is_rate_limit else "transient",
                delay, e,
            )
            await asyncio.sleep(delay)


def compute_score_from_breakdown(breakdown: list[CriterionVerdict]) -> tuple[int, str]:
    """
    Deterministic score formula — pure function of the criterion verdicts.
    Called both when reconciling fresh LLM passes AND when loading cached results,
    so the same penalty rules apply regardless of when the breakdown was generated.
    No cache invalidation ever needed when the formula changes.

    Per-criterion deltas (start at 100, all clamped to [0, 100]):
      INELIGIBLE inclusion: -20  (patient fails a required criterion)
      INELIGIBLE exclusion: -35  (patient triggers a disqualifying criterion)
      UNCERTAIN  inclusion: -8   (can't confirm patient meets it)
      UNCERTAIN  exclusion: -3   (can't confirm patient avoids it)
      contested:            -2   (both LLM passes disagreed — extra doubt)
      ELIGIBLE:              0   (no change — they met the criterion)
    """
    score = 100
    for c in breakdown:
        if c.verdict == "INELIGIBLE":
            score -= 35 if c.type == "exclusion" else 20
        elif c.verdict == "UNCERTAIN":
            score -= 3 if c.type == "exclusion" else 8
        if c.contested:
            score -= 2

    score = max(0, min(100, score))

    has_ineligible_exclusion = any(
        c.verdict == "INELIGIBLE" and c.type == "exclusion" for c in breakdown
    )
    if has_ineligible_exclusion or score < 40:
        status = "LIKELY_INELIGIBLE"
    elif score >= 70:
        status = "LIKELY_ELIGIBLE"
    else:
        status = "UNCERTAIN"

    return score, status


def _reconcile_passes(a: MatchOutput, b: MatchOutput) -> MatchOutput:
    """
    Merge two scoring passes into one breakdown, then compute the score
    deterministically. Disagreements collapse to UNCERTAIN + contested=True.
    """
    b_by_id = {c.criterion_id: c for c in b.criteria_breakdown}

    reconciled: list[CriterionVerdict] = []
    for c_a in a.criteria_breakdown:
        c_b = b_by_id.get(c_a.criterion_id)
        if c_b is None or c_a.verdict == c_b.verdict:
            reconciled.append(c_a)
        else:
            reconciled.append(CriterionVerdict(
                criterion_id=c_a.criterion_id,
                criterion_text=c_a.criterion_text,
                type=c_a.type,
                verdict="UNCERTAIN",
                reason=f"Agents disagreed ({c_a.verdict} vs {c_b.verdict}) — insufficient data to confirm.",
                contested=True,
            ))

    score, status = compute_score_from_breakdown(reconciled)

    return MatchOutput(
        overall_score=score,
        status=status,
        summary=a.summary,
        criteria_breakdown=reconciled,
    )


async def match_patient_to_trial(
    patient: PatientProfile,
    trial: TrialResult,
) -> MatchOutput:
    """
    Run two concurrent LLM scoring passes and reconcile disagreements.
    Tolerates one-pass failure: if both passes fail the trial drops, but if only
    one fails the surviving pass is returned as-is (just no contested-flagging).
    """
    results = await asyncio.gather(
        _single_match_pass(patient, trial, temperature=0.1),
        _single_match_pass(patient, trial, temperature=0.5),
        return_exceptions=True,
    )
    pass_a, pass_b = results

    a_ok = isinstance(pass_a, MatchOutput)
    b_ok = isinstance(pass_b, MatchOutput)

    if a_ok and b_ok:
        return _reconcile_passes(pass_a, pass_b)
    if a_ok:
        logger.info("Trial %s: pass B failed, returning pass A only", trial.nct_id)
        return pass_a
    if b_ok:
        logger.info("Trial %s: pass A failed, returning pass B only", trial.nct_id)
        return pass_b
    # Both failed — re-raise so _match_one logs and drops this trial
    raise pass_a if isinstance(pass_a, Exception) else pass_b


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
