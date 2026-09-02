# RoomFull — Build Context

Venue-scoped social game. Strangers at an event play a few short group games,
then privately signal interest in each other based on how someone answered —
not what they look like. Mutual interest opens an anonymous chat; a photo
unlocks gradually only if the chat keeps going.

Use this doc as the source of truth for product behavior while building.
Where this doc is silent, ask rather than guess — several mechanics below were
chosen specifically to avoid recreating "who's hot wins" dynamics from other
apps, so small implementation shortcuts can undo the actual point of the
product.

## Stack

- Frontend (v0): lightweight React web app — QR opens a URL in the browser, no
  app install. Optimized for mobile web (single-column, touch-friendly).
- Frontend (later): Flutter (iOS + Android) once the loop is validated at real
  events and native feel / push / camera polish justify the install step.
- Backend: Supabase (Postgres, Realtime, Edge Functions, `pg_cron`).
- No native login/accounts for v0 — participation is QR/session-scoped, not
  account-based. See "Known gaps" below.

## Architecture

Clients are **server-driven**: they render UI, subscribe to Realtime, and call
named backend operations — they do not encode game rules or write state
directly. React (v0) and Flutter (later) share the same Supabase project and
the same API surface.

### Build order (always)

**Database and APIs first, UI second.** Every feature ships in this order:

1. **Schema** — migrations for tables, constraints, indexes.
2. **RLS** — policies before any client can read/write.
3. **RPC / Edge Functions** — named mutations + `domain_events` in one transaction.
4. **Verify** — exercise the API directly (SQL, `supabase` CLI, or a thin test
   script) before touching the React app.
5. **UI** — wire screens to existing contracts only; no business logic in the
   client.

Do not scaffold frontend screens ahead of the backend calls they depend on.
When both clients (React, Flutter) exist, they consume the same APIs — building
the layer underneath first avoids duplicating logic or guessing contracts.

```
React (v0)  ──┐
              ├──► Postgres RPC + Edge Functions ──► Postgres + RLS
Flutter     ──┘              │
                             └── domain_events (append-only audit log)
              ▲
              └── Supabase Realtime (rounds, leaderboard, chat)
```

**Backend = Supabase, not a separate app server.** Postgres functions and Edge
Functions are the shared integration layer. Do not add a standalone Node/Express
(or similar) service for v0 — it would mostly proxy the same calls and add ops
cost without solving problems we don't have yet.

### Client responsibilities

- Call named mutations only (`join_session`, `send_vibe`, `accept_vibe`, …).
- Subscribe to Realtime for live state (round open/close, messages, leaderboard).
- Store session-scoped participant identity locally (`localStorage` on web;
  secure storage on Flutter).
- Compute UI countdowns from **server timestamps** (`opens_at` / `closes_at`),
  not from "time since I got the push."

### Web feature layers (React)

Each feature under `web/src/features/<name>/`:

| Layer | Role |
|---|---|
| `store/` | Zustand state + `patch` / `reset` only |
| `orchestration/` | Logic: repos, store updates, chrome; returns hints not side effects |
| `hooks/` | React: subscribe, poll, realtime, `navigate` |
| `repo/` | Supabase RPC only |
| `ui/` | Presentational screens |

Reference: `features/play/`. See `.cursor/rules/web-feature-architecture.mdc`.

Side 1v1 games (chat icebreakers, not built yet): `docs/games.md`.
Dumb client I/O; `game_moves` is truth; Postgres folds the view.

### Server responsibilities

- All writes that affect game state (vibes, matches, rounds, reveal stages).
- Atomic mutuality checks (vibe → match) — no client-side race conditions.
- Round timing authority (`opens_at` / `closes_at` set server-side).
- RLS enforcement so participants never see raw identity beyond session scope.
- Append a `domain_events` row in the **same transaction** as every state
  mutation (see Data model).

### Domain events (event-driven lite — no Kafka for v0)

Every meaningful state change emits an append-only domain event. This gives
audit trails, debugging ("what happened at this event?"), and a path to
organizer analytics later — without operating a message broker.

