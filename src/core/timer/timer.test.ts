import { describe, it, expect } from 'vitest';
import { FixedClock } from '../ports/index.ts';
import type { Block, PlanDay, Session, Workout } from '../model/entities.ts';
import {
  remainingMs,
  createTimer,
  timerPhase,
  timerRemaining,
  isExpired,
  isRunning,
  startTimer,
  pauseTimer,
  resetTimer,
  addTime,
  recommendedRestSeconds,
} from './timer.ts';

const SEC = 1000;

describe('remainingMs (anti-drift primitive)', () => {
  it('is the absolute gap to the deadline, clamped at 0', () => {
    expect(remainingMs(60_000, 0)).toBe(60_000);
    expect(remainingMs(60_000, 59_999)).toBe(1);
    expect(remainingMs(60_000, 60_000)).toBe(0);
    expect(remainingMs(60_000, 65_000)).toBe(0); // past the deadline never goes negative
  });
});

describe('countdown from an absolute deadline', () => {
  it('signals exactly on time — no early, no late', () => {
    const clock = new FixedClock(1_000);
    const timer = startTimer(createTimer(60 * SEC), clock.now()); // endAt = 61_000

    clock.set(60_999);
    expect(isExpired(timer, clock.now())).toBe(false);
    expect(timerRemaining(timer, clock.now())).toBe(1);
    expect(timerPhase(timer, clock.now())).toBe('running');

    clock.set(61_000);
    expect(isExpired(timer, clock.now())).toBe(true);
    expect(timerRemaining(timer, clock.now())).toBe(0);
    expect(timerPhase(timer, clock.now())).toBe('finished');
  });

  it('fires on time after a large forward jump (tab backgrounded / device slept)', () => {
    const clock = new FixedClock(0);
    const timer = startTimer(createTimer(90 * SEC), clock.now()); // endAt = 90_000

    // Simulate the tab being backgrounded for 10 minutes: one big jump past the deadline.
    clock.advance(10 * 60 * SEC);
    expect(isExpired(timer, clock.now())).toBe(true);
    expect(timerRemaining(timer, clock.now())).toBe(0); // exactly 0, not a negative accumulated lag
  });

  it('does not accumulate error across many ticks', () => {
    const clock = new FixedClock(0);
    const timer = startTimer(createTimer(60 * SEC), clock.now());

    // 600 ticks of 100ms each. A tick-summing timer would drift; an absolute one cannot.
    for (let i = 1; i <= 600; i++) {
      clock.advance(100);
      const expected = Math.max(0, 60_000 - i * 100);
      expect(timerRemaining(timer, clock.now())).toBe(expected);
    }
    expect(timerRemaining(timer, clock.now())).toBe(0);
    expect(isExpired(timer, clock.now())).toBe(true);
  });

  it('gives the same remaining whether time moves in one jump or many small steps', () => {
    const clock = new FixedClock(0);
    const stepped = startTimer(createTimer(45 * SEC), clock.now());
    for (let i = 0; i < 30; i++) clock.advance(1000);
    const remainingStepped = timerRemaining(stepped, clock.now());

    const jumpClock = new FixedClock(0);
    const jumped = startTimer(createTimer(45 * SEC), jumpClock.now());
    jumpClock.advance(30_000);
    expect(remainingStepped).toBe(timerRemaining(jumped, jumpClock.now()));
    expect(remainingStepped).toBe(15_000);
  });
});

describe('phases and lifecycle', () => {
  it('starts idle showing the preset', () => {
    const timer = createTimer(90 * SEC);
    expect(timerPhase(timer, 0)).toBe('idle');
    expect(timerRemaining(timer, 0)).toBe(90_000);
    expect(isRunning(timer)).toBe(false);
  });

  it('reset returns a running timer to idle at the preset', () => {
    const clock = new FixedClock(0);
    let timer = startTimer(createTimer(60 * SEC), clock.now());
    clock.advance(20_000);
    timer = resetTimer(timer);
    expect(timerPhase(timer, clock.now())).toBe('idle');
    expect(timerRemaining(timer, clock.now())).toBe(60_000);
  });

  it('a zero-duration start is a no-op (stays idle)', () => {
    const timer = startTimer(createTimer(0), 0);
    expect(timerPhase(timer, 0)).toBe('idle');
  });
});

