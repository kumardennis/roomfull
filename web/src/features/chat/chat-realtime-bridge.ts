import type { RealtimeMessage } from '../../core/realtime/realtime.service'
import { chatRtLog } from '../../core/realtime/chat-realtime-debug'

type MessageHandler = (message: RealtimeMessage) => void

let activeMatchId: string | null = null
let handler: MessageHandler | null = null

/** Lets the app-wide social inbox push messages into the open chat thread. */
export const chatRealtimeBridge = {
  setActiveMatch(matchId: string | null, onMessage: MessageHandler | null) {
    chatRtLog('bridge: setActiveMatch', { matchId, hasHandler: Boolean(onMessage) })
    activeMatchId = matchId
    handler = onMessage
  },

  dispatch(message: RealtimeMessage) {
    chatRtLog('bridge: dispatch', {
      activeMatchId,
      messageMatchId: message.match_id,
      messageId: message.id,
      willDispatch: Boolean(activeMatchId && message.match_id === activeMatchId && handler),
    })
    if (!activeMatchId || message.match_id !== activeMatchId) return
    handler?.(message)
  },
}
