import { useState, useRef } from 'react'
import { generateSamplePatient } from '../api.js'

// both notes below are invented. no real patient record is used anywhere in
// this repo, and neither person exists.
const SYNTHETIC_NOTE_2 = `PATIENT HEALTH SUMMARY

Patient: James R.  |  Date of Birth: August 3, 1958  |  Male  |  Cambridge, MA

PRESENTING COMPLAINT
Follow-up for idiopathic Parkinson disease. Reports worsening right-hand tremor, slower gait,
and increased stiffness over the past 18 months. Interested in clinical trial options.

CONFIRMED DIAGNOSES
- Parkinson disease — clinically definite per MDS criteria (diagnosed June 2022)
- Hypertension — controlled on lisinopril
- Mild depressive symptoms — managed without SSRI (patient preference)

CURRENT MEDICATIONS
- Carbidopa/levodopa 25/100 mg — 1 tablet three times daily
- Pramipexole 0.5 mg — three times daily
- Lisinopril 10 mg — once daily

RECENT LABORATORY RESULTS (April 2026)
- Hemoglobin: 13.8 g/dL
- Platelets: 210,000 /μL
- Creatinine: 0.9 mg/dL
- ALT / AST: within normal limits
- HbA1c: 5.6%

NEUROLOGIC / FUNCTIONAL STATUS
- Hoehn and Yahr stage: 2.5
- UPDRS Part III (motor, on medication): 28
- MoCA: 26/30 (mild executive slowing, no dementia)
- ECOG performance status: 1
- Ambulatory without assistive device; occasional freezing episodes on turning

TREATMENT HISTORY
- No prior deep brain stimulation
- No prior gene therapy or cell therapy
- No participation in interventional clinical trials in the past 12 months

CLINICAL NOTES
Non-smoker. No known drug allergies. No active psychosis or substance use disorder.
Lives with spouse; reliable study companion available.
Willing to travel within 100 miles of Boston for trial visits.`

const EXAMPLE_PATIENTS = [
  { id: 'gaucher',   label: 'Gaucher — Sarah',   note: null },
  { id: 'parkinson', label: 'Parkinson — James',  note: SYNTHETIC_NOTE_2 },
]

const SYNTHETIC_NOTE = `PATIENT HEALTH SUMMARY

Patient: Sarah M.  |  Date of Birth: March 14, 1992  |  Female  |  Boston, MA

PRESENTING COMPLAINT
Referred for management of Gaucher disease type 1. Reports progressive fatigue,
abdominal fullness, and easy bruising over the past 4 years.

CONFIRMED DIAGNOSES
- Gaucher disease, type 1 — confirmed via glucocerebrosidase enzyme assay (activity:
  0.8 nmol/hr/mg protein; reference range: 5.2–11.0). Diagnosed February 2018.
- Splenomegaly — spleen volume approximately 12× normal on abdominal MRI (November 2025)
- Mild thrombocytopenia (secondary to Gaucher disease)
- Iron deficiency anemia (concurrent)

CURRENT MEDICATIONS
- Imiglucerase (Cerezyme) 60 U/kg IV every 2 weeks — enzyme replacement therapy,
  initiated January 2019
- Ferrous sulfate 325 mg orally once daily

RECENT LABORATORY RESULTS (March 2026)
- Hemoglobin: 10.2 g/dL  (reference: 12.0–16.0)
- Platelets: 98,000 /μL   (reference: 150,000–400,000)
- WBC: 4.1 × 10³/μL       (normal)
- Chitotriosidase: 1,240 nmol/hr/mL  (markedly elevated; normal <150)
- Ferritin: 42 ng/mL
- Liver function tests: within normal limits
- Renal function: within normal limits

TREATMENT HISTORY
- No prior gene therapy
- No prior stem cell or bone marrow transplant

CLINICAL NOTES
ECOG performance status: 1 (ambulatory, restricted in strenuous activity only)
No current or planned pregnancy. No known drug allergies.
BMI: 22.4 kg/m². Blood type: O positive.
Patient willing to travel up to 200 miles for study.`

