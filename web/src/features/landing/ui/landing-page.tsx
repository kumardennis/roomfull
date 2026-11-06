import { Link } from 'react-router-dom'
import './landing.css'

const steps = [
  {
    title: 'Scan in',
    body: "A code at the venue gets you into tonight's session. No name, no photo, no signup form.",
    icon: (
      <svg className="landing-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4zM9 9h6v6H9V9z"
        />
      </svg>
    ),
  },
  {
    title: 'Play',
    body: 'Quick, funny group games with everyone in the room. Live leaderboard, real answers.',
    icon: (
      <svg className="landing-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
        />
      </svg>
    ),
  },
  {
    title: 'Vibe',
    body: "See how someone actually answered and played, then decide yourself if you're into it.",
    icon: (
      <svg className="landing-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
    ),
  },
  {
    title: 'Meet',
    body: "Mutual? Chat opens, photo unfolds as you talk. You're already in the same room — just go say hi.",
    icon: (
      <svg className="landing-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
  },
]

const reasons = [
  {
    title: 'No matchmaking algorithm',
    body: "We don't score you, rank you, or hide you behind a paywall. Everyone in the room is equal.",
  },
  {
    title: 'Looks come last, not first',
    body: 'Connect over shared humor and answers first. The physical reveal happens only when the vibe is right.',
  },
  {
    title: "You're already there",
    body: 'No endless chatting trying to schedule a date. If you connect, just walk across the room.',
  },
  {
    title: 'Built for the night, not your feed',
    body: 'Designed to enhance your night out, not distract from it. Quick interactions, real-world results.',
  },
]

const faqs = [
  {
    title: 'Do I need to download an app?',
    body: 'No. Scan the venue QR and play in the browser. Nothing to install, nothing to keep after the night.',
  },
  {
    title: 'Is this another dating app?',
    body: "It's a room game that can lead to meeting someone. Personality and presence first — not a feed of strangers.",
  },
]

export function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-header__inner">
          <a className="landing-brand" href="#top" aria-label="RoomFull home">
            <img className="landing-brand__icon" src="/brand/logo-icon.png" alt="" width={40} height={40} />
            <img
              className="landing-brand__wordmark"
              src="/brand/logo-wordmark.png"
              alt="RoomFull"
              width={140}
              height={36}
            />
          </a>
          <nav className="landing-nav" aria-label="Primary">
            <a href="#how-it-works">How it works</a>
            <a href="#why-us">Why us</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="landing-btn landing-btn--sm" href="#get-notified">
            Get Notified
          </a>
        </div>
      </header>

      <main id="top">
        <section className="landing-hero">
          <div className="landing-glow landing-glow--hero" aria-hidden />
          <div className="landing-hero__inner">
            <img
              className="landing-hero__logo"
              src="/brand/logo-lockup.png"
              alt="RoomFull"
              width={320}
              height={400}
            />
            <span className="landing-badge">Coming first to Tallinn</span>
            <h1 className="landing-hero__title">
              No algorithm. No photo.
              <br />
              <span className="gold-gradient-text">Just the room you&apos;re in.</span>
            </h1>
            <p className="landing-hero__subtitle">
              Scan a code at the venue. Play a few quick games with everyone there. See who you
              actually vibe with — for real, not because an app decided.
            </p>
            <Link className="landing-btn" to="/join">
              Find out where it&apos;s happening
            </Link>
          </div>
        </section>

        <section className="landing-section landing-section--steps" id="how-it-works">
          <div className="landing-glow landing-glow--steps" aria-hidden />
          <div className="landing-section__inner">
            <div className="landing-rule" aria-hidden />
            <div className="landing-steps">
              {steps.map((step) => (
                <article key={step.title} className="landing-card landing-card--step">
                  <div className="landing-card__icon">{step.icon}</div>
                  <h3 className="landing-card__title">{step.title}</h3>
                  <p className="landing-card__body">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-section--why" id="why-us">
          <div className="landing-glow landing-glow--why" aria-hidden />
          <div className="landing-section__inner landing-section__inner--narrow">
            <p className="landing-eyebrow">Connection without the feed</p>
            <h2 className="landing-heading">A better night doesn&apos;t need an algorithm.</h2>
            <div className="landing-reasons">
              {reasons.map((reason) => (
                <article key={reason.title} className="landing-card">
                  <h3 className="landing-card__title">{reason.title}</h3>
                  <p className="landing-card__body">{reason.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-section--faq" id="faq">
          <div className="landing-glow landing-glow--faq" aria-hidden />
          <div className="landing-section__inner landing-section__inner--narrow">
            <h2 className="landing-heading landing-heading--center">
              A few things you might wonder.
            </h2>
            <div className="landing-faqs">
              {faqs.map((faq) => (
                <article key={faq.title} className="landing-card">
                  <h3 className="landing-card__title">{faq.title}</h3>
                  <p className="landing-card__body">{faq.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-section--cta" id="get-notified">
          <div className="landing-glow landing-glow--cta" aria-hidden />
          <div className="landing-section__inner landing-section__inner--cta">
            <p className="landing-eyebrow">Tallinn, first</p>
            <h2 className="landing-heading landing-heading--center">
              Be in the room when it starts.
            </h2>
            <p className="landing-cta__copy">
              The first sessions are coming soon. Find your room, play along, and meet people
              without the feed in the way.
            </p>
            <a className="landing-btn" href="mailto:hello@roomfull.app?subject=Notify%20me">
              Get Notified
            </a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer__brand">
          <img className="landing-footer__icon" src="/brand/logo-icon.png" alt="" width={36} height={36} />
          <img
            className="landing-footer__wordmark"
            src="/brand/logo-wordmark.png"
            alt="RoomFull"
            width={120}
            height={32}
          />
        </div>
        <p className="landing-footer__copy">© {new Date().getFullYear()} RoomFull</p>
      </footer>
    </div>
  )
}
