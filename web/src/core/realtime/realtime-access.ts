import { chatRtLog } from './chat-realtime-debug'
import { supabase } from '../supabase/client'

/** Confirms authenticated SELECT RLS on messages (required for postgres_changes delivery). */
export async function verifyMessagesRealtimeAccess(matchId: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  const userId = userData.user?.id ?? null

  const { error, count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', matchId)

  chatRtLog('verifyMessagesRealtimeAccess', {
    matchId,
    userId,
    userError: userError?.message,
    selectError: error?.message,
    selectCode: error?.code,
    visibleRowCount: count,
    canSelect: !error && (count ?? 0) > 0,
  })

  return { userId, canSelect: !error && (count ?? 0) > 0, error }
}
