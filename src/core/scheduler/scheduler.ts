import type { Clock } from '../ports/index.ts';
import type { Program, Workout, SchedulerState } from '../model/index.ts';

/**
 * Id of a scheduler strategy. A {@link Program} carries a recommended one as data.
 * Phase 1 implementations: `'calendar'` and `'hybrid'`.
 */
export type SchedulerId = 'calendar' | 'hybrid';

/**
 * Pluggable scheduling strategy (ADR 0001). Decides which workout is "now", advances the
 * cursor, and owns its own serialisable runtime state — separate from the program, which is
 * pure data.
 *
 * Implementations: {@link CalendarScheduler}, {@link HybridScheduler} (ticket 04). Each owns a
 * concrete {@link SchedulerState} shape discriminated by a `kind` field and treats the opaque
 * `SchedulerState` it receives as its own after narrowing.
 */
export interface Scheduler {
  /** Strategy id, matching the value stored in a program's recommended scheduler field. */
  readonly id: SchedulerId;

  /**
   * Fresh runtime state for a program launched now. The start date is read from `clock`
   * (see ADR 0001 — the cursor/start-date is per-run private state, not part of the program).
   */
  init(clock: Clock): SchedulerState;

  /** The workout due now for `state`/`program`, or `null` for a rest day / a day already done. */
  currentWorkout(state: SchedulerState, program: Program, clock: Clock): Workout | null;

  /** Advance the cursor after a workout is completed; returns the next state. */
  advance(state: SchedulerState, program: Program, clock: Clock): SchedulerState;

  /** Skip the current workout (calendar: it burns; hybrid: it waits); returns the next state. */
  skip(state: SchedulerState, program: Program, clock: Clock): SchedulerState;

  /** Swap the given block with the following one in the current workout; returns the next state. */
  deferBlock(state: SchedulerState, blockId: string): SchedulerState;

  /** Serialise runtime state for {@link SaveData.schedulerState}. */
  serialize(state: SchedulerState): unknown;

  /** Rebuild runtime state from persisted JSON. */
  deserialize(raw: unknown): SchedulerState;
}
