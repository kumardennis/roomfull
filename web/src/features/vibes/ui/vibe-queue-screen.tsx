import { RoomfullChrome } from '../../../layout/roomfull-chrome'
import { useVibeQueueScreen } from '../hooks/use-vibe-queue-screen'
import { VibeQueueCard, VibeQueuePreviewCard } from './vibe-queue-card'

export function VibeQueueScreen() {
  const { vibe, loading, acting, error, accept, pass } = useVibeQueueScreen()

  return (
    <RoomfullChrome activeTab="vibes" variant="vibes">
      <main className="vibe-queue-main">
        <header className="vibe-queue-header">
          <h1 className="vibe-queue-header__title">Your Vibes</h1>
          <p className="vibe-queue-header__subtitle">
            {vibe ? 'Someone is waiting in the shadows…' : 'Waiting in the shadows…'}
          </p>
        </header>

        {loading ? (
          <p className="vibe-queue-loading">Loading…</p>
        ) : (
          <div className="vibe-queue-stack">
            {vibe ? (
              <>
                <VibeQueueCard
                  vibe={vibe}
                  acting={acting}
                  onPass={() => void pass()}
                  onAccept={() => void accept()}
                />
                <VibeQueuePreviewCard />
              </>
            ) : (
              <section className="vibe-queue-empty">
                <p>No vibes waiting right now.</p>
                <p className="vibe-queue-empty__hint">
                  Send vibes from the leaderboard during round breaks.
                </p>
              </section>
            )}
          </div>
        )}

        {error ? <p className="vibe-queue-error">{error}</p> : null}
      </main>
    </RoomfullChrome>
  )
}
