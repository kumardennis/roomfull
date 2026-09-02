import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { DeadlineTimers } from "./deadline-timers.js";
import type { SessionDeadline } from "./types.js";

const supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const timers = new DeadlineTimers(async (deadlineId) => {
  await fireDeadline(deadlineId);
});

function log(message: string, extra?: Record<string, unknown>): void {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[scheduler] ${message}${suffix}`);
}

type FireResult = {
  noop?: boolean;
  reason?: string;
};

async function fireDeadline(deadlineId: string): Promise<void> {
  const { data, error } = await supabase.rpc("fire_session_deadline", {
    p_deadline_id: deadlineId,
    p_worker_id: config.workerId,
  });

  if (error) {
    log("fire failed", { deadlineId, error: error.message });
    return;
  }

  const result = data as FireResult | null;
  if (result?.noop && result.reason === "not_claimable") {
    log("retrying claim", { deadlineId });
    timers.retry(deadlineId, 1_000);
    return;
  }

  timers.disarm(deadlineId);
  log("fired", { deadlineId, result: data });
}

function handleDeadlineInsert(row: SessionDeadline): void {
  if (row.status !== "scheduled") {
    return;
  }

  timers.arm(row);
  log("armed", {
    deadlineId: row.id,
    sessionId: row.session_id,
    kind: row.kind,
    fireAt: row.fire_at,
    armed: timers.armedCount(),
  });
}

function handleDeadlineUpdate(
  _previous: Partial<SessionDeadline>,
  next: SessionDeadline,
): void {
  if (next.status !== "scheduled") {
    timers.disarm(next.id);
    log("disarmed", {
      deadlineId: next.id,
      status: next.status,
      armed: timers.armedCount(),
    });
    return;
  }

  handleDeadlineInsert(next);
}

async function loadScheduledDeadlines(): Promise<void> {
  const { data, error } = await supabase
    .from("session_deadlines")
    .select(
      "id, session_id, kind, expected_event, fire_at, round_id, status",
    )
    .eq("status", "scheduled")
    .order("fire_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load deadlines: ${error.message}`);
  }

  const latestByKind = new Map<string, SessionDeadline>();
  for (const row of (data ?? []) as SessionDeadline[]) {
    const key = `${row.session_id}:${row.kind}`;
    const existing = latestByKind.get(key);
    if (!existing || row.fire_at > existing.fire_at) {
      latestByKind.set(key, row);
    }
  }

  for (const row of latestByKind.values()) {
    handleDeadlineInsert(row);
  }

  log("bootstrapped", {
    scheduled: data?.length ?? 0,
    armed: latestByKind.size,
  });
}

function subscribeToDeadlines(): void {
  const channel = supabase
    .channel(`session-deadlines:${config.workerId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "session_deadlines",
      },
      (payload) => {
        handleDeadlineInsert(payload.new as SessionDeadline);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "session_deadlines",
      },
      (payload) => {
        handleDeadlineUpdate(
          (payload.old ?? {}) as Partial<SessionDeadline>,
          payload.new as SessionDeadline,
        );
      },
    )
    .subscribe((status) => {
      log("realtime status", { status });
    });

  process.on("SIGINT", () => {
    void channel.unsubscribe();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    void channel.unsubscribe();
    process.exit(0);
  });
}

async function main(): Promise<void> {
  log("starting", { workerId: config.workerId });
  await loadScheduledDeadlines();
  subscribeToDeadlines();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[scheduler] fatal: ${message}`);
  process.exit(1);
});
