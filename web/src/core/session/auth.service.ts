import { supabase } from '../supabase/client'
import { callRpc } from '../supabase/rpc'
import { chatRtLog } from '../realtime/chat-realtime-debug'
import { participantStore } from './participant-store'

let realtimeAuthHooked = false

function hookRealtimeAuth() {
  if (realtimeAuthHooked) return
  realtimeAuthHooked = true

  supabase.auth.onAuthStateChange((_event, session) => {
    void supabase.realtime.setAuth(session?.access_token ?? null)
  })
}

export const authService = {
  hookRealtimeAuth,

  async syncRealtimeAuth() {
    hookRealtimeAuth()
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token ?? null
    chatRtLog('auth: syncRealtimeAuth', { hasToken: Boolean(token), userId: data.session?.user?.id })
    await supabase.realtime.setAuth(token)
  },

  async ensureAnonymousSession() {
    hookRealtimeAuth()
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      await this.syncRealtimeAuth()
      return
    }

    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    await this.syncRealtimeAuth()
  },

  async linkParticipant(participantToken: string) {
    await this.ensureAnonymousSession()
    await callRpc('link_participant_auth', {
      p_participant_token: participantToken,
    })
    await this.syncRealtimeAuth()
  },

  async bootstrapFromStore() {
    if (!participantStore.getToken()) return
    await this.ensureAnonymousSession()
    await this.linkParticipant(participantStore.requireToken())
  },
}
