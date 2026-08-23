import { describe, it, expect } from 'vitest';
import { FixedClock } from '../ports/index.ts';
import type { Program, PlanDay } from '../model/index.ts';
import { DAY_MS } from './day.ts';
import { HybridScheduler } from './hybrid.ts';
import type { HybridState } from './hybrid.ts';

const rest: PlanDay = { kind: 'rest' };

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
  return { id: 'p', name: 'P', plans: [{ id: 'plan', days }], recommendedSchedulerId: 'hybrid' };
}

function atDay(n: number): FixedClock {
  return new FixedClock(n * DAY_MS);
}

const sched = new HybridScheduler();

function stateAt(start: number) {
  return sched.init(atDay(start));
}

describe('HybridScheduler — a workout waits for completion', () => {
  it('keeps the same workout current across skipped gym days', () => {
    const prog = program([w('W0'), w('W1')]);
    const s = stateAt(0);

    expect(sched.currentWorkout(s, prog, atDay(0))?.id).toBe('W0');
    expect(sched.currentWorkout(s, prog, atDay(3))?.id).toBe('W0'); // 3 gym days missed, still W0
    expect(sched.currentWorkout(s, prog, atDay(10))?.id).toBe('W0');
  });

  it('advances to the next plan-day only once the workout is completed', () => {
    const prog = program([w('W0'), w('W1')]);
    const s0 = stateAt(0);

    // Completed on day 5 after skipping the gym for days 0..4.
    const after = sched.advance(s0, prog, atDay(5));
    expect(sched.currentWorkout(after, prog, atDay(5))?.id).toBe('W1'); // next workout waits
    expect(sched.currentWorkout(after, prog, atDay(20))?.id).toBe('W1'); // still waiting
  });
});

describe('HybridScheduler — rest days advance by the calendar', () => {
  it('a rest day is spent on its own calendar day, then yields the next workout', () => {
    const prog = program([rest, w('W0')]);
    const s = stateAt(0);

    expect(sched.currentWorkout(s, prog, atDay(0))).toBeNull(); // rest today
    expect(sched.currentWorkout(s, prog, atDay(1))?.id).toBe('W0'); // rest advanced with the day
  });

  it('consumes several consecutive rest days one per calendar day', () => {
    const prog = program([rest, rest, w('W0')]);
    const s = stateAt(0);

    expect(sched.currentWorkout(s, prog, atDay(0))).toBeNull();
    expect(sched.currentWorkout(s, prog, atDay(1))).toBeNull();
    expect(sched.currentWorkout(s, prog, atDay(2))?.id).toBe('W0');
  });

  it('after completion the next day is a rest day that passes with the calendar', () => {
    const prog = program([w('W0'), rest, w('W1')]);
    const done = sched.advance(stateAt(0), prog, atDay(0)); // finished W0 on day 0

    expect(sched.currentWorkout(done, prog, atDay(0))).toBeNull(); // rest of day 0: done
    expect(sched.currentWorkout(done, prog, atDay(1))).toBeNull(); // rest day
    expect(sched.currentWorkout(done, prog, atDay(2))?.id).toBe('W1'); // next workout waits
  });
});

describe('HybridScheduler — pull-forward ("начать следующую") on a rest day', () => {
  it('skip on a rest day surfaces the next workout the same day', () => {
    const prog = program([w('W0'), rest, w('W1')]);
    const done = sched.advance(stateAt(0), prog, atDay(0)); // cursor now on the rest day (due day 1)

    // On day 1 it is a rest day...
    expect(sched.currentWorkout(done, prog, atDay(1))).toBeNull();
    // ...user chooses "начать следующую": pull W1 forward into day 1.
    const pulled = sched.skip(done, prog, atDay(1));
    expect(sched.currentWorkout(pulled, prog, atDay(1))?.id).toBe('W1');
  });

  it('skip on a workout day drops it and moves on', () => {
    const prog = program([w('W0'), rest, w('W1')]);
    const s = stateAt(0);

    const skipped = sched.skip(s, prog, atDay(0)); // skip W0 → next day is the rest day
    expect(sched.currentWorkout(skipped, prog, atDay(0))).toBeNull(); // rest
    expect(sched.currentWorkout(skipped, prog, atDay(1))?.id).toBe('W1'); // rest advances → W1
  });
});

describe('HybridScheduler — a full cycle', () => {
  it('walks workout → rest → workout across advances and day changes', () => {
    const prog = program([w('A'), rest, w('B')]); // L = 3
    let s = stateAt(0);

    expect(sched.currentWorkout(s, prog, atDay(0))?.id).toBe('A');
    s = sched.advance(s, prog, atDay(0)); // complete A on day 0
    expect(sched.currentWorkout(s, prog, atDay(1))).toBeNull(); // rest day 1
    expect(sched.currentWorkout(s, prog, atDay(2))?.id).toBe('B'); // B waits from day 2
    s = sched.advance(s, prog, atDay(2)); // complete B on day 2
    // cursor wraps to A (index 0); due starting day 3.
    expect(sched.currentWorkout(s, prog, atDay(3))?.id).toBe('A');
  });
});

describe('HybridScheduler — block deferral', () => {
  const prog = program([w('W0', ['a', 'b', 'c'])]);

  it('applies a deferred block order to the returned workout', () => {
    let s: HybridState = { ...stateAt(0), blockOrder: ['a', 'b', 'c'] };
    s = sched.deferBlock(s, 'b');
    expect(sched.currentWorkout(s, prog, atDay(0))!.blocks.map((b) => b.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('HybridScheduler — serialization', () => {
  it('round-trips its state through serialize/deserialize', () => {
    const s = sched.advance(stateAt(3), program([w('W0'), rest]), atDay(3));
    const raw = JSON.parse(JSON.stringify(sched.serialize(s)));
    expect(sched.deserialize(raw)).toEqual(s);
  });
});
