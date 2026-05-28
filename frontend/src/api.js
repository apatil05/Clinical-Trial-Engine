/**
 * api.js — All fetch calls to the FastAPI backend live here.
 * Never write fetch() directly inside a component.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await response.json()
  if (!response.ok) {
    const message = data?.detail?.error || data?.detail || data?.error || 'Request failed'
    throw new Error(message)
  }
  return data
}

/**
 * Extract a structured patient profile from raw health notes.
 * Used for the condition-confirmation step before full matching.
 * POST /extract → { extracted_profile: PatientProfile }
 */
export async function extractProfile(patientText) {
  return request('/extract', {
    method: 'POST',
    body: JSON.stringify({ patient_text: patientText }),
  })
}

/**
 * Run the full pipeline: extract → search trials → bulk match → save → return top 10.
 * POST /match → BulkMatchResponse
 */
export async function runBulkMatch(patientText, confirmedCondition, extractedProfile = null, maxTrials = 8) {
  return request('/match', {
    method: 'POST',
    body: JSON.stringify({
      patient_text: patientText,
      confirmed_condition: confirmedCondition,
      extracted_profile: extractedProfile,
      max_trials: maxTrials,
    }),
  })
}

/**
 * Search ClinicalTrials.gov directly by condition/keyword.
 * GET /trials/search?condition=...&max_results=...
 */
export async function searchTrials(condition, maxResults = 20) {
  const params = new URLSearchParams({ condition, max_results: maxResults })
  return request(`/trials/search?${params}`)
}

/**
 * Load all match results from Supabase, ranked by score.
 * GET /queue → { count, results }
 */
export async function getQueue() {
  return request('/queue')
}

/**
 * Load a single match result with full criterion breakdown.
 * GET /queue/{id}
 */
export async function getMatchResult(id) {
  return request(`/queue/${id}`)
}

/**
 * Generate a fresh synthetic patient health summary via LLM.
 * POST /generate-sample → { patient_text: string }
 */
export async function generateSamplePatient() {
  return request('/generate-sample', { method: 'POST' })
}
