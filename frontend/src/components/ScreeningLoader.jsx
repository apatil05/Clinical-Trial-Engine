import { useState, useEffect } from 'react'

/**
 * ScreeningLoader — progress UI during bulk trial matching.
 * Uses a smooth estimate until the API returns, then snaps to totalScreened.
 */
export default function ScreeningLoader({
  condition,
  maxTrials = 8,
  totalScreened = null,
  isDone = false,
}) {
  const [screened, setScreened] = useState(0)
  const [phase, setPhase] = useState('searching')
  const [dots, setDots] = useState('')

  const targetTotal = totalScreened ?? maxTrials

  useEffect(() => {
    const id = setInterval(() => {
      setDots(d => (d.length >= 3 ? '' : d + '.'))
    }, 400)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (isDone) {
      setScreened(targetTotal)
      setPhase('done')
      return
    }

    setScreened(0)
    setPhase('searching')

    const searchTimer = setTimeout(() => setPhase('matching'), 1500)

    const interval = setInterval(() => {
      setScreened(prev => {
        if (prev >= maxTrials) {
          clearInterval(interval)
          return maxTrials
        }
        return prev + 1
      })
    }, 550)

    return () => {
      clearTimeout(searchTimer)
      clearInterval(interval)
    }
  }, [isDone, maxTrials, targetTotal])

  const progressPct = isDone
    ? 100
    : Math.min(100, Math.round((screened / maxTrials) * 100))

  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 480,
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent-light) 0%, var(--primary-light) 100%)',
          border: '2px solid var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 32,
          fontSize: 28,
        }}
        className={isDone ? '' : 'animate-pulse-ring'}
      >
        {isDone ? '✓' : '🔬'}
      </div>

      <h2
        className="font-display"
        style={{ fontSize: 28, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}
      >
        {isDone
          ? 'Screening Complete'
          : phase === 'searching'
          ? `Searching ClinicalTrials.gov${dots}`
          : `Screening Trials${dots}`}
      </h2>

      <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 36, lineHeight: 1.6 }}>
        {isDone
          ? `Screened ${targetTotal} trials for ${condition}. Showing your top matches.`
          : phase === 'searching'
          ? `Finding active recruiting trials for "${condition}"`
          : `Analyzing your eligibility for each trial`}
      </p>

      <div style={{ width: '100%', maxWidth: 420, marginBottom: 14 }}>
        <div style={{
          height: 6,
          background: 'var(--border)',
          borderRadius: 99,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: isDone
              ? 'var(--eligible)'
              : 'linear-gradient(90deg, var(--primary) 0%, var(--accent) 100%)',
            borderRadius: 99,
            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
      </div>

      {phase !== 'searching' && (
        <p
          className="font-mono"
          style={{ fontSize: 13, color: 'var(--text-muted)' }}
        >
          {isDone
            ? `${targetTotal} / ${targetTotal} trials screened`
            : `${screened} / ${maxTrials} trials screened`}
        </p>
      )}

      <div style={{
        display: 'flex', gap: 28, marginTop: 44,
        fontSize: 12, color: 'var(--text-hint)',
      }}>
        {[
          { label: 'Extract profile', done: true },
          { label: 'Search trials', done: phase !== 'searching' || isDone },
          { label: 'Score eligibility', done: isDone },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 16, height: 16, borderRadius: '50%',
              background: s.done ? 'var(--eligible)' : 'var(--border)',
              color: s.done ? '#fff' : 'transparent',
              fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.4s',
            }}>
              {s.done ? '✓' : ''}
            </span>
            <span style={{ color: s.done ? 'var(--text-mid)' : 'var(--text-hint)' }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