Event examples: `participant.joined`, `round.opened`, `round.closed`,
`vibe.sent`, `vibe.accepted`, `vibe.passed`, `match.created`, `message.sent`,
`reveal.stage_changed`.

**Do not use Kafka (or similar) for v0.** Postgres + transactional event log
is enough for single-venue sessions at tens-to-hundreds of participants.
Revisit async infrastructure only when there are multiple real downstream
consumers or volume that Postgres can't serve (see evolution path below).

Handlers must be **idempotent** where retries are possible (e.g. network
flakiness on mobile web).

### v0 API surface (initial)

Implement as Postgres RPC and/or Edge Functions; document payloads so Flutter
can call the same contracts later.

| Operation | Purpose |
|---|---|
| `join_session` | QR check-in → anonymous handle + participant row |
| `submit_opener` | First answer on check-in |
| `submit_answer` | Answer for current round |
| `send_vibe` | Send interest to another participant |
| `accept_vibe` / `pass_vibe` | Private queue actions (pass is silent) |
| `send_message` | Chat after mutual match |
| `request_reveal` | Explicit mutual full-photo reveal tap |
| `advance_round` | Internal — opens next planned round (scheduler / FSM) |
| `host_pause_session` / `host_resume_session` / `host_force_end_session` | Emergency host overrides |

Reads go through RLS-scoped queries or narrow RPCs; clients never `INSERT`/
`UPDATE` game tables directly.

### Evolution path (when to add more infrastructure)

1. **v0 (now):** RPC + Postgres state + `domain_events` → Realtime for live UI.
   Session timing: `session_deadlines` + **persistent scheduler worker** (Realtime
   timers); `pg_cron` `session_tick` as fallback only. See
   [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
2. **v1 (multi-venue, organizer dashboard):** ETL `domain_events` to a
   warehouse, or Supabase webhooks → Edge Function for async side effects.
3. **v2+ (only if needed):** outbox table + worker, or Redis/SQS — or Kafka
   only when multiple independent services genuinely need the same event stream.

## Core loop (locked)

1. **Check in** — scan a venue QR code, join that venue's live `session`. No
   name or photo required. Assigned an anonymous `handle` (e.g. "Otter23")
   for the session.
2. **Opener question** — one quick curated question, answered immediately on
   check-in. This is the first line of the participant's "answer trail."
3. **Game rounds** — 3-5 short rounds play out over the session, each a
   This-or-That / Superlative / Prediction / Two-Truths-One-Lie / Hot-Take
   prompt (see Content Bank). Each round ends with a live, shared leaderboard
   visible to everyone in the session.
4. **Tap to Vibe** — tapping any handle on the leaderboard expands a card
   showing that person's full answer trail so far (opener + every round up to
   now, not just the latest). From there: **Send a Vibe** or skip. There is
   **no separate browsing/deck screen** — the leaderboard + expand card is the
   only place Vibes are sent from. (This was deliberately simplified from an
   earlier "deck of profiles" design — do not reintroduce a standalone
   browsing screen.)
5. **Private accept queue** — Vibes a participant receives show up one at a
   time in their own queue, each showing the sender's full answer trail.
   Accept or Pass. **Passing is silent** — the sender is never told, and never
   sees whether/when a Vibe was seen.
6. **Mutual match → anonymous chat** — a mutual Vibe (both sides accepted)
   opens a real-time anonymous chat thread. Identity stays hidden — avatar
   shown as a blurred/silhouette placeholder, no name.
7. **Gradual reveal** — if both participants stay actively chatting for
   several minutes, the avatar blur lifts automatically (not tied to message
   *quality*, just continued mutual engagement). A separate **explicit,
   mutual tap** is required for the full clear photo + name reveal — gradual
   unblur is a soft signal, not full identity disclosure.
8. **Session end** — Vibes, matches, and chats are scoped to the session/
   venue night. No cross-event carryover for v0.

## Design rules that must not be violated

These came out of a long back-and-forth about avoiding the failure modes of
existing dating/proximity apps. Each one fixes a specific problem — don't
"simplify" one of these without understanding what it re-introduces.

- **No photos before a mutual match.** This is the entire differentiator.
  Never show a real photo during browsing, leaderboard, or the pre-match
  Vibe flow.
