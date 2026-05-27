# Clinical Trial Eligibility Engine

An AI-powered pipeline that automatically matches patients to clinical trials — turning a process that takes days into one that takes seconds.

---

## The Problem

Getting a patient into a clinical trial today is almost entirely manual. A coordinator reads through pages of medical records, then reads through pages of trial requirements, and tries to match them by hand. This takes days to weeks per patient, and most eligible patients are never identified at all.

This engine automates that process. It reads both inputs, extracts the key facts, and determines whether a patient qualifies — with a plain-English explanation a human can verify in seconds.

---

## Project Structure

```
/backend
  main.py              # FastAPI app
  extractor.py         # Prompt logic for parsing records + trials
  matcher.py           # Prompt logic for eligibility comparison
  trials_fetcher.py    # Pulls live data from ClinicalTrials.gov API
  models.py            # Pydantic schemas (Patient, Trial, MatchResult)

/frontend
  index.html
  app.js
  style.css
```

---

## Tech Stack

- **Backend:** Python + FastAPI
- **AI:** Nebius API (OpenAI-compatible) running Llama 3.1 70B
- **Data:** ClinicalTrials.gov public API
- **Frontend:** HTML / CSS / JS

---

## Setup

### 1. Install dependencies

```bash
pip install fastapi uvicorn openai httpx
```

### 2. Configure Nebius

Nebius uses an OpenAI-compatible endpoint. Set your API key as an environment variable:

```bash
export NEBIUS_API_KEY=your-nebius-key
```

Then initialise the client in your backend:

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["NEBIUS_API_KEY"],
    base_url="https://api.studio.nebius.ai/v1/"
)

response = client.chat.completions.create(
    model="meta-llama/Meta-Llama-3.1-70B-Instruct",
    messages=[{"role": "user", "content": prompt}],
    temperature=0.1  # low temp for consistent structured output
)
```

> Check your Nebius dashboard to confirm the exact model name strings available on your account.

### 3. Run the server

```bash
uvicorn backend.main:app --reload
```

---

## How It Works

The pipeline has two AI steps and one data step.

**Step 1 — Extraction**

Raw text in, structured JSON out. The extractor reads a patient record and returns a clean object with age, diagnoses, medications, lab results, and medical history. The same step runs on the trial's eligibility criteria.

**Step 2 — Matching**

Both JSON objects are sent to the matcher, which evaluates each criterion one by one and returns a verdict per criterion, an overall score, and a plain-English summary.

**Step 3 — Queue**

Results are filed into a coordinator queue ranked by match strength, so the to-do list builds itself.

---

## The Two Core Prompts

### Extraction prompt

```
You are a medical data extractor. Given the following patient record,
extract and return ONLY a JSON object with these fields:
age, diagnoses (list), medications (list), lab_results (dict),
medical_history (list). Return nothing else — no explanation, no markdown.
```

### Matching prompt

```
You are a clinical trial eligibility analyst. Given a patient profile
and a trial's inclusion/exclusion criteria, evaluate each criterion
one by one. Return ONLY a JSON object with:
- overall_score (int, criteria met out of total)
- status ("ELIGIBLE" | "INELIGIBLE" | "UNCERTAIN")
- criteria (list of {criterion, status, reason})
- summary (2-sentence plain English explanation)
Return nothing else.
```

> Low temperature + explicit JSON-only instruction is what keeps output reliable. Test this in hour one before building anything else.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/match` | Screen a patient against a trial |
| `GET` | `/trials/search` | Search ClinicalTrials.gov by condition or keyword |
| `GET` | `/queue` | Return all screenings ranked by match score |

---

## Work Split

### Person A — Backend + AI pipeline
- FastAPI server setup
- Extraction prompt (patient record → structured JSON)
- Matching prompt (patient JSON vs trial JSON → verdict per criterion)
- `/match` endpoint and `/trials/search` endpoint wrapping ClinicalTrials.gov

### Person B — Frontend + Data
- Input UI (paste patient record, search/select a trial)
- Results UI (score, per-criterion breakdown, plain-English explanation)
- Queue view (all screened patients ranked by match strength)
- Pull and format sample data from ClinicalTrials.gov for the demo

---

## Build Order

| Hours | Milestone |
|-------|-----------|
| 1–3 | FastAPI skeleton + Nebius connection working + extraction prompt returning valid JSON |
| 3–7 | Matching prompt tuned + `/match` endpoint live + basic frontend connected end to end |
| 7–12 | ClinicalTrials.gov integration + queue view + one patient screened against multiple trials |
| 12–18 | Polish, error handling, 3 canned demo cases loaded |
| 18–24 | Demo prep, edge case fixes, presentation flow |

---

## Demo Flow

Walk through this sequence for judges:

1. Load a pre-filled patient record in the UI
2. Search ClinicalTrials.gov live — real trials appear
3. Hit **Screen** — the queue populates in seconds
4. Click a result — show the criterion-by-criterion breakdown with pass/fail per item

The criterion breakdown is the most important moment. It shows the AI's reasoning is auditable — which is the central trust problem in medical AI, and what separates this from a chatbot.

---

## Notes

- Use `temperature=0.1` on all matching calls to minimise hallucination and keep JSON output stable
- If a patient record doesn't mention a required field, mark it as `UNCERTAIN` rather than `INELIGIBLE` — missing data is not the same as a failed criterion
- Have at least three sample records ready for the demo: one strong match, one partial match, one rejection
