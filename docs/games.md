# Side games (1v1)

Designed, not built. Trivia (`features/play/`) stays the room-wide loop.
This spec is for **optional 1v1 tables** after a mutual vibe — icebreakers
inside chat, not a replacement for group rounds.

Implement in the usual order: schema → RLS → RPC → verify → UI.

## Product

- First placement: matched chat. Either person can start a table.
- Later (optional): same runtime during `social` / interstitial. Do not run
  1v1 during `round_live`.
- Winning a side game must not affect vibes, leaderboard points, or reveal.
  It is a toy, not a ranking.
- Session-scoped like everything else. No cross-event ELO.

## Constraints

- **Clients are dumb I/O.** A game module renders a derived `view` and emits
  an opaque `payload` on tap. No legal-move checks, no winner detection, no
  local event reducer.
- **`game_moves` is truth.** Append-only, sequenced. Board state is always
  *derived* by folding that log in Postgres.
- **Log is strongly consistent. UI is eventually consistent.** Turns are
  totally ordered (`seq` + row lock). A phone may lag one event until
  Realtime + refetch land. Boards are not CRDTs.
- **Flutter later** consumes the same RPCs. Do not put rules in React.

Not in scope: Module Federation, per-game deploys, Kafka, client-side
event sourcing.

## Data

One match table, one move log, a new `game_kind` enum value per game.
Do not add a table per game — matchmaking, RLS, forfeit, and Realtime stay
shared. The enum is the type; the engine owns the shape of `payload` / `view`.

```sql
create type public.game_kind as enum (
  'tic_tac_toe'
  -- add values as games ship
);

create type public.game_match_status as enum (
  'pending', 'live', 'won', 'draw', 'forfeit'
);

create table public.game_matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  social_match_id uuid references public.matches (id) on delete cascade,
  kind public.game_kind not null,
  status public.game_match_status not null default 'pending',
  player_a uuid not null references public.participants (id),
  player_b uuid not null references public.participants (id),
  -- derived cache only; rebuild from game_moves if seq is behind
  view jsonb not null default '{}'::jsonb,
  view_seq int not null default 0,
  winner_id uuid references public.participants (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_moves (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.game_matches (id) on delete cascade,
  seq int not null,
  participant_id uuid not null references public.participants (id),
  client_move_id uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (match_id, seq),
  unique (match_id, client_move_id)
);
```

`view` / `view_seq` are a **cache** written in the same transaction as a
move. If `view_seq <> max(seq)`, fold the log and replace the cache.
Reads never require the cache; restore always works from `game_moves`.

`domain_events` stays session-level: emit `game.started` and `game.ended`
(and forfeit). Do **not** log every tap there — replay lives on `game_moves`.

### RLS

Participants may SELECT `game_matches` and `game_moves` only for tables they
are seated at. All writes go through RPCs (no direct INSERT/UPDATE).

Fog-of-war games (e.g. Battleship) must not expose the opponent's secret
payload via SELECT on `game_moves`. Either fold a **per-viewer** view in
`get_game` and withhold raw moves, or store secrets in a private table.
Turn-based open-information games (tic-tac-toe, Connect Four) can expose
the full log.

## Engine

```
private.fold(kind, moves) → view
private.apply_move(kind, view, actor_id, payload) → view | illegal
```

Dispatch on `kind`. Each game is one SQL function (or a tight pair).
`submit_move` always folds (or uses a cache that matches `max(seq)`), then
`apply_move`, then appends.

`view` is the only thing a client renders. Example tic-tac-toe:

```json
{
  "board": [null, "x", "o", null, "x", null, null, null, "o"],
  "turn": "x",
  "you": "x",
  "result": null
}
```

## RPCs

| Operation | Purpose |
|---|---|
| `create_game_match` | Seat both chat partners, status `live`, empty log, `game.started` |
| `submit_move` | Lock row → fold → apply → append `seq` → refresh view cache → return view |
| `get_game` | Fold (or cache) → `{ match, view, seq, my_turn, status }` |
| `forfeit_game` | Terminal status, `game.ended` |

`submit_move(match_id, payload, client_move_id)`:

1. `SELECT … FOR UPDATE` on `game_matches`.
2. Same `client_move_id` already stored → return current view (idempotent retry).
3. Fold if cache is stale.
4. Illegal / not your turn / not `live` → exception, no row.
5. Insert move, bump cache, set `won` / `draw` when the engine says so.

## Realtime (frontend event-driven)

