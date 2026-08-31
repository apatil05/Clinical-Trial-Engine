/**
 * results.js — shared helpers for reading a match result.
 * Queue and MatchResult both render the same result object, so anything that
 * derives a number or a string from it belongs here rather than in both.
 */

/**
 * Percentage of a trial's criteria that could actually be evaluated from the
 * patient's notes. UNCERTAIN means the notes were silent, so it does not count.
 *
 * Returns null for an empty breakdown, which is not the same as 0%. 0% means
 * we looked at ten criteria and could not judge any of them. null means there
 * was nothing to look at.
 */
export function coveragePct(breakdown) {
  if (!breakdown || breakdown.length === 0) return null
  const evaluable = breakdown.filter(c => c.verdict !== 'UNCERTAIN').length
  return Math.round((evaluable / breakdown.length) * 100)
}

/**
 * Below this the score stops meaning much and the UI says so.
 *
 * Under 60% the majority of what the trial asks for was never answered by the
 * notes, so the score is mostly the UNCERTAIN penalty accumulating rather than
 * a judgement about the patient. Two patients with the same 45 can be in
 * completely different situations, one genuinely ineligible and one who just
 * pasted a thin note. Telling the user to add labs is more useful than letting
 * them read the number as a verdict.
 */
export const LOW_COVERAGE_THRESHOLD = 60

/**
 * Drop any sentence in the summary that states a score.
 *
 * The summary comes back from the scoring pass verbatim, and the prompt asks
 * it to mention the score, so it narrates its own arithmetic. The number we
 * display is the deterministic one from compute_score_from_breakdown(), which
 * is a different number. Left alone the UI reads "86" beside "you scored a
 * high eligibility score of 100".
 *
 * The prose either side of that sentence is still worth showing, so strip the
 * claim rather than the whole summary.
 *
 * A one-sentence summary that is nothing but the score claim strips to empty.
 * That is the right answer. Falling back to the original there would put the
 * contradiction back on screen, which is the thing this exists to prevent.
 * Use summaryText() to get something renderable.
 */
const SCORE_CLAIM = /\b(?:scored?|scoring)\b[^.!?]*\d|\d+\s*(?:out of|\/)\s*100/i

export function stripScoreClaim(summary) {
  if (!summary) return ''
  return summary
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => !SCORE_CLAIM.test(sentence))
    .join(' ')
    .trim()
}

/** What the summary strips down to, or a neutral line when nothing is left. */
export function summaryText(result) {
  return stripScoreClaim(result?.summary) || 'See the criterion breakdown for this trial.'
}
