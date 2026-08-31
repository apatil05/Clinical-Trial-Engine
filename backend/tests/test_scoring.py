"""
test_scoring.py — the parts that decide a patient's score.

No network. Every LLM call is stubbed, so this runs free and offline.
Run from backend/:  ./.venv/bin/python -m pytest tests/ -q
"""

import asyncio
import os
import sys

import pytest

import matcher  # noqa: E402
from models import CriterionVerdict, MatchOutput  # noqa: E402


def cv(cid, ctype, verdict, contested=False, text="t"):
    return CriterionVerdict(criterion_id=cid, criterion_text=text, type=ctype,
                            verdict=verdict, reason="r", contested=contested)


def out(breakdown, score=0, summary="s"):
    return MatchOutput(overall_score=score, status="UNCERTAIN",
                       summary=summary, criteria_breakdown=breakdown)


# --------------------------------------------------------------------------
# the published penalty table. these numbers are in the README, so if one
# changes here it has to change there.
# --------------------------------------------------------------------------

@pytest.mark.parametrize("ctype,verdict,expected", [
    ("exclusion", "INELIGIBLE", 65),
    ("inclusion", "INELIGIBLE", 80),
    ("inclusion", "UNCERTAIN",  92),
    ("exclusion", "UNCERTAIN",  97),
    ("inclusion", "ELIGIBLE",  100),
    ("exclusion", "ELIGIBLE",  100),
])
def test_penalty_table(ctype, verdict, expected):
    assert matcher.compute_score_from_breakdown([cv("c1", ctype, verdict)])[0] == expected


def test_contested_costs_two_more():
    assert matcher.compute_score_from_breakdown([cv("i1", "inclusion", "UNCERTAIN", True)])[0] == 90


def test_verdict_casing_still_deducts():
    """The bug this guards: comparing case-sensitively skipped the deduction
    silently and the score read 100 next to UNCERTAIN badges."""
    assert matcher.compute_score_from_breakdown([cv("e1", "Exclusion", "ineligible")])[0] == 65
    assert matcher.compute_score_from_breakdown([cv("i1", "  inclusion  ", " uncertain ")])[0] == 92


def test_score_clamps_to_zero():
    assert matcher.compute_score_from_breakdown(
        [cv(f"e{i}", "exclusion", "INELIGIBLE") for i in range(5)])[0] == 0


def test_empty_breakdown_scores_100():
    assert matcher.compute_score_from_breakdown([]) == (100, "LIKELY_ELIGIBLE")


@pytest.mark.parametrize("breakdown,status", [
    ([cv("e1", "exclusion", "INELIGIBLE")],                      "LIKELY_INELIGIBLE"),
    ([cv("i1", "inclusion", "ELIGIBLE")],                        "LIKELY_ELIGIBLE"),
    ([cv(f"i{i}", "inclusion", "UNCERTAIN") for i in range(4)],  "UNCERTAIN"),
])
def test_status_thresholds(breakdown, status):
    assert matcher.compute_score_from_breakdown(breakdown)[1] == status


def test_any_ineligible_exclusion_forces_ineligible_status():
    """Even with an otherwise perfect card, one triggered exclusion disqualifies."""
    bd = [cv(f"i{i}", "inclusion", "ELIGIBLE") for i in range(10)] + [cv("e1", "exclusion", "INELIGIBLE")]
    score, status = matcher.compute_score_from_breakdown(bd)
    assert score == 65 and status == "LIKELY_INELIGIBLE"


# --------------------------------------------------------------------------
# B2 — the single-pass fallback used to return the model's own arithmetic
# --------------------------------------------------------------------------

def test_single_pass_is_rescored_not_trusted():
    bad = out([cv("e1", "exclusion", "INELIGIBLE"), cv("i1", "inclusion", "INELIGIBLE"),
               cv("i2", "inclusion", "UNCERTAIN"), cv("i3", "inclusion", "UNCERTAIN")],
              score=45, summary="You scored 45 out of 100.")
    got = matcher._score_single_pass(bad)
    assert got.overall_score == 29            # 100 -35 -20 -8 -8
    assert got.status == "LIKELY_INELIGIBLE"
    assert got.summary == bad.summary          # summary is passed through untouched


def test_fallback_path_rescores_when_one_pass_dies():
    async def run():
        real = matcher._single_match_pass
        async def stub(patient, trial, temperature, call_counter=None):
            if call_counter is not None:
                call_counter[0] += 1
            if temperature == 0.5:
                raise RuntimeError("Expecting value: line 1 column 1 (char 0)")
            return out([cv("e1", "exclusion", "INELIGIBLE")], score=99)
        matcher._single_match_pass = stub
        try:
            counter = [0]
            got = await matcher.match_patient_to_trial(None, type("T", (), {"nct_id": "N1"})(), counter)
            return got, counter[0]
        finally:
            matcher._single_match_pass = real
    got, calls = asyncio.run(run())
    assert got.overall_score == 65   # not the 99 the model claimed
    assert calls == 2


# --------------------------------------------------------------------------
# C1 / C4 — reconciliation
# --------------------------------------------------------------------------

def test_agreement_is_kept_uncontested():
    a = out([cv("inc_1", "inclusion", "ELIGIBLE")])
    b = out([cv("inc_1", "inclusion", "ELIGIBLE")])
    rec = matcher._reconcile_passes(a, b)
    assert len(rec.criteria_breakdown) == 1
    assert rec.criteria_breakdown[0].contested is False
    assert rec.overall_score == 100


