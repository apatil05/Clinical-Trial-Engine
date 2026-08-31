"""
trials_fetcher.py — ClinicalTrials.gov v2 API integration.

Fetches recruiting trials for a condition, then post-filters them. The filter
is the part that matters. See _trial_matches_condition().
"""

import re
import httpx
from models import TrialResult

CTGOV_BASE = "https://clinicaltrials.gov/api/v2/studies"

# dropped before keyword matching. these words appear in half of all condition
# strings, so keeping them would make every trial match every search.
_CONDITION_STOPWORDS = {
    "disease", "disorder", "syndrome", "type", "stage", "grade",
    "primary", "secondary", "acute", "chronic", "early", "late",
    "the", "and", "or", "of", "with", "in",
}


def _condition_keywords(condition: str) -> list[str]:
    """
    Disease words from whatever the user typed, qualifiers stripped.
    "Gaucher disease type 1"        -> ["gaucher"]
    "Parkinson disease"             -> ["parkinson"]
    "Diffuse large B-cell lymphoma" -> ["diffuse", "large", "b-cell", "lymphoma"]
    """
    tokens = re.findall(r"[a-zA-Z][a-zA-Z\-]+", condition.lower())
    return [t for t in tokens if len(t) >= 3 and t not in _CONDITION_STOPWORDS]


def _trial_matches_condition(title: str, conditions: list[str], keywords: list[str]) -> bool:
    """
    Keep a trial only if a disease keyword shows up in its title or condition list.

    CTGov's search is full-text and fuzzy, so it returns trials that merely
    mention the search term. The case this was written for: search "Gaucher
    disease" and you get back GBA1 Parkinson's trials. GBA1 is the Gaucher
    gene, and carrying one variant raises Parkinson's risk, so those protocols
    name Gaucher all through their text while recruiting Parkinson's patients
    exclusively. A Gaucher patient is not eligible for any of them.

    The keyword has to land in the title or the conditions list, which is
    where a trial states who it is actually for, rather than anywhere in the
    body text.

    No keywords means nothing to filter on, so everything passes through.
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
    """
    (name, email, phone) for the trial. Central contact first, since that is
    the only one that carries an email or a phone number. Plenty of trials
    list neither, hence the Nones.
    """
    try:
        contacts_module = (
            study["protocolSection"]
            .get("contactsLocationsModule", {})
        )
        # central contact is the only one with contactable details
        central = contacts_module.get("centralContacts", [])
        if central:
            c = central[0]
            return c.get("name"), c.get("email"), c.get("phone")
        # otherwise the overall official, who is a name and an institution
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
    Recruiting trials for a condition, already filtered.
    max_results is the page size sent to CTGov, so the list that comes back is
    usually shorter than that once the keyword filter has run.
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

            # drop trials that only mention the condition. see
            # _trial_matches_condition() for the GBA1/Gaucher case this exists for.
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