- **No visible scores, rankings, or compatibility percentages shown to
  users.** Trivia leaderboard *points* are fine (public, game-based). A
  "% compatibility" or ranked "people you vibe with" list is not — it
  recreates a popularity contest. Matching-by-suggestion algorithms were
  explicitly rejected in favor of the user browsing/choosing themselves.
- **Passes are always silent.** No read receipts, no "seen" indicator, no
  notification to the sender that they were declined.
- **Prediction-format rounds must pair with a simultaneous self-report
  question.** E.g. "guess what % have seen Star Wars" must ask everyone
  "have you seen Star Wars? y/n" at the same moment, and score against that
  live tally. Do not hardcode or assume a "correct" answer to a fact nobody
  in the room actually reported.
- **Trivia content must not reward being well-read/educated** (no capital
  cities, historical dates, general-knowledge trivia). That just swaps a
  looks-based hierarchy for a smarts-based one. Keep prompts personality/
  opinion/prediction-based (see Content Bank).
- **Reveal is earned by mutual engagement continuing, not by chat quality.**
  Don't build any mechanic that rewards being a better texter with faster
  reveal — that reintroduces a performance-based hierarchy one layer down.
- **No open social feed / posts / likes.** Considered and explicitly
  rejected — same "curated performance wins" problem as photos, just via
  writing instead of looks.
- **Vibe rate limiting should emerge from the round structure**, not an
  arbitrary cap. A participant can Vibe a different person after each round;
  the number of rounds in a session is the natural limiter. Don't add an
  artificial "5 Vibes per night" rule on top of that.

## Data model (Postgres / Supabase)

```sql
venues        (id, name, slug)
sessions      (id, venue_id, qr_code, scheduled_starts_at, started_at, ends_at,
               status, phase, phase_deadline, opener_window_sec, interstitial_sec,
               round_duration_sec, current_plan_index, paused_at, host_pin)
session_round_plan (session_id, position, question_id, duration_sec)
participants  (id, session_id, handle, avatar_seed, joined_at)

questions     (id, format, prompt, options jsonb, correct_option,
               self_report_prompt, is_local boolean)
  -- format: 'this_or_that' | 'superlative' | 'prediction'
  --       | 'two_truths_one_lie' | 'hot_take'
  -- self_report_prompt is required (non-null) when format = 'prediction'

rounds        (id, session_id, question_id, round_number,
               opens_at, closes_at, status)

answers       (id, round_id, participant_id, chosen_option,
               answered_at, is_correct)
  -- for 'prediction' rounds, also store the self-report answer
  -- (either a second row type, or a self_report_value column)

vibes         (id, session_id, from_participant, to_participant,
               status, created_at)
  -- status: 'pending' | 'accepted' | 'passed' | 'expired'

matches       (id, session_id, participant_a, participant_b,
               matched_at, reveal_stage, first_message_at)
  -- reveal_stage: 'hidden' | 'blurred' | 'revealed'

messages      (id, match_id, sender_id, body, sent_at)

domain_events (id, session_id, event_type, actor_participant_id,
               payload jsonb, created_at)
  -- append-only; written in same transaction as state mutations
  -- event_type e.g. 'participant.joined', 'vibe.sent', 'match.created'
  -- payload: ids, round_number, etc. — no PII beyond session handles
```

Notes:
- The "answer trail" shown on expand-cards is not a separate table — it's
  `answers` joined by `participant_id`, ordered by `round_number`. Keep this
  as a simple query, not a denormalized cache, for v0.
- `vibes` mutuality check (A→B accepted AND B→A accepted, or A→B accepted
  after B had already sent A one) should happen atomically in a Postgres
  function or Edge Function — don't let two client writes race to create the
  match row. Emit `match.created` (and any `vibe.*` events) in that same
  transaction.
- `domain_events` is not readable by participants via RLS — service role /
  future organizer dashboard only. See Architecture.
- RLS matters here specifically because of anonymity: a participant should
  never be able to query another participant's raw identity, only their
  session-scoped handle/avatar/answers. Design RLS policies before writing
  UI that assumes broader read access.

