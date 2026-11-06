import { useMemo } from 'react'
import { AnswerTrailCard } from '../../../core/ui/answer-trail-card'
import { VibeOrb } from '../../../core/ui/vibe-orb'
import type { LeaderboardEntry } from '../../../core/types/domain'
import { RoomfullChrome } from '../../../layout/roomfull-chrome'
import { usePlayScreen } from '../hooks/use-play-screen'
import { ANSWER_FILTER_PENDING } from '../store/play.store'
import { PredictionLiveTallyCard } from './prediction-live-tally'
import { roundDurationSeconds, TriviaTimer } from './trivia-timer'

function matchesAnswerFilter(entry: LeaderboardEntry, answerFilter: string | null) {
  if (!answerFilter) return true
  if (answerFilter === ANSWER_FILTER_PENDING) return !entry.last_answer
  return entry.last_answer === answerFilter
}

function formatQuestionFormat(format: string) {
  switch (format) {
    case 'this_or_that':
      return 'This or that'
    case 'hot_take':
      return 'Hot take'
    case 'prediction':
      return 'Prediction'
    case 'two_truths_one_lie':
      return 'Two truths, one lie'
    case 'superlative':
      return 'Who in the room'
    case 'red_flag_green_flag':
      return 'Red or green'
    default:
      return format
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
  }
}

function formatHint(format: string): string | null {
  switch (format) {
    case 'two_truths_one_lie':
      return 'Which one is the lie?'
    case 'superlative':
      return 'Pick someone else in the room.'
    default:
      return null
  }
}

