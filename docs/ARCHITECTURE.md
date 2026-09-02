# RoomFull — Architecture

How the system fits together: backend, web client, scheduler, Realtime, and deployment.

Product behavior and design rules live in [`CONTEXT.md`](../CONTEXT.md). Web feature layering rules live in [`.cursor/rules/web-feature-architecture.mdc`](../.cursor/rules/web-feature-architecture.mdc).

---

## System overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Supabase (hosted Postgres)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │ Tables +    │  │ Postgres RPCs│  │ RLS         │  │ domain_events │  │
│  │ constraints │  │ (mutations)  │  │ policies    │  │ (audit log)   │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └───────────────┘  │
│         │                │                 │                            │
│  ┌──────┴────────────────┴─────────────────┴──────────────────────────┐ │
│  │ Session FSM · vibes · matches · chat · leaderboard                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│         │                              ▲                                │
│         │ session_deadlines INSERT     │ fire_session_deadline RPC       │
│         ▼                              │                                │
│  ┌──────────────┐              ┌───────┴────────┐                       │
│  │ pg_cron      │              │ Scheduler worker │                    │
│  │ session_tick │ (fallback)   │ (persistent)     │                    │
│  └──────────────┘              └────────────────┘                       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ Realtime (postgres_changes)
                                ▼
                    ┌───────────────────────┐
                    │ React web app (Vite)  │
                    │ QR → mobile browser   │
                    └───────────────────────┘
```

**Principle:** clients are dumb. Game rules, timing authority, mutuality checks, and RLS all live in Postgres.

---

## Repository layout

```
roomfull/
├── CONTEXT.md              # Product + build contract
├── docs/
│   └── ARCHITECTURE.md       # This file
├── supabase/
│   ├── config.toml
│   └── migrations/         # Schema, RPCs, RLS, cron, seeds
├── web/                    # React SPA (participant + host UI)
│   └── src/
│       ├── app/            # Router, global styles
│       ├── core/           # Supabase, auth, realtime, shared hooks
│       ├── chrome/         # Toasts, drawers
│       ├── layout/         # Shell, bottom nav
│       └── features/       # check-in, opener, play, vibes, chat, host
└── scheduler/              # Persistent deadline worker (NOT serverless)
    └── src/                # Realtime + one setTimeout per session_deadlines row