## Round sync (realtime)

Round timing must be server-anchored, not client-timer-based:
- `rounds.opens_at` / `closes_at` are set server-side.
- Supabase Realtime pushes the round-open event to all connected clients.
- Each client computes its own countdown from the server timestamp, not from
  "time since I received the push" — otherwise late/dropped events desync
  the room. (Same pattern as a `performance.now()`-anchored countdown against
  a server timestamp.)

## Session FSM (trivia)

Sessions run on a clock-driven finite state machine in Postgres
(`private.transition_session`). Phase deadlines are stored in `session_deadlines`;
a **persistent scheduler worker** fires them via Realtime + `setTimeout`
(sub-second). `session_tick` via `pg_cron` is fallback only (~1 min lag):

| Phase | Meaning |
|---|---|
| `scheduled` | Before `scheduled_starts_at`; players can check in |
| `opener` | Opener question window (~10 min default) |
| `round_live` | Active trivia round (~90s) |
| `round_interstitial` | Break between rounds (~15 min); vibe window |
| `social` | All planned rounds done; vibes/chat continue |
| `ended` | Terminal |

- Questions come from `session_round_plan` — system picks, host does not.
- Late join is always allowed while `status` is `scheduled` or `active`.
- Opener is per-participant and required once (any time until they submit).
- Host PIN is for emergency pause / resume / force-end only.

## Gradual reveal timer

- A scheduled job (`pg_cron`, minute-level is fine for v0) checks active
  `matches` where `reveal_stage = 'hidden'` and both sides have sent at least
  one message; if `now() - first_message_at` exceeds the threshold, flip to
  `'blurred'`.
- Full `'revealed'` only happens via an explicit mutual action from both
  participants — never automatically.

## Content bank

A structured starter question bank (25 prompts across the 5 formats, with a
review/verification workflow and status tracking) already exists as a
spreadsheet — pull prompts from there rather than inventing new ones inline
in code. Treat `questions` as seedable/admin-editable data, not hardcoded
strings, since the bank will grow and get curated over time (AI-assisted
generation + human review before anything goes live, per the review
workflow in that sheet).

## Screens (v0 minimum)

1. Check-in (QR scan → join session)
2. Opener question
3. Round screen (prompt + live leaderboard, tap-to-expand answer trail +
   Send a Vibe / Skip)
4. Incoming Vibe queue (one at a time, Accept / Pass)
5. Chat (blurred avatar, unlocks over time, explicit mutual reveal action)
6. **Host ops screen** — pause / resume / force-end only (trivia is
   clock-driven; system picks questions from `session_round_plan`)

## Known gaps / deliberately deferred

- **No persistent accounts.** QR-only entry means a passed/blocked person
  could rejoin as a "new" anonymous participant. Fine for a small v0 test
  event; needs at least lightweight device fingerprinting or phone-gated
  check-in before running at a real public/repeat venue.
- **Wingman/nudge mechanic** (a participant deputizes a trusted friend to
  nudge someone on their behalf) — explicitly a v2+ feature, not core MVP.
  Deliberately manual/explicit, not automatic triangle-detection (that felt
  too obvious/creepy when discussed).
- **Cross-event history / persistent profiles** — out of scope for v0;
  everything is session-scoped.
- **Organizer-facing analytics dashboard** (check-ins, plays, Vibes sent,
  matches made) — needed for the B2B2C pitch to venues eventually, not
  needed to run a first test event.
- **1v1 side games** (tic-tac-toe etc. as a post-match icebreaker) — designed
  in `docs/games.md`, not needed to run a first trivia+vibe test event.
  Must not replace group rounds or feed leaderboard / reveal.

## Business context (for product decisions, not engineering)

- Go-to-market is organizer-first (B2B2C): license the game layer to singles
  mixers, networking events, run clubs — not a general consumer download.
  This shapes what "v0 done" means: good enough to run at one real
  partnered event, not a public app store launch.
- Monetization: organizer licensing first, consumer subscription once there
  is real usage (extra Vibes, cosmetic flair — never pay-to-see-who-liked-
  you, which would undercut the whole positioning), sponsored sessions
  later.