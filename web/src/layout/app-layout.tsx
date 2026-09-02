import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { participantStore } from '../core/session/participant-store'

type AppLayoutProps = {
  title?: string
  subtitle?: string
  children: ReactNode
  showNav?: boolean
}

export function AppLayout({ title, subtitle, children, showNav = true }: AppLayoutProps) {
  const hasToken = participantStore.isCheckedIn()
  const location = useLocation()

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">RoomFull</p>
          {title ? <h1>{title}</h1> : null}
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        </div>
      </header>

      <main className="app-main">{children}</main>

      {showNav && hasToken ? (
        <nav className="bottom-nav">
          <Link to="/play" className={location.pathname === '/play' ? 'active' : ''}>
            Play
          </Link>
          <Link to="/vibes" className={location.pathname === '/vibes' ? 'active' : ''}>
            Vibes
          </Link>
          <Link
            to="/matches"
            className={
              location.pathname.startsWith('/chat') || location.pathname === '/matches'
                ? 'active'
                : ''
            }
          >
            Chats
          </Link>
        </nav>
      ) : null}
    </div>
  )
}
