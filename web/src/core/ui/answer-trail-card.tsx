import type { AnswerTrail } from '../types/domain'
import { VibeOrb } from './vibe-orb'

type TrailSegment = {
  key: string
  label: string
  prompt: string
  answer: string
  meta?: string
}

type Props = {
  trail: AnswerTrail
  title?: string
  onSendVibe?: () => void
  vibing?: boolean
  showSendVibe?: boolean
}

function buildSegments(trail: AnswerTrail): TrailSegment[] {
  const segments: TrailSegment[] = []

  if (trail.opener) {
    segments.push({
      key: 'opener',
      label: 'Opener',
      prompt: trail.opener.prompt,
      answer: trail.opener.answer ?? '—',
    })
  }

  for (const round of trail.rounds) {
    segments.push({
      key: `round-${round.round_number}`,
      label: `Round ${round.round_number}`,
      prompt: round.prompt,
      answer: round.chosen_option,
      meta: round.self_report_value ? `Self-report: ${round.self_report_value}` : undefined,
    })
  }

  return segments
}

export function AnswerTrailCard({
  trail,
  title = 'The Connection',
  onSendVibe,
  vibing = false,
  showSendVibe = false,
}: Props) {
  const segments = buildSegments(trail)

  return (
    <div className="trail-connection">
      <header className="trail-connection__header">
        <h3 className="trail-connection__title">{title}</h3>
        <p className="trail-connection__handle">{trail.handle}</p>
      </header>

      {segments.length === 0 ? (
        <p className="trail-connection__empty">No answers yet tonight.</p>
      ) : (
        <div className="trail-connection__list">
          {segments.map((segment, index) => (
            <article className="trail-glass-card" key={segment.key}>
              <div className="trail-glass-card__meta">
                <VibeOrb seed={trail.avatar_seed} dim={index > 0} />
                <span className="trail-glass-card__label">{segment.label}</span>
              </div>
              <p className="trail-glass-card__prompt">{segment.prompt}</p>
              <p className="trail-glass-card__answer">&ldquo;{segment.answer}&rdquo;</p>
              {segment.meta ? <p className="trail-glass-card__meta-line">{segment.meta}</p> : null}
            </article>
          ))}
        </div>
      )}

      {showSendVibe && onSendVibe ? (
        <div className="trail-connection__actions">
          <button
            className="btn-vibe-pill"
            type="button"
            disabled={vibing}
            onClick={onSendVibe}
          >
            <span className="btn-vibe-pill__icon" aria-hidden>
              ✦
            </span>
            {vibing ? 'Sending…' : 'Send a Vibe'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
