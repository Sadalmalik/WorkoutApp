/**
 * Calendar scheduler (ADR 0001).
 *
 * "Today" is a pure function of the date: the plan-day due now is derived from the launch date
 * and the cycle length (`plan.days.length`). Nothing accumulates — an unstarted workout that its
 * calendar day passes over simply **burns**; the next day maps to whatever plan-day the date
 * lands on. Completing (or skipping) today's workout only marks today as done so the rest of the
 * day shows no pending workout; the cursor is otherwise entirely date-driven.
 */

import type { Clock } from '../ports/index.ts';
import type { Program, Workout, SchedulerState } from '../model/index.ts';
import type { Scheduler } from './scheduler.ts';
import { dayIndex, mod } from './day.ts';
import { applyBlockOrder, deferInOrder } from './block-order.ts';

/** Concrete runtime state of the {@link CalendarScheduler}. Stored opaquely in the save. */
export type CalendarState = {
  kind: 'calendar';
  /** Day ordinal (see {@link dayIndex}) on which the program was launched. */
  startDay: number;
  /** Day ordinal on which today's workout was completed or skipped, or `null` for none yet. */
  completedDay: number | null;
  /** Order of the current workout's block ids after {@link Scheduler.deferBlock}, or `null`. */
  blockOrder: string[] | null;
};

/** Narrow the opaque save state to a {@link CalendarState}, tolerating a partially-formed value. */
export function asCalendarState(state: SchedulerState): CalendarState {
  const s = state as Partial<CalendarState>;
  return {
    kind: 'calendar',
    startDay: typeof s.startDay === 'number' ? s.startDay : 0,
    completedDay: typeof s.completedDay === 'number' ? s.completedDay : null,
    blockOrder: Array.isArray(s.blockOrder) ? s.blockOrder.slice() : null,
  };
}

/** The plan-day index due on `today` for a program launched on `startDay` over an `L`-day cycle. */
function planIndex(startDay: number, today: number, length: number): number {
  return mod(today - startDay, length);
}

export class CalendarScheduler implements Scheduler {
  readonly id = 'calendar' as const;

  init(clock: Clock): CalendarState {
    return { kind: 'calendar', startDay: dayIndex(clock.now()), completedDay: null, blockOrder: null };
  }

  currentWorkout(state: SchedulerState, program: Program, clock: Clock): Workout | null {
    const s = asCalendarState(state);
    const days = program.plans[0].days;
    const today = dayIndex(clock.now());
    const day = days[planIndex(s.startDay, today, days.length)];

    if (day.kind !== 'workout') return null;
    if (s.completedDay === today) return null; // already done/skipped today
    return applyBlockOrder(day.workout, s.blockOrder);
  }

  /** Mark today's workout complete. The calendar marches on its own; nothing else changes. */
  advance(state: SchedulerState, _program: Program, clock: Clock): CalendarState {
    const s = asCalendarState(state);
    return { ...s, completedDay: dayIndex(clock.now()), blockOrder: null };
  }

  /** Skip today's workout — identical effect to completing it (the missed workout burns). */
  skip(state: SchedulerState, program: Program, clock: Clock): CalendarState {
    return this.advance(state, program, clock);
  }

  deferBlock(state: SchedulerState, blockId: string): CalendarState {
    const s = asCalendarState(state);
    return { ...s, blockOrder: deferInOrder(s.blockOrder, blockId) };
  }

  serialize(state: SchedulerState): CalendarState {
    return asCalendarState(state);
  }

  deserialize(raw: unknown): CalendarState {
    return asCalendarState((raw ?? {}) as SchedulerState);
  }
}
