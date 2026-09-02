import { Link } from 'react-router-dom'
import { VibeOrb } from '../../../core/ui/vibe-orb'
import { RoomfullChrome } from '../../../layout/roomfull-chrome'
import type { MatchSummary } from '../../../core/types/domain'
import { useMatchesScreen } from '../hooks/use-matches-screen'

function revealLabel(stage: MatchSummary['reveal_stage']) {
  if (stage === 'revealed') return 'Revealed'
  if (stage === 'blurred') return 'Blurred'
  return 'Anonymous'
}

export function MatchesScreen() {
  const { matches, loading, error } = useMatchesScreen()

  return (
    <RoomfullChrome activeTab="chat" variant="chat">
      <main className="chat-matches-main">
        <header className="chat-page-header">
          <h1 className="chat-page-header__title">Your Chats</h1>
          <p className="chat-page-header__subtitle">Mutual matches from tonight</p>
        </header>

        {loading ? (
          <p className="chat-page-loading">Loading…</p>
        ) : matches.length === 0 ? (
          <section className="chat-empty">
            <div className="trivia-glass-card chat-empty__card">
              <p>No matches yet.</p>
              <p className="chat-empty__hint">
                Send vibes from the leaderboard during round breaks — when you both vibe, you can chat here.
              </p>
            </div>
          </section>
        ) : (
          <ul className="chat-match-list">
            {matches.map((match) => (
              <li key={match.match_id}>
                <Link className="chat-match-row trivia-glass-card trivia-glass-card--compact" to={`/chat/${match.match_id}`}>
                  <div className={`chat-match-row__avatar reveal-${match.reveal_stage}`}>
                    <VibeOrb seed={match.other_participant.avatar_seed} />
                  </div>
                  <span className="chat-match-row__body">
                    <strong className="chat-match-row__handle">{match.other_participant.handle}</strong>
                    <span className="chat-match-row__meta">{revealLabel(match.reveal_stage)}</span>
                  </span>
                  <span className="chat-match-row__chevron" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {error ? <p className="chat-page-error">{error}</p> : null}
      </main>
    </RoomfullChrome>
  )
}
