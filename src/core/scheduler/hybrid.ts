/**
 * Hybrid scheduler (ADR 0001).
 *
 * A workout **waits** for completion — missing the gym does not burn it; it stays "today's
 * workout" until `advance`d. Rest days, by contrast, **advance by the calendar**: each new
 * calendar day consumes one rest day, so rest passes on its own while a workout never does.
 *
 * State is a cursor into `plan.days` plus the calendar day that cursor became due. Resolution
 * walks the cursor forward one rest-day per elapsed calendar day, stopping at the first workout
 * day (which blocks) or once the cursor's due-day catches up to today.
 */

import type { Clock } from '../ports/index.ts';
import type { Program, PlanDay, Workout, SchedulerState } from '../model/index.ts';
import type { Scheduler } from './scheduler.ts';
import { dayIndex } from './day.ts';
import { applyBlockOrder, deferInOrder } from './block-order.ts';

/** Concrete runtime state of the {@link HybridScheduler}. Stored opaquely in the save. */
export type HybridState = {
  kind: 'hybrid';
  /** Index into `plan.days` of the plan-day currently active. */
  cursor: number;
  /** Day ordinal (see {@link dayIndex}) on which `cursor` became / is due to become current. */
  cursorDay: number;
  /** Day ordinal on which a workout was last completed, or `null` (drives the Home "done" state). */
  completedDay: number | null;
  /** Order of the current workout's block ids after {@link Scheduler.deferBlock}, or `null`. */
  blockOrder: string[] | null;
};

/** Narrow the opaque save state to a {@link HybridState}, tolerating a partially-formed value. */
export function asHybridState(state: SchedulerState): HybridState {
  const s = state as Partial<HybridState>;
  return {
    kind: 'hybrid',
    cursor: typeof s.cursor === 'number' ? s.cursor : 0,
    cursorDay: typeof s.cursorDay === 'number' ? s.cursorDay : 0,
    completedDay: typeof s.completedDay === 'number' ? s.completedDay : null,
    blockOrder: Array.isArray(s.blockOrder) ? s.blockOrder.slice() : null,
  };
}

/**
 * Advance `cursor`/`cursorDay` through rest days for the calendar days elapsed up to `today`.
 * Each rest day consumes exactly one calendar day; a workout day halts the walk (it waits). If
 * the plan has no workout day at all, rest just tracks the calendar (bounded by the gap).
 */
function resolve(days: PlanDay[], cursor: number, cursorDay: number, today: number): { cursor: number; cursorDay: number } {
  const length = days.length;
  let c = cursor;
  let d = cursorDay;
  while (today > d && days[c].kind === 'rest') {
    c = (c + 1) % length;
    d += 1;
  }
  return { cursor: c, cursorDay: d };
}

export class HybridScheduler implements Scheduler {
  readonly id = 'hybrid' as const;

  init(clock: Clock): HybridState {
    return { kind: 'hybrid', cursor: 0, cursorDay: dayIndex(clock.now()), completedDay: null, blockOrder: null };
  }

  currentWorkout(state: SchedulerState, program: Program, clock: Clock): Workout | null {
    const s = asHybridState(state);
    const days = program.plans[0].days;
    const { cursor } = resolve(days, s.cursor, s.cursorDay, dayIndex(clock.now()));
    const day = days[cursor];

    if (day.kind !== 'workout') return null;
    return applyBlockOrder(day.workout, s.blockOrder);
  }

  /** Complete the current workout: step to the next plan-day, due starting the next calendar day. */
  advance(state: SchedulerState, program: Program, clock: Clock): HybridState {
    const s = asHybridState(state);
    const days = program.plans[0].days;
    const today = dayIndex(clock.now());
    const { cursor } = resolve(days, s.cursor, s.cursorDay, today);

    return {
      kind: 'hybrid',
      cursor: (cursor + 1) % days.length,
      cursorDay: today + 1,
      completedDay: today,
      blockOrder: null,
    };
  }

  /**
   * "начать следующую" — jump straight to the next workout, making it current **today**. Steps at
   * least one plan-day forward from the resolved cursor and keeps skipping consecutive rest days so
   * a run of rest days is cleared in a single call (on a workout day it likewise drops the current
   * workout and lands on the following one). A plan with no workout day falls back to a single step.
   */
  skip(state: SchedulerState, program: Program, clock: Clock): HybridState {
    const s = asHybridState(state);
    const days = program.plans[0].days;
    const length = days.length;
    const today = dayIndex(clock.now());
    const { cursor } = resolve(days, s.cursor, s.cursorDay, today);

    // Advance past the current plan-day, then skip any run of rest days to reach the next workout.
    let next = (cursor + 1) % length;
    for (let steps = 1; steps < length && days[next].kind === 'rest'; steps += 1) {
      next = (next + 1) % length;
    }

    return {
      kind: 'hybrid',
      cursor: next,
      cursorDay: today,
      completedDay: s.completedDay,
      blockOrder: null,
    };
  }

  deferBlock(state: SchedulerState, blockId: string): HybridState {
    const s = asHybridState(state);
    return { ...s, blockOrder: deferInOrder(s.blockOrder, blockId) };
  }

  serialize(state: SchedulerState): HybridState {
    return asHybridState(state);
  }

  deserialize(raw: unknown): HybridState {
    return asHybridState((raw ?? {}) as SchedulerState);
  }
}
