import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { checkInOrchestrator } from '../orchestration/check-in.orchestrator'
import { useCheckInStore } from '../store/check-in.store'

export function useCheckInScreen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const { qrCode, loading, error } = useCheckInStore(
    useShallow((s) => ({
      qrCode: s.qrCode,
      loading: s.loading,
      error: s.error,
    })),
  )

  useEffect(() => {
    const qr = searchParams.get('qr')
    if (qr) checkInOrchestrator.setQrCode(qr)
  }, [searchParams])

  async function submit() {
    const result = await checkInOrchestrator.submit()
    if (result.ok) navigate('/opener', { replace: true })
  }

  return {
    qrCode,
    setQrCode: checkInOrchestrator.setQrCode,
    loading,
    error,
    submit,
  }
}
