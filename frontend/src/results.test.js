/**
 * results.test.js — the helpers that decide what a user reads next to a score.
 * No dependencies, no browser. Run from frontend/:  npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coveragePct, summaryText, stripScoreClaim, LOW_COVERAGE_THRESHOLD } from './results.js'

const v = verdict => ({ verdict })

// --- coverage -------------------------------------------------------------

test('coverage counts everything that is not UNCERTAIN', () => {
  assert.equal(coveragePct([v('ELIGIBLE'), v('INELIGIBLE'), v('UNCERTAIN'), v('UNCERTAIN')]), 50)
  assert.equal(coveragePct([v('ELIGIBLE')]), 100)
  assert.equal(coveragePct([v('UNCERTAIN')]), 0)
})

test('an empty breakdown is null, not zero', () => {
  // 0% means we judged nothing out of ten. null means there was nothing to judge.
  assert.equal(coveragePct([]), null)
  assert.equal(coveragePct(null), null)
  assert.equal(coveragePct(undefined), null)
})

test('coverage rounds to a whole percent', () => {
  assert.equal(coveragePct([v('ELIGIBLE'), v('UNCERTAIN'), v('UNCERTAIN')]), 33)
})

test('the warning threshold is the value the README documents', () => {
  assert.equal(LOW_COVERAGE_THRESHOLD, 60)
})

// --- B3: the summary must never state a score ------------------------------

const CONTRADICTS = /\b(?:scored?|scoring)\b[^.!?]*\d|\d+\s*(?:out of|\/)\s*100/i

test('strips a leading score claim and keeps the rest', () => {
  assert.equal(
    stripScoreClaim('You have a high eligibility score of 100. You meet the age criteria.'),
    'You meet the age criteria.')
})

test('strips the "out of 100" phrasing', () => {
  assert.equal(
    stripScoreClaim('You scored 100 out of 100. Two items could not be evaluated.'),
    'Two items could not be evaluated.')
})

test('strips a claim buried mid-paragraph', () => {
  assert.equal(
    stripScoreClaim('This trial is recruiting. Your score of 30 is low. Talk to the site.'),
    'This trial is recruiting. Talk to the site.')
})

test('leaves a summary that makes no numeric claim alone', () => {
  const s = 'You meet every criterion listed for this trial.'
  assert.equal(stripScoreClaim(s), s)
})

test('a summary that is nothing but the claim strips to empty', () => {
  // returning the original here would put the contradiction back on screen
  assert.equal(stripScoreClaim('Based on your notes you have a score of 65.'), '')
})

test('summaryText always renders something, and never a score claim', () => {
  const cases = [
    'You have a high eligibility score of 100. You meet the age criteria.',
    'You scored 100 out of 100. Two items could not be evaluated.',
    'Based on your notes you have a score of 65.',
    'You meet every criterion listed for this trial.',
    '', null, undefined,
  ]
  for (const summary of cases) {
    const rendered = summaryText({ summary })
    assert.ok(rendered.length > 0, `empty render for: ${summary}`)
    assert.ok(!CONTRADICTS.test(rendered), `score claim survived: ${rendered}`)
  }
})

test('handles a missing result object', () => {
  assert.ok(summaryText(undefined).length > 0)
  assert.ok(summaryText({}).length > 0)
})

// --- regression: the real summaries the model returned in the live run -----

test('the live summaries from the verification run are all cleaned', () => {
  const live = [
    { score: 97, summary: 'You have a score of 85, indicating you are likely eligible for the study. However, we need to confirm if your splenomegaly is not due to portal hypertension.' },
    { score: 92, summary: 'You have a high overall score of 100, indicating you are likely eligible for the clinical trial. This is based on meeting the key inclusion criteria.' },
    { score: 92, summary: 'You have a high overall score of 100, indicating you are likely eligible for the trial. This is based on your confirmed diagnosis of Gaucher disease type 1.' },
  ]
  for (const r of live) {
    const rendered = summaryText(r)
    assert.ok(!CONTRADICTS.test(rendered), `contradiction next to ${r.score}: ${rendered}`)
    assert.ok(rendered.length > 20, 'stripped too much useful prose')
  }
})
