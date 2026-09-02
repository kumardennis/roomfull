import { useEffect } from 'react'
import { ChromeProvider } from '../chrome'
import { authService } from '../core/session/auth.service'
import { participantStore } from '../core/session/participant-store'
import { AppNotifications } from '../core/notifications/app-notifications'
import { AppRouter } from './router'
import './app.css'

export function App() {
  useEffect(() => {
    authService.hookRealtimeAuth()
    if (participantStore.isCheckedIn()) {
      void authService.bootstrapFromStore().catch(() => undefined)
    }
  }, [])

  return (
    <ChromeProvider>
      <AppNotifications />
      <AppRouter />
    </ChromeProvider>
  )
}
