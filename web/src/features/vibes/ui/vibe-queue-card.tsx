import type { IncomingVibe } from '../../../core/types/domain'
import { AnswerTrailCard } from '../../../core/ui/answer-trail-card'
import { VibeOrb } from '../../../core/ui/vibe-orb'

type Props = {
  vibe: IncomingVibe
  acting?: boolean
  onPass?: () => void
  onAccept?: () => void
}

export function VibeQueueCard({ vibe, acting = false, onPass, onAccept }: Props) {
  return (
    <article className="vibe-queue-card">
      <div className="vibe-queue-card__hero">
        <div className="vibe-queue-card__orb">
          <VibeOrb seed={vibe.avatar_seed} size="lg" />
        </div>
        <p className="vibe-queue-card__kicker">Sent you a vibe</p>
      </div>

      <div className="vibe-queue-card__trail">
        <AnswerTrailCard trail={vibe.answer_trail} title="Their answers tonight" />
      </div>

      <div className="vibe-queue-card__actions">
        <button
          className="vibe-queue-card__btn vibe-queue-card__btn--pass"
          type="button"
          disabled={acting}
          onClick={onPass}
        >
          Pass
        </button>
        <button
          className="vibe-queue-card__btn vibe-queue-card__btn--accept"
          type="button"
          disabled={acting}
          onClick={onAccept}
        >
          {acting ? '…' : 'Accept'}
        </button>
      </div>
    </article>
  )
}

export function VibeQueuePreviewCard() {
  return (
    <article className="vibe-queue-card vibe-queue-card--preview" aria-hidden>
      <div className="vibe-queue-card__orb vibe-queue-card__orb--preview">
        <VibeOrb seed="preview" size="lg" dim delay={-2} />
      </div>

      <p className="vibe-queue-card__message vibe-queue-card__message--preview">
        &ldquo;A patron across the room felt an enigmatic connection to your aura.&rdquo;
      </p>

      <div className="vibe-queue-card__actions vibe-queue-card__actions--preview">
        <div className="vibe-queue-card__btn vibe-queue-card__btn--pass" />
        <div className="vibe-queue-card__btn vibe-queue-card__btn--accept" />
      </div>
    </article>
  )
}
