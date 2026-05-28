const STATUS_CONFIG = {
  LIKELY_ELIGIBLE:   { label: 'Strong Match',   cls: 'badge-eligible',   char: '●' },
  UNCERTAIN:         { label: 'Possible Match', cls: 'badge-uncertain',  char: '◐' },
  LIKELY_INELIGIBLE: { label: 'Unlikely Match', cls: 'badge-ineligible', char: '○' },
}

function ScoreBar({ score }) {
  const color = score >= 75 ? 'var(--eligible)' : score >= 50 ? 'var(--uncertain)' : 'var(--ineligible)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <div style={{ width: 52, height: 3, background: 'var(--border)', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, transition: 'width 1s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500, color, lineHeight: 1, minWidth: 30 }}>
        {score}
      </span>
    </div>
  )
}

function coveragePct(breakdown) {
  if (!breakdown || breakdown.length === 0) return null
  const evaluable = breakdown.filter(c => c.verdict !== 'UNCERTAIN').length
  return Math.round((evaluable / breakdown.length) * 100)
}

function ResultRow({ result, rank, onClick }) {
  const statusCfg = STATUS_CONFIG[result.status] || STATUS_CONFIG.UNCERTAIN
  const coverage = coveragePct(result.criteria_breakdown)

  return (
    <div
      className="animate-fade-up"
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 88px 1fr 52px',
        alignItems: 'center',
        gap: 20,
        padding: '15px 20px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background 0.12s',
        background: 'var(--surface)',
        animationDelay: `${rank * 60}ms`,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
    >
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: rank === 0 ? 'var(--accent)' : 'var(--text-hint)',
        fontWeight: rank === 0 ? 600 : 400,
        letterSpacing: '0.04em',
      }}>
        {String(rank + 1).padStart(2, '0')}
      </span>

      <ScoreBar score={result.overall_score} />

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span className={`badge ${statusCfg.cls}`}>{statusCfg.char} {statusCfg.label}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.05em' }}>
            {result.nct_id}
          </span>
        </div>
        <h3 style={{
          fontSize: 13.5, fontWeight: 500, color: 'var(--text)', lineHeight: 1.4, marginBottom: 2,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
        }}>
          {result.trial_title}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{
            fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
            flex: 1,
          }}>
            {result.summary}
          </p>
          {coverage !== null && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, flexShrink: 0,
              letterSpacing: '0.07em', whiteSpace: 'nowrap',
              color: coverage >= 70 ? 'var(--eligible)' : coverage >= 40 ? 'var(--uncertain)' : 'var(--ineligible)',
            }}>
              {coverage}% DATA
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hint)' }}>→</span>
        <a
          href={`https://clinicaltrials.gov/study/${result.nct_id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 8,
            color: 'var(--accent)', letterSpacing: '0.07em',
            textDecoration: 'none', borderBottom: '1px solid var(--accent)',
            lineHeight: 1, paddingBottom: 1,
            whiteSpace: 'nowrap',
          }}
        >
          CTGOV ↗
        </a>
      </div>
    </div>
  )
}

export default function Queue({ results, totalScreened, condition, onSelectResult, onStartOver }) {
  if (!results || results.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>NO_RESULTS_FOUND</p>
        <button className="btn-secondary" onClick={onStartOver} style={{ marginTop: 20 }}>Start Over</button>
      </div>
    )
  }

  const eligibleCount  = results.filter(r => r.status === 'LIKELY_ELIGIBLE').length
  const uncertainCount = results.filter(r => r.status === 'UNCERTAIN').length

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 40px 0' }}>

      {/* Header */}
      <div className="animate-fade-up" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              STEP_04 / MATCH_RESULTS
            </p>
            <h1 className="font-display" style={{ fontSize: 44, fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>
              Your top trial matches.
            </h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              {totalScreened} trials screened for "{condition}" · top {results.length} shown
            </p>
          </div>
          <button className="btn-ghost" onClick={onStartOver}>← New Search</button>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          {[
            { label: 'Trials Screened',  value: totalScreened,  color: 'var(--text)' },
            { label: 'Strong Matches',   value: eligibleCount,  color: 'var(--eligible)' },
            { label: 'Possible Matches', value: uncertainCount, color: 'var(--uncertain)' },
          ].map((stat, i) => (
            <div key={stat.label} style={{
              padding: '16px 28px',
              borderRight: i < 2 ? '1px solid var(--border)' : 'none',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500, color: stat.color, lineHeight: 1 }}>
                {stat.value}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3, maxWidth: 90 }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="terminal-card">
        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: '32px 88px 1fr 52px',
          gap: 20, padding: '9px 20px',
          borderBottom: '1.5px solid var(--border-hard)',
          background: 'var(--surface-2)',
        }}>
          {['#', 'SCORE', 'TRIAL', ''].map(h => (
            <span key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-hint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {h}
            </span>
          ))}
        </div>

        {results.map((result, idx) => (
          <ResultRow key={result.id} result={result} rank={idx} onClick={() => onSelectResult(result)} />
        ))}
      </div>

      <p style={{ textAlign: 'center', marginTop: 24, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.05em', lineHeight: 1.7 }}>
        // FOR INFORMATIONAL PURPOSES ONLY — NOT MEDICAL ADVICE
      </p>
    </div>
  )
}
