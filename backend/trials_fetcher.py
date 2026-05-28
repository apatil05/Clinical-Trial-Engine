"""
trials_fetcher.py — ClinicalTrials.gov v2 API integration.
Fetches up to max_results recruiting trials for a given condition.
"""

import re
import httpx
from models import TrialResult

CTGOV_BASE = "https://clinicaltrials.gov/api/v2/studies"

# Words to ignore when extracting disease keywords from the user's condition string.
# These are common medical qualifiers, not the condition itself.
_CONDITION_STOPWORDS = {
    "disease", "disorder", "syndrome", "type", "stage", "grade",
    "primary", "secondary", "acute", "chronic", "early", "late",
    "the", "and", "or", "of", "with", "in",
}


def _condition_keywords(condition: str) -> list[str]:
    """
    Extract meaningful disease keywords from a user-entered condition string.
    "Gaucher disease type 1" -> ["gaucher"]
    "Parkinson disease" -> ["parkinson"]
    "Diffuse large B-cell lymphoma" -> ["diffuse", "large", "b-cell", "lymphoma"]
    """
    tokens = re.findall(r"[a-zA-Z][a-zA-Z\-]+", condition.lower())
    return [t for t in tokens if len(t) >= 3 and t not in _CONDITION_STOPWORDS]


def _trial_matches_condition(title: str, conditions: list[str], keywords: list[str]) -> bool:
    """
    Post-filter for clinicaltrials.gov's fuzzy full-text search.
    Requires at least one disease keyword to appear in the trial's title or condition list.
    Prevents e.g. GBA1-Parkinson's trials from leaking into Gaucher searches.
    """
    if not keywords:
        return True
    haystack = f"{title} {' '.join(conditions)}".lower()
    return any(kw in haystack for kw in keywords)


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


def _extract_contact(study: dict) -> tuple[str | None, str | None, str | None]:
    """Return (name, email, phone) from central contacts or overall officials."""
    try:
        contacts_module = (
            study["protocolSection"]
            .get("contactsLocationsModule", {})
        )
        # Prefer central contact (has email/phone)
        central = contacts_module.get("centralContacts", [])
        if central:
            c = central[0]
            return c.get("name"), c.get("email"), c.get("phone")
        # Fall back to overall official (name + affiliation only)
        officials = contacts_module.get("overallOfficials", [])
        if officials:
            o = officials[0]
            name = o.get("name")
            affiliation = o.get("affiliation")
            if affiliation:
                name = f"{name} ({affiliation})"
            return name, None, None
    except (KeyError, TypeError):
        pass
    return None, None, None


async def search_trials(condition: str, max_results: int = 20) -> list[TrialResult]:
    """
    Search ClinicalTrials.gov for recruiting trials matching the condition.
    Returns a list of TrialResult objects with eligibility criteria and contact info.
    """
    params = {
        "query.cond": condition,
        "filter.overallStatus": "RECRUITING",
        "pageSize": max_results,
        "format": "json",
        "fields": (
            "NCTId,BriefTitle,Condition,Phase,"
            "OverallStatus,EligibilityCriteria,"
            "CentralContact,OverallOfficial"
        ),
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(CTGOV_BASE, params=params)
        response.raise_for_status()
        data = response.json()

    studies = data.get("studies", [])
    results: list[TrialResult] = []
    keywords = _condition_keywords(condition)

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
            contact_name, contact_email, contact_phone = _extract_contact(study)

            if not nct_id or not raw_criteria:
                continue

            # Reject trials where the disease keyword doesn't appear in title/conditions.
            # CTGov full-text search is fuzzy — it pulls in shared-gene trials (e.g. GBA1
            # Parkinson's studies under "Gaucher disease") that we want to filter out.
            if not _trial_matches_condition(title, conditions, keywords):
                continue

            results.append(
                TrialResult(
                    nct_id=nct_id,
                    title=title,
                    condition=condition_str,
                    phase=phase,
                    status=overall_status,
                    raw_criteria=raw_criteria,
                    contact_name=contact_name,
                    contact_email=contact_email,
                    contact_phone=contact_phone,
                )
            )
        except (KeyError, TypeError):
            continue

    return results
