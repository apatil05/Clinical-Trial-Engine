import { test, expect } from '@playwright/test'

const APP = 'http://127.0.0.1:5173'
test.describe.configure({ mode: 'serial' })

test('full screening flow, input through criterion breakdown', async ({ page }, testInfo) => {
  test.setTimeout(900_000)
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))

  // --- step 1: input
  await page.goto(APP)
  await expect(page.getByText('Clinical Trial Matching Engine V1.0')).toBeVisible()
  await expect(page.locator('textarea')).toContainText('Gaucher disease', { timeout: 10_000 })
  await page.screenshot({ path: `test-results/1-input.png`, fullPage: true })

  // --- step 2: extraction -> confirm
  await page.getByRole('button', { name: /Analyze/ }).click()
  await expect(page.getByText('Confirm your condition.')).toBeVisible({ timeout: 180_000 })
  const condition = await page.locator('input[type="text"]').inputValue()
  console.log(`  extracted condition: "${condition}"`)
  expect(condition.toLowerCase()).toContain('gaucher')
  await page.screenshot({ path: `test-results/2-confirm.png`, fullPage: true })

  // --- step 3: screening
  await page.getByRole('button', { name: /Run Screening/ }).click()
  await expect(page.getByText('SCREENING_ENGINE')).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `test-results/3-screening.png`, fullPage: true })

  // --- step 4: results
  await expect(page.getByText('Your top trial matches.')).toBeVisible({ timeout: 900_000 })
  const rows = page.locator('div').filter({ hasText: /^\d{2}$/ })
  const nctLinks = await page.getByText(/^NCT\d+$/).count()
  console.log(`  results rendered: ${nctLinks}`)
  expect(nctLinks).toBeGreaterThan(0)

  // no summary on screen may contradict its own score
  const bodyText = await page.locator('body').innerText()
  const claim = bodyText.match(/\b(?:scored?|scoring)\b[^.!?\n]*\d|\d+\s*(?:out of|\/)\s*100/i)
  console.log(`  score-claim in visible text: ${claim ? JSON.stringify(claim[0]) : 'none'}`)
  expect(claim, `summary contradicts the score: ${claim && claim[0]}`).toBeNull()
  await page.screenshot({ path: `test-results/4-results.png`, fullPage: true })

  // --- step 5: detail
  await page.getByText(/^NCT\d+$/).first().click({ force: true })
  await expect(page.getByText('ELIGIBILITY_BREAKDOWN · ALL CRITERIA')).toBeVisible({ timeout: 30_000 })

  const score = await page.locator('div:has(> div:text-is("MATCH_SCORE"))').first().locator('div').first().innerText()
  const incRows = await page.locator('tbody tr').count()
  console.log(`  detail score: ${score}, criterion rows: ${incRows}`)
  expect(Number(score)).toBeGreaterThanOrEqual(0)
  expect(Number(score)).toBeLessThanOrEqual(100)
  expect(incRows).toBeGreaterThan(0)

  const detailText = await page.locator('body').innerText()
  const detailClaim = detailText.match(/\b(?:scored?|scoring)\b[^.!?\n]*\d|\d+\s*(?:out of|\/)\s*100/i)
  expect(detailClaim, `detail summary contradicts score: ${detailClaim && detailClaim[0]}`).toBeNull()
  expect(detailText).toContain('NOT MEDICAL ADVICE')
  await page.screenshot({ path: `test-results/5-detail.png`, fullPage: true })

  console.log(`  console errors: ${errors.length}`)
  if (errors.length) console.log('   ' + errors.slice(0, 5).join('\n   '))
  expect(errors.filter(e => !/favicon|DevTools/i.test(e))).toHaveLength(0)
})
