import type { SessionDeadline } from "./types.js";

type FireHandler = (deadlineId: string) => void;

function kindKey(sessionId: string, kind: SessionDeadline["kind"]): string {
  return `${sessionId}:${kind}`;
}

export class DeadlineTimers {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly kindToDeadlineId = new Map<string, string>();
  private readonly firing = new Set<string>();

  constructor(private readonly onFire: FireHandler) {}

  arm(deadline: SessionDeadline): void {
    if (deadline.status !== "scheduled") {
      return;
    }

    const key = kindKey(deadline.session_id, deadline.kind);
    const existingId = this.kindToDeadlineId.get(key);
    if (existingId && existingId !== deadline.id) {
      this.disarm(existingId);
    }

    this.disarm(deadline.id);
    this.kindToDeadlineId.set(key, deadline.id);

    const delayMs = Math.max(
      0,
      new Date(deadline.fire_at).getTime() - Date.now(),
    );

    const handle = setTimeout(() => {
      this.timers.delete(deadline.id);
      this.fire(deadline.id);
    }, delayMs);

    this.timers.set(deadline.id, handle);
  }

  retry(deadlineId: string, delayMs: number): void {
    this.clearRetry(deadlineId);

    const handle = setTimeout(() => {
      this.retryTimers.delete(deadlineId);
      this.fire(deadlineId);
    }, delayMs);

    this.retryTimers.set(deadlineId, handle);
  }

  disarm(deadlineId: string): void {
    this.clearTimer(deadlineId);
    this.clearRetry(deadlineId);

    for (const [key, id] of this.kindToDeadlineId) {
      if (id === deadlineId) {
        this.kindToDeadlineId.delete(key);
      }
    }
  }

  armedCount(): number {
    return this.timers.size + this.retryTimers.size;
  }

  private fire(deadlineId: string): void {
    if (this.firing.has(deadlineId)) {
      return;
    }

    this.firing.add(deadlineId);
    void Promise.resolve(this.onFire(deadlineId)).finally(() => {
      this.firing.delete(deadlineId);
    });
  }

  private clearTimer(deadlineId: string): void {
    const handle = this.timers.get(deadlineId);
    if (!handle) {
      return;
    }

    clearTimeout(handle);
    this.timers.delete(deadlineId);
  }

  private clearRetry(deadlineId: string): void {
    const handle = this.retryTimers.get(deadlineId);
    if (!handle) {
      return;
    }

    clearTimeout(handle);
    this.retryTimers.delete(deadlineId);
  }
}
