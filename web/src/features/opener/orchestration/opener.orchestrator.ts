import { sessionRepo } from '../../../core/session/session.repo'
import { openerStore } from '../store/opener.store'

export type OpenerLoadResult = {
  openerComplete: boolean
  phase: string
}

export const openerOrchestrator = {
  setAnswer(answer: string) {
    openerStore.patch({ answer })
  },

  async load(): Promise<OpenerLoadResult> {
    const state = await sessionRepo.getState()

    openerStore.patch({
      handle: state.participant.handle,
      phase: state.session.phase,
      startsAt: state.session.scheduled_starts_at,
      phaseDeadline: state.session.phase_deadline,
      prompt: state.opener_question?.prompt ?? '',
      options: state.opener_question?.options ?? [],
      error: null,
    })

    return {
      openerComplete: !state.participant.needs_opener,
      phase: state.session.phase,
    }
  },

  async submit(answerOverride?: string): Promise<{ ok: true } | { ok: false }> {
    const answer = (answerOverride ?? openerStore.getState().answer).trim()
    if (!answer) return { ok: false }

    openerStore.patch({ answer, submitting: true, error: null })
    try {
      await sessionRepo.submitOpener(answer)
      return { ok: true }
    } catch (err) {
      openerStore.patch({
        error: err instanceof Error ? err.message : 'Could not submit',
      })
      return { ok: false }
    } finally {
      openerStore.patch({ submitting: false })
    }
  },

  async skip(): Promise<{ ok: true } | { ok: false }> {
    return this.submit('Skipped')
  },

  reset() {
    openerStore.reset()
  },
}