```

---

## Backend (Supabase / Postgres)

### Data model (core tables)

| Table | Purpose |
|---|---|
| `sessions` | Venue night: phase, deadlines, pause, host PIN |
| `participants` | Anonymous handles per session; linked to Supabase Auth |
| `session_round_plan` | Pre-planned questions + durations |
| `rounds` | Open/closed rounds with `opens_at` / `closes_at` |
| `answers` | Per-participant round answers |
| `vibes` | Directed interest A→B (`pending` / `accepted` / `passed`) |
| `matches` | Mutual vibe → chat thread |
| `messages` | Chat after match |
| `session_deadlines` | One row per upcoming FSM transition (audit + scheduler) |
| `domain_events` | Append-only audit log (same transaction as writes) |

### Session FSM

Phases: `scheduled` → `opener` → `round_live` ⇄ `round_interstitial` → `social` → `ended`

- **Single entry point:** `private.transition_session(session_id, event, actor)`
- **Events:** `EVENT_START`, `OPENER_END`, `ROUND_CLOSE`, `INTERSTITIAL_END`, `SESSION_END`, `HOST_PAUSE`, `HOST_RESUME`, `HOST_FORCE_END`
- **Round open:** `private.open_planned_round()` sets `rounds.closes_at` server-side
- **Host:** PIN-gated RPCs (`host_pause_session`, `dev_reset_session`, …)

### Social graph RPCs

| RPC | Who | What |
|---|---|---|
| `join_session` | anon | QR check-in → participant + token |
| `submit_opener` / `submit_answer` | participant | Answer trail |
| `send_vibe` | participant | Send interest (interstitial/social only) |
| `accept_vibe` / `pass_vibe` | participant | Queue actions; pass is silent |
| `send_message` | participant | Chat after match |
| `get_session_state` | participant | Full play screen state |
| `get_leaderboard` / `get_answer_trail` | participant | Roster + vibe cards |
| `get_prediction_live_tally` | participant | Live Yes/No aggregate (prediction rounds, after you've answered) |
| `get_incoming_vibe` | participant | Vibe queue head |
| `get_my_matches` / `get_chat_messages` | participant | Chat |

**Vibe re-send after pass:** blocked until the *next* round break (`passed_after_round` on `vibes`).

### Auth + RLS

Participants use **anonymous Supabase Auth** + `link_participant_auth` so Realtime and RLS work:

1. Browser signs in anonymously
2. `participant_token` (from QR join) links to `participants.auth_user_id`
3. RLS policies use `auth.uid()` via helpers (`auth_session_id`, `is_match_participant`, `can_read_vibe`)

Clients never `INSERT`/`UPDATE` game tables directly — only RPCs.

### Domain events

Every meaningful mutation emits a row in `domain_events` in the **same transaction** (e.g. `round.opened`, `vibe.sent`, `match.created`). Used for debugging and future analytics — not consumed by clients today.

---

## Scheduler (session timing)

### Problem

Phase transitions depend on deadlines (`phase_deadline`, `rounds.closes_at`, `ends_at`). A naive `pg_cron` poll every minute adds up to ~60s lag after the UI hits 0:00.

### Solution: event-driven deadlines

1. When session/round state changes, triggers call `private.sync_session_deadlines(session_id)`
2. That **supersedes** old rows and **inserts** one new `session_deadlines` row for the next transition
3. A scheduler **arms one timer per deadline row** (not one global interval)
4. When the timer fires → `fire_session_deadline(deadline_id, worker_id)` → `transition_session` → sync inserts the *next* deadline

### `session_deadlines` row

| Column | Meaning |
|---|---|
| `kind` | `event_start`, `opener_end`, `round_close`, `interstitial_end`, `session_end` |
| `expected_event` | FSM event to fire (`OPENER_END`, …) |
| `fire_at` | When to nudge |
| `status` | `scheduled` → `fired` \| `cancelled` \| `superseded` |
| `nudged_by` | Worker id (audit) |

**Pause:** `sessions.paused_at` set → pending deadlines cancelled; on resume → sync reschedules from current state.

**Safety net:** `pg_cron` still runs `session_tick()` every minute if the worker is down.

### Two scheduler runtimes

| Mode | Where | Precision | How |
|---|---|---|---|
| **Persistent worker** (primary) | `scheduler/src/index.ts` | ~sub-second | Realtime on `session_deadlines` INSERT/UPDATE; `Map<deadlineId, setTimeout>` |
| **pg_cron** (fallback only) | Supabase | ~1 minute | `session_tick()` if worker is down |

```bash
# Local dev / event night
cd scheduler && npm run dev

# Production — deploy as a long-running process (Railway, Fly, Render, VPS)
cd scheduler && npm start
```

**Do not deploy the scheduler to Vercel serverless or cron.** Vercel Functions are request-scoped; sub-second phase transitions need a process that holds timers and a Realtime connection.

`pg_cron` remains a safety net only — not the hot path.

---

## Web app (React)

### Feature layers

Each feature under `web/src/features/<name>/`:

```
ui/  →  hooks/  →  orchestration/  →  repo/  →  Supabase RPC
                         ↓
                      store/ (Zustand)
