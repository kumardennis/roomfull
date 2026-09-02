/** Dev-only: set VITE_CHAT_RT_DEBUG=true in .env to trace chat realtime. */
const CHAT_RT_DEBUG =
  import.meta.env.DEV && import.meta.env.VITE_CHAT_RT_DEBUG === 'true'

export function chatRtLog(step: string, data?: unknown) {
  if (!CHAT_RT_DEBUG) return
  if (data !== undefined) {
    console.log(`[chat-rt] ${step}`, data)
  } else {
    console.log(`[chat-rt] ${step}`)
  }
}
