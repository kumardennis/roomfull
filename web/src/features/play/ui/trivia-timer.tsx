const TIMER_CIRCUMFERENCE = 283

type Props = {
  secondsLeft: number | null
  totalSeconds?: number | null
}

export function formatTriviaTimer(seconds: number | null) {
  if (seconds === null) return '—:—'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function TriviaTimer({ secondsLeft, totalSeconds }: Props) {
  const total = totalSeconds && totalSeconds > 0 ? totalSeconds : null
  const fraction =
    secondsLeft !== null && total !== null ? Math.min(1, Math.max(0, secondsLeft / total)) : 0.75
  const dashOffset = TIMER_CIRCUMFERENCE * (1 - fraction)

  return (
    <div className="trivia-timer" aria-live="polite" aria-label="Time remaining">
      <svg className="trivia-timer__ring" viewBox="0 0 100 100" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="2"
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="#d4af37"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={TIMER_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          className="trivia-timer__progress"
        />
      </svg>
      <span className="trivia-timer__label">{formatTriviaTimer(secondsLeft)}</span>
    </div>
  )
}

export function roundDurationSeconds(opensAt: string, closesAt: string) {
  const duration = Math.round((new Date(closesAt).getTime() - new Date(opensAt).getTime()) / 1000)
  return duration > 0 ? duration : null
}
