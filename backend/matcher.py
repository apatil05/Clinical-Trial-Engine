"""
matcher.py — per-criterion matching + bulk async orchestration.

match_patient_to_trial() runs one patient against one trial.
bulk_match() fans that out across every trial via asyncio.gather().

Two passes per trial: the same model at temperature 0.1 and 0.5. The score
never comes from the model. compute_score_from_breakdown() is the only thing
that sets it, on every path.

UNCERTAIN beats INELIGIBLE whenever the notes simply don't say.
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

# criteria longer than this get cut before they reach the prompt. some oncology
# trials ship 20k characters of eligibility text, which eats the token budget
# before the model has emitted any JSON.
MAX_CRITERIA_CHARS = int(os.getenv("MAX_CRITERIA_CHARS", "6000"))

# each trial fires 2 calls, so live requests = MATCH_CONCURRENCY * 2. Nemotron
# 253B takes ~20s a call. Raise this and Nebius starts rate-limiting the model.
MATCH_CONCURRENCY = int(os.getenv("MATCH_CONCURRENCY", "2"))

# 4096 is plenty once THINKING_OFF is in play, because the model then answers
# in a few hundred characters. Do not try to fix parse failures by raising it:
# measured across two runs, response bodies came back 8089-9989 chars at 4096
# and 8191-9867 at 16384. Same distribution. The cap was never what cut them
# off. See THINKING_OFF below.
MATCH_MAX_TOKENS = int(os.getenv("MATCH_MAX_TOKENS", "4096"))

# retries per pass on transient failure (rate limits, timeouts).
MATCH_RETRIES = int(os.getenv("MATCH_RETRIES", "3"))

# seconds. rate limits need much longer waits than a network blip does.
RATE_LIMIT_BACKOFF_BASE = 5.0
TRANSIENT_BACKOFF_BASE = 0.6

client = AsyncOpenAI(
    api_key=os.environ["NEBIUS_API_KEY"],
    base_url="https://api.studio.nebius.ai/v1/",
)

MODEL_DEFAULT = os.getenv("NEBIUS_MODEL", "meta-llama/Llama-3.3-70B-Instruct")
MODEL_MATCH = os.getenv("NEBIUS_MODEL_MATCH", MODEL_DEFAULT)

# Nemotron Ultra decides how much to reason from a system message, and with no
# system message at all it reasons without stopping. It opened every scoring
# response with <think>, ran 8-10k characters, and returned having emitted no
# JSON, which failed 11 of 15 calls. Same prompt with this line: 465 characters,
# clean JSON, finish_reason=stop.
#
# Nvidia spells it exactly like this. "detailed thinking off" works, paraphrases
# do not. Harmless on the non-reasoning models, so it is sent unconditionally.
THINKING_OFF = {"role": "system", "content": "detailed thinking off"}


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
    call_counter: list[int] | None = None,
) -> MatchOutput:
    """
    One scoring pass at the given temperature, retried on transient errors.
    Without the retry loop a rate limit drops the trial silently. That matters
    more here than in extraction because two passes double the call count.

    call_counter is a one-element list bumped on every request actually sent,
    retries included, so /match can report a real number instead of a guess.
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
            if call_counter is not None:
                call_counter[0] += 1
            response = await client.chat.completions.create(
                model=MODEL_MATCH,
                messages=[THINKING_OFF, {"role": "user", "content": prompt}],
                temperature=temperature,
                max_tokens=MATCH_MAX_TOKENS,
            )
            raw_json = (response.choices[0].message.content or "").strip()
            try:
                data = _parse_llm_json(raw_json)
            except Exception:
                # log what actually came back. "Expecting value: line 1 column 1"
                # tells you nothing about whether the model returned prose, an
                # empty string, or JSON that ran out of tokens mid-object.
                logger.warning(
                    "Unparseable response for %s (temp=%.1f, %d chars): %.400r",
                    trial.nct_id, temperature, len(raw_json), raw_json,
                )
                raise
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

            # a rate limit needs a much longer wait than a network blip, so the
            # two get different bases. the jitter matters because both passes
            # fail together: without it they back off in lockstep and hit the
            # limit again at exactly the same moment.
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
    The score. Pure function of the verdicts, nothing else feeds it.

    Every path runs through here: fresh passes, the single-pass fallback, and
    cached rows on load. That is what lets the weights below change without a
    cache wipe, because no stored score is ever trusted.

    Start at 100, clamp to [0, 100]:

      INELIGIBLE exclusion  -35   trigger an exclusion and the protocol is done
                                  with you. nothing about the patient can be
                                  adjusted to get back in.
      INELIGIBLE inclusion  -20   a failed inclusion is often movable. a lab
                                  value, a washout period, a med that can be
                                  swapped. worth a coordinator's phone call, so
                                  it should not sink the score as hard.
      UNCERTAIN  inclusion   -8   we cannot show the patient qualifies. that is
                                  real doubt about a requirement.
      UNCERTAIN  exclusion   -3   notes are usually silent on an exclusion
                                  because the patient does not have it. weak
                                  evidence, so a light touch.
      contested              -2   the two passes disagreed. extra doubt on top
                                  of whatever verdict survived.
      ELIGIBLE                0

    UNCERTAIN costs points on purpose. Sparse notes must not score 100 against
    a trial whose criteria were never evaluated.
    """
    score = 100
    for c in breakdown:
        # normalize first. the model returns "uncertain" and "Uncertain" as
        # happily as "UNCERTAIN". compare case-sensitively and the deduction
        # skips without erroring, so the score reads 100 while the UI is still
        # showing UNCERTAIN badges next to it.
        verdict = (c.verdict or "").strip().upper()
        ctype   = (c.type or "").strip().lower()

        if verdict == "INELIGIBLE":
            score -= 35 if ctype == "exclusion" else 20
        elif verdict == "UNCERTAIN":
            score -= 3 if ctype == "exclusion" else 8
        if c.contested:
            score -= 2

    score = max(0, min(100, score))

    # a 100 alongside UNCERTAIN verdicts means the casing or type normalization
    # above stopped matching. catches malformed breakdowns from old cache rows.
    uncertain_count = sum(1 for c in breakdown if (c.verdict or "").strip().upper() == "UNCERTAIN")
    if uncertain_count > 0 and score == 100:
        logger.warning(
            "Score=100 despite %d UNCERTAIN criteria — check verdict casing/types: %s",
            uncertain_count,
            [(c.verdict, c.type) for c in breakdown if (c.verdict or "").strip().upper() == "UNCERTAIN"],
        )

    has_ineligible_exclusion = any(
        (c.verdict or "").strip().upper() == "INELIGIBLE"
        and (c.type or "").strip().lower() == "exclusion"
        for c in breakdown
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
    Merge both passes into one breakdown, then score it deterministically.
    Where they disagree the criterion drops to UNCERTAIN + contested=True.

    Known gap: the join is on criterion_id, and MATCHING_PROMPT never pins the
    id scheme. Two passes have no reason to agree on ids, so in practice most
    criteria fall through the `c_b is None` branch and keep pass A's verdict
    with no contested flag. Symptom is a run with 0 contested across every
    trial. Fixing it means joining on normalized criterion_text or pinning the
    ids in the prompt. See AUDIT.md C1.
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


def _score_single_pass(p: MatchOutput) -> MatchOutput:
    """
    One pass survived, the other raised. Re-score the survivor through the same
    formula anyway.

    Returning the pass as-is is what let the model's own arithmetic reach the
    UI. NCT03980717 came back 45 where the penalty table gives 29, on roughly
    one trial in four, and nothing in the response marked which ones.
    """
    score, status = compute_score_from_breakdown(p.criteria_breakdown)
    return MatchOutput(
        overall_score=score,
        status=status,
        summary=p.summary,
        criteria_breakdown=p.criteria_breakdown,
    )


async def match_patient_to_trial(
    patient: PatientProfile,
    trial: TrialResult,
    call_counter: list[int] | None = None,
) -> MatchOutput:
    """
    Run both scoring passes concurrently and reconcile them.
    One pass failing is survivable. Both failing drops the trial.
    """
    results = await asyncio.gather(
        _single_match_pass(patient, trial, 0.1, call_counter),
        _single_match_pass(patient, trial, 0.5, call_counter),
        return_exceptions=True,
    )
    pass_a, pass_b = results

    a_ok = isinstance(pass_a, MatchOutput)
    b_ok = isinstance(pass_b, MatchOutput)

    if a_ok and b_ok:
        return _reconcile_passes(pass_a, pass_b)
    if a_ok:
        logger.info("Trial %s: pass B failed, scoring on pass A alone", trial.nct_id)
        return _score_single_pass(pass_a)
    if b_ok:
        logger.info("Trial %s: pass A failed, scoring on pass B alone", trial.nct_id)
        return _score_single_pass(pass_b)
    # both failed. re-raise so _match_one logs it and drops the trial.
    raise pass_a if isinstance(pass_a, Exception) else pass_b


# ---------------------------------------------------------------------------
# Bulk match orchestration
# ---------------------------------------------------------------------------

async def _match_one(
    patient: PatientProfile,
    trial: TrialResult,
    semaphore: asyncio.Semaphore,
    call_counter: list[int] | None = None,
) -> tuple[TrialResult, MatchOutput] | None:
    """Match one trial. Returns None on any error so the rest of the batch survives."""
    async with semaphore:
        try:
            result = await match_patient_to_trial(patient, trial, call_counter)
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
    Match the patient against every trial with bounded concurrency.
    Returns (top_n results sorted by score, LLM calls actually made).
    Trials already in cached_by_nct are not re-scored.
    """
    cached_by_nct = cached_by_nct or {}
    cached_hits = [
        cached_by_nct[t.nct_id]
        for t in trials
        if t.nct_id in cached_by_nct
    ]
    to_score = [t for t in trials if t.nct_id not in cached_by_nct]

    # counts requests sent, not trials scored. len(to_score) undercounts by at
    # least half (two passes each) and ignores retries entirely, which is how a
    # run reporting 3 calls actually spent 11.
    call_counter = [0]
    if to_score:
        semaphore = asyncio.Semaphore(MATCH_CONCURRENCY)
        tasks = [_match_one(patient, trial, semaphore, call_counter) for trial in to_score]
        raw_results = await asyncio.gather(*tasks)
        fresh = [r for r in raw_results if r is not None]
    else:
        fresh = []
    llm_calls = call_counter[0]

    valid = cached_hits + fresh
    valid.sort(key=lambda x: x[1].overall_score, reverse=True)
    return valid[:top_n], llm_calls
