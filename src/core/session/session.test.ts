import { describe, it, expect } from 'vitest';
import { FixedClock, InMemoryStorage } from '../ports/index.ts';
import { emptySaveData } from '../model/index.ts';
import type { Program, PlanDay, SaveData, Block, Session } from '../model/index.ts';
import { DAY_MS } from '../scheduler/day.ts';
import { startProgram, currentWorkout } from '../scheduler/active.ts';
import {
  getSession,
  isSessionComplete,
  activeSlot,
  needsResumeDecision,
  startSession,
  logSet,
  editSessionSet,
  removeSessionSet,
  abandonSession,
  startAdHoc,
  endAdHoc,
  logAdHocResult,
  deferSessionBlock,
} from './session.ts';

/** A block of one exercise (id === exerciseId for readability), `sets` sets, no rest. */
function block(id: string, sets: number, exerciseIds: string[] = [id]): Block {
  return {
    id,
    sets,
    betweenSetsRest: 0,
    betweenSupersetExercisesRest: 0,
    exercises: exerciseIds.map((eid) => ({
      id: `${id}-${eid}`,
      exerciseId: eid,
      target: { weight: 100, reps: 10 },
    })),
  };
}

function workoutDay(tag: string, blocks: Block[]): PlanDay {
  return { kind: 'workout', workout: { id: tag, blocks, betweenBlocksRest: 0 } };
}

function program(id: string, days: PlanDay[]): Program {
  return { id, name: id, plans: [{ id: `${id}-plan`, days }], recommendedSchedulerId: 'hybrid' };
}

function atDay(n: number, extraMs = 0): FixedClock {
  return new FixedClock(n * DAY_MS + extraMs);
}

/** Storage seeded with programs (nothing active yet). */
function storageWith(...programs: Program[]): InMemoryStorage {
  const save: SaveData = { ...emptySaveData(), programs };
  return new InMemoryStorage(save);
}

/** Start a program and a session on today's workout. */
function launch(store: InMemoryStorage, clock: FixedClock, programId = 'P'): Session {
  startProgram(store, clock, programId);
  const s = startSession(store, clock);
  if (s === null) throw new Error('expected a workout to start');
  return s;
}

describe('session lifecycle', () => {
  it('starts on today’s workout and snapshots it', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 2)])]));
    const session = launch(store, atDay(0));

    expect(session.workout.id).toBe('W0');
    expect(session.blockOrder).toEqual(['a']);
    expect(session.cursor).toEqual({ block: 0, exercise: 0, set: 0 });
    expect(getSession(store)?.id).toBe(session.id);
  });

  it('logs sets to both the session and the results history, advancing the cursor', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 2), block('b', 1)])]));
    launch(store, atDay(0));

    logSet(store, atDay(0, 1000), 100, 10);
    const afterFirst = getSession(store)!;
    expect(afterFirst.cursor).toEqual({ block: 0, exercise: 0, set: 1 });
    expect(afterFirst.loggedSets).toHaveLength(1);
    expect(afterFirst.lastSetAt).toBe(atDay(0, 1000).now());

    const save = store.load()!;
    expect(save.results).toHaveLength(1);
    expect(save.results[0]).toMatchObject({ exerciseId: 'a', weight: 100, reps: 10 });
  });

  it('completes a block only after all its sets, then moves to the next block', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 2), block('b', 1)])]));
    launch(store, atDay(0));

    logSet(store, atDay(0), 100, 10); // a set 1
    logSet(store, atDay(0), 100, 10); // a set 2 -> block done -> block b
    expect(activeSlot(store, getSession(store)!)?.exerciseId).toBe('b');
    expect(getSession(store)!.cursor).toEqual({ block: 1, exercise: 0, set: 0 });
  });

  it('walks a superset A→B→A→B within one block', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('sup', 2, ['a', 'b'])])]));
    launch(store, atDay(0));

    expect(activeSlot(store, getSession(store)!)?.exerciseId).toBe('a');
    logSet(store, atDay(0), 100, 10);
    expect(activeSlot(store, getSession(store)!)?.exerciseId).toBe('b');
    logSet(store, atDay(0), 100, 10);
    expect(activeSlot(store, getSession(store)!)?.exerciseId).toBe('a'); // set 2
    expect(getSession(store)!.cursor).toEqual({ block: 0, exercise: 0, set: 1 });
  });

  it('auto-finishes when the last block is done: advances the scheduler once and clears the session', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 1)]), workoutDay('W1', [block('b', 1)])]));
    launch(store, atDay(0));

    const { finished } = logSet(store, atDay(0, 5000), 100, 10);
    expect(finished).not.toBeNull();
    expect(finished!.setCount).toBe(1);
    expect(finished!.totalVolume).toBe(1000);
    expect(getSession(store)).toBeNull(); // session cleared

    // Scheduler advanced exactly once: today’s workout is now the next one.
    expect(currentWorkout(store, atDay(0))?.id).toBe('W1');
  });

  it('reports completion via isSessionComplete once the cursor passes the last block', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 1)])]));
    const session = launch(store, atDay(0));
    expect(isSessionComplete(session)).toBe(false);
  });
});

