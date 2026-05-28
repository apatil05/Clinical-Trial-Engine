import { useState } from 'react'
import PatientInput from './components/PatientInput.jsx'
import ScreeningLoader from './components/ScreeningLoader.jsx'
import Queue from './components/Queue.jsx'
import MatchResult from './components/MatchResult.jsx'
import { extractProfile, runBulkMatch } from './api.js'

const STEPS = ['input', 'confirm', 'screening', 'results', 'detail']

// ── Dev mock data ──────────────────────────────────────────────────────────
const MOCK_PROFILE = {
  primary_condition: 'Gaucher disease type 1',
  condition_confidence: 'high',
  age: 34,
  sex: 'female',
  diagnosis: ['Gaucher disease type 1', 'Splenomegaly', 'Thrombocytopenia', 'Iron deficiency anemia'],
  current_medications: ['Imiglucerase (Cerezyme)', 'Ferrous sulfate'],
  lab_values: { hemoglobin: '10.2 g/dL', platelets: '98000 /μL', chitotriosidase: '1240 nmol/hr/mL' },
}

const MOCK_RESULTS = [
  { id: 1, nct_id: 'NCT05765812', overall_score: 88, status: 'LIKELY_ELIGIBLE',
    trial_title: 'Gene Therapy Study of LYS-GM501 in Adults with Gaucher Disease Type 1',
    summary: 'Phase 1/2 open-label study evaluating safety and efficacy of a one-time AAV-based gene therapy in adults with GD1.',
    criteria_breakdown: [
      { criterion_id: 'c1', type: 'inclusion', criterion_text: 'Confirmed Gaucher disease type 1 by enzyme assay or genetic testing', verdict: 'ELIGIBLE', reason: 'Patient has confirmed GD1 via glucocerebrosidase enzyme assay (0.8 nmol/hr/mg).' },
      { criterion_id: 'c2', type: 'inclusion', criterion_text: 'Age 18–65 years', verdict: 'ELIGIBLE', reason: 'Patient is 34 years old, within range.' },
      { criterion_id: 'c3', type: 'inclusion', criterion_text: 'On stable ERT for ≥6 months', verdict: 'ELIGIBLE', reason: 'Patient has been on imiglucerase since January 2019 — over 6 years of stable ERT.' },
      { criterion_id: 'c4', type: 'inclusion', criterion_text: 'ECOG performance status 0–2', verdict: 'ELIGIBLE', reason: 'ECOG status 1 noted in records.' },
      { criterion_id: 'c5', type: 'exclusion', criterion_text: 'Prior gene therapy or stem cell transplant', verdict: 'ELIGIBLE', reason: 'No prior gene therapy or transplant per treatment history.' },
      { criterion_id: 'c6', type: 'exclusion', criterion_text: 'Active malignancy', verdict: 'ELIGIBLE', reason: 'No malignancy mentioned in records.' },
      { criterion_id: 'c7', type: 'inclusion', criterion_text: 'Platelet count ≥70,000 /μL', verdict: 'ELIGIBLE', reason: 'Platelets 98,000 /μL — above threshold.' },
      { criterion_id: 'c8', type: 'exclusion', criterion_text: 'Current pregnancy or planned pregnancy within 12 months', verdict: 'ELIGIBLE', reason: 'Patient not pregnant and on hormonal contraception.' },
      { criterion_id: 'c9', type: 'inclusion', criterion_text: 'Willingness to participate in long-term follow-up', verdict: 'UNCERTAIN', reason: 'Not explicitly stated in notes; assumed willing given travel commitment.' },
    ],
  },
  { id: 2, nct_id: 'NCT05432891', overall_score: 74, status: 'UNCERTAIN',
    trial_title: 'Venglustat Oral Substrate Reduction Therapy in Gaucher Disease — Phase 3 Extension',
    summary: 'Randomized double-blind study of venglustat vs. placebo in patients with GD1 currently on ERT.',
    criteria_breakdown: [
      { criterion_id: 'd1', type: 'inclusion', criterion_text: 'GD1 diagnosis confirmed', verdict: 'ELIGIBLE', reason: 'Confirmed by enzyme assay.' },
      { criterion_id: 'd2', type: 'inclusion', criterion_text: 'Currently receiving imiglucerase or velaglucerase', verdict: 'ELIGIBLE', reason: 'Patient on imiglucerase 60 U/kg biweekly.' },
      { criterion_id: 'd3', type: 'inclusion', criterion_text: 'Hemoglobin ≥10 g/dL for females', verdict: 'UNCERTAIN', reason: 'Hemoglobin is 10.2 g/dL, just above threshold — borderline, should verify at screening.' },
      { criterion_id: 'd4', type: 'exclusion', criterion_text: 'Neurological symptoms of Gaucher disease', verdict: 'ELIGIBLE', reason: 'GD type 1 confirmed — no neurological involvement noted.' },
      { criterion_id: 'd5', type: 'exclusion', criterion_text: 'Hepatic impairment (ALT/AST >3× ULN)', verdict: 'ELIGIBLE', reason: 'LFTs within normal limits.' },
    ],
  },
  { id: 3, nct_id: 'NCT04981106', overall_score: 61, status: 'UNCERTAIN',
    trial_title: 'Safety of Pegunigalsidase Alfa in Lysosomal Storage Disorders — Basket Study',
    summary: 'Open-label basket study evaluating enzyme replacement therapy in multiple lysosomal storage diseases.',
    criteria_breakdown: [
      { criterion_id: 'e1', type: 'inclusion', criterion_text: 'Confirmed lysosomal storage disorder', verdict: 'ELIGIBLE', reason: 'GD1 is a lysosomal storage disorder.' },
      { criterion_id: 'e2', type: 'inclusion', criterion_text: 'Age ≥18', verdict: 'ELIGIBLE', reason: 'Patient is 34.' },
      { criterion_id: 'e3', type: 'inclusion', criterion_text: 'No available approved therapy or treatment failure', verdict: 'INELIGIBLE', reason: 'Patient is currently on approved ERT (imiglucerase) with no documented treatment failure.' },
    ],
  },
  { id: 4, nct_id: 'NCT05109234', overall_score: 55, status: 'UNCERTAIN',
    trial_title: 'Taliglucerase Alfa vs. Imiglucerase Head-to-Head in Treatment-Naive GD1 Patients',
    summary: 'Phase 3 comparative study of two ERT agents in patients not previously treated for Gaucher disease.',
    criteria_breakdown: [
      { criterion_id: 'f1', type: 'inclusion', criterion_text: 'Treatment-naive for Gaucher disease ERT', verdict: 'INELIGIBLE', reason: 'Patient has been on imiglucerase since 2019 — not treatment-naive.' },
    ],
  },
  { id: 5, nct_id: 'NCT05611022', overall_score: 42, status: 'LIKELY_INELIGIBLE',
    trial_title: 'Natural History of Untreated Gaucher Disease Type 1 — Observational Registry',
    summary: 'Long-term observational study tracking disease progression in patients not receiving standard ERT.',
    criteria_breakdown: [
      { criterion_id: 'g1', type: 'inclusion', criterion_text: 'Not currently receiving enzyme replacement or substrate reduction therapy', verdict: 'INELIGIBLE', reason: 'Patient is actively on imiglucerase 60 U/kg every 2 weeks.' },
    ],
  },
]