// the highlight layer is injected with dangerouslySetInnerHTML, so anything
// the user pasted has to be escaped before the term matching adds its own
// spans. escape first, match second, never the other way round.
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function highlightMedical(raw) {
  let result = escapeHtml(raw)

  const terms = [
    'gaucher disease', 'splenomegaly', 'thrombocytopenia', 'anemia',
    'imiglucerase', 'cerezyme', 'chitotriosidase', 'glucocerebrosidase',
    'enzyme replacement therapy', 'gene therapy', 'stem cell',
    'ferrous sulfate', 'cancer', 'tumor', 'carcinoma', 'lymphoma',
    'leukemia', 'diabetes', 'hypertension', 'mutation', 'deletion', 'ferritin',
    'parkinson disease', 'parkinson', 'levodopa', 'carbidopa', 'pramipexole',
    'lisinopril', 'deep brain stimulation', 'tremor',
  ]
  terms.forEach(term => {
    const r = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    result = result.replace(r, m => `<span class="hi-term">${m}</span>`)
  })

  result = result.replace(
    /(\b\d[\d,]*\.?\d*\s*(?:g\/dL|\/μL|ng\/mL|nmol\/hr\/mg|nmol\/hr\/mL|U\/kg|mg\/m²|mg|mL|%)\b)/g,
    '<span class="hi-val">$1</span>'
  )

  return result
}

