import { type FormEvent, useEffect, useRef } from 'react'
import { useOpenerScreen } from '../hooks/use-opener-screen'

const TIMER_CIRCUMFERENCE = 283

function formatTimerLabel(seconds: number | null) {
  if (seconds === null) return '—'
  if (seconds <= 99) return String(seconds)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return secs > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : String(mins)
}

function OpenerTimer({ secondsLeft }: { secondsLeft: number | null }) {
  const initialSeconds = useRef<number | null>(null)

  useEffect(() => {
    if (secondsLeft !== null && initialSeconds.current === null) {
      initialSeconds.current = Math.max(secondsLeft, 1)
    }
  }, [secondsLeft])

  const fraction =
    secondsLeft !== null && initialSeconds.current !== null
      ? secondsLeft / initialSeconds.current
      : 1
  const dashOffset = TIMER_CIRCUMFERENCE * (1 - fraction)

  return (
    <div className="opener-timer" aria-live="polite" aria-label="Time remaining">
      <svg className="opener-timer__ring" viewBox="0 0 100 100" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="transparent"
          stroke="rgba(212, 175, 55, 0.15)"
          strokeWidth="2"
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="transparent"
          stroke="#d4af37"
          strokeWidth="2"
          strokeDasharray={TIMER_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          className="opener-timer__progress"
        />
      </svg>
      <span className="opener-timer__label">{formatTimerLabel(secondsLeft)}</span>
    </div>
  )
}

export function OpenerScreen() {
  const {
    prompt,
    options,
    answer,
    setAnswer,
    phase,
    startsIn,
    phaseSecondsLeft,
    loading,
    submitting,
    error,
    submit,
    selectOption,
    skip,
  } = useOpenerScreen()

  const waiting = phase === 'scheduled'
  const timerSeconds = waiting ? startsIn : phaseSecondsLeft

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void submit()
  }

  if (loading) {
    return (
      <div className="opener-screen">
        <div className="opener-screen__bg" aria-hidden />
        <main className="opener-main">
          <p className="opener-loading">Loading…</p>
        </main>
      </div>
    )
  }

  return (
    <div className="opener-screen">
      <div className="opener-screen__bg" aria-hidden />

      <main className="opener-main">
        <OpenerTimer secondsLeft={timerSeconds} />

        <article className="opener-card">
          <h1 className="opener-card__title">The Opener</h1>

          {waiting ? (
            <>
              <p className="opener-card__prompt">Doors open soon</p>
              <p className="opener-card__hint">
                You&apos;re checked in. Answer your opener as soon as trivia begins.
                {startsIn !== null ? ` Starting in about ${formatTimerLabel(startsIn)}.` : null}
              </p>
            </>
          ) : (
            <>
              <p className="opener-card__prompt">{prompt}</p>

              {options.length > 0 ? (
                <div className="opener-options">
                  {options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`opener-chip ${answer === option ? 'selected' : ''}`}
                      disabled={submitting}
                      onClick={() => void selectOption(option)}
                    >
                      <span>{option}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <form className="opener-fallback" onSubmit={handleSubmit}>
                  <label className="opener-fallback__field">
                    <span className="sr-only">Your answer</span>
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      rows={3}
                      placeholder="Say something real…"
                      disabled={submitting}
                    />
                  </label>
                  <button
                    className="opener-chip opener-chip--submit"
                    type="submit"
                    disabled={submitting || !answer.trim()}
                  >
                    {submitting ? 'Saving…' : 'Continue'}
                  </button>
                </form>
              )}
            </>
          )}

          {error ? <p className="opener-error">{error}</p> : null}
        </article>

        {!waiting ? (
          <button
            className="opener-skip"
            type="button"
            disabled={submitting}
            onClick={() => void skip()}
          >
            Skip for now
          </button>
        ) : null}
      </main>
    </div>
  )
}
