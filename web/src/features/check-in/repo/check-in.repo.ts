import type { JoinResult } from '../../../core/types/domain'
import { callRpc } from '../../../core/supabase/rpc'

export const checkInRepo = {
  joinSession(qrCode: string): Promise<JoinResult> {
    return callRpc<JoinResult>('join_session', { p_qr_code: qrCode })
  },
}
