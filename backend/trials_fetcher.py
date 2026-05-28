"""
trials_fetcher.py — ClinicalTrials.gov v2 API integration.
Fetches up to max_results recruiting trials for a given condition.
"""

import httpx
from models import TrialResult

CTGOV_BASE = "https://clinicaltrials.gov/api/v2/studies"


def _extract_criteria_text(study: dict) -> str:
    """Pull raw eligibility criteria text out of a v2 study object."""
    try:
        return (
            study["protocolSection"]
            ["eligibilityModule"]
            ["eligibilityCriteria"]
        )
    except (KeyError, TypeError):
        return ""


def _extract_phase(study: dict) -> str | None:
    try:
        phases = (
            study["protocolSection"]
            ["designModule"]
            .get("phases", [])
        )
        return ", ".join(phases) if phases else None
    except (KeyError, TypeError):
        return None


async def search_trials(condition: str, max_results: int = 20) -> list[TrialResult]:
    """
    Search ClinicalTrials.gov for recruiting trials matching the condition.
    Returns a list of TrialResult objects (nct_id, title, condition,
    phase, status, raw_criteria).
    """
    params = {
        "query.cond": condition,
        "filter.overallStatus": "RECRUITING",
        "pageSize": max_results,
        "format": "json",
        "fields": (
            "NCTId,BriefTitle,Condition,Phase,"
            "OverallStatus,EligibilityCriteria"
        ),
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(CTGOV_BASE, params=params)
        response.raise_for_status()
        data = response.json()

    studies = data.get("studies", [])
    results: list[TrialResult] = []

    for study in studies:
        try:
            proto = study["protocolSection"]
            id_module = proto["identificationModule"]
            status_module = proto["statusModule"]

            nct_id = id_module.get("nctId", "")
            title = id_module.get("briefTitle", "")
            conditions = proto.get("conditionsModule", {}).get("conditions", [])
            condition_str = conditions[0] if conditions else condition
            overall_status = status_module.get("overallStatus", "")
            phase = _extract_phase(study)
            raw_criteria = _extract_criteria_text(study)

            if not nct_id or not raw_criteria:
                continue

            results.append(
                TrialResult(
                    nct_id=nct_id,
                    title=title,
                    condition=condition_str,
                    phase=phase,
                    status=overall_status,
                    raw_criteria=raw_criteria,
                )
            )
        except (KeyError, TypeError):
            continue

    return results
