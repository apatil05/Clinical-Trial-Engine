//imports useState tool and page level components
import { useState } from 'react'
import PatientInput from './components/PatientInput.jsx'
import ScreeningLoader from './components/ScreeningLoader.jsx'
import Queue from './components/Queue.jsx'
import MatchResult from './components/MatchResult.jsx'

//importing functions that talk to back end
import { extractProfile, runBulkMatch } from './api.js'

//step order for what page users typically see (except for going back to edit)
const STEPS = ['input', 'confirm', 'screening', 'results', 'detail']

// how many trials one screening run pulls and scores. two Nebius calls per
// trial, ~20s each, so this is the number that decides both how long the run
// takes and what it costs. drop it to 3 when testing.
const MAX_TRIALS = 8

//confidence badge configs
const CONFIDENCE_CONFIG = {
  high:      { label: 'High confidence', icon: '✓' },
  low:       { label: 'Low confidence — verify', icon: '?' },
  not_found: { label: 'Not detected', icon: '!' },
}

//variables below hold a piece of memory between renders
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

  //called when users submits patient notes on input screen
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
      const data = await runBulkMatch(patientText, confirmedCondition.trim(), extractedProfile, MAX_TRIALS)
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
            <ScreeningLoader condition={confirmedCondition} maxTrials={MAX_TRIALS} totalScreened={screeningDone ? totalScreened : null} isDone={screeningDone} />
          </div>
        )}

        {step === 'results' && (
          <Queue results={matchResults} totalScreened={totalScreened} condition={confirmedCondition} onSelectResult={handleSelectResult} onStartOver={handleStartOver} />
        )}

        {step === 'detail' && (
          <MatchResult result={selectedResult} onBack={() => setStep('results')} />
        )}
      </main>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '14px 40px', background: 'var(--surface-2)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.06em' }}>
            AIxBio_HACKATHON · BAYER_CO.LAB · BOSTON_TECH_WEEK_2026 · ALL_DEMO_DATA_IS_SYNTHETIC
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.06em' }}>
            LLAMA_3.3_70B + NEMOTRON_253B VIA NEBIUS · CLINICALTRIALS.GOV
          </p>
        </div>
      </footer>
    </div>
  )
}
