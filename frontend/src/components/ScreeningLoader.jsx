import { useState, useEffect } from 'react'

export default function ScreeningLoader({
  condition,
  maxTrials = 8,
  totalScreened = null,
  isDone = false,
}) {
  const [screened, setScreened]   = useState(0)
  const [phase, setPhase]         = useState('fetching')
  const [logLines, setLogLines]   = useState([`> CONDITION: "${condition}"`])

  const targetTotal = totalScreened ?? maxTrials

  useEffect(() => {
    if (isDone) {
      setScreened(targetTotal)
      setPhase('done')
      setLogLines(prev => [
        ...prev,
        `> SCREENING COMPLETE — ${targetTotal}/${targetTotal} TRIALS EVALUATED`,
        '> RANKING BY ELIGIBILITY SCORE...',
        '> DONE ✓',
      ])
      return
    }

    // Reset on new run
    setScreened(0)
    setPhase('fetching')
    setLogLines([`> CONDITION: "${condition}"`])

    const timeouts = []
    const push = (fn, ms) => timeouts.push(setTimeout(fn, ms))

    push(() => setLogLines(prev => [...prev, '> SEARCHING CLINICALTRIALS.GOV...']), 400)
    push(() => setLogLines(prev => [...prev, '> STATUS: 200 OK']), 1000)
    push(() => {
      setLogLines(prev => [...prev, `> TRIALS_FOUND: ${maxTrials}`])
      setPhase('matching')
    }, 1600)
    push(() => setLogLines(prev => [...prev, '> INITIALIZING ELIGIBILITY ENGINE...']), 2200)

    // Count up and emit a log line per trial
    let count = 0
    const countId = setInterval(() => {
      count++
      if (count > maxTrials) { clearInterval(countId); return }
      const n = count
      setScreened(n)
      setLogLines(prev => [
        ...prev.slice(-14),
        `> TRIAL_${String(n).padStart(2, '0')}: CRITERIA_PARSED — SCORING ELIGIBILITY...`,
      ])
    }, 550)

    return () => {
      timeouts.forEach(clearTimeout)
      clearInterval(countId)
    }
  }, [isDone, maxTrials, targetTotal, condition])

  const progressPct = isDone ? 100 : Math.min(100, Math.round((screened / maxTrials) * 100))

  const stages = [
    { key: 'FETCH_TRIALS',      done: phase !== 'fetching' || isDone },
    { key: 'PARSE_CRITERIA',    done: phase === 'matching'  || isDone },
    { key: 'SCORE_ELIGIBILITY', done: isDone },
  ]

  return (
    <div className="terminal-card animate-fade-in">
      {/* Header */}
      <div style={{
        background: 'var(--surface-2)',
        borderBottom: '1.5px solid var(--border-hard)',
        padding: '10px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          SCREENING_ENGINE · {isDone ? 'COMPLETE' : 'RUNNING'}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: isDone ? 'var(--eligible)' : 'var(--accent)', letterSpacing: '0.06em' }}>
          {screened}/{targetTotal}
        </span>
      </div>

      {/* Log output */}
      <div style={{
        padding: '20px',
        minHeight: 260,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 1.85,
        color: 'var(--text-muted)',
        overflow: 'hidden',
      }}>
        {logLines.map((line, i) => (
          <div key={i} style={{
            color:
              line.includes('COMPLETE') || line.includes('DONE') ? 'var(--eligible)' :
              line.includes('ERROR')    ? 'var(--ineligible)' :
              line.includes('STATUS')  || line.includes('FOUND') ? 'var(--accent)' :
              'var(--text-muted)',
          }}>
            {line}
          </div>
        ))}
        {!isDone && <span className="cursor-blink" />}
      </div>

      {/* Progress bar + stage indicators */}
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ height: 3, background: 'var(--border)', marginBottom: 12 }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: isDone ? 'var(--eligible)' : 'var(--accent)',
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 18 }}>
            {stages.map(s => (
              <span key={s.key} style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9, letterSpacing: '0.07em',
                color: s.done ? 'var(--text-mid)' : 'var(--text-hint)',
              }}>
                {s.done ? '▶' : '○'} {s.key}
              </span>
            ))}
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hint)', letterSpacing: '0.06em' }}>
            {progressPct}%
          </span>
        </div>
      </div>
    </div>
  )
}
