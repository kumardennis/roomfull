import { type FormEvent, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { VibeOrb } from '../../../core/ui/vibe-orb'
import { RoomfullChrome } from '../../../layout/roomfull-chrome'
import type { MatchSummary } from '../../../core/types/domain'
import { useChatScreen } from '../hooks/use-chat-screen'

function revealLabel(stage: MatchSummary['reveal_stage']) {
  if (stage === 'revealed') return 'Revealed'
  if (stage === 'blurred') return 'Blurred'
  return 'Anonymous'
}

export function ChatScreen() {
  const {
    match,
    messages,
    body,
    setBody,
    loading,
    sending,
    error,
    send,
  } = useChatScreen()

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void send()
  }

  const handle = match?.other_participant.handle ?? 'Chat'
  const revealStage = match?.reveal_stage ?? 'hidden'
  const avatarSeed = match?.other_participant.avatar_seed ?? 'chat'

  return (
    <RoomfullChrome activeTab="chat" variant="chat">
      <main className="chat-thread-main">
        <header className="chat-thread-header">
          <Link className="chat-thread-header__back" to="/matches" aria-label="Back to chats">
            ‹
          </Link>
          <div className={`chat-thread-header__avatar reveal-${revealStage}`}>
            <VibeOrb seed={avatarSeed} size="lg" />
          </div>
          <div className="chat-thread-header__identity">
            <h1 className="chat-thread-header__handle">{handle}</h1>
            <span className="chat-thread-header__badge">{revealLabel(revealStage)}</span>
          </div>
        </header>

        {loading ? (
          <p className="chat-page-loading">Loading…</p>
        ) : (
          <>
            <div className="chat-messages-panel trivia-glass-card trivia-glass-card--compact">
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <p className="chat-messages__empty">Say hi — you matched on vibes tonight.</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`chat-bubble${message.is_mine ? ' chat-bubble--mine' : ' chat-bubble--theirs'}`}
                    >
                      {message.body}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {error ? <p className="chat-page-error">{error}</p> : null}

            <form className="chat-compose" onSubmit={handleSubmit}>
              <input
                className="chat-compose__input"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Say something…"
                disabled={sending}
              />
              <button className="btn primary chat-compose__send" type="submit" disabled={sending || !body.trim()}>
                {sending ? '…' : 'Send'}
              </button>
            </form>
          </>
        )}
      </main>
    </RoomfullChrome>
  )
}
