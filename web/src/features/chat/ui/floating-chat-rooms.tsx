import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { VibeOrb } from '../../../core/ui/vibe-orb'
import { realtimeService } from '../../../core/realtime/realtime.service'
import { participantStore } from '../../../core/session/participant-store'
import { matchesOrchestrator } from '../orchestration/matches.orchestrator'
import { useMatchesStore } from '../store/matches.store'

const MAX_VISIBLE = 3

/** App-wide floating chat-room heads (top-right), visible on every checked-in screen. */
export function FloatingChatRooms() {
  const navigate = useNavigate()
  const location = useLocation()
  const matches = useMatchesStore(useShallow((s) => s.matches))
  const checkedIn = participantStore.isCheckedIn()

  useEffect(() => {
    if (!checkedIn) return

    void matchesOrchestrator.refresh().catch(() => undefined)
  }, [checkedIn, location.pathname])

  useEffect(() => {
    if (!checkedIn) return

    let unsubscribe: (() => void) | undefined
    void realtimeService
      .onMatchChange(() => {
        void matchesOrchestrator.refresh().catch(() => undefined)
      })
      .then((fn) => {
        unsubscribe = fn
      })

    return () => unsubscribe?.()
  }, [checkedIn])

  if (!checkedIn || matches.length === 0) return null

  const visible = matches.slice(0, MAX_VISIBLE)
  const overflow = matches.length - visible.length
  const activeMatchId = location.pathname.startsWith('/chat/')
    ? location.pathname.slice('/chat/'.length)
    : null

  return (
    <div className="floating-chats" aria-label="Chat rooms">
      {visible.map((match) => {
        const active = match.match_id === activeMatchId
        return (
          <button
            key={match.match_id}
            type="button"
            className={`floating-chats__head${active ? ' floating-chats__head--active' : ''} reveal-${match.reveal_stage}`}
            onClick={() => navigate(`/chat/${match.match_id}`)}
            aria-label={`Chat with ${match.other_participant.handle}`}
            title={match.other_participant.handle}
            aria-current={active ? 'page' : undefined}
          >
            <VibeOrb seed={match.other_participant.avatar_seed} />
          </button>
        )
      })}
      {overflow > 0 ? (
        <Link className="floating-chats__more" to="/matches" aria-label={`See ${overflow} more chats`}>
          +{overflow}
        </Link>
      ) : null}
    </div>
  )
}
