import { chatRepo } from '../repo/chat.repo'
import type { RealtimeMessage } from '../../../core/realtime/realtime.service'
import { chatRtLog } from '../../../core/realtime/chat-realtime-debug'
import { participantStore } from '../../../core/session/participant-store'
import { chatThreadStore } from '../store/chat-thread.store'

export const chatThreadOrchestrator = {
  setBody(body: string) {
    chatThreadStore.patch({ body })
  },

  async refreshMatch(matchId: string) {
    const allMatches = await chatRepo.getMatches()
    const match = allMatches.find((m) => m.match_id === matchId) ?? null
    chatThreadStore.patch({ match })
  },

  async refreshMessages(matchId: string) {
    chatRtLog('orchestrator: refreshMessages start', { matchId })
    const messages = await chatRepo.getMessages(matchId)
    chatRtLog('orchestrator: refreshMessages done', { matchId, count: messages.length })
    chatThreadStore.patch({ messages, error: null })
  },

  async handleIncomingMessage(matchId: string, row?: RealtimeMessage) {
    chatRtLog('orchestrator: handleIncomingMessage', {
      matchId,
      rowId: row?.id,
      hasRow: Boolean(row),
    })
    if (row) {
      chatThreadOrchestrator.appendRealtimeMessage(matchId, row)
    }
    await chatThreadOrchestrator.refreshMessages(matchId)
  },

  appendRealtimeMessage(matchId: string, row: RealtimeMessage) {
    if (row.match_id !== matchId) return

    const myId = participantStore.getId()
    const { messages } = chatThreadStore.getState()
    if (messages.some((message) => message.id === row.id)) return

    chatThreadStore.patch({
      messages: [
        ...messages,
        {
          id: row.id,
          sender_id: row.sender_id,
          body: row.body,
          sent_at: row.sent_at ?? new Date().toISOString(),
          is_mine: row.sender_id === myId,
        },
      ],
      error: null,
    })
  },

  async load(matchId: string) {
    await Promise.all([
      chatThreadOrchestrator.refreshMatch(matchId),
      chatThreadOrchestrator.refreshMessages(matchId),
    ])
  },

  async send(matchId: string) {
    const { body } = chatThreadStore.getState()
    if (!body.trim()) return

    chatRtLog('orchestrator: send start', { matchId, bodyLength: body.trim().length })
    chatThreadStore.patch({ sending: true, error: null })
    try {
      await chatRepo.sendMessage(matchId, body.trim())
      chatThreadStore.patch({ body: '' })
      await chatThreadOrchestrator.refreshMessages(matchId)
    } catch (err) {
      chatThreadStore.patch({
        error: err instanceof Error ? err.message : 'Could not send',
      })
    } finally {
      chatThreadStore.patch({ sending: false })
    }
  },

  reset() {
    chatThreadStore.reset()
  },
}
