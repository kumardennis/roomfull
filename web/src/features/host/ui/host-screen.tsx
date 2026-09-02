import { AppLayout } from '../../../layout'
import { useHostScreen } from '../hooks/use-host-screen'

function formatPhase(phase: string | undefined) {
  return (phase ?? 'unknown').replaceAll('_', ' ')
}

export function HostScreen() {
  const {
    hostPin,
    setHostPin,
    sessionId,
    setSessionId,
    session,
    loading,
    error,
    loadSession,
    pause,
    resume,
    forceEnd,
    devReset,
    devTick,
    devSkipWait,
    devEndRoundSoon,
  } = useHostScreen()

  const canSkipBreak =
    session != null &&
    (session.phase === 'opener' ||
      session.phase === 'round_interstitial' ||
      session.phase === 'scheduled')
  const canEndRoundSoon = session?.phase === 'round_live'

  return (
    <AppLayout title="Host" subtitle="Emergency controls only" showNav={false}>
      <div className="stack">
        <label className="field">
          <span>Session ID</span>
          <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
        </label>

        <label className="field">
          <span>Host PIN</span>
          <input value={hostPin} onChange={(e) => setHostPin(e.target.value)} />
        </label>

        <button className="btn ghost" type="button" onClick={() => void loadSession()} disabled={loading}>
          Refresh
        </button>

        {session ? (
          <section className="card stack">
            <p>
              <strong>{formatPhase(session.phase)}</strong>
              {session.paused ? ' · paused' : ''}
            </p>
            <p className="muted">
              {session.participant_count} checked in · round {session.round_progress.current}/
              {session.round_progress.total}
            </p>

            <div className="btn-row">
              {session.paused ? (
                <button className="btn primary" type="button" onClick={() => void resume()} disabled={loading}>
                  Resume auto-run
                </button>
              ) : (
                <button className="btn ghost" type="button" onClick={() => void pause()} disabled={loading}>
                  Pause
                </button>
              )}
              <button className="btn ghost" type="button" onClick={() => void forceEnd()} disabled={loading}>
                End session
              </button>
            </div>

            {session.round_plan.length > 0 ? (
              <div>
                <p className="muted">System round plan</p>
                <ul className="plain-list">
                  {session.round_plan.map((item) => (
                    <li key={item.position}>
                      {item.position + 1}. [{item.format}] {item.prompt}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="card stack">
          <h2>Dev tools</h2>
          <p className="muted">
            Reset rewinds to opener (2 min breaks). Skip break ends opener or vibe-window
            timers early. End round soon shortens the live trivia timer. Each runs one FSM
            tick after shortening.
          </p>
          <div className="btn-row">
            <button
              className="btn primary"
              type="button"
              disabled={loading || !sessionId || !hostPin}
              onClick={() => void devReset()}
            >
              Reset session
            </button>
            <button
              className="btn ghost"
              type="button"
              disabled={loading || !sessionId || !hostPin || !canSkipBreak}
              onClick={() => void devSkipWait()}
            >
              Skip break + tick
            </button>
            <button
              className="btn ghost"
              type="button"
              disabled={loading || !sessionId || !hostPin || !canEndRoundSoon}
              onClick={() => void devEndRoundSoon()}
            >
              End round soon + tick
            </button>
            <button
              className="btn ghost"
              type="button"
              disabled={loading || !sessionId || !hostPin}
              onClick={() => void devTick()}
            >
              Run FSM tick
            </button>
          </div>
        </section>

        {error ? <p className="error">{error}</p> : null}
      </div>
    </AppLayout>
  )
}