function formatCountdown(seconds: number | null) {
  if (seconds === null) return null
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

function formatScore(score: number) {
  if (score === 1) return '1 pt'
  return `${score} pt`
}

const SELF_REPORT_YES_NO = ['Yes', 'No'] as const

function leadersTitle(canVibe: boolean, showScores: boolean) {
  if (showScores) return 'Leaderboard'
  if (canVibe) return 'Tap someone to vibe'
  return 'In the room'
}

function isScoredRound(question: { is_scored?: boolean } | undefined) {
  return question?.is_scored === true
}

function heroTitle(phase: string | undefined) {
  if (phase === 'round_interstitial') return 'Round Break'
  if (phase === 'social') return 'Social Hour'
  if (phase === 'ended') return 'Night Over'
  return "Tonight's Trivia"
}

export function PlayScreen() {
  const {
    state,
    leaderboard,
    leaderboardFilter,
    answerFilter,
    setAnswerFilter,
    expandedId,
    trail,
    chosenOption,
    selfReport,
    setSelfReport,
    loading,
    submitting,
    vibing,
    error,
    secondsLeft,
    phaseSecondsLeft,
    waitingForNextRound,
    expandParticipant,
    selectOption,
    submitAnswer,
    sendVibe,
    predictionTally,
  } = usePlayScreen()

  const round = state?.open_round
  const hasAnswered = Boolean(round?.my_answer)
  const phase = state?.session.phase
  const progress = state?.session.round_progress
  const lockedAnswer = round?.my_answer?.chosen_option ?? chosenOption
  const lockedSelfReport = round?.my_answer?.self_report_value ?? selfReport
  const needsSelfReport = Boolean(round?.question.self_report_prompt)
  const canSubmitPrediction =
    needsSelfReport && Boolean(chosenOption) && Boolean(lockedSelfReport.trim())

  const roundDuration = useMemo(() => {
    if (!round) return null
    return roundDurationSeconds(round.opens_at, round.closes_at)
  }, [round])

  const timerSeconds =
    phase === 'round_live' && round
      ? secondsLeft
      : phase === 'opener' || phase === 'scheduled' || phase === 'round_interstitial'
        ? phaseSecondsLeft
        : null

  const timerTotal =
    phase === 'round_live' && round ? roundDuration : null

  const filteredLeaderboard = useMemo(
    () => leaderboard.filter((entry) => matchesAnswerFilter(entry, answerFilter)),
    [leaderboard, answerFilter],
  )

  const topLeaders = filteredLeaderboard.slice(0, 3)
  const canVibe = phase === 'round_interstitial' || phase === 'social'
  const hasAnyScore = leaderboard.some((entry) => entry.score > 0)
  const showLeaderboardScores = Boolean(
    state?.session.leaderboard_scoring &&
      (isScoredRound(round?.question) || hasAnyScore),
  )

  function renderRosterEntry(
    entry: (typeof leaderboard)[number],
    index: number,
    options?: { button?: boolean; onClick?: () => void },
  ) {
    const row = (
      <>
        <div className="trivia-leader-row__identity">
          {showLeaderboardScores ? (
            <span className="trivia-leader-row__rank">{index + 1}</span>
          ) : null}
          <VibeOrb seed={entry.avatar_seed} />
          <span className="trivia-leader-row__handle">{entry.handle}</span>
        </div>
        {showLeaderboardScores ? (
          <span className="trivia-leader-row__score">{formatScore(entry.score)}</span>
        ) : entry.last_answer ? (
          <span className="trivia-leader-row__answer">{entry.last_answer}</span>
        ) : null}
      </>
    )

    const className = `trivia-leader-row${
      showLeaderboardScores && index === 0 ? ' trivia-leader-row--first' : ''
    }${entry.is_me ? ' trivia-leader-row--me' : ''}${options?.button ? ' trivia-leader-row--button' : ''}`

    if (options?.button) {
      return (
        <button className={className} type="button" onClick={options.onClick}>
          {row}
        </button>
      )
    }

    return <div className={className}>{row}</div>
  }

  function renderAnswerFilters() {
    if (!leaderboardFilter?.options.length) return null

    const pendingCount = leaderboard.filter((entry) => !entry.last_answer).length

    return (
      <div className="trivia-answer-filters" role="group" aria-label="Filter by last answer">
        <button
          type="button"
          className={`trivia-answer-filter${answerFilter === null ? ' trivia-answer-filter--active' : ''}`}
          onClick={() => setAnswerFilter(null)}
        >
          All
        </button>
        {leaderboardFilter.options.map((option) => (
          <button
            key={option}
            type="button"
            className={`trivia-answer-filter${answerFilter === option ? ' trivia-answer-filter--active' : ''}`}
            onClick={() => setAnswerFilter(option)}
          >
            {option}
          </button>
        ))}
        {pendingCount > 0 ? (
          <button
            type="button"
            className={`trivia-answer-filter${answerFilter === ANSWER_FILTER_PENDING ? ' trivia-answer-filter--active' : ''}`}
            onClick={() => setAnswerFilter(ANSWER_FILTER_PENDING)}
          >
            Waiting
          </button>
        ) : null}
      </div>
    )
  }

  function renderRosterSection(options: { entries: LeaderboardEntry[]; expandable?: boolean }) {
    const { entries, expandable = false } = options
    if (entries.length === 0 && !leaderboardFilter) return null

    return (
      <section className="trivia-leaders">
        <h3 className="trivia-leaders__title">{leadersTitle(canVibe, showLeaderboardScores)}</h3>
        {renderAnswerFilters()}
        <div className="trivia-glass-card trivia-glass-card--compact">
          {entries.length === 0 ? (
            <p className="trivia-answer-filters__empty">No one picked that answer.</p>
          ) : expandable ? (
            <ul className="trivia-leaderboard-list">
              {entries.map((entry, index) => (
                <li key={entry.participant_id}>
                  {renderRosterEntry(entry, index, {
                    button: true,
                    onClick: () => void expandParticipant(entry.participant_id),
                  })}

                  {expandedId === entry.participant_id && trail ? (
                    <div className="trivia-expand-panel">
                      <AnswerTrailCard
                        trail={trail}
                        showSendVibe={!entry.is_me}
                        vibing={vibing}
                        onSendVibe={() => void sendVibe(entry.participant_id)}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            entries.map((entry, index) => (
              <div key={entry.participant_id}>{renderRosterEntry(entry, index)}</div>
            ))
          )}
        </div>
        {answerFilter && entries.length > 0 ? (
          <p className="trivia-answer-filters__count">
            {entries.length} of {leaderboard.length} in the room
          </p>
        ) : null}
      </section>
    )
  }

  function renderStatusCard(title: string, body: string) {
    return (
      <section className="trivia-glass-card trivia-glass-card--status">
        <h2 className="trivia-glass-card__status-title">{title}</h2>
        <p className="trivia-glass-card__status-body">{body}</p>
      </section>
    )
  }

  function renderPhaseContent() {
    if (phase === 'scheduled') {
      return renderStatusCard(
        'Doors open soon',
        `You're checked in. Trivia starts automatically${
          phaseSecondsLeft !== null ? ` in ${formatCountdown(phaseSecondsLeft)}` : ' soon'
        }.`,
      )
    }

    if (phase === 'opener') {
      if (state?.participant.needs_opener) {
        return renderStatusCard(
          'Opener is live',
          'Head to the opener screen to answer tonight’s icebreaker.',
        )
      }

      const answer = state?.participant.opener_answer
      return renderStatusCard(
        'Opener locked in',
        answer
          ? `You answered “${answer}”. Rounds start when the opener window closes${
              phaseSecondsLeft !== null ? ` (${formatCountdown(phaseSecondsLeft)} left)` : ''
            }.`
          : `You're set. Rounds start when the opener window closes${
              phaseSecondsLeft !== null ? ` (${formatCountdown(phaseSecondsLeft)} left)` : ''
            }.`,
      )
    }

    if (phase === 'round_interstitial') {
      return (
        <>
          {renderStatusCard(
            'Time to vibe',
            `The round is over. Tap a handle below to see their answer trail and send a vibe. Next round starts${
              phaseSecondsLeft !== null ? ` in ${formatCountdown(phaseSecondsLeft)}` : ' soon'
            }.`,
          )}
          {progress ? (
            <p className="trivia-meta-line">
              Round {progress.current} of {progress.total} complete.
            </p>
          ) : null}
        </>
      )
    }

    if (phase === 'social') {
      return renderStatusCard(
        'Rounds are done',
        'Keep vibing and chatting while the night winds down.',
      )
    }

    if (phase === 'ended') {
      return renderStatusCard('Session ended', 'Thanks for playing tonight.')
    }

    if (!round) {
      return renderStatusCard('Stand by', 'The next round is about to start.')
    }

    if (waitingForNextRound) {
      return (
        <>
          {renderStatusCard(
            'Wait for the next round',
            `This round started before you joined. It ends${
              secondsLeft !== null ? ` in ${formatCountdown(secondsLeft)}` : ' soon'
            }. You'll play from the next one.`,
          )}
          {topLeaders.length > 0 || leaderboardFilter
            ? renderRosterSection({ entries: topLeaders })
            : null}
        </>
      )
    }

    return (
      <>
        <section className="trivia-glass-card">
          <div className="trivia-question-meta">
            <span>
              Question {round.round_number}
              {progress ? ` / ${progress.total}` : ''}
            </span>
            <span>{formatQuestionFormat(round.question.format)}</span>
          </div>

          <p className="trivia-question-prompt">{round.question.prompt}</p>

          {formatHint(round.question.format) ? (
            <p className="trivia-format-hint">{formatHint(round.question.format)}</p>
          ) : null}

          {(round.question.options ?? []).length === 0 ? (
            <p className="trivia-format-hint">
              {round.question.format === 'superlative'
                ? 'Need more people in the room before you can vote.'
                : 'No options for this round yet.'}
            </p>
          ) : (
            <div className="trivia-options">
              {(round.question.options ?? []).map((option) => {
                const isSelected = lockedAnswer === option
                const isLocked = hasAnswered

                return (
                  <button
                    key={option}
                    type="button"
                    className={`trivia-option${isSelected ? ' trivia-option--selected' : ''}${
                      isLocked && !isSelected ? ' trivia-option--dimmed' : ''
                    }`}
                    disabled={submitting || isLocked}
                    onClick={() => void selectOption(option)}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          )}

          {!hasAnswered && needsSelfReport ? (
            <>
              <div className="trivia-self-report">
                <span>{round.question.self_report_prompt}</span>
                <div className="trivia-self-report__options" role="group" aria-label="Your answer">
                  {SELF_REPORT_YES_NO.map((option) => {
                    const isSelected = lockedSelfReport === option

                    return (
                      <button
                        key={option}
                        type="button"
                        className={`trivia-option trivia-option--compact${
                          isSelected ? ' trivia-option--selected' : ''
                        }`}
                        disabled={submitting}
                        onClick={() => setSelfReport(option)}
                      >
                        {option}
                      </button>
                    )
                  })}
                </div>
              </div>

              {!chosenOption ? (
                <p className="trivia-self-report-hint">Pick a prediction bucket above.</p>
              ) : !lockedSelfReport.trim() ? (
                <p className="trivia-self-report-hint">
                  Tap Yes or No for yourself — then submit.
                </p>
              ) : null}

              <button
                className="btn primary trivia-submit"
                type="button"
                disabled={!canSubmitPrediction || submitting}
                onClick={() => void submitAnswer()}
              >
                {submitting ? 'Submitting…' : 'Submit answer'}
              </button>
            </>
          ) : null}

          {hasAnswered ? (
            <>
              <p className="trivia-locked-note">
                Answer locked in.
                {showLeaderboardScores
                  ? ' Scores lock in when the round ends.'
                  : ' No points this round — your answer feeds your trail for vibes.'}
              </p>
              {round.question.format === 'prediction' && predictionTally && !predictionTally.locked ? (
                <PredictionLiveTallyCard tally={predictionTally} />
              ) : null}
            </>
          ) : null}
        </section>

        {topLeaders.length > 0 || leaderboardFilter
          ? renderRosterSection({ entries: topLeaders })
          : null}
      </>
    )
  }

  function renderExpandedLeaderboard() {
    if (!canVibe || (leaderboard.length === 0 && !leaderboardFilter)) return null

    return renderRosterSection({ entries: filteredLeaderboard, expandable: true })
  }

  return (
    <RoomfullChrome activeTab="trivia">
      <main className="trivia-main">
        <section className="trivia-hero">
          <h1 className="trivia-hero__title">{heroTitle(phase)}</h1>
          <TriviaTimer secondsLeft={timerSeconds} totalSeconds={timerTotal} />
        </section>

        {loading ? (
          <p className="trivia-loading">Loading…</p>
        ) : (
          <>
            {state?.session.paused ? (
              <section className="trivia-paused-banner">Session paused by the venue. Hang tight.</section>
            ) : null}

            {renderPhaseContent()}
            {renderExpandedLeaderboard()}
          </>
        )}

        {error ? <p className="trivia-error">{error}</p> : null}
      </main>
    </RoomfullChrome>
  )
}
