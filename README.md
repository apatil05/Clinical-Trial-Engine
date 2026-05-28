# Clinical Trial Eligibility Engine

An AI-powered tool that matches patients to clinical trials in seconds — automating a process that today takes coordinators days to weeks by hand.

Built at the **AIxBio Hackathon at Bayer Co.Lab**, Cambridge MA · Boston Tech Week 2026

---

## The Problem

Finding the right clinical trial for a patient is one of the most time-consuming jobs in medical research. A coordinator reads through a patient's entire medical history, then reads through the eligibility requirements of dozens of trials, and matches them manually — line by line. Most eligible patients are never found. Not because the trials don't exist, but because the process doesn't scale.

This tool changes that. Paste a patient record, search for trials by condition, and hit **Screen**. Within seconds you get a ranked list of matching trials — with a plain-English explanation of exactly which criteria were met, which were not, and which couldn't be determined from the available information.

Every decision the AI makes is shown, explained, and reviewable by a human before any action is taken.

---

## Why It Matters

- **80% of clinical trial timeline overruns** are caused by recruitment delays
- The average time to manually screen a single patient is measured in days
- Eligible patients are routinely missed because they aren't connected to the right research network
- This tool makes eligibility screening fast enough to run on every patient, not just the ones a coordinator happens to think of

---

## How It Works

**Step 1 — Extraction**

The tool reads a patient's medical record in plain text and extracts the clinically relevant facts: age, diagnoses, current medications, lab results, and medical history. The same step runs on the trial's inclusion and exclusion criteria, pulled live from ClinicalTrials.gov.

**Step 2 — Matching**

Both sets of structured facts are compared criterion by criterion. Each criterion gets a verdict — met, not met, or uncertain — with a plain-English reason. The result is an overall eligibility score and a two-sentence summary a coordinator can read in under ten seconds.

**Step 3 — Queue**

Matched patients are filed into a ranked queue by match strength. The coordinator's to-do list builds itself.

---

## Demo

| Step | What Happens |
|---|---|
| Load patient | A pre-filled synthetic patient record appears in the input panel |
| Search trials | Live search against ClinicalTrials.gov returns real active trials |
| Screen | AI runs extraction and matching — queue populates in seconds |
| Review | Click any result to see the full criterion-by-criterion breakdown |

The criterion breakdown is the most important moment. It shows that the AI's reasoning is fully auditable — which is the central trust problem in medical AI, and what separates this from a chatbot.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Styling | Tailwind CSS |
| Backend | Python + FastAPI |
| AI | Nebius API — Llama 3.3 70B Instruct |
| Database | Supabase (PostgreSQL) |
| Trial Data | ClinicalTrials.gov public API |

---

## Project Structure

```
/
├── backend/
│   ├── main.py              # FastAPI app, CORS config, route registration
│   ├── extractor.py         # Extraction prompt — raw text → structured JSON
│   ├── matcher.py           # Matching prompt — patient JSON vs trial JSON → verdict
│   ├── trials_fetcher.py    # ClinicalTrials.gov API integration
│   ├── models.py            # Pydantic schemas (Patient, Trial, MatchResult)
│   └── db.py                # Supabase client initialization
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── PatientInput.jsx    # Paste or load a patient record
│   │   │   ├── TrialSearch.jsx     # Search trials by condition
│   │   │   ├── MatchResult.jsx     # Per-criterion breakdown + summary
│   │   │   └── Queue.jsx           # All screened patients ranked by score
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── api.js                  # All fetch calls to the FastAPI backend
│   ├── index.html
│   └── vite.config.js
│
├── .env.example
└── README.md
```

---

## Database

Three tables. Results persist across sessions and are always ranked by match score.

```sql
patients (
  id                  uuid primary key default gen_random_uuid(),
  raw_text            text,
  extracted_profile   jsonb,
  created_at          timestamptz default now()
)

trials (
  id                  uuid primary key default gen_random_uuid(),
  nct_id              text unique,
  title               text,
  condition           text,
  raw_criteria        text,
  parsed_criteria     jsonb,
  created_at          timestamptz default now()
)

match_results (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid references patients(id),
  trial_id            uuid references trials(id),
  overall_score       int,
  status              text,
  criteria_breakdown  jsonb,
  summary             text,
  created_at          timestamptz default now()
)
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/match` | Run the full pipeline — extract, match, save to Supabase, return result |
| `GET` | `/trials/search` | Search ClinicalTrials.gov by condition or keyword |
| `GET` | `/queue` | Return all match results from Supabase ranked by score |
| `GET` | `/queue/{id}` | Return a single result with full criterion breakdown |

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Supabase](https://supabase.com) project with the schema above applied
- A [Nebius](https://nebius.ai) account with API access

### 1. Clone the repo

```bash
git clone https://github.com/your-handle/clinical-trial-eligibility-engine
cd clinical-trial-eligibility-engine
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
NEBIUS_API_KEY=your-nebius-key
NEBIUS_MODEL=meta-llama/Llama-3.3-70B-Instruct
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
MAX_TRIALS=12
MATCH_CONCURRENCY=8
```

### 2b. Apply Supabase schema (required for persistence)

In Supabase Dashboard → **SQL Editor**, paste and run:

`supabase/schema.sql`

This creates `patients`, `trials`, and `match_results` with permissive demo RLS policies so the anon key can read/write.

Verify with:

```bash
curl http://127.0.0.1:8000/health
```

You should see `"database": { "ready": true, ... }`.

### 3. Install and run the backend

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Backend runs at `http://localhost:8000`
Interactive API docs at `http://localhost:8000/docs`

If port `8000` is in use from a stale dev process:

```bash
lsof -tiTCP:8000 -sTCP:LISTEN | xargs kill
```

### 4. Install and run the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

---

## Nebius Configuration

Nebius uses an OpenAI-compatible endpoint — the client setup is straightforward:

```python
from openai import OpenAI
import os

client = OpenAI(
    api_key=os.environ["NEBIUS_API_KEY"],
    base_url="https://api.studio.nebius.ai/v1/"
)

response = client.chat.completions.create(
    model="meta-llama/Meta-Llama-3.1-70B-Instruct",
    messages=[{"role": "user", "content": prompt}],
    temperature=0.1
)
```

> All matching calls use `temperature=0.1` to keep JSON output stable and minimise hallucination. Verify the exact model name string in your Nebius dashboard before running.

---

## Important Notes

All patient data in this project is **fully synthetic** — no real patient records are used, stored, or referenced anywhere. This tool is a **decision-support system**. Every result is intended to be reviewed and confirmed by a qualified human coordinator before any action is taken.

If a patient record doesn't mention a field required by a trial criterion, that criterion is marked `UNCERTAIN` rather than `INELIGIBLE`. Missing data is not the same as a failed criterion.

---

## Built With

A collaboration of **C10 Labs**, **LabCentral**, **Bayer Co.Lab**, and **Evolved Technology**.
Compute provided by **Nebius**.
Part of [Boston Tech Week 2026](https://www.tech-week.com).