describe('pause / resume', () => {
  it('freezes the remaining and does not consume it while paused in the background', () => {
    const clock = new FixedClock(0);
    let timer = startTimer(createTimer(60 * SEC), clock.now());

    clock.set(10_000);
    timer = pauseTimer(timer, clock.now()); // 50s frozen
    expect(timerPhase(timer, clock.now())).toBe('paused');
    expect(timerRemaining(timer, clock.now())).toBe(50_000);

    // Backgrounded for a long while WHILE paused — the frozen remainder must not drain.
    clock.set(600_000);
    expect(timerRemaining(timer, clock.now())).toBe(50_000);

    timer = startTimer(timer, clock.now()); // resume: endAt = 650_000
    expect(timerRemaining(timer, clock.now())).toBe(50_000);
    clock.advance(50_000);
    expect(isExpired(timer, clock.now())).toBe(true);
  });
});

describe('addTime increments (±1/10/30/60 s)', () => {
  it('adjusts the preset while idle', () => {
    let timer = createTimer(60 * SEC);
    timer = addTime(timer, 30 * SEC, 0);
    expect(timerRemaining(timer, 0)).toBe(90_000);
    timer = addTime(timer, -100 * SEC, 0); // clamped at 0, not negative
    expect(timerRemaining(timer, 0)).toBe(0);
  });

  it('shifts the deadline while running without introducing drift', () => {
    const clock = new FixedClock(0);
    let timer = startTimer(createTimer(60 * SEC), clock.now());
    clock.advance(10_000); // 50s left
    timer = addTime(timer, 30 * SEC, clock.now());
    expect(timerRemaining(timer, clock.now())).toBe(80_000);

    // Subtracting past `now` clamps remaining to 0 rather than going negative.
    timer = addTime(timer, -1000 * SEC, clock.now());
    expect(timerRemaining(timer, clock.now())).toBe(0);
  });

  it('adjusts the frozen remainder while paused', () => {
    const clock = new FixedClock(0);
    let timer = startTimer(createTimer(60 * SEC), clock.now());
    clock.set(10_000);
    timer = pauseTimer(timer, clock.now()); // 50s
    timer = addTime(timer, 10 * SEC, clock.now());
    expect(timerRemaining(timer, clock.now())).toBe(60_000);
  });
});

// #region recommendedRestSeconds

function block(id: string, sets: number, exerciseIds: string[], setsRest: number, superRest: number): Block {
  return {
    id,
    sets,
    betweenSetsRest: setsRest,
    betweenSupersetExercisesRest: superRest,
    exercises: exerciseIds.map((eid) => ({ id: `${id}-${eid}`, exerciseId: eid, target: { weight: 100, reps: 10 } })),
  };
}

function session(workout: Workout, cursor: Session['cursor'], adHoc: Session['adHoc'] = null): Session {
  return {
    id: 's',
    programId: 'p',
    workout,
    blockOrder: workout.blocks.map((b) => b.id),
    cursor,
    loggedSets: [],
    startedAt: 0,
    lastSetAt: null,
    adHoc,
    timelinePaused: adHoc !== null,
  };
}

// keep PlanDay import used (documents the workout shape origin)
const _shape: PlanDay['kind'] = 'workout';

describe('recommendedRestSeconds — preloaded interval for the current place', () => {
  const superset = block('B1', 3, ['a', 'b'], 90, 15);
  const plain = block('B2', 2, ['c'], 75, 0);
  const workout: Workout = { id: 'w', blocks: [superset, plain], betweenBlocksRest: 120 };

  it('between superset exercises when the cursor is not on the last superset exercise', () => {
    expect(recommendedRestSeconds(session(workout, { block: 0, exercise: 0, set: 0 }))).toBe(15);
  });

  it('between sets when leaving the last superset exercise (not the last set)', () => {
    expect(recommendedRestSeconds(session(workout, { block: 0, exercise: 1, set: 0 }))).toBe(90);
  });

  it('between blocks after the last set of a non-final block', () => {
    expect(recommendedRestSeconds(session(workout, { block: 0, exercise: 1, set: 2 }))).toBe(120);
  });

  it('between sets inside a plain block', () => {
    expect(recommendedRestSeconds(session(workout, { block: 1, exercise: 0, set: 0 }))).toBe(75);
  });

  it('falls back to between-sets on the last set of the final block', () => {
    expect(recommendedRestSeconds(session(workout, { block: 1, exercise: 0, set: 1 }))).toBe(75);
  });

  it('uses betweenBlocksRest for ad-hoc (no plan cadence)', () => {
    const s = session(workout, { block: 0, exercise: 0, set: 0 }, { exerciseId: 'x', startedAt: 0 });
    expect(recommendedRestSeconds(s)).toBe(120);
  });

  it('uses betweenBlocksRest when the cursor is past the last block', () => {
    expect(_shape).toBe('workout');
    expect(recommendedRestSeconds(session(workout, { block: 2, exercise: 0, set: 0 }))).toBe(120);
  });
});

// #endregion
