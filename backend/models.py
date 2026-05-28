"""
models.py — Pydantic schemas for all inputs and outputs.
Every LLM response is validated through these before touching Supabase.
"""

from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


# ---------------------------------------------------------------------------
# Patient extraction
# ---------------------------------------------------------------------------

class PatientProfile(BaseModel):
    """Structured profile extracted from raw patient text by the LLM."""
    primary_condition: Optional[str] = None
    condition_confidence: str = Field(
        default="not_found",
        description="high | low | not_found"
    )
    age: Optional[int] = None
    sex: Optional[str] = None
    diagnosis: list[str] = Field(default_factory=list)
    comorbidities: list[str] = Field(default_factory=list)
    current_medications: list[str] = Field(default_factory=list)
    prior_treatments: list[str] = Field(default_factory=list)
    lab_values: dict = Field(default_factory=dict)
    prior_gene_therapy: Optional[bool] = None
    ecog_performance_status: Optional[int] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Trial criteria parsing
# ---------------------------------------------------------------------------

class ParsedCriterion(BaseModel):
    id: str
    text: str
    type: str = Field(description="inclusion | exclusion")


class ParsedCriteria(BaseModel):
    inclusion: list[ParsedCriterion] = Field(default_factory=list)
    exclusion: list[ParsedCriterion] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Matching output
# ---------------------------------------------------------------------------

class CriterionVerdict(BaseModel):
    criterion_id: str
    criterion_text: str
    type: str = Field(description="inclusion | exclusion")
    verdict: str = Field(description="ELIGIBLE | INELIGIBLE | UNCERTAIN")
    reason: str


class MatchOutput(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    status: str = Field(description="LIKELY_ELIGIBLE | LIKELY_INELIGIBLE | UNCERTAIN")
    summary: str
    criteria_breakdown: list[CriterionVerdict]


# ---------------------------------------------------------------------------
# API request / response shapes
# ---------------------------------------------------------------------------

class ExtractRequest(BaseModel):
    patient_text: str


class MatchRequest(BaseModel):
    patient_text: str = Field(description="Raw patient health notes")
    confirmed_condition: Optional[str] = Field(
        default=None,
        description="Patient-confirmed condition after extraction step"
    )
    max_trials: int = Field(default=20, ge=1, le=30)


class TrialResult(BaseModel):
    """A single trial returned from ClinicalTrials.gov search."""
    nct_id: str
    title: str
    condition: str
    phase: Optional[str] = None
    status: str
    raw_criteria: str


class MatchResultRow(BaseModel):
    """A single row from match_results in Supabase."""
    id: str
    patient_id: str
    trial_id: str
    nct_id: str
    trial_title: str
    overall_score: int
    status: str
    summary: str
    criteria_breakdown: list[CriterionVerdict]


class BulkMatchResponse(BaseModel):
    """Response from POST /match — top N results ranked by score."""
    patient_id: str
    extracted_profile: PatientProfile
    total_screened: int
    results: list[MatchResultRow]
