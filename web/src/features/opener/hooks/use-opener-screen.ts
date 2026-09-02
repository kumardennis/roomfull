import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useCountdown } from '../../../core/hooks/use-countdown'
import { useSessionRealtime } from '../../../core/hooks/use-session-realtime'
import { participantStore } from '../../../core/session/participant-store'
import { openerOrchestrator } from '../orchestration/opener.orchestrator'
import { useOpenerStore } from '../store/opener.store'

export function useOpenerScreen() {
  const navigate = useNavigate()

  const {
    prompt,
    options,
    answer,
    handle,
    phase,
    startsAt,
    phaseDeadline,
    loading,
    submitting,
    error,
  } = useOpenerStore(
    useShallow((s) => ({
      prompt: s.prompt,
      options: s.options,
      answer: s.answer,
      handle: s.handle,
      phase: s.phase,
      startsAt: s.startsAt,
      phaseDeadline: s.phaseDeadline,
      loading: s.loading,
      submitting: s.submitting,
      error: s.error,
    })),
  )

  const startsIn = useCountdown(startsAt)
  const phaseSecondsLeft = useCountdown(
    phase === 'opener' ? phaseDeadline : phase === 'scheduled' ? startsAt : null,
  )

  const load = useCallback(() => {
    return openerOrchestrator
      .load()
      .then((result) => {
        if (result.openerComplete) navigate('/play', { replace: true })
        else if (result.phase !== 'scheduled' && result.phase !== 'opener') {
          navigate('/play', { replace: true })
        }
        return result
      })
      .catch((err) => {
        useOpenerStore.setState({
          error: err instanceof Error ? err.message : 'Could not load opener',
        })
      })
  }, [navigate])

  useEffect(() => {
    if (!participantStore.isCheckedIn()) {
      navigate('/join', { replace: true })
      return
    }

    useOpenerStore.setState({ loading: true })
    void load().finally(() => {
      useOpenerStore.setState({ loading: false })
    })

    return () => openerOrchestrator.reset()
  }, [navigate, load])

  useSessionRealtime(() => {
    void load()
  })

  async function submit() {
    const result = await openerOrchestrator.submit()
    if (result.ok) navigate('/play', { replace: true })
  }

  async function selectOption(option: string) {
    if (submitting) return
    openerOrchestrator.setAnswer(option)
    const result = await openerOrchestrator.submit(option)
    if (result.ok) navigate('/play', { replace: true })
  }

  async function skip() {
    if (submitting) return
    const result = await openerOrchestrator.skip()
    if (result.ok) navigate('/play', { replace: true })
  }

  return {
    prompt,
    options,
    answer,
    setAnswer: openerOrchestrator.setAnswer,
    handle,
    phase,
    startsIn,
    phaseSecondsLeft,
    loading,
    submitting,
    error,
    submit,
    selectOption,
    skip,
  }
}
