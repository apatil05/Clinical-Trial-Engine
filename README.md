# Clinical Trial Eligibility Engine

An AI-powered eligibility screening engine that matches patients to actively recruiting clinical trials in seconds — automating a process that today takes coordinators days to weeks by hand.

Built at the **AIxBio Hackathon · Bayer Co.Lab · Boston Tech Week 2026**

---

## The Problem

Finding the right clinical trial for a patient is one of the most time-consuming jobs in medical research. A coordinator reads through a patient's entire medical history, then reads through the eligibility requirements of dozens of trials, and matches them manually — line by line. Most eligible patients are never found. Not because the trials don't exist, but because the process doesn't scale.

- **80% of clinical trial timeline overruns** are caused by recruitment delays
- The average time to manually screen a single patient is measured in days
- Eligible patients are routinely missed because they aren't connected to the right research network

This engine changes that.

---

## Who It's For

**Patients & Caregivers** — paste your medical notes and get a ranked list of actively recruiting trials matched to your specific profile, with a plain-English breakdown of exactly why each trial is or isn't a fit.

**Trial Coordinators & Researchers** — screen candidate patient records from referring primary care practices quickly and consistently. Identify strong matches, surface borderline cases worth a follow-up call, and stop building eligibility spreadsheets by hand.

---

## How It Works

```
Patient Notes (free text)
        ↓
Extraction Agent  ·  Llama 3.3 70B
        ↓
Structured Patient Profile  (age, diagnoses, medications, labs, history)
        ↓
ClinicalTrials.gov v2 API  ·  live recruiting trials for the confirmed condition
        ↓
Dual Scoring Agents  ·  Nemotron 253B × 2  (parallel, different temperatures)
        ↓
Reconciliation  ·  contested criteria flagged, deterministic penalty scoring applied
        ↓
Ranked Results  ·  full eligibility breakdown, contact info, direct CTGov link
```

**Step 1 — Extraction**
The engine reads a patient's free-text medical record and extracts structured clinical facts: primary condition, age, sex, diagnoses, medications, lab values, treatment history, and functional status. A fast 70B model handles this step — speed matters here, quality matters in the next step.

**Step 2 — Dual-Agent Scoring**
Each trial is scored by two independent LLM passes running in parallel — the same Nemotron 253B model at temperature 0.1 (conservative) and 0.5 (exploratory). Where the agents agree, the verdict stands. Where they disagree, the criterion is flagged **CONTESTED** and downgraded to UNCERTAIN — surfacing exactly the data gaps that need clinical confirmation before enrollment.

**Step 3 — Deterministic Scoring**
Scores are computed by our engine from the verdict breakdown, not left to AI arithmetic. Each criterion type carries a defined penalty:

| Verdict | Criterion Type | Score Impact |
|---|---|---|
| INELIGIBLE | Exclusion | −35 |
| INELIGIBLE | Inclusion | −20 |
| UNCERTAIN | Inclusion | −8 |
| UNCERTAIN | Exclusion | −3 |
| CONTESTED | Either | −2 additional |
| ELIGIBLE | Either | 0 |

A patient with sparse notes cannot score 100 against a trial with unevaluable criteria. Data coverage is displayed alongside the score so the user understands how much of the trial's criteria could actually be assessed.

**Step 4 — Results**
Trials are ranked by eligibility score. Each result shows the overall score, data coverage percentage, match status, and a full criterion-by-criterion breakdown with plain-English reasoning. Trial contact information and a direct ClinicalTrials.gov link are included for every result.

---

## Key Features

