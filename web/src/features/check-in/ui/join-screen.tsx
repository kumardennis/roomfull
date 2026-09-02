import { type FormEvent, useRef } from 'react'
import { useCheckInScreen } from '../hooks/use-check-in-screen'

function MenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 7h16v1.5H4V7zm0 5h16v1.5H4V12zm0 5h16v1.5H4V17z" />
    </svg>
  )
}

function QrScannerIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path
        d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4zM9 9h6v6H9V9z"
        opacity={filled ? 1 : 0.9}
      />
    </svg>
  )
}

function QrPlaceholderIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h2v2h-2v-2zm-2 2h2v2h-2v-2zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm2 2h2v2h-2v-2zM13 13h2v2h-2v-2zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2z" />
    </svg>
  )
}

export function JoinScreen() {
  const { qrCode, setQrCode, loading, error, submit } = useCheckInScreen()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void submit()
  }

  return (
    <div className="check-in-screen">
      <header className="check-in-header">
        <button className="check-in-header__btn" type="button" aria-label="Menu">
          <MenuIcon />
        </button>
        <div className="check-in-header__brand">RoomFull</div>
        <button
          className="check-in-header__btn check-in-header__btn--accent"
          type="button"
          aria-label="QR code scanner"
          onClick={() => inputRef.current?.focus()}
        >
          <QrScannerIcon filled />
        </button>
      </header>

      <main className="check-in-main">
        <div className="check-in-hero">
          <h1 className="check-in-hero__title">Enter the Room</h1>
          <p className="check-in-hero__subtitle">Scan the table code to join tonight&apos;s game.</p>
        </div>

        <button
          className="check-in-scanner"
          type="button"
          aria-label="Focus session code input"
          onClick={() => inputRef.current?.focus()}
        >
          <span className="check-in-scanner__corner check-in-scanner__corner--tl" />
          <span className="check-in-scanner__corner check-in-scanner__corner--tr" />
          <span className="check-in-scanner__corner check-in-scanner__corner--bl" />
          <span className="check-in-scanner__corner check-in-scanner__corner--br" />
          <span className="check-in-scanner__line" aria-hidden />
          <span className="check-in-scanner__viewport">
            <QrPlaceholderIcon />
          </span>
        </button>

        <form className="check-in-form" onSubmit={handleSubmit}>
          <span className="check-in-form__label">Or enter code manually</span>
          <input
            ref={inputRef}
            className="check-in-form__input"
            value={qrCode}
            onChange={(e) => setQrCode(e.target.value)}
            placeholder="dev-night-001"
            autoComplete="off"
            spellCheck={false}
            aria-label="Session code"
          />

          {error ? <p className="error check-in-form__error">{error}</p> : null}

          <button
            className="btn-check-in-join"
            type="submit"
            disabled={loading || !qrCode.trim()}
          >
            {loading ? 'Joining…' : 'Join tonight'}
          </button>
        </form>
      </main>
    </div>
  )
}
