import { authService } from '../../../core/session/auth.service'
import { participantStore } from '../../../core/session/participant-store'
import { checkInRepo } from '../repo/check-in.repo'
import { checkInStore } from '../store/check-in.store'

export const checkInOrchestrator = {
  setQrCode(qrCode: string) {
    checkInStore.patch({ qrCode })
  },

  async submit(): Promise<{ ok: true } | { ok: false }> {
    const { qrCode } = checkInStore.getState()
    checkInStore.patch({ loading: true, error: null })

    try {
      await authService.ensureAnonymousSession()
      const result = await checkInRepo.joinSession(qrCode.trim())
      participantStore.save(
        result.participant_token,
        result.session_id,
        result.participant_id,
        result.handle,
      )
      participantStore.markJoined(result.participant_id)
      await authService.linkParticipant(result.participant_token)
      return { ok: true }
    } catch (err) {
      checkInStore.patch({
        error: err instanceof Error ? err.message : 'Could not join session',
      })
      return { ok: false }
    } finally {
      checkInStore.patch({ loading: false })
    }
  },

  reset() {
    checkInStore.reset()
  },
}
