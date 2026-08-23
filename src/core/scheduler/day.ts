/**
 * Calendar-day arithmetic shared by the schedulers.
 *
 * Both strategies reason in whole "day ordinals" rather than milliseconds: which plan-day is due
 * depends on how many calendar days have elapsed, not on the time of day. The core reads the
 * current instant only through the {@link Clock} port, so day math is a pure function of an
 * epoch-ms value and is fully deterministic under `FixedClock`.
 *
 * NOTE (Phase 1 simplification): a "day" boundary is UTC midnight. This keeps day counting
 * independent of the host timezone (so tests and CI are deterministic) at the cost of local
 * midnights not lining up with UTC ones. Real local-midnight handling can be layered in later
 * without touching the {@link Scheduler} interface — it only changes {@link dayIndex}.
 */

/** Milliseconds in one day. */
export const DAY_MS = 86_400_000;

/**
 * The whole-day ordinal for an epoch-ms instant (days since the Unix epoch, UTC). Two instants on
 * the same UTC calendar day share an ordinal; the next day's ordinal is exactly one greater.
 */
export function dayIndex(epochMs: number): number {
  return Math.floor(epochMs / DAY_MS);
}

/** Non-negative modulo (JS `%` keeps the sign of the dividend; plan indices must wrap positively). */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
