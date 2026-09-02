import { Navigate, Route, Routes } from 'react-router-dom'
import { participantStore } from '../core/session/participant-store'
import { checkInRoutes } from '../features/check-in'
import { chatRoutes } from '../features/chat'
import { hostRoutes } from '../features/host'
import { openerRoutes } from '../features/opener'
import { playRoutes } from '../features/play'
import { vibesRoutes } from '../features/vibes'

function HomeRedirect() {
  return <Navigate to={participantStore.isCheckedIn() ? '/play' : '/join'} replace />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      {checkInRoutes}
      {openerRoutes}
      {playRoutes}
      {vibesRoutes}
      {chatRoutes}
      {hostRoutes}
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}