Publish `game_moves` INSERT (and optionally `game_matches` UPDATE for status).
Filter: `match_id=eq.{id}`.

Client loop:

```
load      → get_game(match_id)
subscribe → game_moves INSERT for that match
on event  → get_game(match_id)          // same fold, new seq
input     → submit_move(payload, uuid)  // do not apply locally
```

The module does **not** apply the event. Realtime is an invalidation signal.
Pending highlight on the tapped cell is allowed; computing a winner is not.

Do not build a client reducer “for snappiness.” Restore would use the server
fold and live play would use a second, drift-prone fold.

### Restore

Leave mid-game → come back → `get_game`. If a move committed, it is in the
log; if the RPC failed, it never happened. No resume handshake.

Replay / debug: `select * from game_moves where match_id = $1 order by seq`
and run `fold`.

## Web module layout

Follow `.cursor/rules/web-feature-architecture.mdc`. Shell owns session,
RPC, Realtime, chrome. Modules are presentational.

```
features/games/
  catalog.ts
  repo/games.repo.ts
  orchestration/games.orchestrator.ts
  hooks/use-game-table.ts
  ui/table-screen.tsx
  games.routes.tsx
  modules/
    tic-tac-toe/ui.tsx
```

```ts
type GameModule = {
  kind: 'tic_tac_toe' // matches game_kind
  View: (props: {
    view: unknown
    myTurn: boolean
    onInput: (payload: unknown) => void
  }) => JSX.Element
}
```

`catalog[kind].View` is the only per-game frontend code. Adding a game is:
enum value + `private.apply_*` + catalog entry + board UI.

## Implementation order

1. Schema + RLS + `tic_tac_toe` engine + `submit_move` / `get_game`.
2. Exercise via SQL: two participants, illegal move rejected, reconnect
   returns the same view, duplicate `client_move_id` is a no-op.
3. React table shell in chat + tic-tac-toe board.
4. Next kind is Connect Four (same runtime, larger board).

## Games that fit

Filter: mobile web, < ~2 min, discrete moves, learnable at a mixer, no
expertise hierarchy (same reason trivia is not capital cities), no photos,
foldable in SQL.

### Ship first

| Game | Why |
|---|---|
| **Tic-tac-toe** | Proves the runtime. 9 taps, open info, trivial fold. |
| **Connect Four** | Same input model (`{ col }`), slightly more play, still short. |

### Same runtime, next

| Game | Notes |
|---|---|
| **SOS** | 3×3 or 5×5 letter placement. Still a grid + tap. |
| **Dots and boxes** | Claim an edge; good once the grid renderer exists. |
| **Gomoku (5-in-a-row)** | Cap the board (e.g. 9×9) so mixer games stay short. |
| **Reversi / Othello** | Flip-line fold is still pure SQL. A bit more “I know this game.” |
| **Nim / subtraction** | Tiny UI, good for testing the engine without a grid. |
| **Rock–paper–scissors** (best of 5) | **Simultaneous** turns: both submit before fold reveals. Tests a second turn model without new infrastructure. Commit payload sealed until both rows exist (or timeout). |

### Worth it later (still 1v1, still this log)

| Game | Extra work |
|---|---|
| **Memory (concentration)** | Server shuffles once as move 0 / seed. View hides unmatched faces. |
| **Battleship** | Fog of war: `get_game` returns a **per-viewer** view; do not SELECT raw opponent placements. |
| **Mancala** | More rules, still turn + discrete pits. |
| **Pig / simple dice** | RNG **in the RPC**, recorded as a move (`{ "roll": 4 }`), never `Math.random()` on the client. |

### Do not build on this runtime (or not as mixer icebreakers)

| Game | Why |
|---|---|
| Chess, Go, competitive card TCG | Too long; recreates a skill hierarchy. |
| Real-time drawing, physics, twitch tap games | Need a different transport; clients stop being dumb. |
| Anything photo / likeness based | Violates “no photos before reveal.” |
| Room-wide trivia / this-or-that | Already `features/play/`. Do not fork it into `game_moves`. |
| Jackbox / Codenames / Werewolf | Party games; different seating and timing than 1v1 chat tables. |

Simultaneous-turn (RPS) and hidden-info (Battleship) are **engine flags**, not
new platforms. Keep one log; change when `apply_move` is allowed to run.

## Out of scope until the runtime exists

- Spectator mode for the rest of the room
- Host-picked “play this game next” as a session phase
- Ranked / points / cosmetics tied to side-game wins
- More than two seats (can extend `game_seats` later; do not design it now)
