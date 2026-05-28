import { useState, useEffect } from 'react'

/**
 * ScreeningLoader — animated loading state shown during bulk trial matching.
 * Fakes a per-trial progress counter that animates over ~20s,
 * then snaps to 100% when real results arrive.
 */
export default function ScreeningLoader({ condition, maxTrials = 20, isDone = false }) {
  const [screened, setScreened] = useState(0)
  const [phase, setPhase] = useState('searching') // 'searching' | 'matching' | 'done'
  const [dots, setDots] = useState('')

  // Animated ellipsis
  useEffect(() => {
    const id = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    return () => clearInterval(id)
  }, [])

  // Fake progress: 0 → maxTrials over ~20s, accelerating then slowing
  useEffect(() => {
    if (isDone) {
      setScreened(maxTrials)
      setPhase('done')
      return
    }

    // Phase 1: searching (0-2s)
    const searchTimer = setTimeout(() => setPhase('matching'), 2000)

    // Phase 2: counting up trials
    let count = 0
    const interval = setInterval(() => {
      if (count >= maxTrials - 1) {
        clearInterval(interval)
        return
      }
      // Variable speed: fast start, slow finish
      const progress = count / maxTrials
      const delay = progress < 0.6 ? 600 : 1200
      count++
      setScreened(count)
    }, 750)

    return () => {
      clearTimeout(searchTimer)
      clearInterval(interval)
    }
  }, [isDone, maxTrials])

  const progressPct = isDone ? 100 : Math.round((screened / maxTrials) * 100)

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
      {/* Animated orb */}
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

      {/* Status headline */}
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
          ? `Screened ${maxTrials} trials for ${condition}. Showing your top matches.`
          : phase === 'searching'
          ? `Finding active recruiting trials for "${condition}"`
          : `Analyzing your eligibility for each trial`}
      </p>

      {/* Progress bar */}
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

      {/* Counter */}
      {phase !== 'searching' && (
        <p
          className="font-mono"
          style={{ fontSize: 13, color: 'var(--text-muted)' }}
        >
          {isDone
            ? `${maxTrials} / ${maxTrials} trials screened`
            : `${screened} / ${maxTrials} trials screened`}
        </p>
      )}

      {/* Steps */}
      <div style={{
        display: 'flex', gap: 28, marginTop: 44,
        fontSize: 12, color: 'var(--text-hint)',
      }}>
        {[
          { label: 'Extract profile',   done: true },
          { label: 'Search trials',     done: phase !== 'searching' || isDone },
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
