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
        <span className={`badge ${cfg.cls}`}>{cfg.icon} {cfg.label}</span>
      </td>
      <td style={{ padding: '11px 16px', lineHeight: 1.6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{criterion.reason}</span>
      </td>
    </tr>
  )
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
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.06em' }}>
                {result.nct_id}
              </span>
            </div>
            <h1 className="font-display" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, marginBottom: 12 }}>
              {result.trial_title}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.7 }}>
              {result.summary}
            </p>
          </div>
        </div>

        {/* Verdict summary */}
        <div style={{ borderTop: '1px solid var(--border-hard)', background: 'var(--surface-2)', padding: '12px 24px', display: 'flex', gap: 0 }}>
          {[
            { label: 'MET',       value: eligibleCount,   color: 'var(--eligible)' },
            { label: 'NOT_MET',   value: ineligibleCount, color: 'var(--ineligible)' },
            { label: 'UNCERTAIN', value: uncertainCount,  color: 'var(--uncertain)' },
            { label: 'TOTAL',     value: breakdown.length,color: 'var(--text-mid)' },
          ].map((s, i) => (
            <div key={s.label} style={{ paddingRight: 28, marginRight: 28, borderRight: i < 3 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: s.color, lineHeight: 1 }}>{s.value}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

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
                  {inclusionCriteria.map(c => <CriterionRow key={c.criterion_id} criterion={c} />)}
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
                  {exclusionCriteria.map(c => <CriterionRow key={c.criterion_id} criterion={c} />)}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.05em', lineHeight: 1.8, marginBottom: 40 }}>
        // FOR INFORMATIONAL PURPOSES ONLY — NOT MEDICAL ADVICE<br/>
        // CONSULT A QUALIFIED HEALTHCARE PROFESSIONAL BEFORE ENROLLING
      </p>
    </div>
  )
}