const MOCK_CONDITION = 'Gaucher disease type 1'

function DevBar({ onJumpTo }) {
  const steps = [
    { id: 'input',     label: 'Input' },
    { id: 'confirm',   label: 'Confirm' },
    { id: 'screening', label: 'Screening' },
    { id: 'results',   label: 'Results' },
    { id: 'detail',    label: 'Detail' },
  ]
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#0C0B09',
      borderTop: '1px solid #333',
      padding: '8px 20px',
      display: 'flex', alignItems: 'center', gap: 6,
      zIndex: 9999,
      fontFamily: 'var(--font-mono)',
    }}>
      <span style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', marginRight: 8, textTransform: 'uppercase' }}>
        DEV
      </span>
      {steps.map(s => (
        <button
          key={s.id}
          onClick={() => onJumpTo(s.id)}
          style={{
            background: 'transparent', border: '1px solid #333',
            color: '#888', fontSize: 10, letterSpacing: '0.07em',
            padding: '4px 12px', cursor: 'pointer',
            textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.target.style.borderColor = '#333'; e.target.style.color = '#888' }}
        >
          {s.label}
        </button>
      ))}
      <span style={{ fontSize: 9, color: '#333', marginLeft: 8 }}>— mock data, no backend needed</span>
    </div>
  )
}

const CONFIDENCE_CONFIG = {
  high:      { label: 'High confidence', icon: '✓' },
  low:       { label: 'Low confidence — verify', icon: '?' },
  not_found: { label: 'Not detected', icon: '!' },
}