def test_disagreement_becomes_contested_uncertain():
    a = out([cv("inc_1", "inclusion", "ELIGIBLE")])
    b = out([cv("inc_1", "inclusion", "INELIGIBLE")])
    rec = matcher._reconcile_passes(a, b)
    c = rec.criteria_breakdown[0]
    assert c.verdict == "UNCERTAIN" and c.contested is True
    assert rec.overall_score == 90            # 100 -8 uncertain -2 contested


def test_criterion_only_pass_b_found_is_not_dropped():
    """C4. Iterating pass A alone scored as if the trial never asked for it."""
    a = out([cv("inc_1", "inclusion", "ELIGIBLE")])
    b = out([cv("inc_1", "inclusion", "ELIGIBLE"), cv("exc_1", "exclusion", "INELIGIBLE")])
    rec = matcher._reconcile_passes(a, b)
    ids = [c.criterion_id for c in rec.criteria_breakdown]
    assert ids == ["inc_1", "exc_1"]
    assert rec.overall_score == 65
    assert rec.status == "LIKELY_INELIGIBLE"


def test_criterion_only_pass_a_found_is_kept():
    a = out([cv("inc_1", "inclusion", "ELIGIBLE"), cv("inc_2", "inclusion", "UNCERTAIN")])
    b = out([cv("inc_1", "inclusion", "ELIGIBLE")])
    rec = matcher._reconcile_passes(a, b)
    assert [c.criterion_id for c in rec.criteria_breakdown] == ["inc_1", "inc_2"]
    assert rec.overall_score == 92


def test_one_sided_criteria_are_not_marked_contested():
    """They did not disagree, one pass just never enumerated it."""
    a = out([cv("inc_1", "inclusion", "ELIGIBLE")])
    b = out([cv("exc_1", "exclusion", "ELIGIBLE")])
    rec = matcher._reconcile_passes(a, b)
    assert all(c.contested is False for c in rec.criteria_breakdown)


def test_reconciled_summary_comes_from_pass_a():
    a = out([cv("inc_1", "inclusion", "ELIGIBLE")], summary="A summary")
    b = out([cv("inc_1", "inclusion", "ELIGIBLE")], summary="B summary")
    assert matcher._reconcile_passes(a, b).summary == "A summary"


# --------------------------------------------------------------------------
# C5 — llm_calls counts requests, not trials
# --------------------------------------------------------------------------

def test_llm_calls_counts_requests_including_retries():
    async def run():
        real = matcher._single_match_pass
        async def stub(patient, trial, temperature, call_counter=None):
            if call_counter is not None:
                call_counter[0] += 1
            return out([cv("inc_1", "inclusion", "ELIGIBLE")])
        matcher._single_match_pass = stub
        try:
            trials = [type("T", (), {"nct_id": f"N{i}"})() for i in range(3)]
            return await matcher.bulk_match(None, trials, top_n=3)
        finally:
            matcher._single_match_pass = real
    results, calls = asyncio.run(run())
    assert calls == 6          # 3 trials x 2 passes, not 3
    assert len(results) == 3


def test_bulk_match_skips_cached_and_still_ranks():
    async def run():
        real = matcher._single_match_pass
        async def stub(patient, trial, temperature, call_counter=None):
            if call_counter is not None:
                call_counter[0] += 1
            return out([cv("inc_1", "inclusion", "ELIGIBLE")])
        matcher._single_match_pass = stub
        try:
            trials = [type("T", (), {"nct_id": f"N{i}"})() for i in range(3)]
            cached = {"N0": (trials[0], out([cv("e1", "exclusion", "INELIGIBLE")], score=65))}
            return await matcher.bulk_match(None, trials, top_n=5, cached_by_nct=cached)
        finally:
            matcher._single_match_pass = real
    results, calls = asyncio.run(run())
    assert calls == 4                                   # only the 2 uncached trials
    assert [r[1].overall_score for r in results] == sorted(
        [r[1].overall_score for r in results], reverse=True)


def test_a_dead_trial_does_not_kill_the_batch():
    async def run():
        real = matcher._single_match_pass
        async def stub(patient, trial, temperature, call_counter=None):
            if call_counter is not None:
                call_counter[0] += 1
            if trial.nct_id == "N1":
                raise RuntimeError("both passes down")
            return out([cv("inc_1", "inclusion", "ELIGIBLE")])
        matcher._single_match_pass = stub
        try:
            trials = [type("T", (), {"nct_id": f"N{i}"})() for i in range(3)]
            return await matcher.bulk_match(None, trials, top_n=5)
        finally:
            matcher._single_match_pass = real
    results, _ = asyncio.run(run())
    assert {r[0].nct_id for r in results} == {"N0", "N2"}


def test_duplicate_ids_from_one_pass_are_not_double_counted():
    """A pass occasionally repeats an id. Charging its penalty twice would make
    the score depend on the model's bookkeeping rather than the criteria."""
    a = out([cv("inc_1", "inclusion", "UNCERTAIN"), cv("inc_1", "inclusion", "UNCERTAIN")])
    b = out([cv("inc_1", "inclusion", "UNCERTAIN")])
    rec = matcher._reconcile_passes(a, b)
    assert len(rec.criteria_breakdown) == 1
    assert rec.overall_score == 92          # one -8, not two


def test_union_preserves_pass_a_ordering():
    a = out([cv("inc_1", "inclusion", "ELIGIBLE"), cv("exc_1", "exclusion", "ELIGIBLE")])
    b = out([cv("exc_2", "exclusion", "ELIGIBLE"), cv("inc_1", "inclusion", "ELIGIBLE")])
    rec = matcher._reconcile_passes(a, b)
    assert [c.criterion_id for c in rec.criteria_breakdown] == ["inc_1", "exc_1", "exc_2"]
