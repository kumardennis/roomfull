import type { PredictionLiveTally } from '../../../core/types/domain'

type Props = {
  tally: PredictionLiveTally
}

export function PredictionLiveTallyCard({ tally }: Props) {
  const yesCount = tally.yes_count ?? 0
  const noCount = tally.no_count ?? 0
  const answered = tally.answered_count ?? 0
  const total = tally.total_participants ?? 0
  const yesPercent = tally.yes_percent ?? 0

  return (
    <section className="prediction-tally" aria-live="polite">
      <p className="prediction-tally__kicker">Room so far</p>
      <div className="prediction-tally__counts">
        <span className="prediction-tally__pill prediction-tally__pill--yes">
          {yesCount} Yes
        </span>
        <span className="prediction-tally__pill prediction-tally__pill--no">
          {noCount} No
        </span>
      </div>

      <div
        className="prediction-tally__bar"
        role="img"
        aria-label={`${yesPercent} percent yes`}
      >
        <div
          className="prediction-tally__bar-yes"
          style={{ width: `${answered > 0 ? yesPercent : 0}%` }}
        />
      </div>

      <p className="prediction-tally__meta">
        {yesPercent}% Yes · {answered} of {total} answered
      </p>

      {tally.leading_bucket ? (
        <p className="prediction-tally__bucket">
          If the round ended now, the room would land in{' '}
          <strong>{tally.leading_bucket}</strong>
        </p>
      ) : null}
    </section>
  )
}