```

- **UI:** render only; events from hook
- **Hook:** React lifecycle, `navigate`, Realtime subscriptions
- **Orchestration:** async flows, store patches, error mapping
- **Repo:** `callRpc` only
- **Store:** serializable UI state

Reference implementation: `features/play/`.

### Core services

| Module | Role |
|---|---|
| `core/supabase/client.ts` | Typed Supabase client (`Database` from generated types) |
| `core/supabase/rpc.ts` | Typed `callRpc` wrapper |
| `core/session/auth.service.ts` | Anonymous auth + participant link + Realtime JWT |
| `core/session/participant-store.ts` | `participant_token` in `localStorage` |
| `core/realtime/realtime.service.ts` | `postgres_changes` for sessions, rounds, vibes, messages |
| `core/hooks/use-countdown.ts` | UI timers from server `closes_at` / `phase_deadline` |

### Routes

| Path | Feature |
|---|---|
| `/join` | QR check-in |
| `/opener` | Opener question |
| `/` (play) | Trivia + leaderboard + vibe send |
| `/vibes` | Incoming vibe queue |
| `/chat`, `/chat/:matchId` | Matches + thread |
| `/host` | Dev/host tools (PIN) |

### Generated types

Regenerate after schema changes:

```bash
supabase gen types typescript --linked --schema public \
  > web/src/core/supabase/database.types.ts
```

Commit `database.types.ts`. The web client imports `Database` in `client.ts` and `rpc.ts`.

### Debug logging

Chat Realtime trace logs are **off by default**. Enable locally only:

```env
VITE_CHAT_RT_DEBUG=true
```

---

## Realtime flow (example: chat)

```
send_message RPC
  → INSERT messages
  → RLS allows SELECT for match participants
  → postgres_changes on messages (filter: match_id)
  → realtime.service.ts
  → chat-thread.orchestrator
  → Zustand store
  → chat-screen re-renders
```

Same pattern for session phase changes (`sessions` table) and incoming vibes (`vibes` table).

---

## Deployment

### 1. Web — Vercel

| Setting | Value |
|---|---|
| Root Directory | `web` |
| Framework | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

**Environment variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

`web/vercel.json` rewrites all paths to `index.html` for client-side routing.

### 2. Scheduler — persistent worker (not Vercel)

Deploy `scheduler/` as a **long-running Node process**:

| Platform | Setup |
|---|---|
| **Local / event laptop** | `cd scheduler && npm run dev` |
| **Railway / Render / Fly** | Root: `scheduler`, start: `npm start`, env from `scheduler/.env.example` |
| **VPS** | `npm start` under systemd or pm2 |

**Environment variables:**

| Variable | Notes |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SECRET_KEY` | Service role key — never in the web app |
| `SCHEDULER_WORKER_ID` | e.g. `railway-prod-1` (audit trail in `session_deadlines.nudged_by`) |

One instance is enough for v0. Run a second instance only with leader election (not implemented yet).

### 3. Supabase (hosted)

- Apply migrations: `supabase db push`
- Enable Realtime on: `sessions`, `rounds`, `answers`, `vibes`, `messages`, `matches`, `session_deadlines`
- `pg_cron` `roomfull-session-tick` remains as fallback

---

## Request flows

### Join → play a round

```
Browser scan QR
  → join_session(qr_code)
  → participant_token stored locally
  → link_participant_auth (anonymous Supabase session)
  → submit_opener
  → get_session_state (poll + Realtime on sessions)
  → submit_answer during round_live
  → scheduler fires ROUND_CLOSE at closes_at
  → phase → round_interstitial (vibe window)
```

### Send vibe → match → chat

```
send_vibe(to_id) during interstitial
  → vibes row pending
  → Realtime → recipient toast / vibe queue
  → accept_vibe OR pass_vibe (silent)
  → accept → try_create_match → match row
  → send_message / Realtime postgres_changes
```

---

## What to improve next

See conversation history / team backlog. High-value items:

1. RPC integration tests (SQL or script) for full loop
2. Regenerate + commit types after every migration
3. Remove or gate remaining dev-only paths (`verifyMessagesRealtimeAccess`, host dev tools in prod)

---

## Related files

| Area | Key migrations |
|---|---|
| Initial schema + vibes | `20260828123753_initial_schema.sql` |
| Session FSM | `20260829130000_session_fsm.sql` |
| Realtime RLS helpers | `20260901170500_realtime_rls_security_definer_helpers.sql` |
| Accept = match | `20260901180000_accept_vibe_creates_match.sql` |
| Deadline scheduler | `20260902120000_session_deadlines_scheduler.sql` |
| Vibe re-send after pass | `20260902140000_vibe_resend_after_pass.sql` |
