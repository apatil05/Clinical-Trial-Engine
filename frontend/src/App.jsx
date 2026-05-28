import { useState } from 'react'
import PatientInput from './components/PatientInput.jsx'
import ScreeningLoader from './components/ScreeningLoader.jsx'
import Queue from './components/Queue.jsx'
import MatchResult from './components/MatchResult.jsx'
import { extractProfile, runBulkMatch } from './api.js'

// Steps: 'input' → 'confirm' → 'screening' → 'results' → 'detail'
const STEPS = ['input', 'confirm', 'screening', 'results', 'detail']
const STEP_LABELS = ['Enter Info', 'Confirm', 'Screening', 'Results', 'Detail']

const CONFIDENCE_CONFIG = {
  high:      { label: 'Detected with high confidence', color: 'var(--eligible)',   icon: '✓' },
  low:       { label: 'Detected with low confidence — please verify', color: 'var(--uncertain)', icon: '?' },
  not_found: { label: 'Could not detect — please enter your condition', color: 'var(--ineligible)', icon: '!' },
}

export default function App() {
  const [step, setStep]                     = useState('input')
  const [patientText, setPatientText]       = useState('')
  const [extractedProfile, setExtractedProfile] = useState(null)
  const [confirmedCondition, setConfirmedCondition] = useState('')
  const [matchResults, setMatchResults]     = useState([])
  const [totalScreened, setTotalScreened]   = useState(0)
  const [selectedResult, setSelectedResult] = useState(null)
  const [isExtracting, setIsExtracting]     = useState(false)
  const [isScreening, setIsScreening]       = useState(false)
  const [screeningDone, setScreeningDone]   = useState(false)
  const [error, setError]                   = useState(null)

  // ── Step 1: User submits patient notes → extract profile ──
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

  // ── Step 2: User confirms condition → run bulk match ──
  async function handleStartMatching() {
    if (!confirmedCondition.trim()) return
    setError(null)
    setIsScreening(true)
    setScreeningDone(false)
    setStep('screening')
    try {
      const data = await runBulkMatch(patientText, confirmedCondition.trim())
      setMatchResults(data.results || [])
      setTotalScreened(data.total_screened || 0)
      setScreeningDone(true)
      // Brief pause to show "complete" state before transitioning
      setTimeout(() => setStep('results'), 1200)
    } catch (err) {
      setError(`Matching failed: ${err.message}`)
      setStep('confirm')
    } finally {
      setIsScreening(false)
    }
  }

  // ── Step 4: User clicks a result ──
  function handleSelectResult(result) {
    setSelectedResult(result)
    setStep('detail')
  }

  // ── Reset to start ──
  function handleStartOver() {
    setStep('input')
    setPatientText('')
    setExtractedProfile(null)
    setConfirmedCondition('')
    setMatchResults([])
    setTotalScreened(0)
    setSelectedResult(null)
    setError(null)
    setScreeningDone(false)
  }

  const currentStepIdx = STEPS.indexOf(step)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <header style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 32px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{
          maxWidth: 960, margin: '0 auto',
          height: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 15, fontWeight: 700,
              fontFamily: 'var(--font-display)',
            }}>
              T
            </div>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18, fontWeight: 600, color: 'var(--text)',
              letterSpacing: '-0.01em',
            }}>
              TrialMatch
            </span>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: 'var(--accent)',
              background: 'var(--accent-light)',
              border: '1px solid #9FD8D9',
              borderRadius: 4, padding: '2px 6px',
              fontFamily: 'var(--font-body)',
              letterSpacing: '0.04em',
            }}>
              BETA
            </span>
          </div>

          {/* Step indicators */}
          {step !== 'input' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {['confirm', 'screening', 'results'].map((s, i) => {
                const idx = STEPS.indexOf(s)
                const state = idx < currentStepIdx ? 'done' : idx === currentStepIdx ? 'active' : 'idle'
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className={`step-dot ${state}`} />
                    {i < 2 && (
                      <div style={{
                        width: 20, height: 1,
                        background: idx < currentStepIdx ? 'var(--accent)' : 'var(--border)',
                        transition: 'background 0.4s',
                      }} />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Built at tag */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-hint)', fontFamily: 'var(--font-body)' }}>
              Built at AIxBio · Bayer Co.Lab
            </span>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main style={{
        flex: 1,
        padding: '52px 0 64px',
        position: 'relative',
      }}>

        {/* Global error banner */}
        {error && (
          <div className="animate-fade-in" style={{
            maxWidth: 760, margin: '0 auto 24px', padding: '0 24px',
          }}>
            <div style={{
              background: 'var(--ineligible-bg)',
              border: '1px solid var(--ineligible-border)',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <span style={{ color: 'var(--ineligible)', fontSize: 16, flexShrink: 0 }}>⚠</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13.5, color: 'var(--ineligible)', fontWeight: 500, marginBottom: 2 }}>
                  Something went wrong
                </p>
                <p style={{ fontSize: 13, color: '#7F1D1D' }}>{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ineligible)', fontSize: 16 }}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: input ── */}
        {step === 'input' && (
          <PatientInput
            onAnalyze={handleAnalyze}
            isLoading={isExtracting}
          />
        )}

        {/* ── STEP: confirm ── */}
        {step === 'confirm' && extractedProfile && (
          <div className="animate-fade-up" style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <h1 className="font-display" style={{ fontSize: 36, fontWeight: 600, marginBottom: 10 }}>
                Profile Extracted
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Review the detected condition before we search for trials.
                You can edit it if anything looks wrong.
              </p>
            </div>

            {/* Condition card */}
            <div className="card-elevated" style={{ padding: '28px', marginBottom: 16 }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{
                  display: 'block', fontSize: 11, fontWeight: 700,
                  color: 'var(--text-muted)', letterSpacing: '0.06em',
                  textTransform: 'uppercase', marginBottom: 10,
                  fontFamily: 'var(--font-body)',
                }}>
                  Primary Condition
                </label>
                {/* Confidence badge */}
                {extractedProfile.condition_confidence && (
                  <div style={{ marginBottom: 10 }}>
                    <span className={`badge ${
                      extractedProfile.condition_confidence === 'high'      ? 'badge-eligible' :
                      extractedProfile.condition_confidence === 'low'       ? 'badge-uncertain' :
                      'badge-ineligible'
                    }`} style={{ fontSize: 10 }}>
                      {CONFIDENCE_CONFIG[extractedProfile.condition_confidence]?.icon}{' '}
                      {CONFIDENCE_CONFIG[extractedProfile.condition_confidence]?.label}
                    </span>
                  </div>
                )}
                <input
                  type="text"
                  value={confirmedCondition}
                  onChange={e => setConfirmedCondition(e.target.value)}
                  placeholder="Type your primary condition..."
                  style={{ fontSize: 16 }}
                />
                <p style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 6 }}>
                  This will be used to search ClinicalTrials.gov. Be specific for better results.
                </p>
              </div>

              {/* Extracted facts summary */}
              <div style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border-soft)',
                borderRadius: 8, padding: '14px 16px',
                marginBottom: 24,
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10, fontFamily: 'var(--font-body)' }}>
                  Extracted Profile Summary
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
                  {[
                    extractedProfile.age   ? `Age: ${extractedProfile.age}` : null,
                    extractedProfile.sex   ? `Sex: ${extractedProfile.sex}` : null,
                    extractedProfile.diagnosis?.length
                      ? `Diagnoses: ${extractedProfile.diagnosis.length}` : null,
                    extractedProfile.current_medications?.length
                      ? `Medications: ${extractedProfile.current_medications.length}` : null,
                    Object.keys(extractedProfile.lab_values || {}).length
                      ? `Lab values: ${Object.keys(extractedProfile.lab_values).length}` : null,
                  ].filter(Boolean).map(fact => (
                    <span key={fact} style={{ fontSize: 13, color: 'var(--text-mid)' }}>
                      <strong style={{ color: 'var(--primary)', fontWeight: 500 }}>·</strong> {fact}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn-ghost" onClick={() => setStep('input')}>
                  ← Edit Notes
                </button>
                <button
                  className="btn-primary"
                  onClick={handleStartMatching}
                  disabled={!confirmedCondition.trim() || isScreening}
                >
                  Find Matching Trials →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: screening ── */}
        {step === 'screening' && (
          <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px' }}>
            <div className="card-elevated" style={{ overflow: 'hidden' }}>
              <ScreeningLoader
                condition={confirmedCondition}
                maxTrials={20}
                isDone={screeningDone}
              />
            </div>
          </div>
        )}

        {/* ── STEP: results ── */}
        {step === 'results' && (
          <Queue
            results={matchResults}
            totalScreened={totalScreened}
            condition={confirmedCondition}
            onSelectResult={handleSelectResult}
            onStartOver={handleStartOver}
          />
        )}

        {/* ── STEP: detail ── */}
        {step === 'detail' && (
          <MatchResult
            result={selectedResult}
            onBack={() => setStep('results')}
          />
        )}
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        background: 'rgba(255,255,255,0.6)',
        padding: '16px 32px',
      }}>
        <div style={{
          maxWidth: 960, margin: '0 auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 8,
        }}>
          <p style={{ fontSize: 11, color: 'var(--text-hint)' }}>
            AIxBio Hackathon · Bayer Co.Lab, Boston Tech Week 2026 · All demo data is synthetic
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-hint)' }}>
            Llama 3.1 70B via Nebius · ClinicalTrials.gov
          </p>
        </div>
      </footer>
    </div>
  )
}
