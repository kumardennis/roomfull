import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useChrome } from '../../chrome'
import { chatRealtimeBridge } from '../../features/chat/chat-realtime-bridge'
import { matchesOrchestrator } from '../../features/chat/orchestration/matches.orchestrator'
import { chatRtLog } from '../realtime/chat-realtime-debug'
import { realtimeService } from '../realtime/realtime.service'
import { authService } from '../session/auth.service'
import { participantStore } from '../session/participant-store'

function truncate(text: string, max = 48) {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

/**
 * App-wide social realtime: toasts for incoming vibes, matches, and chat messages
 * while the user is on any screen (play, opener, etc.).
 */
export function useAppNotifications() {
  const { showToast } = useChrome()
  const navigate = useNavigate()
  const location = useLocation()
  const pathnameRef = useRef(location.pathname)

  pathnameRef.current = location.pathname

  useEffect(() => {
    if (!participantStore.isCheckedIn()) return

    const participantId = participantStore.getId()
    if (!participantId) return

    let unsubscribe: (() => void) | undefined
    let cancelled = false

    void authService.bootstrapFromStore().then(async () => {
      if (cancelled) return
      unsubscribe = await realtimeService.subscribeSocialInbox(participantId, {
        onVibe(vibe) {
          if (vibe.status !== 'pending') return
          if (vibe.to_participant !== participantId) return
          if (pathnameRef.current === '/vibes') return

          showToast('Someone vibed you — tap to respond', () => {
            navigate('/vibes')
          })
        },

        onMatch(match) {
          if (match.participant_a !== participantId && match.participant_b !== participantId) {
            return
          }
          void matchesOrchestrator.refresh().catch(() => undefined)
          const pathname = pathnameRef.current
          if (pathname === `/chat/${match.id}` || pathname === '/matches') return

          showToast("It's a match! Tap to say hi", () => {
            navigate(`/chat/${match.id}`)
          })
        },

        onMessage(message) {
          chatRtLog('socialInbox: onMessage', {
            messageId: message.id,
            matchId: message.match_id,
            pathname: pathnameRef.current,
          })
          chatRealtimeBridge.dispatch(message)

          if (message.sender_id === participantId) return
          if (pathnameRef.current === `/chat/${message.match_id}`) return

          showToast(`New message: ${truncate(message.body)}`, () => {
            navigate(`/chat/${message.match_id}`)
          })
        },
      })
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [navigate, showToast])
}
