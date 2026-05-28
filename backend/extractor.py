"""
extractor.py — LLM extraction logic.

Two functions:
  1. extract_patient_profile(raw_text) → PatientProfile
  2. parse_trial_criteria(raw_criteria_text) → ParsedCriteria

Both call the Nebius-hosted Llama 3.1 70B model.
Temperature is always 0.1. All prompts return JSON only.
"""

import os
import re
import json
import logging
from openai import AsyncOpenAI
from dotenv import load_dotenv
from models import PatientProfile, ParsedCriteria, ParsedCriterion

load_dotenv()

logger = logging.getLogger(__name__)


def _parse_llm_json(raw: str) -> dict:
    """Extract and parse JSON from an LLM response that may include markdown fences or prose."""
    text = raw.strip()
    # Strip ```json ... ``` or ``` ... ``` fences
    fence_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if fence_match:
        text = fence_match.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Last resort: find the first {...} block in the response
        brace_match = re.search(r'\{[\s\S]*\}', text)
        if brace_match:
            return json.loads(brace_match.group(0))
        raise


client = AsyncOpenAI(
    api_key=os.environ["NEBIUS_API_KEY"],
    base_url="https://api.studio.nebius.ai/v1/",
)

MODEL_DEFAULT = os.getenv("NEBIUS_MODEL", "meta-llama/Llama-3.3-70B-Instruct")
MODEL_EXTRACT = os.getenv("NEBIUS_MODEL_EXTRACT", MODEL_DEFAULT)
MODEL_PARSE = os.getenv("NEBIUS_MODEL_PARSE", MODEL_DEFAULT)


# ---------------------------------------------------------------------------
# Patient profile extraction
# ---------------------------------------------------------------------------

PATIENT_EXTRACTION_PROMPT = """You are a clinical data extraction assistant. Extract structured information from the patient health notes below.

Return ONLY valid JSON matching this exact schema. No markdown, no explanation, no extra text.

Schema:
{
  "primary_condition": string or null,
  "condition_confidence": "high" | "low" | "not_found",
  "age": integer or null,
  "sex": string or null,
  "diagnosis": [string],
  "comorbidities": [string],
  "current_medications": [string],
  "prior_treatments": [string],
  "lab_values": {
    "<lab_name_snake_case>": number
  },
  "prior_gene_therapy": boolean or null,
  "ecog_performance_status": integer or null,
  "notes": string or null
}

Rules:
- Use null for any field not mentioned in the notes. Never omit a field.
- condition_confidence: "high" if the primary condition is explicitly stated, "low" if inferred, "not_found" if absent.
- lab_values keys must be snake_case with units in the key name (e.g. "hemoglobin_g_dl", "platelet_count_per_ul").
- diagnosis should list all confirmed diagnoses, not just the primary condition.
- notes: capture any clinically relevant detail that doesn't fit another field.

Patient health notes:
{patient_text}"""


async def extract_patient_profile(raw_text: str) -> PatientProfile:
    """Extract a structured patient profile from free-text health notes."""
    prompt = PATIENT_EXTRACTION_PROMPT.replace("{patient_text}", raw_text)

    response = await client.chat.completions.create(
        model=MODEL_EXTRACT,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )

    raw_json = response.choices[0].message.content.strip()

    try:
        data = _parse_llm_json(raw_json)
    except (json.JSONDecodeError, ValueError) as e:
        logger.error("Patient extraction JSON parse error: %s\nRaw: %s", e, raw_json)
        raise ValueError(f"LLM returned invalid JSON for patient extraction: {e}")

    return PatientProfile(**data)


# ---------------------------------------------------------------------------
# Trial criteria parsing
# ---------------------------------------------------------------------------

