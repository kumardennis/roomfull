import { hostRepo } from '../repo/host.repo'
import { hostStore } from '../store/host.store'

export const hostOrchestrator = {
  setHostPin(hostPin: string) {
    hostStore.patch({ hostPin })
  },

  setSessionId(sessionId: string) {
    hostStore.patch({ sessionId })
  },

  async loadSession() {
    const { hostPin, sessionId } = hostStore.getState()
    if (!hostPin || !sessionId) return

    hostStore.patch({ loading: true, error: null })
    try {
      const session = await hostRepo.getSession(hostPin, sessionId)
      hostStore.patch({ session })
    } catch (err) {
      hostStore.patch({
        error: err instanceof Error ? err.message : 'Could not load host session',
      })
    } finally {
      hostStore.patch({ loading: false })
    }
  },

  async pause() {
    const { hostPin, sessionId } = hostStore.getState()
    if (!hostPin || !sessionId) return

    hostStore.patch({ loading: true, error: null })
    try {
      await hostRepo.pauseSession(hostPin, sessionId)
      await hostOrchestrator.loadSession()
    } catch (err) {
      hostStore.patch({
        error: err instanceof Error ? err.message : 'Could not pause session',
      })
      hostStore.patch({ loading: false })
    }
  },

  async resume() {
    const { hostPin, sessionId } = hostStore.getState()
    if (!hostPin || !sessionId) return

    hostStore.patch({ loading: true, error: null })
    try {
      await hostRepo.resumeSession(hostPin, sessionId)
      await hostOrchestrator.loadSession()
    } catch (err) {
      hostStore.patch({
        error: err instanceof Error ? err.message : 'Could not resume session',
      })
      hostStore.patch({ loading: false })
    }
  },

  async forceEnd() {
    const { hostPin, sessionId } = hostStore.getState()
    if (!hostPin || !sessionId) return

    hostStore.patch({ loading: true, error: null })
    try {
      await hostRepo.forceEndSession(hostPin, sessionId)
      await hostOrchestrator.loadSession()
    } catch (err) {
      hostStore.patch({
        error: err instanceof Error ? err.message : 'Could not end session',
      })
      hostStore.patch({ loading: false })
    }
  },

  async devReset(clearParticipantAnswers = true, clearSocial = true) {
    const { hostPin, sessionId } = hostStore.getState()
    if (!hostPin || !sessionId) return

    hostStore.patch({ loading: true, error: null })
    try {
      await hostRepo.devResetSession(hostPin, sessionId, clearParticipantAnswers, clearSocial)
      await hostOrchestrator.loadSession()
    } catch (err) {
      hostStore.patch({
        error: err instanceof Error ? err.message : 'Could not reset session',
      })
      hostStore.patch({ loading: false })
    }
  },

  async devTick() {
    const { hostPin, sessionId } = hostStore.getState()
    if (!hostPin || !sessionId) return

    hostStore.patch({ loading: true, error: null })
    try {
      await hostRepo.devSessionTick(hostPin, sessionId)
      await hostOrchestrator.loadSession()
    } catch (err) {
      hostStore.patch({
        error: err instanceof Error ? err.message : 'Could not advance session',
      })
      hostStore.patch({ loading: false })
    }
  },

  async devSkipWait() {
    const { hostPin, sessionId } = hostStore.getState()
    if (!hostPin || !sessionId) return

    hostStore.patch({ loading: true, error: null })
    try {
      await hostRepo.devSkipPhaseWait(hostPin, sessionId, 5)
      await hostRepo.devSessionTick(hostPin, sessionId)
      await hostOrchestrator.loadSession()
    } catch (err) {
      hostStore.patch({
        error: err instanceof Error ? err.message : 'Could not skip wait',
      })
      hostStore.patch({ loading: false })
    }
  },

  async devEndRoundSoon() {
    await hostOrchestrator.devSkipWait()
  },

  reset() {
    hostStore.reset()
  },
}
