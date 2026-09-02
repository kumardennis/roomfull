import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useParticipantHandle } from '../core/hooks/use-participant-handle'

export type RoomfullTab = 'trivia' | 'vibes' | 'chat'

type RoomfullChromeProps = {
  activeTab: RoomfullTab
  variant?: 'trivia' | 'vibes' | 'chat'
  children: ReactNode
}

export function MenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 7h16v1.5H4V7zm0 5h16v1.5H4V12zm0 5h16v1.5H4V17z" />
    </svg>
  )
}

export function QrScannerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4zM9 9h6v6H9V9z" />
    </svg>
  )
}

function TriviaIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" />
    </svg>
  )
}

function SparklesIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path
        d="M12 2l1.2 3.6L17 7l-3.6 1.2L12 12l-1.2-3.8L7 7l3.8-1.4L12 2zm0 10l.9 2.7L15.7 15l-2.8.9L12 18.6l-.9-2.7L8.3 15l2.8-.9L12 12zm-7 1l.6 1.8L7.4 16l-1.8.6L5 18.4l-.6-1.8L2.6 16l1.8-.6L5 13.4zm14 0l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8z"
        opacity={filled ? 1 : 0.7}
      />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h10v2H7V9zm0-3h10v2H7V6zm0 6h7v2H7v-2z" />
    </svg>
  )
}

export function RoomfullChrome({ activeTab, variant = 'trivia', children }: RoomfullChromeProps) {
  const handle = useParticipantHandle()

  return (
    <div className={`roomfull-shell roomfull-shell--${variant}`}>
      <header className="roomfull-topbar">
        <button className="roomfull-topbar__btn" type="button" aria-label="Menu">
          <MenuIcon />
        </button>
        <div className="roomfull-topbar__center">
          {handle ? (
            <>
              <span className="roomfull-topbar__handle">{handle}</span>
              <span className="roomfull-topbar__brand-sub">RoomFull</span>
            </>
          ) : (
            <span className="roomfull-topbar__brand">RoomFull</span>
          )}
        </div>
        <Link className="roomfull-topbar__btn roomfull-topbar__btn--accent" to="/join" aria-label="Scan">
          <QrScannerIcon />
        </Link>
      </header>

      {children}

      <nav className="roomfull-bottomnav" aria-label="Main">
        <Link
          className={`roomfull-bottomnav__item${activeTab === 'trivia' ? ' roomfull-bottomnav__item--active' : ''}`}
          to="/play"
          aria-current={activeTab === 'trivia' ? 'page' : undefined}
        >
          <TriviaIcon />
          <span>Trivia</span>
        </Link>
        <Link
          className={`roomfull-bottomnav__item${activeTab === 'vibes' ? ' roomfull-bottomnav__item--active' : ''}`}
          to="/vibes"
          aria-current={activeTab === 'vibes' ? 'page' : undefined}
        >
          <SparklesIcon filled={activeTab === 'vibes'} />
          <span>Vibes</span>
        </Link>
        <Link
          className={`roomfull-bottomnav__item${activeTab === 'chat' ? ' roomfull-bottomnav__item--active' : ''}`}
          to="/matches"
          aria-current={activeTab === 'chat' ? 'page' : undefined}
        >
          <ChatIcon />
          <span>Chat</span>
        </Link>
      </nav>
    </div>
  )
}
