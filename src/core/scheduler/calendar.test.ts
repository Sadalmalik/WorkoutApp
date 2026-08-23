import { describe, it, expect } from 'vitest';
import { FixedClock } from '../ports/index.ts';
import type { Program, PlanDay } from '../model/index.ts';
import { DAY_MS } from './day.ts';
import { CalendarScheduler } from './calendar.ts';

const rest: PlanDay = { kind: 'rest' };

/** A workout day tagged by id, with one block per id in `blockIds` (default one). */
function w(tag: string, blockIds: string[] = [`${tag}-b`]): PlanDay {
  return {
    kind: 'workout',
    workout: {
      id: tag,
      blocks: blockIds.map((id) => ({ id, exercises: [], sets: 1, betweenSetsRest: 0, betweenSupersetExercisesRest: 0 })),
      betweenBlocksRest: 0,
    },
  };
}

function program(days: PlanDay[]): Program {
  return { id: 'p', name: 'P', plans: [{ id: 'plan', days }], recommendedSchedulerId: 'calendar' };
}

/** Clock fixed to the UTC midnight of day ordinal `n`. */
function atDay(n: number): FixedClock {
  return new FixedClock(n * DAY_MS);
}

const sched = new CalendarScheduler();

/** Fresh state for a program launched on day `start`. */
function stateAt(start: number) {
  return sched.init(atDay(start));
}

describe('CalendarScheduler — today = date → plan day', () => {
  const prog = program([w('W0'), w('W1'), rest]); // 3-day cycle

  it('maps each calendar day to its plan-day and wraps by cycle length', () => {
    const s = stateAt(0);
    expect(sched.currentWorkout(s, prog, atDay(0))?.id).toBe('W0');
    expect(sched.currentWorkout(s, prog, atDay(1))?.id).toBe('W1');
    expect(sched.currentWorkout(s, prog, atDay(2))).toBeNull(); // rest
    expect(sched.currentWorkout(s, prog, atDay(3))?.id).toBe('W0'); // wrap
    expect(sched.currentWorkout(s, prog, atDay(4))?.id).toBe('W1');
  });

  it('offsets by the launch date, not the epoch', () => {
    const s = stateAt(10); // launched on day 10
    expect(sched.currentWorkout(s, prog, atDay(10))?.id).toBe('W0');
    expect(sched.currentWorkout(s, prog, atDay(12))).toBeNull();
  });
});

describe('CalendarScheduler — an unstarted missed workout burns', () => {
  it('the next day maps to the next plan-day; the skipped one is gone', () => {
    const prog = program([w('W0'), w('W1')]); // 2-day cycle, no rest
    const s = stateAt(0);

    expect(sched.currentWorkout(s, prog, atDay(0))?.id).toBe('W0');
    // User never trains on day 0. Day 1 is W1 — W0 did not carry over.
    expect(sched.currentWorkout(s, prog, atDay(1))?.id).toBe('W1');
  });

  it('explicit skip burns today the same way completion clears it', () => {
    const prog = program([w('W0'), w('W1')]);
    const s0 = stateAt(0);

    const skipped = sched.skip(s0, prog, atDay(0));
    expect(sched.currentWorkout(skipped, prog, atDay(0))).toBeNull(); // done for today
    expect(sched.currentWorkout(skipped, prog, atDay(1))?.id).toBe('W1');
  });
});

describe('CalendarScheduler — completing today', () => {
  it('advance clears today\'s workout but the calendar still marches', () => {
    const prog = program([w('W0'), w('W1'), rest]);
    const s0 = stateAt(0);

    const done = sched.advance(s0, prog, atDay(0));
    expect(sched.currentWorkout(done, prog, atDay(0))).toBeNull(); // already done today
    expect(sched.currentWorkout(done, prog, atDay(1))?.id).toBe('W1');
  });
});

describe('CalendarScheduler — return after a long break', () => {
  it('lands on whatever plan-day the date maps to, with no accumulation', () => {
    const prog = program([w('W0'), w('W1'), rest]); // L = 3
    const s = stateAt(0);
    // 100 = 33*3 + 1 → index 1 → W1.
    expect(sched.currentWorkout(s, prog, atDay(100))?.id).toBe('W1');
    expect(sched.currentWorkout(s, prog, atDay(102))?.id).toBe('W0'); // 102 mod 3 = 0 → W0
    expect(sched.currentWorkout(s, prog, atDay(101))).toBeNull(); // 101 mod 3 = 2 → rest
  });
});

describe('CalendarScheduler — block deferral', () => {
  const prog = program([w('W0', ['a', 'b', 'c'])]);

  it('applies a deferred block order to the returned workout', () => {
    let s = stateAt(0);
    // Seed the order from the workout (session does this in ticket 05), then defer 'a'.
    s = { ...s, blockOrder: ['a', 'b', 'c'] };
    s = sched.deferBlock(s, 'a');

    const order = sched.currentWorkout(s, prog, atDay(0))!.blocks.map((b) => b.id);
    expect(order).toEqual(['b', 'a', 'c']);
  });

  it('deferring the last block is a no-op', () => {
    let s = { ...stateAt(0), blockOrder: ['a', 'b', 'c'] };
    s = sched.deferBlock(s, 'c');
    expect(sched.currentWorkout(s, prog, atDay(0))!.blocks.map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('CalendarScheduler — serialization', () => {
  it('round-trips its state through serialize/deserialize', () => {
    const s = sched.advance(stateAt(7), program([w('W0')]), atDay(7));
    const raw = JSON.parse(JSON.stringify(sched.serialize(s)));
    expect(sched.deserialize(raw)).toEqual(s);
  });
});