- **Dual-agent architecture** — two independent models score each trial in parallel; disagreements are flagged, not hidden
- **Deterministic scoring** — the score is a pure function of the verdict breakdown on every path, including when one of the two passes fails. Cached results are re-scored from their breakdown on load, so changing a penalty weight updates old rows without a cache wipe
- **Data coverage indicator** — shows what percentage of trial criteria could be evaluated from the patient's notes, with a warning when coverage is below 60%
- **Contested criteria flags** — criteria where the two agents disagreed are visually marked in the breakdown
- **Condition keyword filtering** — post-filters ClinicalTrials.gov's fuzzy search results to prevent off-topic trials from appearing (e.g. GBA1-Parkinson's trials leaking into Gaucher disease searches)
- **Smart caching** — patients are deduplicated by content hash; repeat runs for the same patient load cached verdicts instantly, recomputing scores with the current formula on every load
- **Trial contact info** — pulls central contact name, email, and phone from ClinicalTrials.gov; pre-fills a mailto link for reaching the research team
- **AI sample generation** — generates a realistic synthetic patient note for a randomly selected rare condition via LLM, for demo and testing purposes

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 |
| Backend | Python 3.11 + FastAPI |
| Extraction / Parsing | Llama 3.3 70B via Nebius AI Studio |
| Eligibility Scoring | Nvidia Nemotron 253B via Nebius AI Studio |
| Database / Auth | Supabase (PostgreSQL) |
| Trial Data | ClinicalTrials.gov v2 API |

---

## Project Structure

```
/
├── backend/
│   ├── main.py              # FastAPI app, routes, pipeline orchestration
│   ├── extractor.py         # Patient extraction, criteria parsing, sample generation
│   ├── matcher.py           # Dual-pass scoring, reconciliation, deterministic formula
│   ├── trials_fetcher.py    # ClinicalTrials.gov v2 integration, condition filtering
│   ├── persistence.py       # Supabase read/write, patient dedup, cache loading
│   ├── models.py            # Pydantic schemas for all inputs and outputs
│   ├── db.py                # Supabase client
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                          # State machine, routing, confirm step
│   │   ├── api.js                           # All fetch calls to FastAPI
│   │   ├── results.js                       # Shared result helpers: coverage, summary
│   │   └── components/
│   │       ├── PatientInput.jsx             # Notes input, syntax highlighting overlay
│   │       ├── ScreeningLoader.jsx          # Animated terminal during screening
│   │       ├── Queue.jsx                    # Ranked results table with data coverage
│   │       └── MatchResult.jsx              # Full criterion breakdown, contact card
│   ├── index.html                           # CSS design system (custom properties)
│   └── vite.config.js
│
├── supabase/
│   ├── schema.sql                           # Full DB schema — run this first
│   └── migration_add_cache.sql             # Cache column migration
│
├── .env.example
├── AUDIT.md                                 # Pre-release audit: findings, fixes, what is still open
├── DEV.md                                   # Start/stop/restart commands
├── docs/COMMENT_STYLE.md                    # How comments in this repo are written
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Supabase](https://supabase.com) project with the schema applied
- A [Nebius AI Studio](https://studio.nebius.ai) account with API access

### 1. Clone the repo

```bash
git clone https://github.com/apatil05/Clinical-Trial-Engine
cd Clinical-Trial-Engine
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in your values — **do not overwrite if `.env` already exists with real keys**:

```env
NEBIUS_API_KEY=your-nebius-key
NEBIUS_MODEL=meta-llama/Llama-3.3-70B-Instruct
NEBIUS_MODEL_EXTRACT=meta-llama/Llama-3.3-70B-Instruct
NEBIUS_MODEL_PARSE=meta-llama/Llama-3.3-70B-Instruct
NEBIUS_MODEL_MATCH=nvidia/Llama-3_1-Nemotron-Ultra-253B-v1

MATCH_CONCURRENCY=2
MAX_CRITERIA_CHARS=6000
MATCH_MAX_TOKENS=4096
MATCH_RETRIES=3

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key

VITE_API_URL=http://localhost:8000
```

`.env.example` is the authoritative list and every variable in it is read by something.

### 3. Apply the database schema

In your Supabase project → SQL Editor, run in order:

```
supabase/schema.sql
supabase/migration_add_cache.sql
```

