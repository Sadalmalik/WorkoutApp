import type { Clock } from '../ports/index.ts';
import type { Program, Workout, SchedulerState } from '../model/index.ts';

/**
 * Id of a scheduler strategy. A {@link Program} carries a recommended one as data.
 * Phase 1 implementations: `'calendar'` and `'hybrid'`.
 */
export type SchedulerId = string;

/**
 * Pluggable scheduling strategy (ADR 0001). Decides which workout is "now", advances the
 * cursor, and owns its own serialisable runtime state — separate from the program, which is
 * pure data.
 *
 * INTERFACE ONLY. Implementations (`CalendarScheduler`, `HybridScheduler`) arrive in
 * ticket 04. Signatures may be refined there; kept here so the seam is visible.
 */
export interface Scheduler {
  /** Strategy id, matching the value stored in a program's recommended scheduler field. */
  readonly id: SchedulerId;

  /** The workout due now for `state`/`program`, or `null` for a rest day. */
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
