/** A per-set target: weight in kilograms plus a rep count. */
export interface ProgressionTarget {
  /** Target weight in kilograms (the only unit; no imperial). */
  weight: number;
  reps: number;
}

/**
 * Pluggable load-progression strategy (ADR 0003), living on an exercise slot inside a block.
 * The step index is a count of slot executions (not a calendar week) and, in later phases,
 * is derived from result history.
 *
 * INTERFACE ONLY. Phase 1 has a single implementation ("static targets": fixed weight/reps,
 * edited by hand); grids and adaptive shift are Phase 2.
 */
export interface Progression {
  readonly id: string;

  /** Per-set targets for the given step index. */
  targetsForStep(step: number): readonly ProgressionTarget[];
}