### 4. Run the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs at `http://localhost:8000`
API docs at `http://localhost:8000/docs`

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

See [DEV.md](DEV.md) for a full reference of start, stop, and restart commands.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/extract` | Extract structured patient profile from raw notes |
| `POST` | `/match` | Full pipeline — extract → fetch trials → dual-agent score → cache → return results |
| `POST` | `/generate-sample` | Generate a synthetic patient note via LLM for a random condition |
| `GET` | `/trials/search` | Search ClinicalTrials.gov by condition or keyword |
| `GET` | `/queue` | All match results from Supabase ranked by score |
| `GET` | `/queue/{id}` | Single result with full criterion breakdown |
| `GET` | `/health` | API and Supabase readiness check |

---

## Roadmap

**Account & Data Persistence**
Patients create a secure profile, store their medical data, and return without re-entering notes. Results history, score changes over time as labs update, and a shareable read-only link to send to a referring physician.

**Physician Portal**
Trial coordinators log in and search across a pool of consented patient profiles from referring primary care practices. Filter by condition, score threshold, and geography. Export a shortlist of strong candidates with eligibility breakdowns for outreach.

**FHIR / EHR Integration**
Connect directly to an EHR via FHIR R4. Structured lab values, medication lists, and diagnoses flow in automatically — eliminating manual transcription errors and improving scoring accuracy for criteria requiring precise numeric thresholds.

**Geographic Filtering**
Surface trial sites within a patient-defined travel radius, matched against site location data already available in the ClinicalTrials.gov API.

**Gap Analysis**
For trials just outside a patient's eligibility, show exactly what would need to change: *"Your platelet count is 98,000 /μL. This trial requires ≥100,000. Worth confirming with a repeat CBC at screening."*

---

## Known Limitations

Read this before running the engine against anything that is not synthetic data.

**No auth, no rate limiting.** `/extract`, `/match` and `/generate-sample` all accept free text and spend Nebius credits, with no authentication in front of them. `patient_text` is capped at 20,000 characters and `max_trials` at 30, but there is no per-caller limit of any kind. Run this locally. Deployed as-is on a public address it is a metered endpoint a stranger can drain.

**The Supabase policies are wide open.** `supabase/schema.sql` enables RLS on all three tables and then grants `anon` full read and write on every one of them, `patients.raw_text` included. Enabled RLS with an open policy is not protection — anyone holding the anon key can read every note in the database. This is deliberate for a local synthetic-data demo and is not a configuration for real patient data.

**`GET /queue` returns every patient's results.** No auth, no filter. Nothing in the UI calls it; it exists for local inspection. Accounts are on the roadmap and that is when it gets scoped.

**Dual-agent reconciliation is weaker than it looks.** The two passes are joined on `criterion_id`, and the matching prompt never pins the id scheme, so the two passes have no reason to agree on ids. In practice most criteria fall through and keep the first pass's verdict without a contested flag. A run producing zero contested criteria across every trial is this, not agreement. Tracked in [AUDIT.md](AUDIT.md) as C1.

**The cache path is verified by reading, not by running.** `get_cached_matches_for_patient` and the recompute-on-load behavior have not been executed end to end against a live database. See [AUDIT.md](AUDIT.md) C6.

---

## Notes

All patient data in this project is **fully synthetic** — no real patient records are used, stored, or referenced anywhere.

This tool is a **clinical decision-support system**. Every result is intended to be reviewed and confirmed by a qualified human before any action is taken. A verdict of UNCERTAIN means the patient's notes did not contain enough information to evaluate a criterion — it is not the same as INELIGIBLE.

---

Built by **Aryan Patil** and **Tyler Sheehan** in collaboration with **C10 Labs** · **LabCentral** · **Bayer Co.Lab** · **Evolved Technology**
Compute provided by **Nebius AI Studio** · Part of [Boston Tech Week 2026](https://www.tech-week.com)