export default function PatientInput({ onAnalyze, isLoading }) {
  const [notesText, setNotesText] = useState(SYNTHETIC_NOTE)
  const [activePatient, setActivePatient] = useState('gaucher')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)

  function selectPatient(id) {
    setActivePatient(id)
    const patient = EXAMPLE_PATIENTS.find(p => p.id === id)
    setNotesText(patient.note ?? SYNTHETIC_NOTE)
  }

  async function handleGenerateSample() {
    setIsGenerating(true)
    setGenerateError(null)
    setActivePatient(null)
    try {
      const data = await generateSamplePatient()
      setNotesText(data.patient_text)
    } catch (err) {
      // this used to swallow the error and keep the old text. Nebius being
      // down looked exactly like the button doing nothing at all.
      setGenerateError(err.message || 'Could not generate a sample.')
      setActivePatient('gaucher')
    } finally {
      setIsGenerating(false)
    }
  }
  const textareaRef = useRef(null)
  const highlightRef = useRef(null)

  const wordCount = notesText.trim() ? notesText.trim().split(/\s+/).length : 0

  const sharedTextStyle = {
    fontFamily: 'var(--font-mono)',
    fontSize: '12.5px',
    lineHeight: '1.75',
    padding: '16px',
    letterSpacing: '0.01em',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
  }

  function syncScroll() {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  function handleSubmit() {
    if (notesText.trim()) onAnalyze(notesText.trim())
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 40px 0' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.1fr',
        gap: 72,
        alignItems: 'start',
      }}>

        {/* LEFT — Instructions */}
        <div className="animate-fade-up">
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10, color: 'var(--text-muted)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            marginBottom: 32,
          }}>
            Clinical Trial Matching Engine V1.0
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginBottom: 48 }}>
            {[
              {
                n: '01',
                head: 'Paste your health records.',
                body: "Doctor's notes, lab results, discharge summaries — doesn't need to be clean. The messier the better, honestly.",
              },
              {
                n: '02',
                head: 'We figure out your condition.',
                body: 'AI reads through and extracts a structured profile. You confirm it before anything else runs.',
              },
              {
                n: '03',
                head: 'Your profile gets screened.',
                body: `We pull active recruiting trials from ClinicalTrials.gov and run your profile against each one. Takes ~30 seconds.`,
              },
              {
                n: '04',
                head: 'You get your matches.',
                body: 'Top trials ranked by eligibility score, with a full criterion-by-criterion breakdown for each.',
              },
            ].map(step => (
              <div key={step.n} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11, color: 'var(--accent)',
                  letterSpacing: '0.06em', flexShrink: 0,
                  marginTop: 2,
                }}>
                  {step.n}
                </span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
                    {step.head}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, fontWeight: 300 }}>
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['De-identified locally', 'ClinicalTrials.gov sourced', 'No account needed'].map(label => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="status-dot status-dot-green" />
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9, color: 'var(--text-muted)',
                  letterSpacing: '0.09em', textTransform: 'uppercase',
                }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Terminal input card */}
        <div className="animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="terminal-card">

            {/* Header bar */}
            <div style={{
              background: 'var(--surface-2)',
              borderBottom: '1.5px solid var(--border-hard)',
              padding: '10px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                INPUT_SOURCE: MEDICAL_NOTES.TXT
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.06em' }}>
                {wordCount} WORDS
              </span>
            </div>

            {/* Patient selector */}
            <div style={{
              borderBottom: '1px solid var(--border)',
              padding: '7px 16px',
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'var(--surface)',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-hint)', letterSpacing: '0.08em', marginRight: 8 }}>
                EXAMPLE:
              </span>
              {EXAMPLE_PATIENTS.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectPatient(p.id)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    padding: '3px 10px',
                    background: activePatient === p.id ? 'var(--accent)' : 'transparent',
                    color: activePatient === p.id ? 'var(--surface)' : 'var(--text-muted)',
                    border: `1px solid ${activePatient === p.id ? 'var(--accent-dark)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                >
                  {p.label}
                </button>
              ))}

              <div style={{ marginLeft: 'auto' }}>
                <button
                  onClick={handleGenerateSample}
                  disabled={isGenerating}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    padding: '3px 10px',
                    background: 'transparent',
                    color: isGenerating ? 'var(--text-hint)' : 'var(--accent)',
                    border: `1px solid ${isGenerating ? 'var(--border)' : 'var(--accent)'}`,
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                    transition: 'all 0.12s',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {isGenerating ? (
                    <><span style={{ width: 7, height: 7, border: '1px solid var(--text-hint)', borderTopColor: 'var(--accent)', borderRadius: '50%', display: 'inline-block' }} className="animate-spin-slow" /> Generating...</>
                  ) : '⚡ Generate Sample'}
                </button>
              </div>
            </div>

            {/* Highlighted textarea overlay */}
            <div style={{ position: 'relative', height: 440, overflow: 'hidden' }}>
              {/* Highlight layer (behind) */}
              <div
                ref={highlightRef}
                aria-hidden="true"
                style={{
                  ...sharedTextStyle,
                  position: 'absolute', inset: 0,
                  overflow: 'hidden',
                  pointerEvents: 'none',
                  color: 'var(--text)',
                  zIndex: 0,
                }}
                dangerouslySetInnerHTML={{ __html: highlightMedical(notesText) + '\n' }}
              />
              {/* Transparent textarea (on top for input) */}
              <textarea
                ref={textareaRef}
                value={notesText}
                onChange={e => setNotesText(e.target.value)}
                onScroll={syncScroll}
                placeholder="Paste your medical records here..."
                style={{
                  ...sharedTextStyle,
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  background: 'transparent',
                  color: 'transparent',
                  caretColor: 'var(--text)',
                  border: 'none', outline: 'none',
                  resize: 'none',
                  zIndex: 1,
                  overflow: 'auto',
                }}
              />
            </div>

            {/* Footer bar */}
            <div style={{
              borderTop: '1.5px solid var(--border-hard)',
              background: 'var(--surface-2)',
              padding: '11px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                {[['FHIR', false], ['PDF', false], ['Plain Text', true]].map(([fmt, active]) => (
                  <span key={fmt} style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9, color: active ? 'var(--accent)' : 'var(--text-hint)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>
                    {fmt}
                  </span>
                ))}
              </div>
              <button
                className="btn-accent"
                onClick={handleSubmit}
                disabled={isLoading || !notesText.trim()}
                style={{ padding: '9px 18px', fontSize: 11 }}
              >
                {isLoading ? (
                  <><span style={{ width: 11, height: 11, border: '1.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} className="animate-spin-slow" /> Analyzing</>
                ) : 'Analyze →'}
              </button>
            </div>
          </div>

          <p style={{ marginTop: 11, fontFamily: 'var(--font-mono)', fontSize: 10, color: generateError ? 'var(--ineligible)' : 'var(--text-hint)', letterSpacing: '0.05em', textAlign: 'right' }}>
            {generateError && `// generate failed: ${generateError}`}
            {!generateError && activePatient === 'gaucher' && '// example loaded — gaucher disease patient, synthetic data'}
            {!generateError && activePatient === 'parkinson' && '// example loaded — parkinson disease patient, synthetic data'}
            {!generateError && activePatient === null && !isGenerating && '// ai-generated synthetic patient — not real data'}
            {isGenerating && '// generating patient via llm...'}
          </p>
        </div>
      </div>
    </div>
  )
}
