import { useState } from 'react'

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
- Alglucerase (Ceredase) used approximately 1997–2001 per older records

CLINICAL NOTES
ECOG performance status: 1 (ambulatory, restricted in strenuous activity only)
No current or planned pregnancy — on hormonal contraception (oral).
No known drug allergies.  BMI: 22.4 kg/m².  Blood type: O positive.
Patient resides in Boston, MA and is willing to travel up to 200 miles for study.`

const FHIR_PLACEHOLDER = `{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [
    {
      "resource": {
        "resourceType": "Patient",
        "birthDate": "1992-03-14",
        "gender": "female"
      }
    },
    {
      "resource": {
        "resourceType": "Condition",
        "code": {
          "coding": [{
            "system": "http://snomed.info/sct",
            "code": "190905008",
            "display": "Gaucher disease"
          }]
        }
      }
    }
  ]
}`

export default function PatientInput({ onAnalyze, isLoading }) {
  const [activeTab, setActiveTab] = useState('notes')
  const [notesText, setNotesText] = useState(SYNTHETIC_NOTE)
  const [fhirText, setFhirText] = useState('')

  const charCount = activeTab === 'notes' ? notesText.length : fhirText.length

  function handleSubmit() {
    if (activeTab === 'notes' && notesText.trim()) {
      onAnalyze(notesText.trim())
    }
  }

  return (
    <div className="animate-fade-up" style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>

      {/* Hero text */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1
          className="font-display"
          style={{ fontSize: 42, fontWeight: 600, color: 'var(--text)', lineHeight: 1.15, marginBottom: 14 }}
        >
          Find Your Clinical Trial Match
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1.65, maxWidth: 520, margin: '0 auto' }}>
          Paste your medical records or doctor's notes below. Our AI will analyze
          your health profile and match you to the trials you're most likely to qualify for.
        </p>
      </div>

      {/* Card */}
      <div className="card-elevated" style={{ overflow: 'hidden' }}>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          {[
            { id: 'notes', label: 'Clinical Notes', icon: '📋' },
            { id: 'fhir',  label: 'FHIR JSON',      icon: '⚕️' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '14px 24px',
                background: activeTab === tab.id ? 'var(--surface)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginBottom: '-1px',
              }}
            >
              <span style={{ fontSize: 15 }}>{tab.icon}</span>
              {tab.label}
              {tab.id === 'fhir' && (
                <span
                  className="badge badge-accent"
                  style={{ fontSize: 9, padding: '2px 7px', marginLeft: 2 }}
                >
                  COMING SOON
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '24px 24px 20px' }}>
          {activeTab === 'notes' ? (
            <>
              {/* Actions row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Paste discharge summaries, lab results, or doctor's notes
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn-ghost"
                    onClick={() => setNotesText(SYNTHETIC_NOTE)}
                    style={{ fontSize: 12 }}
                  >
                    Load Example
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => setNotesText('')}
                    style={{ fontSize: 12 }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Textarea */}
              <textarea
                value={notesText}
                onChange={e => setNotesText(e.target.value)}
                placeholder="Paste your medical records here..."
                rows={16}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13.5,
                  lineHeight: 1.7,
                  resize: 'vertical',
                  background: 'var(--surface)',
                }}
              />

              {/* Character count */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-hint)', fontFamily: 'var(--font-mono)' }}>
                  {charCount.toLocaleString()} characters
                </span>
              </div>
            </>
          ) : (
            /* FHIR stub */
            <div style={{ position: 'relative' }}>
              <textarea
                value={fhirText}
                onChange={e => setFhirText(e.target.value)}
                placeholder={FHIR_PLACEHOLDER}
                rows={16}
                disabled
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5,
                  lineHeight: 1.65,
                  opacity: 0.45,
                  cursor: 'not-allowed',
                  resize: 'none',
                }}
              />
              {/* Overlay */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(244,246,250,0.7)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 10, borderRadius: 8,
                backdropFilter: 'blur(1px)',
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'var(--accent-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22,
                }}>⚕️</div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: 600, color: 'var(--text-mid)', fontSize: 15, marginBottom: 4 }}>
                    FHIR R4 Import
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 320, lineHeight: 1.5 }}>
                    Export from Apple Health or your EHR and paste your FHIR R4 bundle here.
                    Available in the next release.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-soft)',
          background: 'var(--surface-2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}>
          <p style={{ fontSize: 12, color: 'var(--text-hint)', lineHeight: 1.5, maxWidth: 420 }}>
            All information is processed securely. Demo uses synthetic data only.
            No real patient records are stored.
          </p>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={isLoading || activeTab === 'fhir' || !notesText.trim()}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {isLoading ? (
              <>
                <span
                  style={{
                    width: 14, height: 14,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    display: 'inline-block',
                  }}
                  className="animate-spin-slow"
                />
                Analyzing…
              </>
            ) : (
              <>
                Analyze My Information
                <span style={{ fontSize: 16 }}>→</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Powered by note */}
      <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-hint)' }}>
        Powered by Llama 3.1 70B via Nebius · Data from ClinicalTrials.gov
      </p>
    </div>
  )
}
