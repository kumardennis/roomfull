import { vibesRepo } from '../repo/vibes.repo'
import { vibesStore } from '../store/vibes.store'

export type VibeAcceptResult = {
  matchId: string | null
  needsMutualVibe?: boolean
}

export const vibesOrchestrator = {
  async refresh() {
    const vibe = await vibesRepo.getIncoming()
    vibesStore.patch({ vibe, error: null })
  },

  async accept(): Promise<VibeAcceptResult> {
    const { vibe } = vibesStore.getState()
    if (!vibe) return { matchId: null }

    vibesStore.patch({ acting: true, error: null })
    try {
      const result = await vibesRepo.accept(vibe.vibe_id)
      if (result.match_id) {
        return { matchId: result.match_id }
      }
      await vibesOrchestrator.refresh()
      return { matchId: null, needsMutualVibe: true }
    } catch (err) {
      vibesStore.patch({
        error: err instanceof Error ? err.message : 'Could not accept',
      })
      return { matchId: null }
    } finally {
      vibesStore.patch({ acting: false })
    }
  },

  async pass() {
    const { vibe } = vibesStore.getState()
    if (!vibe) return

    vibesStore.patch({ acting: true, error: null })
    try {
      await vibesRepo.pass(vibe.vibe_id)
      await vibesOrchestrator.refresh()
    } catch (err) {
      vibesStore.patch({
        error: err instanceof Error ? err.message : 'Could not pass',
      })
    } finally {
      vibesStore.patch({ acting: false })
    }
  },

  reset() {
    vibesStore.reset()
  },
}
