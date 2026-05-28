/**
 * MatchResult.jsx — Full per-criterion breakdown for a single trial match.
 * The criterion table is ALWAYS fully expanded — never collapsed.
 * This is the core trust mechanism of the product.
 */

const VERDICT_CONFIG = {
  ELIGIBLE:   { label: 'Eligible',   cls: 'badge-eligible',   icon: '✓', desc: 'Criterion met' },
  INELIGIBLE: { label: 'Ineligible', cls: 'badge-ineligible', icon: '✗', desc: 'Criterion not met' },
  UNCERTAIN:  { label: 'Uncertain',  cls: 'badge-uncertain',  icon: '?', desc: 'Insufficient data' },
}

const STATUS_CONFIG = {
  LIKELY_ELIGIBLE:   { label: 'Strong Match',   color: 'var(--eligible)',   bg: 'var(--eligible-bg)',   border: 'var(--eligible-border)' },
  UNCERTAIN:         { label: 'Possible Match', color: 'var(--uncertain)',  bg: 'var(--uncertain-bg)',  border: 'var(--uncertain-border)' },
  LIKELY_INELIGIBLE: { label: 'Unlikely Match', color: 'var(--ineligible)', bg: 'var(--ineligible-bg)', border: 'var(--ineligible-border)' },
}

function ScoreRing({ score }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const color = score >= 75 ? 'var(--eligible)' : score >= 50 ? 'var(--uncertain)' : 'var(--ineligible)'
  const offset = circ - (score / 100) * circ

  return (
    <div style={{ position: 'relative', width: 136, height: 136 }}>
      <svg width="136" height="136" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="68" cy="68" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle
          cx="68" cy="68" r={r} fill="none"
          stroke={color} strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="score-arc"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span
          className="font-display"
          style={{ fontSize: 40, fontWeight: 600, color, lineHeight: 1 }}
        >
          {score}
        </span>
        <span style={{
          fontSize: 10, color: 'var(--text-hint)',
          fontFamily: 'var(--font-body)', letterSpacing: '0.07em', marginTop: 3,
        }}>
          MATCH SCORE
        </span>
      </div>
    </div>
  )
}

function CriterionRow({ criterion, index }) {
  const cfg = VERDICT_CONFIG[criterion.verdict] || VERDICT_CONFIG.UNCERTAIN

  return (
    <tr className="criteria-row" style={{ verticalAlign: 'top' }}>
      {/* Type badge */}
      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
        <span className={`badge ${criterion.type === 'inclusion' ? 'badge-primary' : 'badge-neutral'}`}
          style={{ fontSize: 10 }}>
          {criterion.type === 'inclusion' ? 'Include' : 'Exclude'}
        </span>
      </td>

      {/* Criterion text */}
      <td style={{ padding: '12px 14px', lineHeight: 1.55 }}>
        <span style={{ fontSize: 13.5, color: 'var(--text-mid)' }}>
          {criterion.criterion_text}
        </span>
      </td>

      {/* Verdict */}
      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
        <span className={`badge ${cfg.cls}`}>
          {cfg.icon} {cfg.label}
        </span>
      </td>

      {/* Reason */}
      <td style={{ padding: '12px 14px', lineHeight: 1.55 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {criterion.reason}
        </span>
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

  const eligibleCount  = breakdown.filter(c => c.verdict === 'ELIGIBLE').length
  const ineligibleCount = breakdown.filter(c => c.verdict === 'INELIGIBLE').length
  const uncertainCount  = breakdown.filter(c => c.verdict === 'UNCERTAIN').length

  return (
    <div className="animate-fade-up" style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px' }}>

      {/* Back button */}
      <button
        className="btn-ghost"
        onClick={onBack}
        style={{ marginBottom: 20, color: 'var(--primary)', fontWeight: 500 }}
      >
        ← Back to Results
      </button>

      {/* Hero card */}
      <div
        className="card-elevated"
        style={{
          marginBottom: 20,
          borderLeft: `4px solid ${statusCfg.color}`,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '28px 28px 24px', display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* Score ring */}
          <ScoreRing score={result.overall_score} />

          {/* Info */}
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span
                className="badge"
                style={{
                  background: statusCfg.bg,
                  color: statusCfg.color,
                  border: `1px solid ${statusCfg.border}`,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {statusCfg.label}
              </span>
              <span className="badge badge-neutral font-mono" style={{ fontSize: 10 }}>
                {result.nct_id}
              </span>
            </div>

            <h1
              className="font-display"
              style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 14 }}
            >
              {result.trial_title}
            </h1>

            {/* Summary */}
            <p style={{ fontSize: 14.5, color: 'var(--text-mid)', lineHeight: 1.7 }}>
              {result.summary}
            </p>
          </div>
        </div>

        {/* Verdict summary bar */}
        <div style={{
          borderTop: '1px solid var(--border-soft)',
          background: 'var(--surface-2)',
          padding: '14px 28px',
          display: 'flex', gap: 24, flexWrap: 'wrap',
        }}>
          {[
            { label: 'Criteria Met',    value: eligibleCount,   color: 'var(--eligible)' },
            { label: 'Criteria Not Met',value: ineligibleCount, color: 'var(--ineligible)' },
            { label: 'Uncertain',       value: uncertainCount,  color: 'var(--uncertain)' },
            { label: 'Total Criteria',  value: breakdown.length,color: 'var(--text-mid)' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                className="font-display"
                style={{ fontSize: 22, fontWeight: 600, color: s.color, lineHeight: 1 }}
              >
                {s.value}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Criteria breakdown */}
      <div className="card-elevated" style={{ marginBottom: 24, overflow: 'hidden' }}>
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
              Eligibility Breakdown
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Every criterion evaluated — nothing hidden. Uncertain means insufficient data, not ineligible.
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {['Type', 'Criterion', 'Verdict', 'Reasoning'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 14px', textAlign: 'left',
                      fontSize: 11, fontWeight: 600,
                      color: 'var(--text-muted)',
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      fontFamily: 'var(--font-body)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inclusionCriteria.length > 0 && (
                <>
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: '8px 14px',
                        background: 'var(--primary-light)',
                        fontSize: 11, fontWeight: 700,
                        color: 'var(--primary)',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                        fontFamily: 'var(--font-body)',
                        borderTop: '1px solid var(--border-soft)',
                      }}
                    >
                      Inclusion Criteria — must be met
                    </td>
                  </tr>
                  {inclusionCriteria.map((c, i) => (
                    <CriterionRow key={c.criterion_id} criterion={c} index={i} />
                  ))}
                </>
              )}
              {exclusionCriteria.length > 0 && (
                <>
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: '8px 14px',
                        background: '#FFF8F5',
                        fontSize: 11, fontWeight: 700,
                        color: '#C2410C',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                        fontFamily: 'var(--font-body)',
                        borderTop: '1px solid var(--border-soft)',
                      }}
                    >
                      Exclusion Criteria — must not be triggered
                    </td>
                  </tr>
                  {exclusionCriteria.map((c, i) => (
                    <CriterionRow key={c.criterion_id} criterion={c} index={i} />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-hint)', lineHeight: 1.6, marginBottom: 32 }}>
        This assessment is for informational purposes only and is not medical advice.
        Always consult a qualified healthcare professional before enrolling in a clinical trial.
      </p>
    </div>
  )
}
