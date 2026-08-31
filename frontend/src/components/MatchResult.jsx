import { coveragePct, summaryText, LOW_COVERAGE_THRESHOLD } from '../results.js'

const VERDICT_CONFIG = {
  ELIGIBLE:   { label: 'Eligible',   cls: 'badge-eligible',   icon: '✓' },
  INELIGIBLE: { label: 'Ineligible', cls: 'badge-ineligible', icon: '✗' },
  UNCERTAIN:  { label: 'Uncertain',  cls: 'badge-uncertain',  icon: '?' },
}

const STATUS_CONFIG = {
  LIKELY_ELIGIBLE:   { label: 'Strong Match',   color: 'var(--eligible)',   bg: 'var(--eligible-bg)',   border: 'var(--eligible-border)' },
  UNCERTAIN:         { label: 'Possible Match', color: 'var(--uncertain)',  bg: 'var(--uncertain-bg)',  border: 'var(--uncertain-border)' },
  LIKELY_INELIGIBLE: { label: 'Unlikely Match', color: 'var(--ineligible)', bg: 'var(--ineligible-bg)', border: 'var(--ineligible-border)' },
}

// criterion_id is whatever the model emitted and it repeats often enough to
// collide, so pair it with the row index for the React key.
function CriterionRow({ criterion }) {
  const cfg = VERDICT_CONFIG[criterion.verdict] || VERDICT_CONFIG.UNCERTAIN
  return (
    <tr className="criteria-row" style={{ verticalAlign: 'top' }}>
      <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
        <span className={`badge ${criterion.type === 'inclusion' ? 'badge-primary' : 'badge-neutral'}`}>
          {criterion.type === 'inclusion' ? 'INC' : 'EXC'}
        </span>
      </td>
      <td style={{ padding: '11px 16px', lineHeight: 1.6 }}>
        <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>{criterion.criterion_text}</span>
      </td>
      <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className={`badge ${cfg.cls}`}>{cfg.icon} {cfg.label}</span>
          {criterion.contested && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.08em',
              color: 'var(--uncertain)', border: '1px solid var(--uncertain)',
              padding: '1px 5px', textTransform: 'uppercase',
            }}>
              ⚡ CONTESTED
            </span>
          )}
        </div>
      </td>
      <td style={{ padding: '11px 16px', lineHeight: 1.6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{criterion.reason}</span>
      </td>
    </tr>
  )
}

// trial titles carry & and # often enough that this matters. unencoded, the
// browser reads them as the next query param or as a fragment and the body
// arrives truncated at that character.
function mailtoHref(result) {
  const subject = `Interest in ${result.nct_id}`
  const body = [
    'Hello,',
    '',
    `I am interested in learning more about the study "${result.trial_title}" (${result.nct_id}).`,
    '',
    'Please let me know how I can get involved.',
    '',
    'Thank you.',
  ].join('\n')
  const params = new URLSearchParams({ subject, body })
  return `mailto:${encodeURIComponent(result.contact_email)}?${params}`
}

