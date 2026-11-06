import { Navigate, Route, Routes } from 'react-router-dom'
import { participantStore } from '../core/session/participant-store'
import { checkInRoutes } from '../features/check-in'
import { chatRoutes } from '../features/chat'
import { hostRoutes } from '../features/host'
import { LandingPage } from '../features/landing'
import { openerRoutes } from '../features/opener'
import { playRoutes } from '../features/play'
import { vibesRoutes } from '../features/vibes'

function FallbackRedirect() {
  return <Navigate to={participantStore.isCheckedIn() ? '/play' : '/'} replace />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      {checkInRoutes}
      {openerRoutes}
      {playRoutes}
      {vibesRoutes}
      {chatRoutes}
      {hostRoutes}
      <Route path="*" element={<FallbackRedirect />} />
    </Routes>
  )
}
