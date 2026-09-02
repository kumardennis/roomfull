import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { chatRtLog } from '../../../core/realtime/chat-realtime-debug'
import { authService } from '../../../core/session/auth.service'
import { realtimeService } from '../../../core/realtime/realtime.service'
import { participantStore } from '../../../core/session/participant-store'
import { chatRealtimeBridge } from '../chat-realtime-bridge'
import { chatThreadOrchestrator } from '../orchestration/chat-thread.orchestrator'
import { useChatThreadStore } from '../store/chat-thread.store'

export function useChatScreen() {
  const { matchId } = useParams()
  const navigate = useNavigate()

  const { match, messages, body, loading, sending, error } = useChatThreadStore(
    useShallow((s) => ({
      match: s.match,
      messages: s.messages,
      body: s.body,
      loading: s.loading,
      sending: s.sending,
      error: s.error,
    })),
  )

  useEffect(() => {
    if (!participantStore.isCheckedIn() || !matchId) {
      navigate('/join', { replace: true })
      return
    }

    void authService.bootstrapFromStore()

    chatThreadOrchestrator
      .load(matchId)
      .catch((err) => {
        useChatThreadStore.setState({
          error: err instanceof Error ? err.message : 'Could not load chat',
        })
      })
      .finally(() => {
        useChatThreadStore.setState({ loading: false })
      })

    return () => chatThreadOrchestrator.reset()
  }, [matchId, navigate])

  useEffect(() => {
    if (!matchId) return

    const onRealtimeMessage = (message: Parameters<typeof chatThreadOrchestrator.handleIncomingMessage>[1]) => {
      chatRtLog('useChatScreen: onRealtimeMessage', {
        matchId,
        messageId: message?.id,
        source: 'hook',
      })
      void chatThreadOrchestrator.handleIncomingMessage(matchId, message)
    }

    chatRtLog('useChatScreen: set active match', { matchId })
    chatRealtimeBridge.setActiveMatch(matchId, onRealtimeMessage)

    let unsubscribe: (() => void) | undefined
    let cancelled = false

    void authService
      .bootstrapFromStore()
      .then(() => {
        chatRtLog('useChatScreen: bootstrap done, subscribing', { matchId })
        return realtimeService.subscribeMatchChat(matchId, (message) => {
          onRealtimeMessage(message)
        })
      })
      .then((fn) => {
        if (!cancelled) {
          unsubscribe = fn
          chatRtLog('useChatScreen: subscribe ready', { matchId })
          useChatThreadStore.setState({ error: null })
        } else {
          chatRtLog('useChatScreen: subscribe cancelled before ready', { matchId })
          fn()
        }
      })
      .catch((err) => {
        chatRtLog('useChatScreen: subscribe failed', {
          matchId,
          error: err instanceof Error ? err.message : err,
        })
        useChatThreadStore.setState({
          error: err instanceof Error ? err.message : 'Live chat connection failed',
        })
      })

    return () => {
      cancelled = true
      chatRtLog('useChatScreen: cleanup', { matchId })
      chatRealtimeBridge.setActiveMatch(null, null)
      unsubscribe?.()
    }
  }, [matchId])

  async function send() {
    if (!matchId) return
    await chatThreadOrchestrator.send(matchId)
  }

  return {
    match,
    messages,
    body,
    setBody: chatThreadOrchestrator.setBody,
    loading,
    sending,
    error,
    send,
  }
}
