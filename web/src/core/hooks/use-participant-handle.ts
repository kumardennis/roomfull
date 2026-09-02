import { useEffect, useState } from 'react'
import { participantStore } from '../session/participant-store'
import { sessionRepo } from '../session/session.repo'

export function useParticipantHandle() {
  const [handle, setHandle] = useState(() => participantStore.getHandle())

  useEffect(() => {
    if (!participantStore.isCheckedIn()) {
      setHandle(null)
      return
    }

    const cached = participantStore.getHandle()
    if (cached) {
      setHandle(cached)
      return
    }

    void sessionRepo
      .getState()
      .then((state) => {
        participantStore.setHandle(state.participant.handle)
        setHandle(state.participant.handle)
      })
      .catch(() => undefined)
  }, [])

  return handle
}
