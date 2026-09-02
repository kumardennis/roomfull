import { useEffect, useState } from 'react'

export function useCountdown(closesAt: string | null | undefined) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!closesAt) {
      setSecondsLeft(null)
      return
    }

    const target = new Date(closesAt).getTime()

    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)))
    }

    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [closesAt])

  return secondsLeft
}