describe('ad-hoc (off-plan) exercise', () => {
  it('during a session: writes to results but does NOT move the plan cursor', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 3)])]));
    launch(store, atDay(0));
    const before = getSession(store)!.cursor;

    startAdHoc(store, atDay(0), 'zzz');
    const s = getSession(store)!;
    expect(s.adHoc?.exerciseId).toBe('zzz');
    expect(s.timelinePaused).toBe(true);
    expect(activeSlot(store, s)?.exerciseId).toBe('zzz');
    expect(activeSlot(store, s)?.isAdHoc).toBe(true);

    logSet(store, atDay(0), 60, 15);
    logSet(store, atDay(0), 60, 15);

    const after = getSession(store)!;
    expect(after.cursor).toEqual(before); // cursor untouched
    expect(after.loggedSets).toHaveLength(0); // ad-hoc sets are not session plan sets
    expect(store.load()!.results.filter((r) => r.exerciseId === 'zzz')).toHaveLength(2);

    // resume the plan: cursor still at the plan slot
    endAdHoc(store);
    const resumed = getSession(store)!;
    expect(resumed.adHoc).toBeNull();
    expect(resumed.timelinePaused).toBe(false);
    expect(activeSlot(store, resumed)?.exerciseId).toBe('a');
  });

  it('without an active session: does not create a session, still writes to results', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 1)])]));
    // no session started
    expect(startAdHoc(store, atDay(0), 'zzz')).toBeNull();
    expect(getSession(store)).toBeNull();

    logAdHocResult(store, atDay(0), 'zzz', 40, 20);
    expect(getSession(store)).toBeNull(); // still no session
    expect(store.load()!.results).toMatchObject([{ exerciseId: 'zzz', weight: 40, reps: 20 }]);
  });
});

describe('needsResumeDecision (continue / finish trigger)', () => {
  const store = storageWith(program('P', [workoutDay('W0', [block('a', 3)])]));
  const base = launch(store, atDay(10, 8 * 3_600_000)); // day 10, 08:00 UTC

  it('is false shortly after activity on the same day', () => {
    expect(needsResumeDecision(base, atDay(10, 9 * 3_600_000).now(), 6)).toBe(false);
  });

  it('is true after a calendar-day change', () => {
    // next day, only 2h later than the start instant would be — day change alone triggers it
    expect(needsResumeDecision(base, atDay(11, 1 * 3_600_000).now(), 6)).toBe(true);
  });

  it('is true after more than N hours without a set, same day', () => {
    // start was 08:00; +7h = 15:00 same day, threshold 6h
    expect(needsResumeDecision(base, atDay(10, 15 * 3_600_000).now(), 6)).toBe(true);
  });

  it('uses lastSetAt over startedAt once a set is logged', () => {
    const s2 = storageWith(program('Q', [workoutDay('W0', [block('a', 3)])]));
    startProgram(s2, atDay(20), 'Q');
    startSession(s2, atDay(20, 8 * 3_600_000));
    logSet(s2, atDay(20, 20 * 3_600_000), 100, 10); // last set at 20:00
    const s = getSession(s2)!;
    expect(needsResumeDecision(s, atDay(20, 23 * 3_600_000).now(), 6)).toBe(false); // 3h later
    expect(needsResumeDecision(s, atDay(21, 1 * 3_600_000).now(), 6)).toBe(true); // day change
  });
});

describe('abandon then start today (finish branch of the prompt)', () => {
  it('closes the stale session without advancing, and lets a fresh session start on today’s workout', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 2)]), workoutDay('W1', [block('b', 1)])]));
    const first = launch(store, atDay(0));
    logSet(store, atDay(0), 100, 10); // partial

    // "завершить": close the stale session, scheduler NOT advanced
    abandonSession(store);
    expect(getSession(store)).toBeNull();
    expect(currentWorkout(store, atDay(2))?.id).toBe('W0'); // still waiting (hybrid) — offered again

    const second = startSession(store, atDay(2));
    expect(second).not.toBeNull();
    expect(second!.id).not.toBe(first.id);
    expect(second!.workout.id).toBe('W0');
    expect(second!.cursor).toEqual({ block: 0, exercise: 0, set: 0 });
  });
});

