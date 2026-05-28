/**
 * Queue.jsx — Top 10 ranked trial matches.
 * Receives results from POST /match and displays them ranked by overall_score.
 */

const STATUS_CONFIG = {
  LIKELY_ELIGIBLE:    { label: 'Strong Match',    cls: 'badge-eligible',   icon: '●' },
  UNCERTAIN:          { label: 'Possible Match',  cls: 'badge-uncertain',  icon: '◐' },
  LIKELY_INELIGIBLE:  { label: 'Unlikely Match',  cls: 'badge-ineligible', icon: '○' },
}

function ScoreArc({ score }) {
  const r = 32
  const circ = 2 * Math.PI * r
  const color = score >= 75 ? 'var(--eligible)' : score >= 50 ? 'var(--uncertain)' : 'var(--ineligible)'
  const offset = circ - (score / 100) * circ

  return (
    <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
      <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={color} strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="score-arc"
          style={{ transition: 'stroke-dashoffset 1.2s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span
          className="font-display"
          style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1 }}
        >
          {score}
        </span>
        <span style={{ fontSize: 8, color: 'var(--text-hint)', fontFamily: 'var(--font-body)', letterSpacing: '0.05em', marginTop: 1 }}>
          SCORE
        </span>
      </div>
    </div>
  )
}

function ResultCard({ result, rank, onClick }) {
  const statusCfg = STATUS_CONFIG[result.status] || STATUS_CONFIG.UNCERTAIN

  return (
    <div
      className="card animate-fade-up"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '18px 22px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s, border-color 0.15s',
        borderLeft: '3px solid transparent',
        animationDelay: `${rank * 55}ms`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.borderLeftColor = 'var(--primary)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderLeftColor = 'transparent'
      }}
      onClick={onClick}
    >
      {/* Rank */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: rank === 0 ? 'var(--primary)' : 'var(--surface-2)',
        color: rank === 0 ? '#fff' : 'var(--text-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, flexShrink: 0,
        fontFamily: 'var(--font-body)',
      }}>
        {rank + 1}
      </div>

      {/* Score arc */}
      <ScoreArc score={result.overall_score} />

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
          <span className={`badge ${statusCfg.cls}`}>
            {statusCfg.icon} {statusCfg.label}
          </span>
          <span className="badge badge-neutral font-mono" style={{ fontSize: 10 }}>
            {result.nct_id}
          </span>
        </div>

        <h3 style={{
          fontSize: 14.5, fontWeight: 600, color: 'var(--text)',
          marginBottom: 5, lineHeight: 1.35,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {result.trial_title}
        </h3>

        <p style={{
          fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
        }}>
          {result.summary}
        </p>
      </div>

      {/* CTA */}
      <div style={{ flexShrink: 0 }}>
        <span style={{
          fontSize: 12, color: 'var(--primary)', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 4,
          whiteSpace: 'nowrap',
        }}>
          View Analysis <span style={{ fontSize: 14 }}>→</span>
        </span>
      </div>
    </div>
  )
}

export default function Queue({ results, totalScreened, condition, onSelectResult, onStartOver }) {
  if (!results || results.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>No results found.</p>
        <button className="btn-secondary" onClick={onStartOver} style={{ marginTop: 16 }}>
          Start Over
        </button>
      </div>
    )
  }

  const eligibleCount  = results.filter(r => r.status === 'LIKELY_ELIGIBLE').length
  const uncertainCount = results.filter(r => r.status === 'UNCERTAIN').length

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px' }}>

      {/* Header */}
      <div className="animate-fade-up" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1
              className="font-display"
              style={{ fontSize: 34, fontWeight: 600, color: 'var(--text)', marginBottom: 6, lineHeight: 1.2 }}
            >
              Your Top Trial Matches
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Screened <strong style={{ color: 'var(--text-mid)' }}>{totalScreened} trials</strong> for <em>{condition}</em> · Showing top {results.length} by eligibility score
            </p>
          </div>
          <button className="btn-ghost" onClick={onStartOver} style={{ flexShrink: 0 }}>
            ← New Search
          </button>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
          {[
            { label: 'Trials Screened',   value: totalScreened,  color: 'var(--primary)' },
            { label: 'Strong Matches',    value: eligibleCount,  color: 'var(--eligible)' },
            { label: 'Possible Matches',  value: uncertainCount, color: 'var(--uncertain)' },
          ].map(stat => (
            <div
              key={stat.label}
              className="card"
              style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <span
                className="font-display"
                style={{ fontSize: 26, fontWeight: 600, color: stat.color, lineHeight: 1 }}
              >
                {stat.value}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Results list */}
      <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {results.map((result, idx) => (
          <ResultCard
            key={result.id}
            result={result}
            rank={idx}
            onClick={() => onSelectResult(result)}
          />
        ))}
      </div>

      <p style={{ textAlign: 'center', marginTop: 28, fontSize: 12, color: 'var(--text-hint)', lineHeight: 1.6 }}>
        Results are for informational purposes only and are not medical advice.
        Always consult a healthcare professional before enrolling in a clinical trial.
      </p>
    </div>
  )
}
