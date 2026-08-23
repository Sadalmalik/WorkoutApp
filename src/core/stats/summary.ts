/**
 * Session statistics (ticket 09) — volume, set count and duration, derived purely from the logged
 * sets and the session's timestamps.
 *
 * The session engine (ticket 05) already carries `totalVolume`/`setCount` on {@link SessionSummary};
 * this recomputes them from the raw sets so the result screen (and other consumers) have a single
 * pure, testable derivation that also yields the duration the summary does not store directly.
 */

import type { SessionSet } from '../model/index.ts';

/** Aggregate figures the result screen shows: total volume, number of sets, elapsed time. */
export interface SessionStats {
  /** Σ weight × reps over the logged sets. */
  volume: number;
  /** Number of sets logged. */
  setCount: number;
  /** Elapsed session time in milliseconds (never negative). */
  durationMs: number;
}

/** Compute {@link SessionStats} from the logged sets and the session's start/finish instants. */
export function sessionStats(
  sets: readonly SessionSet[],
  startedAt: number,
  finishedAt: number,
): SessionStats {
  let volume = 0;
  for (const s of sets) volume += s.weight * s.reps;
  return {
    volume,
    setCount: sets.length,
    durationMs: Math.max(0, finishedAt - startedAt),
  };
}