describe('persistence across reload and day change', () => {
  it('a session survives a reload (new storage over the same snapshot) and a day change', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 2)])]));
    launch(store, atDay(0));
    logSet(store, atDay(0), 100, 10);

    // simulate reload: a fresh storage instance over the persisted save
    const reloaded = new InMemoryStorage(store.load()!);
    const s = getSession(reloaded)!;
    expect(s.cursor).toEqual({ block: 0, exercise: 0, set: 1 });
    // next calendar day: session still points at its own snapshot
    expect(activeSlot(reloaded, s)?.exerciseId).toBe('a');
    logSet(reloaded, atDay(1), 100, 10); // finishes the block on the next day
    expect(getSession(reloaded)).toBeNull();
  });
});

describe('editSessionSet / removeSessionSet (current-session set editing)', () => {
  it('edits weight and reps in both the session and the backing history result', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 3)])]));
    launch(store, atDay(0));
    logSet(store, atDay(0, 1000), 100, 10);

    editSessionSet(store, 0, 105, 8);

    const s = getSession(store)!;
    expect(s.loggedSets[0]).toMatchObject({ exerciseId: 'a', weight: 105, reps: 8, timestamp: atDay(0, 1000).now() });
    expect(store.load()!.results[0]).toMatchObject({ exerciseId: 'a', weight: 105, reps: 8 });
    // Cursor is untouched by an edit.
    expect(s.cursor).toEqual({ block: 0, exercise: 0, set: 1 });
  });

  it('removes a set from both the session and history', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 3)])]));
    launch(store, atDay(0));
    logSet(store, atDay(0, 1000), 100, 10);
    logSet(store, atDay(0, 2000), 100, 12);

    removeSessionSet(store, 0);

    const s = getSession(store)!;
    expect(s.loggedSets).toHaveLength(1);
    expect(s.loggedSets[0]).toMatchObject({ weight: 100, reps: 12 });
    const save = store.load()!;
    expect(save.results).toHaveLength(1);
    expect(save.results[0]).toMatchObject({ weight: 100, reps: 12 });
  });

  it('disambiguates identical sets logged at the same instant by ordinal', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 5)])]));
    launch(store, atDay(0));
    // Three identical sets, same timestamp — indistinguishable except by position.
    logSet(store, atDay(0), 100, 10);
    logSet(store, atDay(0), 100, 10);
    logSet(store, atDay(0), 100, 10);

    // Edit the middle one only.
    editSessionSet(store, 1, 90, 5);

    const sets = getSession(store)!.loggedSets;
    expect(sets.map((s) => `${s.weight}x${s.reps}`)).toEqual(['100x10', '90x5', '100x10']);
    const results = store.load()!.results.map((r) => `${r.weight}x${r.reps}`);
    expect(results).toEqual(['100x10', '90x5', '100x10']);
  });

  it('keeps unrelated history results intact when removing a session set', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 3)])]));
    launch(store, atDay(0));
    // An ad-hoc result lands in history but not in loggedSets.
    startAdHoc(store, atDay(0, 500), 'zzz');
    logSet(store, atDay(0, 500), 40, 20);
    endAdHoc(store);
    logSet(store, atDay(0, 1000), 100, 10);

    removeSessionSet(store, 0);

    expect(getSession(store)!.loggedSets).toHaveLength(0);
    // The ad-hoc result survives.
    expect(store.load()!.results).toMatchObject([{ exerciseId: 'zzz', weight: 40, reps: 20 }]);
  });

  it('is a no-op for an out-of-range index', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 3)])]));
    launch(store, atDay(0));
    logSet(store, atDay(0), 100, 10);

    editSessionSet(store, 5, 999, 999);
    removeSessionSet(store, -1);

    expect(getSession(store)!.loggedSets).toHaveLength(1);
    expect(store.load()!.results).toHaveLength(1);
  });

  it('throws when there is no active session', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 1)])]));
    expect(() => editSessionSet(store, 0, 1, 1)).toThrow();
    expect(() => removeSessionSet(store, 0)).toThrow();
  });
});

describe('deferSessionBlock', () => {
  it('swaps a block with the next one, changing what comes after the current block', () => {
    const store = storageWith(program('P', [workoutDay('W0', [block('a', 1), block('b', 1), block('c', 1)])]));
    launch(store, atDay(0));

    deferSessionBlock(store, 'b');
    expect(getSession(store)!.blockOrder).toEqual(['a', 'c', 'b']);
  });
});
