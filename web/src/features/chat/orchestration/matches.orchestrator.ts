import { chatRepo } from '../repo/chat.repo'
import { matchesStore } from '../store/matches.store'

export const matchesOrchestrator = {
  async refresh() {
    const matches = await chatRepo.getMatches()
    matchesStore.patch({ matches, error: null })
  },

  reset() {
    matchesStore.reset()
  },
}