export default function App() {
  const [step, setStep]                         = useState('input')
  const [patientText, setPatientText]           = useState('')
  const [extractedProfile, setExtractedProfile] = useState(null)
  const [confirmedCondition, setConfirmedCondition] = useState('')
  const [matchResults, setMatchResults]         = useState([])
  const [totalScreened, setTotalScreened]       = useState(0)
  const [selectedResult, setSelectedResult]     = useState(null)
  const [isExtracting, setIsExtracting]         = useState(false)
  const [isScreening, setIsScreening]           = useState(false)
  const [screeningDone, setScreeningDone]       = useState(false)
  const [error, setError]                       = useState(null)
  const [cacheInfo, setCacheInfo]               = useState(null)

  async function handleAnalyze(text) {
    setPatientText(text)
    setError(null)
    setIsExtracting(true)
    try {
      const data = await extractProfile(text)
      const profile = data.extracted_profile
      setExtractedProfile(profile)
      setConfirmedCondition(profile.primary_condition || '')
      setStep('confirm')
    } catch (err) {
      setError(`Extraction failed: ${err.message}`)
    } finally {
      setIsExtracting(false)
    }
  }

  async function handleStartMatching() {
    if (!confirmedCondition.trim()) return
    setError(null)
    setCacheInfo(null)
    setIsScreening(true)
    setScreeningDone(false)
    setStep('screening')
    try {
      const data = await runBulkMatch(patientText, confirmedCondition.trim(), extractedProfile, 8)
      if (data.persisted_to_db === false && data.db_message) {
        setError(`Saved in-memory only: ${data.db_message}`)
      } else if (data.cache_hits > 0) {
        setCacheInfo(
          `${data.cache_hits} trial score${data.cache_hits > 1 ? 's' : ''} loaded from cache` +
          (data.llm_calls > 0 ? ` · ${data.llm_calls} new AI screenings` : ' · instant replay'),
        )
      }
      setMatchResults(data.results || [])
      setTotalScreened(data.total_screened || 0)
      setScreeningDone(true)
      setTimeout(() => setStep('results'), 1200)
    } catch (err) {
      setError(`Matching failed: ${err.message}`)
      setStep('confirm')
    } finally {
      setIsScreening(false)
    }
  }

  function handleSelectResult(result) {
    setSelectedResult(result)
    setStep('detail')
  }

  function handleJumpTo(target) {
    if (target === 'input')     { handleStartOver(); return }
    if (target === 'confirm')   { setExtractedProfile(MOCK_PROFILE); setConfirmedCondition(MOCK_CONDITION); setPatientText('mock'); setStep('confirm'); return }
    if (target === 'screening') { setConfirmedCondition(MOCK_CONDITION); setScreeningDone(false); setStep('screening'); return }
    if (target === 'results')   { setMatchResults(MOCK_RESULTS); setTotalScreened(20); setConfirmedCondition(MOCK_CONDITION); setStep('results'); return }
    if (target === 'detail')    { setMatchResults(MOCK_RESULTS); setSelectedResult(MOCK_RESULTS[0]); setStep('detail'); return }
  }

  function handleStartOver() {
    setStep('input')
    setPatientText('')
    setExtractedProfile(null)
    setConfirmedCondition('')
    setMatchResults([])
    setTotalScreened(0)
    setSelectedResult(null)
    setError(null)
    setCacheInfo(null)
    setScreeningDone(false)
  }

  const currentStepIdx = STEPS.indexOf(step)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* NAV */}
      <header style={{
        background: 'rgba(236,234,229,0.94)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 40px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          height: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 32,
        }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
            <div style={{ width: 16, height: 16, background: 'var(--accent)' }} />
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12, fontWeight: 500,
              color: 'var(--text)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              TrialEngine
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
            {step !== 'input' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {['confirm', 'screening', 'results'].map((s, i) => {
                  const idx = STEPS.indexOf(s)
                  const state = idx < currentStepIdx ? 'done' : idx === currentStepIdx ? 'active' : ''
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div className={`step-dot ${state}`} />
                      {i < 2 && <div style={{ width: 14, height: 1, background: idx < currentStepIdx ? 'var(--text-muted)' : 'var(--border)', transition: 'background 0.4s' }} />}
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="status-dot status-dot-green" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                System Ready
              </span>
            </div>

            <button className="btn-primary" onClick={handleStartOver} style={{ padding: '9px 16px', fontSize: 10 }}>
              Start Screening
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main style={{ flex: 1, paddingBottom: 80 }}>

        {/* Cache info banner */}
        {cacheInfo && !error && (
          <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '16px auto 0', padding: '0 40px' }}>
            <div style={{
              background: 'var(--accent-light)', border: '1px solid #8DBBAF',
              padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.07em' }}>CACHE:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-dark)', flex: 1 }}>{cacheInfo}</span>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="animate-fade-in" style={{ maxWidth: 1200, margin: '20px auto 0', padding: '0 40px' }}>
            <div style={{
              background: 'var(--ineligible-bg)', border: '1px solid var(--ineligible-border)',
              padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ineligible)', letterSpacing: '0.07em' }}>ERROR:</span>
              <span style={{ fontSize: 13, color: 'var(--ineligible)', flex: 1 }}>{error}</span>
              <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ineligible)', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
          </div>
        )}

        {step === 'input' && <PatientInput onAnalyze={handleAnalyze} isLoading={isExtracting} />}

        {step === 'confirm' && extractedProfile && (
          <div className="animate-fade-up" style={{ maxWidth: 680, margin: '64px auto 0', padding: '0 40px' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
              STEP_02 / PROFILE_EXTRACTED
            </p>
            <h1 className="font-display" style={{ fontSize: 44, fontWeight: 900, lineHeight: 1.1, marginBottom: 10 }}>
              Confirm your condition.
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 32 }}>
              Review what we detected. Edit before we search for trials.
            </p>

            <div className="terminal-card">
              <div style={{
                background: 'var(--surface-2)', borderBottom: '1px solid var(--border-hard)',
                padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  DETECTED_CONDITION
                </span>
                {extractedProfile.condition_confidence && (
                  <span className={`badge ${
                    extractedProfile.condition_confidence === 'high' ? 'badge-eligible' :
                    extractedProfile.condition_confidence === 'low'  ? 'badge-uncertain' : 'badge-ineligible'
                  }`}>
                    {CONFIDENCE_CONFIG[extractedProfile.condition_confidence]?.icon}&nbsp;
                    {extractedProfile.condition_confidence} confidence
                  </span>
                )}
              </div>

              <div style={{ padding: '20px' }}>
                <input
                  type="text"
                  value={confirmedCondition}
                  onChange={e => setConfirmedCondition(e.target.value)}
                  placeholder="Enter primary condition..."
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 500, padding: '14px 16px', background: 'var(--bg)', letterSpacing: '0.02em' }}
                />
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-hint)', marginTop: 8, letterSpacing: '0.04em' }}>
                  // used to search ClinicalTrials.gov — be specific for better results
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', padding: '14px 20px' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-hint)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 10 }}>
                  EXTRACTED_FIELDS
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
                  {[
                    extractedProfile.age && `AGE: ${extractedProfile.age}`,
                    extractedProfile.sex && `SEX: ${extractedProfile.sex}`,
                    extractedProfile.diagnosis?.length && `DIAGNOSES: ${extractedProfile.diagnosis.length}`,
                    extractedProfile.current_medications?.length && `MEDS: ${extractedProfile.current_medications.length}`,
                    Object.keys(extractedProfile.lab_values || {}).length && `LABS: ${Object.keys(extractedProfile.lab_values).length}`,
                  ].filter(Boolean).map(fact => (
                    <span key={fact} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)' }}>{fact}</span>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-hard)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn-ghost" onClick={() => setStep('input')}>← Edit Notes</button>
                <button className="btn-accent" onClick={handleStartMatching} disabled={!confirmedCondition.trim() || isScreening}>
                  {isScreening ? (
                    <><span style={{ width: 12, height: 12, border: '1.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} className="animate-spin-slow" /> Initializing</>
                  ) : 'Run Screening →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'screening' && (
          <div style={{ maxWidth: 720, margin: '64px auto 0', padding: '0 40px' }}>
            <ScreeningLoader condition={confirmedCondition} maxTrials={8} totalScreened={screeningDone ? totalScreened : null} isDone={screeningDone} />
          </div>
        )}

        {step === 'results' && (
          <Queue results={matchResults} totalScreened={totalScreened} condition={confirmedCondition} onSelectResult={handleSelectResult} onStartOver={handleStartOver} />
        )}

        {step === 'detail' && (
          <MatchResult result={selectedResult} onBack={() => setStep('results')} />
        )}
      </main>

      <DevBar onJumpTo={handleJumpTo} />

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '14px 40px', background: 'var(--surface-2)', marginBottom: 40 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.06em' }}>
            AIxBio_HACKATHON · BAYER_CO.LAB · BOSTON_TECH_WEEK_2026 · ALL_DEMO_DATA_IS_SYNTHETIC
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.06em' }}>
            LLAMA_3.1_70B_VIA_NEBIUS · CLINICALTRIALS.GOV
          </p>
        </div>
      </footer>
    </div>
  )
}