CRITERIA_PARSING_PROMPT = """You are a clinical trial eligibility criteria parser. Parse the raw eligibility criteria text below into structured JSON.

Return ONLY valid JSON matching this exact schema. No markdown, no explanation, no extra text.

Schema:
{
  "inclusion": [
    {"id": "inc_1", "text": string, "type": "inclusion"},
    ...
  ],
  "exclusion": [
    {"id": "exc_1", "text": string, "type": "exclusion"},
    ...
  ]
}

Rules:
- Each criterion must be a single, atomic requirement (one condition per object).
- Use sequential IDs: inc_1, inc_2, ... for inclusion; exc_1, exc_2, ... for exclusion.
- Keep criterion text concise but complete — do not paraphrase clinical values.
- If no inclusion or exclusion criteria are found, return an empty array for that key.

Raw eligibility criteria:
{raw_criteria}"""


async def parse_trial_criteria(raw_criteria: str) -> ParsedCriteria:
    """Parse raw trial eligibility criteria text into structured inclusion/exclusion lists."""
    prompt = CRITERIA_PARSING_PROMPT.replace("{raw_criteria}", raw_criteria)

    response = await client.chat.completions.create(
        model=MODEL_PARSE,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )

    raw_json = response.choices[0].message.content.strip()

    try:
        data = _parse_llm_json(raw_json)
    except (json.JSONDecodeError, ValueError) as e:
        logger.error("Criteria parsing JSON parse error: %s\nRaw: %s", e, raw_json)
        raise ValueError(f"LLM returned invalid JSON for criteria parsing: {e}")

    inclusion = [ParsedCriterion(**c) for c in data.get("inclusion", [])]
    exclusion = [ParsedCriterion(**c) for c in data.get("exclusion", [])]
    return ParsedCriteria(inclusion=inclusion, exclusion=exclusion)


# ---------------------------------------------------------------------------
# Synthetic patient generation
# ---------------------------------------------------------------------------

import random

SAMPLE_CONDITIONS = [
    "Fabry disease", "Pompe disease", "Niemann-Pick disease type C",
    "amyotrophic lateral sclerosis", "multiple sclerosis (relapsing-remitting)",
    "chronic lymphocytic leukemia", "diffuse large B-cell lymphoma",
    "Crohn's disease", "systemic lupus erythematosus",
    "pulmonary arterial hypertension", "idiopathic pulmonary fibrosis",
    "myasthenia gravis", "Huntington disease",
]

SAMPLE_GENERATION_PROMPT = """You are a clinical documentation assistant. Generate a realistic, de-identified patient health summary for a patient with {condition}.

Write it in the style of a physician's referral note or discharge summary — plain prose with structured sections. Use realistic but fictional demographics, lab values, medications, and clinical details.

Format it exactly like this template (fill in realistic values):

PATIENT HEALTH SUMMARY

Patient: [First name + last initial]  |  Date of Birth: [Month DD, YYYY]  |  [Male/Female]  |  [City, State]

PRESENTING COMPLAINT
[2-3 sentences describing why they are presenting now and their interest in clinical trials]

CONFIRMED DIAGNOSES
[Bulleted list of diagnoses with dates and supporting evidence where appropriate]

CURRENT MEDICATIONS
[Bulleted list with doses and frequency]

RECENT LABORATORY RESULTS ([Month YYYY])
[Bulleted list of 5-8 relevant lab values with reference ranges where useful]

DISEASE-SPECIFIC / FUNCTIONAL STATUS
[3-5 lines with relevant functional scores, staging, imaging findings, or biomarkers for this condition]

TREATMENT HISTORY
[2-4 bullet points covering prior treatments and any notable history]

CLINICAL NOTES
[2-3 sentences covering ECOG status, allergies, lifestyle factors, willingness to travel for study]

Return ONLY the patient health summary text. No preamble, no explanation."""


async def generate_sample_patient() -> str:
    """Generate a synthetic patient health summary for a random condition."""
    condition = random.choice(SAMPLE_CONDITIONS)
    prompt = SAMPLE_GENERATION_PROMPT.replace("{condition}", condition)

    response = await client.chat.completions.create(
        model=MODEL_EXTRACT,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.9,
    )

    return response.choices[0].message.content.strip()