export default function MatchResult({ result, onBack }) {
  if (!result) return null

  const statusCfg = STATUS_CONFIG[result.status] || STATUS_CONFIG.UNCERTAIN
  const breakdown = result.criteria_breakdown || []
  const inclusionCriteria = breakdown.filter(c => c.type === 'inclusion')
  const exclusionCriteria = breakdown.filter(c => c.type === 'exclusion')
  const eligibleCount   = breakdown.filter(c => c.verdict === 'ELIGIBLE').length
  const ineligibleCount = breakdown.filter(c => c.verdict === 'INELIGIBLE').length
  const uncertainCount  = breakdown.filter(c => c.verdict === 'UNCERTAIN').length
  const contestedCount  = breakdown.filter(c => c.contested).length
  const coverage        = coveragePct(breakdown)
  const score = result.overall_score
  const scoreColor = score >= 75 ? 'var(--eligible)' : score >= 50 ? 'var(--uncertain)' : 'var(--ineligible)'

  return (
    <div className="animate-fade-up" style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 40px 0' }}>

      <button className="btn-ghost" onClick={onBack} style={{ marginBottom: 24 }}>← Back to Results</button>

      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
        STEP_05 / ELIGIBILITY_BREAKDOWN
      </p>

      {/* Hero card */}
      <div className="terminal-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>

          {/* Score column */}
          <div style={{ padding: '24px 28px', borderRight: '1px solid var(--border)', textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 54, fontWeight: 500, color: scoreColor, lineHeight: 1 }}>
              {score}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-hint)', letterSpacing: '0.1em', marginTop: 6 }}>
              MATCH_SCORE
            </div>
            <div style={{ height: 3, background: 'var(--border)', marginTop: 14, width: 80 }}>
              <div style={{ height: '100%', width: `${score}%`, background: scoreColor, transition: 'width 1s ease' }} />
            </div>
          </div>

          {/* Info */}
          <div style={{ padding: '24px', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: statusCfg.bg, color: statusCfg.color, borderColor: statusCfg.border }}>
                {statusCfg.label}
              </span>
              <a
                href={`https://clinicaltrials.gov/study/${result.nct_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.06em', textDecoration: 'none', borderBottom: '1px solid var(--border)' }}
              >
                {result.nct_id} ↗
              </a>
            </div>
            <h1 className="font-display" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, marginBottom: 12 }}>
              {result.trial_title}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.7 }}>
              {summaryText(result)}
            </p>
          </div>
        </div>

        {/* Verdict summary */}
        <div style={{ borderTop: '1px solid var(--border-hard)', background: 'var(--surface-2)', padding: '12px 24px', display: 'flex', gap: 0 }}>
          {[
            { label: 'MET',       value: eligibleCount,            color: 'var(--eligible)' },
            { label: 'NOT_MET',   value: ineligibleCount,          color: 'var(--ineligible)' },
            { label: 'UNCERTAIN', value: uncertainCount,           color: 'var(--uncertain)' },
            { label: 'CONTESTED', value: contestedCount,           color: 'var(--uncertain)' },
            { label: 'DATA_COV',  value: `${coverage ?? '?'}%`, color: coverage >= 70 ? 'var(--eligible)' : coverage >= 40 ? 'var(--uncertain)' : 'var(--ineligible)' },
            { label: 'TOTAL',     value: breakdown.length,         color: 'var(--text-mid)' },
          ].map((s, i) => (
            <div key={s.label} style={{ paddingRight: 28, marginRight: 28, borderRight: i < 5 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: s.color, lineHeight: 1 }}>{s.value}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Low-coverage warning */}
      {coverage !== null && coverage < LOW_COVERAGE_THRESHOLD && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          border: '1px solid var(--uncertain)',
          background: 'var(--uncertain-bg)',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <span style={{ color: 'var(--uncertain)', fontSize: 14, flexShrink: 0 }}>⚠</span>
          <div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--uncertain)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
              LOW DATA COVERAGE — {coverage}% OF CRITERIA EVALUABLE
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Many criteria could not be evaluated because your notes lack the required data points.
              The score has been adjusted downward to account for this uncertainty.
              Adding lab values, functional status scores, and treatment history to your notes will improve accuracy.
            </p>
          </div>
        </div>
      )}

      {/* Criteria table */}
      <div className="terminal-card" style={{ marginBottom: 32 }}>
        <div style={{
          padding: '11px 16px', borderBottom: '1.5px solid var(--border-hard)',
          background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            ELIGIBILITY_BREAKDOWN · ALL CRITERIA
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.05em' }}>
            UNCERTAIN ≠ INELIGIBLE
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {['TYPE', 'CRITERION', 'VERDICT', 'REASONING'].map(h => (
                  <th key={h} style={{
                    padding: '9px 16px', textAlign: 'left',
                    fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500,
                    color: 'var(--text-hint)', letterSpacing: '0.1em', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inclusionCriteria.length > 0 && (
                <>
                  <tr>
                    <td colSpan={4} style={{
                      padding: '7px 16px', fontFamily: 'var(--font-mono)',
                      fontSize: 9, fontWeight: 500, color: 'var(--accent)',
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      background: 'var(--accent-light)', borderTop: '1px solid var(--border)',
                    }}>
                      INCLUSION_CRITERIA — must be met
                    </td>
                  </tr>
                  {inclusionCriteria.map((c, i) => <CriterionRow key={`inc-${i}-${c.criterion_id}`} criterion={c} />)}
                </>
              )}
              {exclusionCriteria.length > 0 && (
                <>
                  <tr>
                    <td colSpan={4} style={{
                      padding: '7px 16px', fontFamily: 'var(--font-mono)',
                      fontSize: 9, fontWeight: 500, color: 'var(--ineligible)',
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      background: 'var(--ineligible-bg)', borderTop: '1px solid var(--border)',
                    }}>
                      EXCLUSION_CRITERIA — must not be triggered
                    </td>
                  </tr>
                  {exclusionCriteria.map((c, i) => <CriterionRow key={`exc-${i}-${c.criterion_id}`} criterion={c} />)}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contact + external link card */}
      <div className="terminal-card" style={{ marginBottom: 32 }}>
        <div style={{
          padding: '11px 16px', borderBottom: '1.5px solid var(--border-hard)',
          background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            TRIAL_CONTACT · NEXT_STEPS
          </span>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
          {/* Contact info */}
          <div style={{ flex: 1, minWidth: 200 }}>
            {(result.contact_name || result.contact_email || result.contact_phone) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.contact_name && (
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-hint)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                      CONTACT
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{result.contact_name}</span>
                  </div>
                )}
                {result.contact_email && (
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-hint)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                      EMAIL
                    </span>
                    <a href={`mailto:${result.contact_email}`} style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px solid var(--accent)' }}>
                      {result.contact_email}
                    </a>
                  </div>
                )}
                {result.contact_phone && (
                  <div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-hint)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                      PHONE
                    </span>
                    <a href={`tel:${result.contact_phone}`} style={{ fontSize: 13, color: 'var(--text-mid)', textDecoration: 'none' }}>
                      {result.contact_phone}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-hint)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  CONTACT
                </span>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Contact details not listed — use the ClinicalTrials.gov page to find the research site nearest you.
                </p>
              </div>
            )}
          </div>

          {/* CTA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            <a
              href={`https://clinicaltrials.gov/study/${result.nct_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-accent"
              style={{ padding: '10px 20px', fontSize: 11, textDecoration: 'none', display: 'inline-block', textAlign: 'center' }}
            >
              View on ClinicalTrials.gov ↗
            </a>
            {result.contact_email && (
              <a
                href={mailtoHref(result)}
                className="btn-secondary"
                style={{ padding: '10px 20px', fontSize: 11, textDecoration: 'none', display: 'inline-block', textAlign: 'center' }}
              >
                Email Research Team →
              </a>
            )}
          </div>
        </div>
      </div>

      <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.05em', lineHeight: 1.8, marginBottom: 40 }}>
        // FOR INFORMATIONAL PURPOSES ONLY — NOT MEDICAL ADVICE<br/>
        // CONSULT A QUALIFIED HEALTHCARE PROFESSIONAL BEFORE ENROLLING
      </p>
    </div>
  )
}
