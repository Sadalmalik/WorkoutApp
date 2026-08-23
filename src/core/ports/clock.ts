/**
 * Port: source of the current time.
 *
 * The core reads time only through this port so that behaviour depending on "now"
 * (scheduling, session continuation prompts, timer) is deterministic in tests.
 */
export interface Clock {
  /** Current time as epoch milliseconds (as {@link Date.now}). */
  now(): number;
}

/** Real clock backed by {@link Date.now}. Use in the app. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/**
 * Deterministic clock for tests. Time only moves when the test moves it.
 */
export class FixedClock implements Clock {
  private t: number;

  constructor(nowMs = 0) {
    this.t = nowMs;
  }

  now(): number {
    return this.t;
  }

  /** Set the current time to an absolute epoch-ms value. */
  set(nowMs: number): void {
    this.t = nowMs;
  }

  /** Move the current time forward by `ms` milliseconds. */
  advance(ms: number): void {
    this.t += ms;
  }
}
